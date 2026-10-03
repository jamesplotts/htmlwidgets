/*
 *  SPDX-FileCopyrightText: 2026 James
 *  SPDX-License-Identifier: MIT
 *
 *  The object exposed to page JavaScript via QWebChannel as "backend".
 *
 *  cpu()/memory()/uptime() are synchronous getters over cached state that a
 *  background poll refreshes every couple of seconds. They're called from
 *  the page as backend.cpu(function(result){...}) per the usual
 *  qwebchannel.js convention.
 *
 *  Reading /proc directly via QML's XMLHttpRequest would be simpler, but
 *  QtWebEngine/QML disables local-file XHR reads unless the environment
 *  variable QML_XHR_ALLOW_FILE_READ=1 is set — not something we can expect
 *  an end user's session to have. So instead everything, including these
 *  read-only stats, goes through Plasma's "executable" data engine, same
 *  as run().
 *
 *  run() itself is fire-and-forget: it kicks off the command and the result
 *  arrives later through the commandFinished signal, which the page
 *  subscribes to once. This keeps the exec off the synchronous WebChannel
 *  call path.
 *
 *  httpFetch()/httpFetchFinished exist because page-side fetch() is a
 *  browser request subject to CORS — fine for APIs that opt in (like
 *  Open-Meteo), useless against ones that don't (like Radio Garden's,
 *  which has no Access-Control-Allow-Origin at all; confirmed by actually
 *  hitting it from the page and watching Chromium block it). QML's own
 *  XMLHttpRequest isn't a browser page, so it isn't subject to that policy
 *  at all — same trick as run(), applied to plain HTTP GETs instead of
 *  shell commands. Much lower-risk than run() (no code execution), but
 *  still worth knowing: it lets loaded HTML read from any URL, including
 *  localhost/LAN addresses, regardless of what that target's own CORS
 *  policy would normally allow a browser to read. Always on (unlike
 *  run()), since it's just outbound GETs. See README.
 */

import QtQuick
import QtWebChannel
import org.kde.plasma.plasma5support as P5Support

QtObject {
    id: backend

    WebChannel.id: "backend"

    // Bound from main.qml to plasmoid.configuration.enableRun. False
    // (disabled) until the user explicitly opts in via the config dialog.
    property bool runEnabled: false

    signal commandFinished(string cmd, string stdout, string stderr, int exitCode)

    readonly property string _cpuCmd: "cat /proc/stat"
    readonly property string _memCmd: "cat /proc/meminfo"
    readonly property string _uptimeCmd: "cat /proc/uptime"
    readonly property int _pollIntervalMs: 2000

    property var _prevCpu: null
    property var _cpuCache: ({ percent: 0 })
    property var _memCache: ({ totalMb: 0, usedMb: 0, availableMb: 0, percent: 0 })
    property var _uptimeCache: ({ seconds: 0 })

    function cpu() { return backend._cpuCache }
    function memory() { return backend._memCache }
    function uptime() { return backend._uptimeCache }

    function _updateCpu(text) {
        var line = (text.split("\n")[0] || "").trim()
        if (!line) return
        var parts = line.split(/\s+/).slice(1).map(Number)
        var idle = parts[3] + parts[4] // idle + iowait
        var total = parts.reduce(function (a, b) { return a + b }, 0)

        var percent = backend._cpuCache.percent
        if (backend._prevCpu) {
            var deltaIdle = idle - backend._prevCpu.idle
            var deltaTotal = total - backend._prevCpu.total
            if (deltaTotal > 0) {
                percent = Math.max(0, Math.min(100, 100 * (1 - deltaIdle / deltaTotal)))
            }
        }
        backend._prevCpu = { idle: idle, total: total }
        backend._cpuCache = { percent: percent }
    }

    function _updateMem(text) {
        var kv = {}
        text.split("\n").forEach(function (line) {
            var m = line.match(/^(\w+):\s+(\d+)/)
            if (m) {
                kv[m[1]] = parseInt(m[2], 10)
            }
        })
        var totalKb = kv.MemTotal || 0
        var availKb = kv.MemAvailable !== undefined ? kv.MemAvailable : (kv.MemFree || 0)
        var usedKb = totalKb - availKb
        backend._memCache = {
            totalMb: totalKb / 1024,
            usedMb: usedKb / 1024,
            availableMb: availKb / 1024,
            percent: totalKb > 0 ? (100 * usedKb / totalKb) : 0
        }
    }

    function _updateUptime(text) {
        var seconds = parseFloat((text.trim().split(/\s+/) || ["0"])[0])
        backend._uptimeCache = { seconds: isNaN(seconds) ? 0 : seconds }
    }

    // Runs a shell command and reports back via commandFinished(cmd, stdout,
    // stderr, exitCode). No-op (reports an error string) unless the user
    // has ticked "Allow the page to run shell commands" in the config.
    //
    // Note: matching replies to requests by the command string itself is a
    // simplification — firing the exact same command twice concurrently
    // will have both replies matched by that one onNewData per source name.
    // Fine for a single widget issuing one command at a time; not meant for
    // heavy concurrent use.
    function run(cmd) {
        if (!backend.runEnabled) {
            Qt.callLater(function () {
                backend.commandFinished(cmd, "", "run() is disabled in this widget's settings.", -1)
            })
            return
        }
        execSource.connectSource(cmd)
    }

    signal httpFetchFinished(string requestId, int status, string body, string finalUrl)

    property int _nextHttpId: 0

    // GET (or HEAD) url, bypassing page-level CORS (see class comment
    // above). Returns a request id synchronously; the real result arrives
    // via httpFetchFinished. status is 0 on a network-level failure (no
    // response at all, e.g. DNS/connection error), matching XHR
    // convention. finalUrl is where the request landed after following
    // any redirects — handy for resolving a redirect endpoint's real URL
    // without caring about the (possibly empty, for HEAD) body.
    function httpFetch(url, method) {
        var id = "h" + (backend._nextHttpId++)
        var xhr = new XMLHttpRequest()
        xhr.onreadystatechange = function () {
            if (xhr.readyState === XMLHttpRequest.DONE) {
                backend.httpFetchFinished(id, xhr.status, xhr.responseText, xhr.responseURL || url)
            }
        }
        xhr.open(method || "GET", url, true)
        xhr.setRequestHeader("Accept", "application/json")
        // Some APIs behind bot-detection (Cloudflare etc.) 403 anything
        // that doesn't look like a real browser. Browser-page fetch()/XHR
        // forbid scripts from setting these; QML's XHR has no such
        // restriction since it isn't a sandboxed page.
        xhr.setRequestHeader("User-Agent",
            "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) " +
            "Chrome/129.0.0.0 Safari/537.36")
        xhr.setRequestHeader("Referer", "https://radio.garden/")
        xhr.send()
        return id
    }

    // QtObject has no default property, so these need explicit properties
    // to attach (unlike Item-derived types, which could just nest them).
    //
    // Two separate DataSources because `interval` applies to every source
    // connected on a DataSource: statsSource polls its three /proc reads
    // on a timer forever, while execSource runs one-shot run() commands
    // (default interval 0) and disconnects each as soon as it answers.
    property P5Support.DataSource statsSource: P5Support.DataSource {
        engine: "executable"
        interval: backend._pollIntervalMs
        onNewData: function (sourceName, data) {
            var stdout = data["stdout"] || ""
            switch (sourceName) {
            case backend._cpuCmd:
                backend._updateCpu(stdout)
                break
            case backend._memCmd:
                backend._updateMem(stdout)
                break
            case backend._uptimeCmd:
                backend._updateUptime(stdout)
                break
            }
        }

        Component.onCompleted: {
            connectSource(backend._cpuCmd)
            connectSource(backend._memCmd)
            connectSource(backend._uptimeCmd)
        }
    }

    property P5Support.DataSource execSource: P5Support.DataSource {
        engine: "executable"
        onNewData: function (sourceName, data) {
            backend.commandFinished(
                sourceName,
                data["stdout"] || "",
                data["stderr"] || "",
                data["exit code"] !== undefined ? data["exit code"] : -1)
            disconnectSource(sourceName)
        }
    }
}

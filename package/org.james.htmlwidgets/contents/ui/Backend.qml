/*
 *  SPDX-FileCopyrightText: 2026 James
 *  SPDX-License-Identifier: GPL-2.0-or-later
 *
 *  The object exposed to page JavaScript via QWebChannel as "backend".
 *  cpu()/memory()/uptime() are synchronous (read straight from /proc) and
 *  are called from the page as backend.cpu(function(result){...}) per the
 *  usual qwebchannel.js convention.
 *
 *  run() is fire-and-forget: it kicks off the command via Plasma's
 *  "executable" data engine and the real result arrives later through the
 *  commandFinished signal, which the page subscribes to once. This keeps
 *  the long-running exec off the synchronous WebChannel call path.
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

    property var _prevCpu: null

    function _readFile(path) {
        var xhr = new XMLHttpRequest()
        xhr.open("GET", "file://" + path, false) // synchronous local read
        xhr.send()
        return xhr.responseText
    }

    // Returns { percent } — percentage of CPU busy since the previous call.
    // The first call has nothing to diff against, so it returns 0.
    function cpu() {
        var line = backend._readFile("/proc/stat").split("\n")[0]
        var parts = line.trim().split(/\s+/).slice(1).map(Number)
        var idle = parts[3] + parts[4] // idle + iowait
        var total = parts.reduce(function (a, b) { return a + b }, 0)

        var percent = 0
        if (backend._prevCpu) {
            var deltaIdle = idle - backend._prevCpu.idle
            var deltaTotal = total - backend._prevCpu.total
            if (deltaTotal > 0) {
                percent = Math.max(0, Math.min(100, 100 * (1 - deltaIdle / deltaTotal)))
            }
        }
        backend._prevCpu = { idle: idle, total: total }
        return { percent: percent }
    }

    // Returns { totalMb, usedMb, availableMb, percent }.
    function memory() {
        var text = backend._readFile("/proc/meminfo")
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
        return {
            totalMb: totalKb / 1024,
            usedMb: usedKb / 1024,
            availableMb: availKb / 1024,
            percent: totalKb > 0 ? (100 * usedKb / totalKb) : 0
        }
    }

    // Returns { seconds }.
    function uptime() {
        var text = backend._readFile("/proc/uptime")
        return { seconds: parseFloat(text.trim().split(/\s+/)[0]) }
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

    P5Support.DataSource {
        id: execSource
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

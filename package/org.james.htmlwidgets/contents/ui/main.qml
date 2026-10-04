/*
 *  SPDX-FileCopyrightText: 2026 James
 *  SPDX-License-Identifier: MIT
 */

import QtQuick
import QtQuick.Layouts
import QtWebEngine
import QtWebChannel
import Qt.labs.platform as Labs

import org.kde.plasma.plasmoid
import org.kde.plasma.core as PlasmaCore
import org.kde.kirigami as Kirigami

PlasmoidItem {
    id: root

    // Let the HTML control its own look.
    Plasmoid.backgroundHints: PlasmaCore.Types.NoBackground

    preferredRepresentation: fullRepresentation

    // implicitWidth/Height (not width/height!) give the initial size when
    // placed as a floating desktop widget — Layout.* attached properties
    // alone are only honored when the item sits inside a real Layout, e.g.
    // in a panel (measured empirically: without one of these,
    // plasmoidviewer gave the applet a bare 112x112 regardless of
    // Layout.preferred* below). Binding width/height directly, rather than
    // their implicit counterparts, was a mistake: it fights the
    // containment's own resize handle, since the item's size stays
    // pinned to that expression instead of yielding to an explicit
    // external resize. implicit* only supplies a default.
    implicitWidth: Kirigami.Units.gridUnit * 16
    implicitHeight: Kirigami.Units.gridUnit * 10

    Layout.minimumWidth: Kirigami.Units.gridUnit * 6
    Layout.minimumHeight: Kirigami.Units.gridUnit * 6
    Layout.preferredWidth: implicitWidth
    Layout.preferredHeight: implicitHeight

    // StandardPaths.writableLocation() returns a file:// URL, not a plain
    // path — strip the scheme so htmlPath is always a plain filesystem path.
    function _stripFileScheme(s) {
        return s.toString().replace(/^file:\/\//, "")
    }

    // The sample widget ships bundled inside the plasmoid package itself
    // (contents/html-widgets/sample/), so the widget works immediately
    // after install — no separate install.sh step required. Resolving it
    // relative to this QML file's own location (rather than guessing an
    // absolute install prefix) works whether the package ended up under
    // ~/.local/share/plasma/plasmoids/ (per-user) or /usr/share/plasma/
    // plasmoids/ (system-wide, e.g. a distro package).
    readonly property string defaultHtmlPath:
        root._stripFileScheme(Qt.resolvedUrl("../html-widgets/sample/index.html"))

    // Dev/testing hook: plasmoidviewer's positional "externalData" CLI
    // argument (and real drag-and-drop of a file onto the widget) land
    // here, letting `test-plasmoidviewer.sh <path>` preview a specific
    // widget without touching the saved config.
    property string _droppedHtmlPath: ""
    onExternalData: function (mimetype, data) {
        root._droppedHtmlPath = data
    }

    readonly property string htmlPath:
        root._droppedHtmlPath.length > 0
        ? root._droppedHtmlPath
        : (Plasmoid.configuration.htmlPath && Plasmoid.configuration.htmlPath.length > 0)
        ? Plasmoid.configuration.htmlPath
        : root.defaultHtmlPath

    Backend {
        id: backend
        runEnabled: Plasmoid.configuration.enableRun
        fetchEnabled: Plasmoid.configuration.enableHttpFetch
    }

    WebChannel {
        id: channel
        registeredObjects: [backend]
    }

    // storageName alone auto-derives a path from the *host* application's
    // own identity (QStandardPaths::AppDataLocation, which incorporates
    // the running binary's app name) — meaning plasmoidviewer and
    // plasmashell could resolve to different directories for the exact
    // same plasmoid. Setting persistentStoragePath/cachePath explicitly,
    // anchored to the user's home directory rather than any app-specific
    // path, makes localStorage (e.g. the weather widget's saved city)
    // resolve to the same place no matter which host loads this plasmoid,
    // and removes any ambiguity about it surviving a restart.
    readonly property string profileStoragePath:
        root._stripFileScheme(Labs.StandardPaths.writableLocation(Labs.StandardPaths.HomeLocation))
        + "/.local/share/org.james.htmlwidgets/webengine-profile"

    WebEngineProfile {
        id: webProfile
        // Named, persistent (not off-the-record) profile: localStorage,
        // cookies and cache survive across plasmashell restarts.
        storageName: "org.james.htmlwidgets"
        offTheRecord: false
        persistentStoragePath: root.profileStoragePath
        cachePath: root.profileStoragePath + "/cache"
        httpCacheType: WebEngineProfile.DiskHttpCache
        persistentCookiesPolicy: WebEngineProfile.AllowPersistentCookies
    }

    fullRepresentation: WebEngineView {
        id: webView
        anchors.fill: parent

        profile: webProfile
        webChannel: channel
        backgroundColor: "transparent"

        // Chromium's generic anti-ad-autoplay heuristic doesn't serve any
        // purpose for a trusted local widget the user chose themselves —
        // without this, QtWebEngine's stricter-than-default gesture
        // tracking could make a real click on a widget's own play button
        // mysteriously fail to count as "sticky" activation.
        settings.playbackRequiresUserGesture: false
        settings.localContentCanAccessFileUrls: true
        // Needed for widgets that fetch() a remote API (e.g. the weather
        // widget hitting Open-Meteo). Any HTML this plasmoid loads can
        // make outbound network requests as a result — see README.
        settings.localContentCanAccessRemoteUrls: true
        settings.showScrollBars: false

        url: "file://" + root.htmlPath

        onJavaScriptConsoleMessage: function (level, message, lineNumber, sourceId) {
            console.log("[htmlwidgets:page]", sourceId + ":" + lineNumber, message)
        }

        onLoadingChanged: function (loadRequest) {
            if (loadRequest.status === WebEngineView.LoadFailedStatus) {
                console.log("[htmlwidgets] failed to load", root.htmlPath, loadRequest.errorString)
            }
        }
    }
}

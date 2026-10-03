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

    // Direct width/height give the initial size when placed as a floating
    // desktop widget (Layout.* attached properties alone are only honored
    // when the item sits inside a real Layout, e.g. in a panel — measured
    // this empirically: without these, plasmoidviewer gave the applet a
    // bare 112x112 regardless of the Layout.preferred* hints below).
    width: Kirigami.Units.gridUnit * 16
    height: Kirigami.Units.gridUnit * 10

    Layout.minimumWidth: Kirigami.Units.gridUnit * 6
    Layout.minimumHeight: Kirigami.Units.gridUnit * 6
    Layout.preferredWidth: width
    Layout.preferredHeight: height

    // StandardPaths.writableLocation() returns a file:// URL, not a plain
    // path — strip the scheme so htmlPath is always a plain filesystem path.
    function _stripFileScheme(s) {
        return s.toString().replace(/^file:\/\//, "")
    }

    readonly property string defaultHtmlPath:
        root._stripFileScheme(Labs.StandardPaths.writableLocation(Labs.StandardPaths.HomeLocation))
        + "/.local/share/html-widgets/sample/index.html"

    readonly property string htmlPath:
        (Plasmoid.configuration.htmlPath && Plasmoid.configuration.htmlPath.length > 0)
        ? Plasmoid.configuration.htmlPath
        : root.defaultHtmlPath

    Backend {
        id: backend
        runEnabled: Plasmoid.configuration.enableRun
    }

    WebChannel {
        id: channel
        registeredObjects: [backend]
    }

    WebEngineProfile {
        id: webProfile
        // Named, persistent (not off-the-record) profile: localStorage,
        // cookies and cache survive across plasmashell restarts.
        storageName: "org.james.htmlwidgets"
        offTheRecord: false
        httpCacheType: WebEngineProfile.DiskHttpCache
        persistentCookiesPolicy: WebEngineProfile.AllowPersistentCookies
    }

    fullRepresentation: WebEngineView {
        id: webView
        anchors.fill: parent

        profile: webProfile
        webChannel: channel
        backgroundColor: "transparent"

        settings.localContentCanAccessFileUrls: true
        settings.localContentCanAccessRemoteUrls: false
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

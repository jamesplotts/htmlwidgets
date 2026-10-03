/*
 *  SPDX-FileCopyrightText: 2026 James
 *  SPDX-License-Identifier: GPL-2.0-or-later
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
    Layout.minimumWidth: Kirigami.Units.gridUnit * 6
    Layout.minimumHeight: Kirigami.Units.gridUnit * 6
    Layout.preferredWidth: Kirigami.Units.gridUnit * 16
    Layout.preferredHeight: Kirigami.Units.gridUnit * 10

    readonly property string defaultHtmlPath:
        Labs.StandardPaths.writableLocation(Labs.StandardPaths.HomeLocation)
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

/*
 *  SPDX-FileCopyrightText: 2026 James
 *  SPDX-License-Identifier: MIT
 */

import QtQuick
import QtQuick.Controls
import QtQuick.Layouts
import QtQuick.Dialogs
import Qt.labs.platform as Labs

import org.kde.kirigami as Kirigami
import org.kde.kcmutils as KCM
import org.kde.plasma.plasma5support as P5Support

KCM.SimpleKCM {
    id: root

    property alias cfg_htmlPath: pathField.text
    property alias cfg_enableRun: enableRunCheckBox.checked

    // [{name, path}], populated by scanSource below.
    property var discoveredWidgets: []

    // StandardPaths.writableLocation() returns a file:// URL; strip the
    // scheme so this reads as a plain path in the placeholder/hint text.
    readonly property string homeDir:
        Labs.StandardPaths.writableLocation(Labs.StandardPaths.HomeLocation).toString().replace(/^file:\/\//, "")

    readonly property string widgetsBaseDir: homeDir + "/.local/share/html-widgets"
    readonly property string defaultHtmlPath: widgetsBaseDir + "/sample/index.html"

    Kirigami.FormLayout {
        ComboBox {
            id: discoveredCombo
            Kirigami.FormData.label: i18nc("@label:listbox", "Installed widgets:")
            Layout.fillWidth: true
            model: root.discoveredWidgets
            textRole: "name"
            enabled: root.discoveredWidgets.length > 0
            displayText: enabled
                ? (currentIndex >= 0 ? currentText : i18nc("@info:placeholder", "Choose one…"))
                : i18nc("@info:placeholder", "None found in ~/.local/share/html-widgets")
            onActivated: function (index) {
                pathField.text = root.discoveredWidgets[index].path
            }
        }

        Label {
            Layout.fillWidth: true
            wrapMode: Text.WordWrap
            font.italic: true
            text: i18nc("@info",
                "Every folder under ~/.local/share/html-widgets/ with an index.html in it shows up " +
                "here automatically — that's where install.sh puts the bundled widgets.")
        }

        Item {
            Kirigami.FormData.isSection: false
        }

        RowLayout {
            Kirigami.FormData.label: i18nc("@label:textbox", "HTML file:")
            Layout.fillWidth: true

            TextField {
                id: pathField
                Layout.fillWidth: true
                placeholderText: root.defaultHtmlPath
            }

            Button {
                icon.name: "document-open"
                text: i18nc("@action:button", "Browse…")
                onClicked: fileDialog.open()
            }
        }

        Label {
            Layout.fillWidth: true
            wrapMode: Text.WordWrap
            font.italic: true
            text: i18nc("@info",
                "Leave blank to use the bundled sample widget (%1). Picking from the list above " +
                "fills this in too — it's the same setting, just whichever is easier.", root.defaultHtmlPath)
        }

        Item {
            Kirigami.FormData.isSection: false
        }

        CheckBox {
            id: enableRunCheckBox
            Kirigami.FormData.label: i18nc("@label:checkbox", "Scripting:")
            text: i18nc("@option:check", "Allow the page to run shell commands (run())")
        }

        Label {
            Layout.fillWidth: true
            wrapMode: Text.WordWrap
            font.italic: true
            text: i18nc("@info",
                "Off by default. When enabled, any HTML file this widget loads can execute " +
                "arbitrary commands on your account via the bridge's run() call. Only enable " +
                "this for widgets you wrote and trust.")
        }
    }

    FileDialog {
        id: fileDialog
        title: i18nc("@title:window", "Choose an HTML file")
        nameFilters: [i18nc("@item:inlistbox", "HTML files (*.html *.htm)"), i18nc("@item:inlistbox", "All files (*)")]
        onAccepted: {
            // selectedFile is a file:// URL; strip the scheme for the plain
            // local path we store and pass to WebEngineView.
            pathField.text = fileDialog.selectedFile.toString().replace(/^file:\/\//, "")
        }
    }

    // Finds every installed sub-widget by looking for an index.html one
    // level down from html-widgets/ — simpler and more accurate than
    // listing directories (Qt.labs.folderlistmodel) and guessing which
    // ones are real widgets vs. support folders like common/, which this
    // naturally excludes since it has no index.html of its own.
    P5Support.DataSource {
        id: scanSource
        engine: "executable"
        onNewData: function (sourceName, data) {
            var stdout = data["stdout"] || ""
            var paths = stdout.split("\n").filter(function (p) { return p.length > 0 })
            var list = paths.map(function (p) {
                var parts = p.split("/")
                return { name: parts[parts.length - 2], path: p }
            })
            list.sort(function (a, b) { return a.name.localeCompare(b.name) })
            root.discoveredWidgets = list
            disconnectSource(sourceName)
        }
        Component.onCompleted: {
            connectSource("find " + root.widgetsBaseDir + " -mindepth 2 -maxdepth 2 -iname index.html 2>/dev/null | sort")
        }
    }
}

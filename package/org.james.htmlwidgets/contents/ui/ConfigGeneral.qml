/*
 *  SPDX-FileCopyrightText: 2026 James
 *  SPDX-License-Identifier: GPL-2.0-or-later
 */

import QtQuick
import QtQuick.Controls
import QtQuick.Layouts
import QtQuick.Dialogs
import Qt.labs.platform as Labs

import org.kde.kirigami as Kirigami
import org.kde.kcmutils as KCM

KCM.SimpleKCM {
    id: root

    property alias cfg_htmlPath: pathField.text
    property alias cfg_enableRun: enableRunCheckBox.checked

    // StandardPaths.writableLocation isn't reachable from plain QML without
    // a Qt.labs.platform import; use it only for the placeholder/default hint.
    readonly property string defaultHtmlPath:
        Labs.StandardPaths.writableLocation(Labs.StandardPaths.HomeLocation)
        + "/.local/share/html-widgets/sample/index.html"

    Kirigami.FormLayout {
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
                "Leave blank to use the bundled sample widget (%1).", root.defaultHtmlPath)
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
}

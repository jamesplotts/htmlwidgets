/*
 *  SPDX-FileCopyrightText: 2026 James
 *  SPDX-License-Identifier: GPL-2.0-or-later
 */

import QtQuick

import org.kde.plasma.configuration

ConfigModel {
    ConfigCategory {
        name: i18nc("@title", "General")
        icon: "text-html"
        source: "ConfigGeneral.qml"
    }
}

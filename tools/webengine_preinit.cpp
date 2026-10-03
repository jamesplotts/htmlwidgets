// SPDX-FileCopyrightText: 2026 James
// SPDX-License-Identifier: MIT
//
// Tiny constructor-time shim: calls QtWebEngineQuick::initialize() as early
// as physically possible (a shared-library constructor runs during dynamic
// linking, before main() and before QGuiApplication exists), satisfying
// QtWebEngine's hard requirement that initialize() run on the main thread
// before the application object is constructed. Meant for LD_PRELOAD.
//
// Why this is needed: Plasma's QML engine resolves "import QtWebEngine"
// (and dlopen()s its plugin) on a background QQmlThread, not the main
// thread. QtWebEngine's plugin constructor tries to self-initialize at
// that point and hard-aborts because it's not on the GUI thread. Preloading
// this shim forces the real initialize() to happen during process startup,
// before any of that — see README.md for how/where to use it.
#include <QtWebEngineQuick/QtWebEngineQuick>

__attribute__((constructor))
static void preinit_webengine() {
    QtWebEngineQuick::initialize();
}

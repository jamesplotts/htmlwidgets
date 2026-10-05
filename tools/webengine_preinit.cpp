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
//
// Containment: plasmashell passes its environment on to every app it
// launches, so a plain LD_PRELOAD would follow into Steam, games, etc.
// Two guards keep this shim confined to the process it's meant for:
//  - It has no link-time Qt dependency. QtWebEngine is dlopen()ed only when
//    the process is plasmashell or plasmoidviewer; in anything else the
//    shim does nothing. (Linking Qt directly used to drag QtWebEngine into
//    every inheriting process and crashed Steam's runtime, which ships an
//    older libz than QtWebEngineCore needs.)
//  - It removes itself from LD_PRELOAD on load, so children of the host
//    never inherit it in the first place.
#include <dlfcn.h>
#include <limits.h>
#include <stdlib.h>
#include <string.h>
#include <unistd.h>

#include <string>

static bool isHostProcess() {
    char exe[PATH_MAX];
    ssize_t n = readlink("/proc/self/exe", exe, sizeof(exe) - 1);
    if (n <= 0)
        return false;
    exe[n] = '\0';
    const char *base = strrchr(exe, '/');
    base = base ? base + 1 : exe;
    return strcmp(base, "plasmashell") == 0 || strcmp(base, "plasmoidviewer") == 0;
}

// Drops every LD_PRELOAD entry naming this library (entries are separated
// by spaces or colons), keeping any others the user had set.
static void removeSelfFromPreload() {
    const char *preload = getenv("LD_PRELOAD");
    if (!preload)
        return;
    std::string kept, entry;
    auto flush = [&]() {
        if (!entry.empty() && entry.find("libwebengine_preinit.so") == std::string::npos) {
            if (!kept.empty())
                kept += ' ';
            kept += entry;
        }
        entry.clear();
    };
    for (const char *p = preload; *p; ++p) {
        if (*p == ' ' || *p == ':')
            flush();
        else
            entry += *p;
    }
    flush();
    if (kept.empty())
        unsetenv("LD_PRELOAD");
    else
        setenv("LD_PRELOAD", kept.c_str(), 1);
}

__attribute__((constructor))
static void preinit_webengine() {
    removeSelfFromPreload();
    if (!isHostProcess())
        return;

    void *lib = dlopen("libQt6WebEngineQuick.so.6", RTLD_NOW | RTLD_GLOBAL);
    if (!lib)
        return;
    // QtWebEngineQuick::initialize()
    using InitFn = void (*)();
    auto init = reinterpret_cast<InitFn>(dlsym(lib, "_ZN16QtWebEngineQuick10initializeEv"));
    if (init)
        init();
}

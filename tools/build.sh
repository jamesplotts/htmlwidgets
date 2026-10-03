#!/usr/bin/env bash
# Builds libwebengine_preinit.so, needed to LD_PRELOAD before plasmoidviewer
# (or plasmashell) when this plasmoid — or any QtWebEngine-using plasmoid —
# is loaded. See README.md for why.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if ! pkg-config --exists Qt6WebEngineQuick 2>/dev/null; then
    echo "qt6-webengine-dev not found. Install it with:" >&2
    echo "  sudo apt install qt6-webengine-dev" >&2
    exit 1
fi

g++ -shared -fPIC -O2 \
    -o "$SCRIPT_DIR/libwebengine_preinit.so" \
    "$SCRIPT_DIR/webengine_preinit.cpp" \
    $(pkg-config --cflags --libs Qt6WebEngineQuick)

echo "Built $SCRIPT_DIR/libwebengine_preinit.so"

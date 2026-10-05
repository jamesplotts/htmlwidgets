#!/usr/bin/env bash
# Builds libwebengine_preinit.so, needed to LD_PRELOAD before plasmoidviewer
# (or plasmashell) when this plasmoid — or any QtWebEngine-using plasmoid —
# is loaded. See README.md for why.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# No Qt headers or libraries needed: the shim dlopen()s QtWebEngine at
# runtime, and only inside plasmashell/plasmoidviewer.
g++ -shared -fPIC -O2 \
    -o "$SCRIPT_DIR/libwebengine_preinit.so" \
    "$SCRIPT_DIR/webengine_preinit.cpp" \
    -ldl

echo "Built $SCRIPT_DIR/libwebengine_preinit.so"

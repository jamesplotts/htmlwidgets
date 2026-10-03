#!/usr/bin/env bash
# Runs plasmoidviewer against org.james.htmlwidgets with the WebEngine
# preinit shim preloaded (see README.md's "QtWebEngine + Plasma" section
# for why this is required). Builds the shim on first use.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SHIM="$SCRIPT_DIR/libwebengine_preinit.so"

if [ ! -f "$SHIM" ]; then
    "$SCRIPT_DIR/build.sh"
fi

exec env LD_PRELOAD="$SHIM" plasmoidviewer -a org.james.htmlwidgets "$@"

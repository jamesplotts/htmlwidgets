#!/usr/bin/env bash
# Syncs sample-widgets/ into the plasmoid package's contents/html-widgets/,
# so the package is self-contained — works immediately after install, no
# separate ~/.local/share/html-widgets/ step required. sample-widgets/
# remains the single source of truth; contents/html-widgets/ is generated
# (gitignored) and rebuilt fresh every time this runs.
#
# Called by install.sh and tools/build-plasmoid-package.sh.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BUNDLED_WIDGETS_DIR="$SCRIPT_DIR/package/org.james.htmlwidgets/contents/html-widgets"
WIDGETS_SRC="$SCRIPT_DIR/sample-widgets"

rm -rf "$BUNDLED_WIDGETS_DIR"
mkdir -p "$BUNDLED_WIDGETS_DIR"
cp -r "$WIDGETS_SRC"/* "$BUNDLED_WIDGETS_DIR/"

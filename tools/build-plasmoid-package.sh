#!/usr/bin/env bash
# Builds the distributable .plasmoid file for publishing (e.g. to
# store.kde.org / opendesktop.org). A .plasmoid is just a zip of the
# package directory's *contents* (metadata.json at the zip root, not
# nested inside another folder).
#
# Output: dist/org.james.htmlwidgets.plasmoid
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PLASMOID_SRC="$SCRIPT_DIR/package/org.james.htmlwidgets"
DIST_DIR="$SCRIPT_DIR/dist"
OUT_FILE="$DIST_DIR/org.james.htmlwidgets.plasmoid"

echo "==> Syncing bundled widgets"
"$SCRIPT_DIR/tools/sync-bundled-widgets.sh"

mkdir -p "$DIST_DIR"
rm -f "$OUT_FILE"

echo "==> Zipping package"
(cd "$PLASMOID_SRC" && zip -r -X -q "$OUT_FILE" . \
    -x '*.qmlc' -x '*.jsc' -x '.directory' -x '*.DS_Store')

echo "==> Built $OUT_FILE ($(du -h "$OUT_FILE" | cut -f1))"
echo ""
echo "Contents:"
unzip -l "$OUT_FILE"

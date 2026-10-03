#!/usr/bin/env bash
# Installs the org.james.htmlwidgets plasmoid and all bundled HTML widgets
# for the current user. Safe to re-run (uses kpackagetool6 --upgrade).
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PLASMOID_SRC="$SCRIPT_DIR/package/org.james.htmlwidgets"
WIDGETS_SRC="$SCRIPT_DIR/sample-widgets"
WIDGETS_DEST="$HOME/.local/share/html-widgets"

if ! command -v kpackagetool6 >/dev/null; then
    echo "kpackagetool6 not found. Install plasma-sdk (or kpackagetool6) and re-run." >&2
    exit 1
fi

echo "==> Installing/upgrading plasmoid package"
if kpackagetool6 --type Plasma/Applet --show org.james.htmlwidgets >/dev/null 2>&1; then
    kpackagetool6 --type Plasma/Applet --upgrade "$PLASMOID_SRC"
else
    kpackagetool6 --type Plasma/Applet --install "$PLASMOID_SRC"
fi

echo "==> Installing HTML widgets to $WIDGETS_DEST"
for dir in "$WIDGETS_SRC"/*/; do
    name="$(basename "$dir")"
    mkdir -p "$WIDGETS_DEST/$name"
    cp -rf "$dir"/* "$WIDGETS_DEST/$name/"
    echo "    - $name"
done

echo "==> Done."
echo "Test one with: ./tools/test-plasmoidviewer.sh -f planar -l floating <path/to/index.html>"

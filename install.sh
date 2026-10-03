#!/usr/bin/env bash
# Installs the org.james.htmlwidgets plasmoid and the bundled sample HTML
# widget for the current user. Safe to re-run (uses kpackagetool6 --upgrade).
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PLASMOID_SRC="$SCRIPT_DIR/package/org.james.htmlwidgets"
SAMPLE_SRC="$SCRIPT_DIR/sample-widgets/sample"
SAMPLE_DEST="$HOME/.local/share/html-widgets/sample"

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

echo "==> Installing sample HTML widget to $SAMPLE_DEST"
mkdir -p "$SAMPLE_DEST"
cp -f "$SAMPLE_SRC"/* "$SAMPLE_DEST/"

echo "==> Done."
echo "Test it standalone with: plasmoidviewer -a org.james.htmlwidgets"

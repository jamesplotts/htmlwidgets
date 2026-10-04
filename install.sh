#!/usr/bin/env bash
# Installs the org.james.htmlwidgets plasmoid, with all widgets bundled
# inside the package itself, for the current user. Safe to re-run (uses
# kpackagetool6 --upgrade).
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PLASMOID_SRC="$SCRIPT_DIR/package/org.james.htmlwidgets"
WIDGETS_SRC="$SCRIPT_DIR/sample-widgets"
USER_WIDGETS_DIR="$HOME/.local/share/html-widgets"

if ! command -v kpackagetool6 >/dev/null; then
    echo "kpackagetool6 not found. Install plasma-sdk (or kpackagetool6) and re-run." >&2
    echo "Note: this plasmoid requires Plasma 6 — kpackagetool6 doesn't exist on a" >&2
    echo "Plasma 5 desktop (e.g. Debian 12/bookworm), and this package won't run there." >&2
    exit 1
fi

PLASMASHELL_VERSION="$(plasmashell --version 2>/dev/null | grep -oE '[0-9]+\.[0-9]+\.[0-9]+' | head -1 || true)"
PLASMASHELL_MAJOR="${PLASMASHELL_VERSION%%.*}"
if [ -n "$PLASMASHELL_MAJOR" ] && [ "$PLASMASHELL_MAJOR" -lt 6 ] 2>/dev/null; then
    echo "plasmashell $PLASMASHELL_VERSION detected — this plasmoid requires Plasma 6+." >&2
    echo "It uses KF6/Qt6-only QML modules and declares X-Plasma-API-Minimum-Version: 6.0," >&2
    echo "so Plasma 5 will silently refuse to add it to the desktop (no crash, no error" >&2
    echo "logged — it just never appears). Upgrading the distro/desktop is the only fix." >&2
    exit 1
fi

echo "==> Bundling widgets into the plasmoid package"
"$SCRIPT_DIR/tools/sync-bundled-widgets.sh"

echo "==> Installing/upgrading plasmoid package"
if kpackagetool6 --type Plasma/Applet --show org.james.htmlwidgets >/dev/null 2>&1; then
    kpackagetool6 --type Plasma/Applet --upgrade "$PLASMOID_SRC"
else
    kpackagetool6 --type Plasma/Applet --install "$PLASMOID_SRC"
fi

mkdir -p "$USER_WIDGETS_DIR"

echo "==> Done."
echo "Bundled: $(ls "$WIDGETS_SRC" | tr '\n' ' ')"
echo "Drop your own custom widgets into $USER_WIDGETS_DIR — they'll show up in the config dialog's widget picker too."
echo "Test one with: ./tools/test-plasmoidviewer.sh -f planar -l floating <path/to/index.html>"

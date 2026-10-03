#!/usr/bin/env bash
# Makes org.james.htmlwidgets usable in your *real* plasmashell, not just
# plasmoidviewer. See README.md's "QtWebEngine + Plasma" section for why
# this is needed at all.
#
# What this does:
#   1. Builds tools/libwebengine_preinit.so if needed.
#   2. Installs it to a stable location outside this repo
#      (~/.local/share/html-widgets/), so it keeps working even if you move
#      or delete this checkout later.
#   3. Writes a systemd --user drop-in that sets LD_PRELOAD for ONLY the
#      plasma-plasmashell.service unit — not your whole graphical session,
#      not other apps. Nothing else on your system is affected.
#
# What this does NOT do: restart plasmashell. That's your call — run it
# when you're ready (see the printed instructions at the end).
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
INSTALL_DIR="$HOME/.local/share/html-widgets"
INSTALLED_SHIM="$INSTALL_DIR/libwebengine_preinit.so"
DROPIN_DIR="$HOME/.config/systemd/user/plasma-plasmashell.service.d"
DROPIN_FILE="$DROPIN_DIR/htmlwidgets-webengine-preinit.conf"

if [ ! -f "$SCRIPT_DIR/libwebengine_preinit.so" ]; then
    "$SCRIPT_DIR/build.sh"
fi

mkdir -p "$INSTALL_DIR"
cp -f "$SCRIPT_DIR/libwebengine_preinit.so" "$INSTALLED_SHIM"
echo "==> Installed shim to $INSTALLED_SHIM"

mkdir -p "$DROPIN_DIR"
cat > "$DROPIN_FILE" <<EOF
# Installed by org.james.htmlwidgets (tools/enable-live.sh).
# Preloads a shim that calls QtWebEngineQuick::initialize() before anything
# else runs, which plasmashell otherwise never does — without it, loading
# any QtWebEngine-based plasmoid (including org.james.htmlwidgets) crashes
# plasmashell. See that project's README for details.
#
# Remove with tools/disable-live.sh.
[Service]
Environment=LD_PRELOAD=$INSTALLED_SHIM
EOF
echo "==> Wrote $DROPIN_FILE"

systemctl --user daemon-reload
echo "==> Reloaded systemd user units"

cat <<EOF

Done. Note: this loads Qt WebEngine's libraries into plasmashell at
startup from now on (a one-time ~tens-of-MB memory bump), whether or not
you're actively using an HTML widget.

Nothing has been restarted yet. When you're ready:

    systemctl --user restart plasma-plasmashell.service

(your panels/desktop will flicker and reload, same as a crash recovery —
expected, and not harmful). After that, org.james.htmlwidgets can be added
from Plasma's "Add Widgets" like any other widget.

To undo everything this script did: tools/disable-live.sh
EOF

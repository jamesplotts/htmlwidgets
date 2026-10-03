#!/usr/bin/env bash
# Undoes tools/enable-live.sh: removes the systemd drop-in that preloads
# the WebEngine init shim into plasmashell, and the installed shim itself.
# Does not restart plasmashell — do that yourself when ready.
set -euo pipefail

DROPIN_FILE="$HOME/.config/systemd/user/plasma-plasmashell.service.d/htmlwidgets-webengine-preinit.conf"
INSTALLED_SHIM="$HOME/.local/share/html-widgets/libwebengine_preinit.so"

if [ -f "$DROPIN_FILE" ]; then
    rm -f "$DROPIN_FILE"
    echo "==> Removed $DROPIN_FILE"
    systemctl --user daemon-reload
    echo "==> Reloaded systemd user units"
else
    echo "==> No drop-in found at $DROPIN_FILE (already removed?)"
fi

if [ -f "$INSTALLED_SHIM" ]; then
    rm -f "$INSTALLED_SHIM"
    echo "==> Removed $INSTALLED_SHIM"
fi

cat <<EOF

Done. org.james.htmlwidgets (and any other QtWebEngine plasmoid) will go
back to crashing plasmashell on load until you run enable-live.sh again.

Restart plasmashell to fully drop LD_PRELOAD from its running process:

    systemctl --user restart plasma-plasmashell.service
EOF

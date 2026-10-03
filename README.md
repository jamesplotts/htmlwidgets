# htmlwidgets

A KDE Plasma 6 plasmoid (`org.james.htmlwidgets`) that hosts an HTML5/JS
widget in a transparent QtWebEngine view, with a small QWebChannel bridge
exposing basic system stats — and, opt-in, shell command execution — to the
page's JavaScript.

Built and tested on Plasma 6.3.6 / Debian 13 (MX Linux 25), Wayland.

## What it does

- Loads a local HTML file you choose in the widget's config dialog
  (default: `~/.local/share/html-widgets/sample/index.html`).
- Transparent background, so the HTML fully controls its own look.
- Persistent (not off-the-record) WebEngine profile — `localStorage`
  survives plasmashell restarts.
- Exposes a `backend` object to page JS over QWebChannel:
  - `backend.cpu(cb)` → `cb({percent})`
  - `backend.memory(cb)` → `cb({totalMb, usedMb, availableMb, percent})`
  - `backend.uptime(cb)` → `cb({seconds})`
  - `backend.run(cmd)` — fires a shell command via Plasma's "executable"
    data engine; the result arrives asynchronously through the
    `backend.commandFinished(cmd, stdout, stderr, exitCode)` signal.
    **Disabled by default** — gated behind a checkbox in the config
    dialog ("Allow the page to run shell commands").
- Works as a desktop widget or in a panel.
- Ships a sample widget (clock + CPU/mem gauges) in `sample-widgets/sample/`.

## ⚠️ `run()` is a deliberate security hole

Any HTML file this widget loads with `run()` enabled gets shell access as
your user. That's why it's off by default. Only point this widget at HTML
you wrote yourself and trust, and only enable the checkbox for that widget.

## Requirements

```
sudo apt install plasma-sdk   # for plasmoidviewer, kpackagetool6 testing
```

These are needed too, but are already present on a stock Plasma 6.3 desktop
install: `qml6-module-qtwebengine`, `qml6-module-qtwebchannel`,
`plasma-widgets-addons`, `qml6-module-org-kde-plasma-plasma5support`.

## Install

```
./install.sh
```

This installs the plasmoid with `kpackagetool6` and copies the sample
widget to `~/.local/share/html-widgets/sample/`. Re-run it any time you
change the plasmoid source — it upgrades in place.

Add the widget from Plasma's "Add Widgets" panel ("HTML Widget Host"), or
test it standalone without touching your live session:

```
plasmoidviewer -a org.james.htmlwidgets
```

## Repo layout

```
package/org.james.htmlwidgets/   the plasmoid itself
sample-widgets/sample/           the bundled sample HTML widget's source
install.sh                       installs both of the above for the current user
```

## Writing your own widget

Point the config dialog's "HTML file" at any local `index.html`. In your
page:

```html
<script src="qrc:///qtwebchannel/qwebchannel.js"></script>
<script>
  new QWebChannel(qt.webChannelTransport, function (channel) {
    var backend = channel.objects.backend;
    backend.cpu(function (r) { console.log(r.percent); });
  });
</script>
```

See `sample-widgets/sample/app.js` for a complete example, including the
`run()` / `commandFinished` pattern.

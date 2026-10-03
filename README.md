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

## Testing with plasmoidviewer

```
./tools/test-plasmoidviewer.sh -f planar -l floating
```

This builds (first run only) and `LD_PRELOAD`s a small shim before calling
`plasmoidviewer -a org.james.htmlwidgets`. **Don't call plasmoidviewer
directly** — see below for why.

## ⚠️ QtWebEngine + Plasma: a real ordering bug, and what it means for you

QtWebEngine has a hard requirement: `QtWebEngineQuick::initialize()` must
run on the main thread *before* `QGuiApplication` is constructed. Plasma's
QML engine, though, resolves `import QtWebEngine` (and `dlopen()`s its
plugin) lazily on a background thread the first time a plasmoid using it is
loaded — by which point `QGuiApplication` already exists and the loader
thread isn't the main thread either. QtWebEngine hard-aborts the process
when that happens:

```
QtWebEngineQuick::initialize() must be called from the Qt gui thread.
```

This isn't a bug in this plasmoid's QML — it reproduces with any
QtWebEngine-using plasmoid, in both `plasmoidviewer` and `plasmashell`,
because neither host knows in advance that it needs to initialize
WebEngine before anything else touches it.

**The fix:** `tools/webengine_preinit.cpp` is a tiny shared library whose
constructor calls `QtWebEngineQuick::initialize()` — a shared library's
constructor runs during dynamic linking, before `main()`, which is the
earliest point `initialize()` can legally run. `LD_PRELOAD`ing it forces
that to happen before Plasma (or anything else) gets a chance to trip the
lazy/background path. `tools/test-plasmoidviewer.sh` does this for you for
testing.

**What this means for actually using the widget day-to-day:** adding
`org.james.htmlwidgets` through Plasma's "Add Widgets" into your *normal,
already-running* `plasmashell` will hit the same abort and crash
plasmashell, because that process was started without the shim preloaded.

### Enabling it for real

```
./tools/enable-live.sh
```

On a systemd-managed Plasma session (check with `systemctl --user status
plasma-plasmashell.service` — this is the default on most Plasma 6
distros, including Debian/MX), this:

1. Builds and installs the shim to `~/.local/share/html-widgets/` (outside
   this repo, so it keeps working if you move or delete this checkout).
2. Writes a `systemd --user` drop-in
   (`~/.config/systemd/user/plasma-plasmashell.service.d/`) that sets
   `LD_PRELOAD` for **only** the `plasma-plasmashell.service` unit — not
   your whole graphical session, not other apps.

It does **not** restart plasmashell — do that yourself when ready:

```
systemctl --user restart plasma-plasmashell.service
```

Your panels/desktop will flicker and reload, same as Plasma's normal crash
recovery. After that, `org.james.htmlwidgets` works from "Add Widgets"
like any other widget. This does mean Qt WebEngine's libraries load into
plasmashell at every startup from then on (a one-time ~tens-of-MB memory
bump), whether or not an HTML widget is actually on your desktop.

To undo: `./tools/disable-live.sh`, then restart plasmashell again.

If your Plasma session *isn't* systemd-managed, the equivalent is getting
`LD_PRELOAD` set for however plasmashell gets launched (e.g. an autostart
script) — same idea, different mechanism.

## Repo layout

```
package/org.james.htmlwidgets/   the plasmoid itself
sample-widgets/sample/           the bundled sample HTML widget's source
tools/                           WebEngine preinit shim, test/enable/disable scripts
install.sh                       installs the plasmoid + sample widget for the current user
```

## Known benign log noise

A few lines show up in `plasmoidviewer`/`journalctl --user` output that
look alarming but aren't actionable:

- `Storage name is empty. Cannot change profile from off-the-record to
  disk-based behavior until a proper storage name is set` / `Switching to
  disk-based behavior` — a one-time ordering quirk at startup, before the
  `storageName` property binding has been applied to the freshly-created
  `WebEngineProfile`. It resolves itself immediately, before the page
  loads; the profile is disk-based (persistent) throughout actual use.
- `Property 'valid'' of object 'Plasma5Support::DataSource' has no notify
  signal...` — a long-standing quirk of the `Plasma5Support` compatibility
  module itself, unrelated to anything in this plasmoid's QML.
- `QML WebEngineProfile: Please use WebEngineProfilePrototype...` — a
  Qt 6.9+ deprecation notice; harmless on the Qt 6.8 this was built against.

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

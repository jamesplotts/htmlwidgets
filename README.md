# htmlwidgets

A KDE Plasma 6 plasmoid (`org.james.htmlwidgets`) that hosts an HTML5/JS
widget in a transparent QtWebEngine view, with a small QWebChannel bridge
exposing basic system stats — and, opt-in, shell command execution — to the
page's JavaScript.

Built and tested on Plasma 6.3.6 / Debian 13 (MX Linux 25), Wayland.

Published on the KDE Store: https://www.opendesktop.org/p/2377033/

## What it does

- Loads a local HTML file you choose in the widget's config dialog — pick
  from the dropdown of bundled + your own custom widgets, or point it
  anywhere (default: the bundled sample widget).
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
  - `backend.httpFetch(url, method, cb)` → `cb(requestId)`, result arrives
    via `backend.httpFetchFinished(requestId, status, body, finalUrl)`.
    GETs (or HEADs) a URL from QML, not the page — bypasses page-level
    CORS entirely, since QML's HTTP client isn't a browser page subject to
    that policy. Always on (see the security note below for what that
    means). The radio widget's `radiogarden.js` is the reference
    consumer.
- Works as a desktop widget or in a panel, and is resizable like any other
  floating widget once placed.
- Ships six widgets as a matching set (shared card chrome, see
  `sample-widgets/common/card.css`) in `sample-widgets/`: `sample/`
  (clock + CPU/mem gauges), `weather/`, `calendar/`, `clock/`, `radio/`,
  and `camera/` (live HLS video, e.g. a Shinobi NVR monitor).

## ⚠️ `run()` and `httpFetch()` expand what loaded HTML can do

Any HTML file this widget loads with `run()` enabled gets shell access as
your user. That's why it's off by default. Only point this widget at HTML
you wrote yourself and trust, and only enable the checkbox for that widget.

`httpFetch()` is lower-risk (it can only issue outbound HTTP GET/HEAD
requests, not execute anything) but is **always on**, unlike `run()`.
Because it bypasses CORS via QML's own HTTP client, loaded HTML can use it
to read from URLs a browser page normally couldn't — including
localhost/LAN addresses — regardless of whether that target's own CORS
policy would allow a browser to read the response. It exists because some
APIs (Radio Garden's, for one) send no CORS headers at all, so page-level
`fetch()` can't reach them no matter how trusted the page is.

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

To preview a specific widget instead of whatever's saved in the config,
pass its `index.html` path as an extra argument — this rides
plasmoidviewer's `externalData` CLI argument (the same mechanism real
drag-and-drop onto the widget uses), which `main.qml` treats as an
`htmlPath` override:

```
./tools/test-plasmoidviewer.sh -f planar -l floating \
  ~/.local/share/html-widgets/radio/index.html
```

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
sample-widgets/common/           shared card chrome (card.css) the bundled widgets all link to
sample-widgets/sample/           clock + CPU/mem gauges, the original demo widget
sample-widgets/weather/          current conditions + 4-day forecast (Open-Meteo)
sample-widgets/calendar/         month grid
sample-widgets/clock/            round analog clock
sample-widgets/radio/            Radio Garden player with spectrum analyzer
sample-widgets/camera/           live HLS video player (vendors hls.js)
tools/                           WebEngine preinit shim, test/enable/disable scripts
install.sh                       installs the plasmoid + all bundled widgets for the current user
dist/                             built .plasmoid package for publishing (gitignored, built on demand)
```

## Publishing an update

```
./tools/build-plasmoid-package.sh
```

Syncs `sample-widgets/` into the package (same as `install.sh`) and zips
it into `dist/org.james.htmlwidgets.plasmoid` — a `.plasmoid` file is just
the package directory's contents zipped with `metadata.json` at the root,
not nested inside another folder. That's the file to upload as a new file
version on the [KDE Store listing](https://www.opendesktop.org/p/2377033/)
(Edit Product → Files → Add File(s)), alongside `dist/README.md` if its
content changed too. Bump the version number both in the upload form and
in `metadata.json`'s `KPlugin.Version`.

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

## The radio widget

`sample-widgets/radio/` is a retro hi-fi-styled player for Radio Garden
stations (search, favorites, a brushed-metal faceplate with a scrolling
LCD station name, and a ~20-bar LED spectrum analyzer). A few things worth
knowing if you touch it:

- **The Radio Garden API has no CORS headers at all.** A curl request with
  faked browser headers succeeding means nothing here — curl doesn't
  implement CORS, browsers do. Confirmed empirically: page-level `fetch()`
  to `radio.garden/api/...` gets flatly blocked by Chromium. Every API
  call in `radiogarden.js` goes through `backend.httpFetch()` instead (see
  above) — plain network GETs from QML, no CORS involved at all.
- **Cloudflare also 403s non-browser-looking requests** to that API, so
  `Backend.qml`'s `httpFetch()` sets a real browser `User-Agent` and
  `Referer` — headers page-level `fetch()`/XHR are forbidden from setting
  themselves, but QML's XHR isn't a sandboxed page and has no such
  restriction.
- **The listen/stream endpoint redirects, and the redirect hop itself
  lacks CORS headers** (even though the final CDN response usually sends
  `Access-Control-Allow-Origin: *`). `<audio crossorigin="anonymous">`
  enforces CORS across the *whole* redirect chain, not just the final
  response, so playing the raw `/api/ara/content/listen/{id}/channel.mp3`
  URL directly fails to load at all. The fix: resolve to the final CDN URL
  first (`RadioGarden.resolveStreamUrl()`, also via the bridge) and play
  *that* — which is also the "resolved stream URL cached" behavior the
  favorites list wants anyway.
- **`settings.playbackRequiresUserGesture` is `false`** in `main.qml`.
  QtWebEngine's default here is stricter than Chromium's own (which allows
  muted autoplay); for a widget the user already chose to add to their
  desktop, that extra gate doesn't protect against anything and could make
  a real click on the widget's own play button mysteriously fail.

**Spectrum analyzer — Web Audio won, no cava needed.** The brief said to
try `AnalyserNode` first and fall back to piping `cava` through the bridge
if the stream turned out CORS-tainted. Tested directly in the running
widget (not guessed): once playback uses the resolved CDN URL (see above),
`analyser.getByteFrequencyData()` returns real, moving values — a 2-second
diagnostic in `spectrum.js` logged **120/120 frames with signal** on KEXP.
So the shipped widget is Web Audio only; there's no cava integration here.
For the record, since it was worth checking either way: `cava` isn't
installed on this machine (`sudo apt install cava` if you want it for
something else) — moot for this widget, since it didn't end up needed.

## The camera widget

`sample-widgets/camera/` plays a live HLS (`.m3u8`) video stream — built
and tested against a [Shinobi](https://shinobi.video/) NVR monitor, but
works with any HLS source. A few things worth knowing:

- **No bridge needed, unlike weather/radio.** Confirmed by inspecting the
  actual network requests Shinobi's own dashboard makes, then checking the
  response headers directly: both the `.m3u8` playlist and the `.ts`
  segments send `Access-Control-Allow-Origin: *`. So this one talks to the
  stream directly via `fetch()`/`XMLHttpRequest` (inside `hls.js`, not our
  code) — no `backend.httpFetch()` detour required. If you point this at
  a different HLS source that *doesn't* send permissive CORS, you'd hit
  the same wall the radio widget did and need the bridge.
- **Chromium has no native HLS support in `<video>`**, so this vendors
  [hls.js](https://github.com/video-dev/hls.js) (`hls.min.js`,
  Apache-2.0, license text in `HLS_JS_LICENSE`) to demux the stream into
  MediaSource Extensions. Deliberately vendored rather than loaded from a
  CDN — a widget for viewing a *local* camera shouldn't need internet
  access to function.
- **Config is a label + stream URL** per camera (gear-equivalent "manage
  cameras" overlay, same list/add/remove pattern as radio's favorites).
  For Shinobi specifically, the URL is
  `http://<host>:8082/<api_key>/hls/<group_key>/<monitor_id>/s.m3u8` —
  grab it from your Shinobi dashboard's own network requests (or Monitor
  Settings) once per camera.
- **Resource cost is real and worth knowing going in.** Unlike every
  other widget here, this one continuously decodes live video — actual
  CPU/GPU load and bandwidth for as long as it's playing. The stop button
  fully tears down the `hls.js` instance and detaches the `<video>` src
  (not just paused) specifically so an idle camera widget costs nothing.
- Built-in reconnect: `hls.js`'s error events are wired up to retry on
  network hiccups (`startLoad()`) and recover from decode errors
  (`recoverMediaError()`) rather than just dying — reasonable to expect
  for something meant to sit on a desktop for days.

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

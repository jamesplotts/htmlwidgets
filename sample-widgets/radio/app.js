(function () {
  "use strict";

  var FAVORITES_KEY = "htmlwidgets.radio.favorites";
  var VOLUME_KEY = "htmlwidgets.radio.volume";
  var KNOB_ANGLE_RANGE = 270; // degrees of sweep, centered
  var KNOB_DRAG_PIXELS_FOR_FULL_SWEEP = 160;

  var player = document.getElementById("player");
  var playBtn = document.getElementById("playBtn");
  var playIcon = document.getElementById("playIcon");
  var stopIcon = document.getElementById("stopIcon");
  var prevBtn = document.getElementById("prevBtn");
  var nextBtn = document.getElementById("nextBtn");
  var favBtn = document.getElementById("favBtn");
  var favoritesListBtn = document.getElementById("favoritesListBtn");
  var searchBtn = document.getElementById("searchBtn");
  var closeSearchBtn = document.getElementById("closeSearchBtn");
  var searchOverlay = document.getElementById("searchOverlay");
  var searchInput = document.getElementById("searchInput");
  var searchStatus = document.getElementById("searchStatus");
  var searchResults = document.getElementById("searchResults");
  var favoritesOverlay = document.getElementById("favoritesOverlay");
  var closeFavoritesBtn = document.getElementById("closeFavoritesBtn");
  var favoritesStatus = document.getElementById("favoritesStatus");
  var favoritesList = document.getElementById("favoritesList");
  var marquee = document.getElementById("marquee");
  var marqueeText = document.getElementById("marqueeText");
  var lcdSub = document.getElementById("lcdSub");
  var knobWrap = document.getElementById("knobWrap");
  var knobPointer = document.getElementById("knobPointer");
  var spectrumCanvas = document.getElementById("spectrum");

  var favorites = [];
  var current = null; // { id, title, subtitle, streamUrl }
  var isPlaying = false;
  var volume = 0.7;
  var spectrumReady = false;
  var spectrumWorking = null; // null = untested, true/false after diagnostic
  var placeStack = []; // breadcrumb for drilling into a place's channels

  // ---------- storage ----------

  function loadFavorites() {
    try {
      var raw = localStorage.getItem(FAVORITES_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch (e) { return []; }
  }

  function saveFavorites() {
    try { localStorage.setItem(FAVORITES_KEY, JSON.stringify(favorites)); } catch (e) { /* ignore */ }
  }

  function loadVolume() {
    try {
      var raw = localStorage.getItem(VOLUME_KEY);
      var v = raw !== null ? parseFloat(raw) : NaN;
      return isNaN(v) ? 0.7 : Math.max(0, Math.min(1, v));
    } catch (e) { return 0.7; }
  }

  function saveVolume() {
    try { localStorage.setItem(VOLUME_KEY, String(volume)); } catch (e) { /* ignore */ }
  }

  // ---------- LCD ----------

  function setMarquee(text) {
    marqueeText.textContent = text;
    // Duplicate the text for a seamless looping ticker; width/duration
    // depend on content length, so measure after layout.
    requestAnimationFrame(function () {
      var dup = marqueeText.cloneNode(true);
      marquee.innerHTML = "";
      marquee.appendChild(marqueeText);
      marquee.appendChild(dup);
      var textWidth = marqueeText.getBoundingClientRect().width;
      var wrapWidth = marquee.parentElement.getBoundingClientRect().width;
      if (textWidth <= wrapWidth) {
        marquee.classList.add("no-scroll");
      } else {
        marquee.classList.remove("no-scroll");
        var duration = Math.max(6, textWidth / 40); // ~40px/sec
        marquee.style.setProperty("--marquee-duration", duration + "s");
      }
    });
  }

  function setSub(text) {
    lcdSub.textContent = text;
  }

  // ---------- volume knob ----------

  function applyVolume() {
    player.volume = volume;
    var angle = -KNOB_ANGLE_RANGE / 2 + volume * KNOB_ANGLE_RANGE;
    knobPointer.setAttribute("transform", "rotate(" + angle.toFixed(1) + " 30 30)");
  }

  function setVolume(v) {
    volume = Math.max(0, Math.min(1, v));
    applyVolume();
    saveVolume();
  }

  (function initKnobDrag() {
    var dragging = false, startY = 0, startVolume = 0;
    knobWrap.addEventListener("pointerdown", function (e) {
      dragging = true;
      startY = e.clientY;
      startVolume = volume;
      knobWrap.setPointerCapture(e.pointerId);
    });
    knobWrap.addEventListener("pointermove", function (e) {
      if (!dragging) return;
      var dy = startY - e.clientY;
      setVolume(startVolume + dy / KNOB_DRAG_PIXELS_FOR_FULL_SWEEP);
    });
    knobWrap.addEventListener("pointerup", function () { dragging = false; });
    knobWrap.addEventListener("wheel", function (e) {
      e.preventDefault();
      setVolume(volume - Math.sign(e.deltaY) * 0.05);
    }, { passive: false });
  })();

  // ---------- playback ----------

  function ensureSpectrum() {
    if (spectrumReady) return;
    spectrumReady = true;
    Spectrum.setCanvas(spectrumCanvas);
    var ok = Spectrum.init(player, function (working) {
      spectrumWorking = working;
      if (!working) {
        spectrumCanvas.classList.add("hidden");
        console.log("[radio] spectrum analyzer hidden (no signal detected — CORS-tainted stream)");
      }
    });
    if (!ok) {
      spectrumCanvas.classList.add("hidden");
      spectrumWorking = false;
    }
  }

  function resizeCanvas() {
    var rect = spectrumCanvas.getBoundingClientRect();
    spectrumCanvas.width = rect.width;
    spectrumCanvas.height = rect.height;
  }

  function setPlayingUI(playing) {
    isPlaying = playing;
    playIcon.classList.toggle("hidden", playing);
    stopIcon.classList.toggle("hidden", !playing);
    playBtn.classList.toggle("playing", playing);
  }

  // Radio Garden's listen endpoint 302s to the real CDN URL, and while
  // that final CDN response usually sends permissive CORS, the
  // radio.garden redirect hop itself doesn't — and <audio crossorigin>
  // enforces CORS across the *whole* redirect chain, not just the final
  // response. So we always resolve to the final URL first and play that
  // directly, skipping the CORS-less hop entirely (confirmed empirically:
  // playing the listen URL as-is fails to load at all with crossorigin set).
  function play(station) {
    current = station;
    setMarquee(station.title);
    setSub(station.subtitle || "");
    updateFavButton();
    ensureSpectrum();

    function startWithUrl(src) {
      player.src = src;
      player.play().then(function () {
        setPlayingUI(true);
        // Measure *after* unhiding, not before — getBoundingClientRect()
        // on a display:none element returns an all-zero rect, which would
        // otherwise zero out the canvas's actual drawing buffer before it
        // ever gets shown.
        spectrumCanvas.classList.remove("hidden");
        resizeCanvas();
        Spectrum.start();
      }).catch(function (err) {
        console.log("[radio] playback failed: " + err.message);
        setPlayingUI(false);
        setSub("Playback failed");
      });
    }

    if (station.streamUrl) {
      startWithUrl(station.streamUrl);
      return;
    }

    setSub("Resolving stream…");
    RadioGarden.resolveStreamUrl(station.id).then(function (resolved) {
      station.streamUrl = resolved;
      var fav = findFavorite(station.id);
      if (fav) { fav.streamUrl = resolved; saveFavorites(); }
      if (current === station) {
        setSub(station.subtitle || "");
        startWithUrl(resolved);
      }
    }).catch(function () {
      // Last resort: try the redirect URL directly. Likely still
      // CORS-blocked with crossorigin set, but worth attempting.
      startWithUrl(RadioGarden.listenUrl(station.id));
    });
  }

  function stop() {
    player.pause();
    setPlayingUI(false);
    Spectrum.stop();
  }

  playBtn.addEventListener("click", function () {
    if (isPlaying) { stop(); return; }
    if (current) { play(current); return; }
    if (favorites.length) { play(favorites[0]); return; }
    openSearch();
  });

  // ---------- favorites ----------

  function findFavorite(id) {
    for (var i = 0; i < favorites.length; i++) {
      if (favorites[i].id === id) return favorites[i];
    }
    return null;
  }

  function updateFavButton() {
    favBtn.classList.toggle("active", !!(current && findFavorite(current.id)));
  }

  function toggleCurrentFavorite() {
    if (!current) return;
    var existing = findFavorite(current.id);
    if (existing) {
      favorites = favorites.filter(function (f) { return f.id !== current.id; });
    } else {
      favorites.push({
        id: current.id,
        title: current.title,
        subtitle: current.subtitle,
        streamUrl: current.streamUrl || null
      });
    }
    saveFavorites();
    updateFavButton();
  }

  favBtn.addEventListener("click", toggleCurrentFavorite);

  function stepFavorite(delta) {
    if (!favorites.length) return;
    var idx = current ? favorites.findIndex(function (f) { return f.id === current.id; }) : -1;
    var nextIdx = ((idx < 0 ? 0 : idx) + delta + favorites.length) % favorites.length;
    play(favorites[nextIdx]);
  }

  prevBtn.addEventListener("click", function () { stepFavorite(-1); });
  nextBtn.addEventListener("click", function () { stepFavorite(1); });

  // ---------- favorites list overlay ----------

  function openFavoritesList() {
    closeSearch();
    favoritesOverlay.classList.remove("hidden");
    renderFavoritesList();
  }

  function closeFavoritesList() {
    favoritesOverlay.classList.add("hidden");
  }

  function renderFavoritesList() {
    favoritesStatus.textContent = favorites.length ? "" : "No favorites yet — add one from search.";
    favoritesList.innerHTML = "";
    var frag = document.createDocumentFragment();

    favorites.forEach(function (fav) {
      var row = document.createElement("div");
      row.className = "radio-result";

      var info = document.createElement("div");
      info.className = "radio-result-info";
      var title = document.createElement("div");
      title.className = "radio-result-title";
      title.textContent = fav.title;
      var subtitle = document.createElement("div");
      subtitle.className = "radio-result-subtitle";
      subtitle.textContent = fav.subtitle || "";
      info.appendChild(title);
      info.appendChild(subtitle);
      row.appendChild(info);

      var removeBtn = document.createElement("button");
      removeBtn.className = "radio-result-remove";
      removeBtn.title = "Remove from favorites";
      removeBtn.innerHTML = '<svg viewBox="0 0 24 24"><line x1="5" y1="12" x2="19" y2="12"/></svg>';
      removeBtn.addEventListener("click", function (e) {
        e.stopPropagation();
        favorites = favorites.filter(function (f) { return f.id !== fav.id; });
        saveFavorites();
        updateFavButton();
        renderFavoritesList();
      });
      row.appendChild(removeBtn);

      row.addEventListener("click", function () {
        play(fav);
        closeFavoritesList();
      });

      frag.appendChild(row);
    });

    favoritesList.appendChild(frag);
  }

  favoritesListBtn.addEventListener("click", openFavoritesList);
  closeFavoritesBtn.addEventListener("click", closeFavoritesList);

  // ---------- search overlay ----------

  function openSearch() {
    closeFavoritesList();
    searchOverlay.classList.remove("hidden");
    searchInput.value = "";
    searchStatus.textContent = "";
    searchResults.innerHTML = "";
    placeStack = [];
    searchInput.focus();
  }

  function closeSearch() {
    searchOverlay.classList.add("hidden");
  }

  searchBtn.addEventListener("click", openSearch);
  closeSearchBtn.addEventListener("click", closeSearch);
  searchInput.addEventListener("keydown", function (e) {
    if (e.key === "Enter") runSearch(searchInput.value.trim());
    if (e.key === "Escape") closeSearch();
  });

  function renderResults(items, backLabel) {
    searchResults.innerHTML = "";
    var frag = document.createDocumentFragment();

    if (backLabel) {
      var back = document.createElement("div");
      back.className = "radio-result";
      back.innerHTML = '<div class="radio-result-info"><div class="radio-result-title">← ' + backLabel + '</div></div>';
      back.addEventListener("click", function () {
        placeStack.pop();
        if (placeStack.length) {
          showPlace(placeStack[placeStack.length - 1]);
        } else {
          renderResults(items.__searchResults || [], null);
        }
      });
      frag.appendChild(back);
    }

    items.forEach(function (item) {
      var row = document.createElement("div");
      row.className = "radio-result" + (item.kind === "place" ? " is-place" : "");

      var info = document.createElement("div");
      info.className = "radio-result-info";
      var title = document.createElement("div");
      title.className = "radio-result-title";
      title.textContent = item.title;
      var subtitle = document.createElement("div");
      subtitle.className = "radio-result-subtitle";
      subtitle.textContent = item.kind === "place"
        ? (item.count + (item.count === 1 ? " station" : " stations") + (item.subtitle ? " — " + item.subtitle : ""))
        : item.subtitle;
      info.appendChild(title);
      info.appendChild(subtitle);
      row.appendChild(info);

      if (item.kind === "channel") {
        var addBtn = document.createElement("button");
        addBtn.className = "radio-result-add";
        addBtn.title = "Add to favorites";
        addBtn.innerHTML = '<svg viewBox="0 0 24 24"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>';
        addBtn.addEventListener("click", function (e) {
          e.stopPropagation();
          if (!findFavorite(item.id)) {
            favorites.push({ id: item.id, title: item.title, subtitle: item.subtitle, streamUrl: null });
            saveFavorites();
          }
          addBtn.innerHTML = '<svg viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>';
        });
        row.appendChild(addBtn);

        row.addEventListener("click", function () {
          play({ id: item.id, title: item.title, subtitle: item.subtitle, streamUrl: null });
          closeSearch();
        });
      } else {
        row.addEventListener("click", function () { showPlace(item); });
      }

      frag.appendChild(row);
    });

    searchResults.appendChild(frag);
  }

  function showPlace(place) {
    placeStack.push(place);
    searchStatus.textContent = "Loading " + place.title + "…";
    RadioGarden.channelsForPlace(place.placeId)
      .then(function (channels) {
        searchStatus.textContent = channels.length ? "" : "No stations found here.";
        renderResults(channels, place.title);
      })
      .catch(function (err) {
        searchStatus.textContent = "Couldn't load that city — try again later.";
        searchStatus.classList.add("error");
        console.log("[radio] channelsForPlace failed: " + err.message);
      });
  }

  function runSearch(query) {
    if (!query) return;
    searchStatus.textContent = "Searching…";
    searchStatus.classList.remove("error");
    searchResults.innerHTML = "";
    placeStack = [];

    RadioGarden.search(query)
      .then(function (items) {
        items.__searchResults = items;
        searchStatus.textContent = items.length ? "" : "No results.";
        renderResults(items, null);
      })
      .catch(function (err) {
        searchStatus.textContent = "Search unavailable right now.";
        searchStatus.classList.add("error");
        console.log("[radio] search failed: " + err.message);
      });
  }

  // ---------- init ----------

  favorites = loadFavorites();
  volume = loadVolume();
  applyVolume();
  updateFavButton();

  if (favorites.length) {
    current = favorites[0];
    setMarquee(current.title);
    setSub(current.subtitle || "");
  }

  spectrumCanvas.classList.add("hidden");
  window.addEventListener("resize", resizeCanvas);

  // Search/channel-list/resolve calls need the backend bridge (see
  // radiogarden.js) — wire it up before anything tries to use it.
  new QWebChannel(qt.webChannelTransport, function (channel) {
    RadioGarden.setBackend(channel.objects.backend);
  });
})();

// Camera widget: plays an HLS (.m3u8) stream — e.g. a Shinobi NVR monitor —
// via hls.js (vendored locally; Chromium/QtWebEngine has no native HLS
// support in <video>, so MediaSource Extensions + a JS demuxer is
// required). Multiple cameras can be saved and cycled through with
// prev/next, same pattern as the radio widget's favorites list.
(function () {
  "use strict";

  var CAMERAS_KEY = "htmlwidgets.camera.cameras";
  var CURRENT_KEY = "htmlwidgets.camera.currentId";
  var MUTED_KEY = "htmlwidgets.camera.muted";

  var videoWrap = document.getElementById("videoWrap");
  var player = document.getElementById("player");
  var placeholder = document.getElementById("placeholder");
  var placeholderText = document.getElementById("placeholderText");
  var camLabel = document.getElementById("camLabel");
  var statusDot = document.getElementById("statusDot");
  var prevBtn = document.getElementById("prevBtn");
  var nextBtn = document.getElementById("nextBtn");
  var playBtn = document.getElementById("playBtn");
  var playIcon = document.getElementById("playIcon");
  var stopIcon = document.getElementById("stopIcon");
  var muteBtn = document.getElementById("muteBtn");
  var mutedIcon = document.getElementById("mutedIcon");
  var unmutedIcon = document.getElementById("unmutedIcon");
  var manageBtn = document.getElementById("manageBtn");
  var manageOverlay = document.getElementById("manageOverlay");
  var closeManageBtn = document.getElementById("closeManageBtn");
  var camList = document.getElementById("camList");
  var newLabel = document.getElementById("newLabel");
  var newUrl = document.getElementById("newUrl");
  var addCamBtn = document.getElementById("addCamBtn");
  var cancelEditBtn = document.getElementById("cancelEditBtn");
  var addError = document.getElementById("addError");

  var cameras = [];
  var currentId = null;
  var hls = null;
  var isPlaying = false;
  var muted = true;
  // Id of the camera being edited, or null when the add row is for a new
  // entry. Same two inputs serve both; addCamera() branches on this.
  var editingId = null;

  // ---------- storage ----------

  function loadCameras() {
    try {
      var raw = localStorage.getItem(CAMERAS_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch (e) { return []; }
  }

  function saveCameras() {
    try { localStorage.setItem(CAMERAS_KEY, JSON.stringify(cameras)); } catch (e) { /* ignore */ }
  }

  function loadCurrentId() {
    try { return localStorage.getItem(CURRENT_KEY); } catch (e) { return null; }
  }

  function saveCurrentId(id) {
    try { localStorage.setItem(CURRENT_KEY, id); } catch (e) { /* ignore */ }
  }

  function loadMuted() {
    try {
      var raw = localStorage.getItem(MUTED_KEY);
      return raw === null ? true : raw === "1";
    } catch (e) { return true; }
  }

  function saveMuted(m) {
    try { localStorage.setItem(MUTED_KEY, m ? "1" : "0"); } catch (e) { /* ignore */ }
  }

  function findCamera(id) {
    for (var i = 0; i < cameras.length; i++) {
      if (cameras[i].id === id) return cameras[i];
    }
    return null;
  }

  // ---------- status ----------

  function setStatus(state) {
    statusDot.className = "status-dot" + (state ? " " + state : "");
  }

  // ---------- playback ----------

  function teardownHls() {
    if (hls) {
      hls.destroy();
      hls = null;
    }
  }

  function stop() {
    teardownHls();
    player.pause();
    player.removeAttribute("src");
    player.load();
    isPlaying = false;
    playIcon.classList.remove("hidden");
    stopIcon.classList.add("hidden");
    setStatus("");
  }

  function play() {
    var cam = findCamera(currentId);
    if (!cam) {
      placeholder.classList.remove("hidden");
      placeholderText.textContent = "No camera configured — open the list icon to add one";
      return;
    }

    placeholder.classList.add("hidden");
    camLabel.textContent = cam.label;
    setStatus("connecting");
    teardownHls();

    if (window.Hls && Hls.isSupported()) {
      hls = new Hls({ lowLatencyMode: true });
      hls.on(Hls.Events.MANIFEST_PARSED, function () {
        player.play().catch(function (err) {
          console.log("[camera] play() failed: " + err.message);
        });
      });
      hls.on(Hls.Events.FRAG_BUFFERED, function () {
        setStatus("live");
      });
      hls.on(Hls.Events.ERROR, function (event, data) {
        if (!data.fatal) return;
        console.log("[camera] hls fatal error: " + data.type + " / " + data.details);
        setStatus("error");
        switch (data.type) {
          case Hls.ErrorTypes.NETWORK_ERROR:
            hls.startLoad();
            break;
          case Hls.ErrorTypes.MEDIA_ERROR:
            hls.recoverMediaError();
            break;
          default:
            teardownHls();
            stop();
            break;
        }
      });
      hls.loadSource(cam.url);
      hls.attachMedia(player);
    } else if (player.canPlayType("application/vnd.apple.mpegurl")) {
      // Not expected on Chromium/QtWebEngine, but a reasonable fallback.
      player.src = cam.url;
      player.play().catch(function (err) {
        console.log("[camera] play() failed: " + err.message);
      });
      setStatus("live");
    } else {
      console.log("[camera] HLS not supported in this engine");
      setStatus("error");
      placeholder.classList.remove("hidden");
      placeholderText.textContent = "HLS playback isn't supported here";
      return;
    }

    isPlaying = true;
    playIcon.classList.add("hidden");
    stopIcon.classList.remove("hidden");
  }

  function selectCamera(id) {
    currentId = id;
    saveCurrentId(id);
    if (isPlaying || !findCamera(id)) {
      play();
    } else {
      var cam = findCamera(id);
      if (cam) camLabel.textContent = cam.label;
    }
  }

  playBtn.addEventListener("click", function () {
    if (isPlaying) stop(); else play();
  });

  function step(delta) {
    if (!cameras.length) return;
    var idx = cameras.findIndex(function (c) { return c.id === currentId; });
    var nextIdx = ((idx < 0 ? 0 : idx) + delta + cameras.length) % cameras.length;
    selectCamera(cameras[nextIdx].id);
  }

  prevBtn.addEventListener("click", function () { step(-1); });
  nextBtn.addEventListener("click", function () { step(1); });

  function applyMuted() {
    player.muted = muted;
    mutedIcon.classList.toggle("hidden", !muted);
    unmutedIcon.classList.toggle("hidden", muted);
  }

  muteBtn.addEventListener("click", function () {
    muted = !muted;
    applyMuted();
    saveMuted(muted);
  });

  // ---------- manage overlay ----------

  function renderCamList() {
    camList.innerHTML = "";
    var frag = document.createDocumentFragment();

    cameras.forEach(function (cam) {
      var row = document.createElement("div");
      row.className = "cam-list-item" + (cam.id === currentId ? " active" : "");

      var label = document.createElement("div");
      label.className = "cam-list-item-label";
      label.textContent = cam.label;
      row.appendChild(label);

      var editBtn = document.createElement("button");
      editBtn.className = "cam-edit-btn";
      editBtn.title = "Edit";
      editBtn.innerHTML = '<svg viewBox="0 0 24 24"><path d="M12 20h9"/>' +
        '<path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z"/></svg>';
      editBtn.addEventListener("click", function (e) {
        e.stopPropagation();
        startEditCam(cam);
      });
      row.appendChild(editBtn);

      var removeBtn = document.createElement("button");
      removeBtn.className = "cam-remove-btn";
      removeBtn.title = "Remove";
      removeBtn.innerHTML = '<svg viewBox="0 0 24 24"><line x1="5" y1="12" x2="19" y2="12"/></svg>';
      removeBtn.addEventListener("click", function (e) {
        e.stopPropagation();
        cameras = cameras.filter(function (c) { return c.id !== cam.id; });
        saveCameras();
        if (editingId === cam.id) cancelEdit();
        if (currentId === cam.id) {
          stop();
          currentId = cameras.length ? cameras[0].id : null;
          saveCurrentId(currentId);
          if (currentId) play();
        }
        renderCamList();
      });
      row.appendChild(removeBtn);

      row.addEventListener("click", function () {
        selectCamera(cam.id);
        closeManage();
      });

      frag.appendChild(row);
    });

    camList.appendChild(frag);
  }

  function openManage() {
    manageOverlay.classList.remove("hidden");
    videoWrap.classList.add("always-show-ui");
    cancelEdit();
    renderCamList();
  }

  function closeManage() {
    manageOverlay.classList.add("hidden");
    videoWrap.classList.remove("always-show-ui");
  }

  manageBtn.addEventListener("click", openManage);
  closeManageBtn.addEventListener("click", closeManage);

  // Populates the add row with an existing camera's values and flips
  // addCamera() into update-in-place mode via editingId, instead of a
  // separate edit form. Mirrors the existing add/remove row rather than
  // introducing a new UI pattern.
  function startEditCam(cam) {
    editingId = cam.id;
    newLabel.value = cam.label;
    newUrl.value = cam.url;
    addError.textContent = "";
    addCamBtn.textContent = "Save";
    cancelEditBtn.classList.remove("hidden");
    newLabel.focus();
  }

  function cancelEdit() {
    editingId = null;
    newLabel.value = "";
    newUrl.value = "";
    addError.textContent = "";
    addCamBtn.textContent = "Add";
    cancelEditBtn.classList.add("hidden");
  }

  cancelEditBtn.addEventListener("click", cancelEdit);

  function addCamera() {
    var label = newLabel.value.trim();
    var url = newUrl.value.trim();
    if (!label || !url) {
      addError.textContent = "Both a label and a stream URL are needed.";
      return;
    }
    if (!/^https?:\/\//i.test(url)) {
      addError.textContent = "That doesn't look like a URL (expected http:// or https://).";
      return;
    }

    if (editingId) {
      var editedCam = findCamera(editingId);
      if (editedCam) {
        editedCam.label = label;
        editedCam.url = url;
        saveCameras();
        if (editedCam.id === currentId) {
          camLabel.textContent = editedCam.label;
          // URL may have changed — restart playback so it takes effect
          // immediately rather than waiting for the next manual play().
          if (isPlaying) play();
        }
      }
      cancelEdit();
      renderCamList();
      return;
    }

    var cam = { id: "cam" + Date.now(), label: label, url: url };
    cameras.push(cam);
    saveCameras();
    newLabel.value = "";
    newUrl.value = "";
    addError.textContent = "";
    renderCamList();
    if (cameras.length === 1) {
      selectCamera(cam.id);
    }
  }

  addCamBtn.addEventListener("click", addCamera);
  newUrl.addEventListener("keydown", function (e) {
    if (e.key === "Enter") addCamera();
  });

  // ---------- init ----------

  cameras = loadCameras();
  muted = loadMuted();
  applyMuted();

  currentId = loadCurrentId();
  if (!currentId || !findCamera(currentId)) {
    currentId = cameras.length ? cameras[0].id : null;
  }

  if (currentId) {
    play();
  } else {
    placeholder.classList.remove("hidden");
  }
})();

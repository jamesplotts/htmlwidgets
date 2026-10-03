// ~20-bar LED-style spectrum analyzer with peak-hold dots, driven by the
// Web Audio API's AnalyserNode reading the <audio> element's own stream.
//
// This only works if the stream's CORS headers don't taint the Web Audio
// graph — some Radio Garden-proxied stations send permissive CORS, some
// may not. Spectrum.start() runs a ~2s empirical check (real bin energy
// vs. silence) and reports the verdict via the diagnosticCallback given to
// init(), so the caller can show/hide the analyzer and log the finding
// instead of guessing.
var Spectrum = (function () {
  "use strict";

  var BAR_COUNT = 20;
  var FFT_SIZE = 64; // -> 32 frequency bins; we average pairs into 20-ish bars
  var PEAK_DECAY_PER_FRAME = 0.015;
  var DIAG_FRAMES = 120; // ~2s at 60fps
  var DIAG_NONZERO_THRESHOLD = 10;

  var canvas, ctx;
  var audioCtx, analyser, sourceNode;
  var dataArray;
  var peaks = [];
  var rafId = null;
  var diagFrames = 0, diagNonZeroFrames = 0, diagReported = false;
  var onDiagnostic = null;

  // Returns false if Web Audio / createMediaElementSource threw (some
  // embedding contexts disallow it outright) — caller should treat that
  // the same as a flatline.
  function init(audioEl, diagnosticCallback) {
    onDiagnostic = diagnosticCallback || null;
    try {
      var Ctx = window.AudioContext || window.webkitAudioContext;
      audioCtx = new Ctx();
      sourceNode = audioCtx.createMediaElementSource(audioEl);
      analyser = audioCtx.createAnalyser();
      analyser.fftSize = FFT_SIZE;
      analyser.smoothingTimeConstant = 0.75;
      sourceNode.connect(analyser);
      // Audio only reaches speakers if the graph is wired through to
      // destination — createMediaElementSource reroutes it, it doesn't
      // tap it.
      analyser.connect(audioCtx.destination);
      dataArray = new Uint8Array(analyser.frequencyBinCount);
      for (var i = 0; i < BAR_COUNT; i++) peaks.push(0);
      return true;
    } catch (e) {
      console.log("[radio] Web Audio init failed: " + e.message);
      return false;
    }
  }

  function setCanvas(el) {
    canvas = el;
    ctx = canvas.getContext("2d");
  }

  function barValues() {
    analyser.getByteFrequencyData(dataArray);
    var bins = dataArray.length;
    var perBar = Math.max(1, Math.floor(bins / BAR_COUNT));
    var values = [];
    for (var b = 0; b < BAR_COUNT; b++) {
      var sum = 0, count = 0;
      for (var i = b * perBar; i < (b + 1) * perBar && i < bins; i++) {
        sum += dataArray[i];
        count++;
      }
      values.push(count ? sum / count : 0);
    }
    return values;
  }

  function draw(values) {
    var w = canvas.width, h = canvas.height;
    ctx.clearRect(0, 0, w, h);

    var gap = 2;
    var barWidth = (w - gap * (BAR_COUNT - 1)) / BAR_COUNT;
    var segH = 3, segGap = 1.5;
    var numSegs = Math.max(1, Math.floor(h / (segH + segGap)));

    for (var i = 0; i < BAR_COUNT; i++) {
      var v = values[i] / 255; // 0..1
      peaks[i] = Math.max(v, peaks[i] - PEAK_DECAY_PER_FRAME);

      var x = i * (barWidth + gap);
      var litSegs = Math.round(v * numSegs);

      for (var s = 0; s < litSegs; s++) {
        var frac = s / numSegs;
        ctx.fillStyle = frac < 0.6 ? "#3ddc63" : frac < 0.85 ? "#d8e04a" : "#e04b3f";
        var sy = h - (s + 1) * (segH + segGap);
        ctx.fillRect(x, sy, barWidth, segH);
      }

      var peakSeg = Math.round(peaks[i] * numSegs);
      if (peakSeg > 0) {
        var py = h - peakSeg * (segH + segGap);
        ctx.fillStyle = "rgba(255,255,255,0.85)";
        ctx.fillRect(x, py, barWidth, 2);
      }
    }
  }

  function tick() {
    var values = barValues();

    if (!diagReported) {
      diagFrames++;
      var sum = values.reduce(function (a, b) { return a + b; }, 0);
      if (sum > 2) diagNonZeroFrames++;
      if (diagFrames >= DIAG_FRAMES) {
        diagReported = true;
        var working = diagNonZeroFrames > DIAG_NONZERO_THRESHOLD;
        console.log("[radio] spectrum diagnostic: " + diagNonZeroFrames + "/" + diagFrames +
          " frames had signal -> " + (working ? "WORKING" : "FLATLINED (likely CORS-tainted)"));
        if (onDiagnostic) onDiagnostic(working);
      }
    }

    draw(values);
    rafId = requestAnimationFrame(tick);
  }

  function start() {
    if (audioCtx && audioCtx.state === "suspended") audioCtx.resume();
    diagFrames = 0;
    diagNonZeroFrames = 0;
    diagReported = false;
    if (!rafId) rafId = requestAnimationFrame(tick);
  }

  function stop() {
    if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
    if (ctx && canvas) ctx.clearRect(0, 0, canvas.width, canvas.height);
  }

  return { init: init, setCanvas: setCanvas, start: start, stop: stop };
})();

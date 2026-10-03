// Sample widget: clock + CPU/mem gauges, driven by the "backend" object the
// plasmoid exposes over QWebChannel (see Backend.qml in the plasmoid).
(function () {
  "use strict";

  var backend = null;

  var clockEl = document.getElementById("clock");
  var dateEl = document.getElementById("date");
  var cpuArc = document.getElementById("cpuArc");
  var cpuValue = document.getElementById("cpuValue");
  var memArc = document.getElementById("memArc");
  var memValue = document.getElementById("memValue");
  var uptimeEl = document.getElementById("uptime");
  var runBox = document.getElementById("runBox");
  var runInput = document.getElementById("runInput");
  var runButton = document.getElementById("runButton");
  var runOutput = document.getElementById("runOutput");

  function setGauge(arcEl, valueEl, percent) {
    var clamped = Math.max(0, Math.min(100, percent || 0));
    arcEl.style.strokeDashoffset = String(100 - clamped);
    valueEl.textContent = Math.round(clamped) + "%";
  }

  function formatUptime(seconds) {
    seconds = Math.floor(seconds || 0);
    var days = Math.floor(seconds / 86400);
    var hours = Math.floor((seconds % 86400) / 3600);
    var mins = Math.floor((seconds % 3600) / 60);
    var parts = [];
    if (days > 0) parts.push(days + "d");
    parts.push(hours + "h");
    parts.push(mins + "m");
    return "uptime " + parts.join(" ");
  }

  function tickClock() {
    var now = new Date();
    clockEl.textContent = now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
    dateEl.textContent = now.toLocaleDateString([], { weekday: "long", month: "short", day: "numeric" });
  }

  function pollStats() {
    if (!backend) return;
    backend.cpu(function (result) {
      setGauge(cpuArc, cpuValue, result.percent);
    });
    backend.memory(function (result) {
      setGauge(memArc, memValue, result.percent);
    });
    backend.uptime(function (result) {
      uptimeEl.textContent = formatUptime(result.seconds);
    });
  }

  function initRunBox() {
    if (!backend.runEnabled) {
      return;
    }
    runBox.classList.remove("hidden");

    backend.commandFinished.connect(function (cmd, stdout, stderr, exitCode) {
      runOutput.textContent = stdout || stderr || ("(exit " + exitCode + ", no output)");
    });

    runButton.addEventListener("click", function () {
      var cmd = runInput.value.trim();
      if (!cmd) return;
      runOutput.textContent = "running…";
      backend.run(cmd);
    });
    runInput.addEventListener("keydown", function (event) {
      if (event.key === "Enter") runButton.click();
    });
  }

  tickClock();
  setInterval(tickClock, 1000);

  new QWebChannel(qt.webChannelTransport, function (channel) {
    backend = channel.objects.backend;
    pollStats();
    setInterval(pollStats, 2000);
    initRunBox();
  });
})();

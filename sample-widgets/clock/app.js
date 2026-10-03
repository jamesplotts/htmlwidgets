// Round analog clock: SVG face + requestAnimationFrame-driven hands for a
// smooth (not ticking) second-hand sweep.
(function () {
  "use strict";

  var STORAGE_KEY = "htmlwidgets.clock.flatBackground";

  var ticksGroup = document.getElementById("ticks");
  var hourHand = document.getElementById("hourHand");
  var minuteHand = document.getElementById("minuteHand");
  var secondHand = document.getElementById("secondHand");
  var card = document.getElementById("clockCard");
  var bgToggle = document.getElementById("bgToggle");

  var CX = 100, CY = 100;

  function applyFlat(flat) {
    card.classList.toggle("flat", flat);
  }

  function loadFlat() {
    try { return localStorage.getItem(STORAGE_KEY) === "1"; } catch (e) { return false; }
  }

  function saveFlat(flat) {
    try { localStorage.setItem(STORAGE_KEY, flat ? "1" : "0"); } catch (e) { /* ignore */ }
  }

  applyFlat(loadFlat());
  bgToggle.addEventListener("click", function () {
    var flat = !card.classList.contains("flat");
    applyFlat(flat);
    saveFlat(flat);
  });

  function buildTicks() {
    var frag = document.createDocumentFragment();
    for (var i = 0; i < 60; i++) {
      var angle = (i * 6) * (Math.PI / 180);
      var isHour = i % 5 === 0;
      var outerR = 84;
      var innerR = isHour ? 74 : 79;
      var x1 = CX + outerR * Math.sin(angle);
      var y1 = CY - outerR * Math.cos(angle);
      var x2 = CX + innerR * Math.sin(angle);
      var y2 = CY - innerR * Math.cos(angle);
      var line = document.createElementNS("http://www.w3.org/2000/svg", "line");
      line.setAttribute("x1", x1.toFixed(2));
      line.setAttribute("y1", y1.toFixed(2));
      line.setAttribute("x2", x2.toFixed(2));
      line.setAttribute("y2", y2.toFixed(2));
      line.setAttribute("stroke-width", isHour ? "2.2" : "1");
      line.setAttribute("opacity", isHour ? "0.85" : "0.45");
      frag.appendChild(line);
    }
    ticksGroup.appendChild(frag);
  }

  function setHand(el, degrees) {
    el.setAttribute("transform", "translate(" + CX + "," + CY + ") rotate(" + degrees.toFixed(3) + ")");
  }

  function tick() {
    var now = new Date();
    var ms = now.getMilliseconds();
    var s = now.getSeconds() + ms / 1000;
    var m = now.getMinutes() + s / 60;
    var h = (now.getHours() % 12) + m / 60;

    setHand(secondHand, s * 6);
    setHand(minuteHand, m * 6);
    setHand(hourHand, h * 30);

    requestAnimationFrame(tick);
  }

  buildTicks();
  requestAnimationFrame(tick);
})();

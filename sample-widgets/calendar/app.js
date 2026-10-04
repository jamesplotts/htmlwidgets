// Month grid calendar: Sun-Sat columns, today highlighted, Sundays red,
// Saturdays blue, adjacent-month days dimmed. Navigation is in-memory only
// (always reopens on the current month).
//
// Clicking a day opens a sticky note for that date. Notes are stored in
// localStorage keyed by YYYY-MM-DD, saved as you type and again on close;
// clearing a note's text deletes it. Days with a note are tinted.
(function () {
  "use strict";

  var monthLabel = document.getElementById("monthLabel");
  var grid = document.getElementById("grid");
  var prevBtn = document.getElementById("prevBtn");
  var nextBtn = document.getElementById("nextBtn");
  var noteOverlay = document.getElementById("noteOverlay");
  var noteDate = document.getElementById("noteDate");
  var noteText = document.getElementById("noteText");
  var noteDoneBtn = document.getElementById("noteDoneBtn");

  var NOTES_KEY = "htmlwidgets.calendar.notes";

  var MONTH_NAMES = ["January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"];

  var WEEKDAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday",
    "Friday", "Saturday"];

  var today = new Date();
  var notes = loadNotes();
  var openKey = null; // date key of the note being edited, if any
  var viewYear = today.getFullYear();
  var viewMonth = today.getMonth(); // 0-11

  function daysInMonth(year, month) {
    return new Date(year, month + 1, 0).getDate();
  }

  function loadNotes() {
    try {
      var raw = localStorage.getItem(NOTES_KEY);
      if (raw) return JSON.parse(raw) || {};
    } catch (e) { /* ignore */ }
    return {};
  }

  function saveNotes() {
    try { localStorage.setItem(NOTES_KEY, JSON.stringify(notes)); } catch (e) { /* ignore */ }
  }

  function pad2(n) { return (n < 10 ? "0" : "") + n; }

  function dateKey(year, month, day) {
    return year + "-" + pad2(month + 1) + "-" + pad2(day);
  }

  function openNote(year, month, day) {
    openKey = dateKey(year, month, day);
    var date = new Date(year, month, day);
    noteDate.textContent = WEEKDAY_NAMES[date.getDay()] + ", " +
      MONTH_NAMES[month] + " " + day + ", " + year;
    noteText.value = notes[openKey] || "";
    noteOverlay.classList.remove("hidden");
    noteText.focus();
    noteText.setSelectionRange(noteText.value.length, noteText.value.length);
  }

  function storeOpenNote() {
    if (!openKey) return;
    if (noteText.value.trim()) notes[openKey] = noteText.value;
    else delete notes[openKey];
    saveNotes();
  }

  function closeNote() {
    if (!openKey) return;
    storeOpenNote();
    openKey = null;
    noteOverlay.classList.add("hidden");
    render();
  }

  function render() {
    monthLabel.textContent = MONTH_NAMES[viewMonth] + " " + viewYear;
    grid.innerHTML = "";

    var firstWeekday = new Date(viewYear, viewMonth, 1).getDay(); // 0=Sun
    var totalDays = daysInMonth(viewYear, viewMonth);

    var prevMonth = viewMonth === 0 ? 11 : viewMonth - 1;
    var prevYear = viewMonth === 0 ? viewYear - 1 : viewYear;
    var totalPrevDays = daysInMonth(prevYear, prevMonth);

    var nextMonth = viewMonth === 11 ? 0 : viewMonth + 1;
    var nextYear = viewMonth === 11 ? viewYear + 1 : viewYear;

    var cells = [];

    // Leading adjacent-month days
    for (var i = 0; i < firstWeekday; i++) {
      var dayNum = totalPrevDays - firstWeekday + i + 1;
      cells.push({ day: dayNum, weekday: i, adjacent: true, year: prevYear, month: prevMonth });
    }

    // Current month days
    for (var d = 1; d <= totalDays; d++) {
      var weekday = (firstWeekday + d - 1) % 7;
      cells.push({ day: d, weekday: weekday, adjacent: false, year: viewYear, month: viewMonth });
    }

    // Trailing adjacent-month days — fill out to a multiple of 7
    var remainder = cells.length % 7;
    if (remainder !== 0) {
      var trailingCount = 7 - remainder;
      for (var n = 1; n <= trailingCount; n++) {
        cells.push({ day: n, weekday: (cells.length + n - 1) % 7, adjacent: true, year: nextYear, month: nextMonth });
      }
    }

    var isCurrentMonth = (viewYear === today.getFullYear() && viewMonth === today.getMonth());

    var frag = document.createDocumentFragment();
    cells.forEach(function (cell) {
      var el = document.createElement("div");
      el.className = "cal-day";
      if (cell.weekday === 0) el.classList.add("sunday");
      if (cell.weekday === 6) el.classList.add("saturday");
      if (cell.adjacent) el.classList.add("adjacent");
      if (!cell.adjacent && isCurrentMonth && cell.day === today.getDate()) {
        el.classList.add("today");
      }
      var note = notes[dateKey(cell.year, cell.month, cell.day)];
      if (note) {
        el.classList.add("has-note");
        el.title = note.split("\n")[0].slice(0, 80);
      }
      el.textContent = cell.day;
      el.addEventListener("click", function () {
        openNote(cell.year, cell.month, cell.day);
      });
      frag.appendChild(el);
    });
    grid.appendChild(frag);
  }

  prevBtn.addEventListener("click", function () {
    viewMonth -= 1;
    if (viewMonth < 0) { viewMonth = 11; viewYear -= 1; }
    render();
  });

  nextBtn.addEventListener("click", function () {
    viewMonth += 1;
    if (viewMonth > 11) { viewMonth = 0; viewYear += 1; }
    render();
  });

  noteText.addEventListener("input", storeOpenNote);
  noteDoneBtn.addEventListener("click", closeNote);
  noteText.addEventListener("keydown", function (e) {
    if (e.key === "Escape") { e.preventDefault(); closeNote(); }
  });
  // Clicking the dimmed area around the note closes it too.
  noteOverlay.addEventListener("click", function (e) {
    if (e.target === noteOverlay) closeNote();
  });

  render();

  // Keep "today" accurate if the widget is left open across midnight.
  setInterval(function () {
    var now = new Date();
    if (now.getDate() !== today.getDate() || now.getMonth() !== today.getMonth()) {
      today = now;
      if (!openKey) render();
    }
  }, 60 * 1000);
})();

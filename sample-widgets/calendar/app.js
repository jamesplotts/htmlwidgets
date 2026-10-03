// Month grid calendar: Sun-Sat columns, today highlighted, Sundays red,
// Saturdays blue, adjacent-month days dimmed. Navigation is in-memory only
// (always reopens on the current month).
(function () {
  "use strict";

  var monthLabel = document.getElementById("monthLabel");
  var grid = document.getElementById("grid");
  var prevBtn = document.getElementById("prevBtn");
  var nextBtn = document.getElementById("nextBtn");

  var MONTH_NAMES = ["January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"];

  var today = new Date();
  var viewYear = today.getFullYear();
  var viewMonth = today.getMonth(); // 0-11

  function daysInMonth(year, month) {
    return new Date(year, month + 1, 0).getDate();
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
      cells.push({ day: dayNum, weekday: i, adjacent: true });
    }

    // Current month days
    for (var d = 1; d <= totalDays; d++) {
      var weekday = (firstWeekday + d - 1) % 7;
      cells.push({ day: d, weekday: weekday, adjacent: false });
    }

    // Trailing adjacent-month days — fill out to a multiple of 7
    var remainder = cells.length % 7;
    if (remainder !== 0) {
      var trailingCount = 7 - remainder;
      for (var n = 1; n <= trailingCount; n++) {
        cells.push({ day: n, weekday: (cells.length + n - 1) % 7, adjacent: true });
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
      el.textContent = cell.day;
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

  render();

  // Keep "today" accurate if the widget is left open across midnight.
  setInterval(function () {
    var now = new Date();
    if (now.getDate() !== today.getDate() || now.getMonth() !== today.getMonth()) {
      today = now;
      render();
    }
  }, 60 * 1000);
})();

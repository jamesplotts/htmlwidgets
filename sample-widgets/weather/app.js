// Weather widget: Open-Meteo for forecast + geocoding (no API key). City is
// set via the gear-icon settings overlay and stored in localStorage, along
// with the last-good forecast so something sensible shows while offline.
(function () {
  "use strict";

  var STORAGE_KEY = "htmlwidgets.weather.place";
  var CACHE_KEY = "htmlwidgets.weather.cache";
  var DEFAULT_CITY = "New York";
  var AUTO_REFRESH_MS = 30 * 60 * 1000;
  var FORECAST_DAYS = 5; // today + 4

  var cityLabel = document.getElementById("cityLabel");
  var nowIcon = document.getElementById("nowIcon");
  var nowTemp = document.getElementById("nowTemp");
  var nowCondition = document.getElementById("nowCondition");
  var forecastRow = document.getElementById("forecastRow");
  var statusLine = document.getElementById("statusLine");
  var refreshBtn = document.getElementById("refreshBtn");
  var settingsBtn = document.getElementById("settingsBtn");
  var settingsOverlay = document.getElementById("settingsOverlay");
  var cityInput = document.getElementById("cityInput");
  var settingsError = document.getElementById("settingsError");
  var saveBtn = document.getElementById("saveBtn");
  var cancelBtn = document.getElementById("cancelBtn");

  function loadPlace() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (raw) return JSON.parse(raw);
    } catch (e) { /* ignore */ }
    return null;
  }

  function savePlace(place) {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(place)); } catch (e) { /* ignore */ }
  }

  function loadCache() {
    try {
      var raw = localStorage.getItem(CACHE_KEY);
      if (raw) return JSON.parse(raw);
    } catch (e) { /* ignore */ }
    return null;
  }

  function saveCache(entry) {
    try { localStorage.setItem(CACHE_KEY, JSON.stringify(entry)); } catch (e) { /* ignore */ }
  }

  function geocode(cityName) {
    var url = "https://geocoding-api.open-meteo.com/v1/search?name=" +
      encodeURIComponent(cityName) + "&count=1&language=en&format=json";
    return fetch(url).then(function (r) { return r.json(); }).then(function (data) {
      if (!data.results || data.results.length === 0) {
        throw new Error("City not found");
      }
      var r = data.results[0];
      var label = r.name + (r.admin1 ? ", " + r.admin1 : "") + (r.country ? ", " + r.country_code : "");
      return { label: label, lat: r.latitude, lon: r.longitude };
    });
  }

  function fetchForecast(place) {
    var url = "https://api.open-meteo.com/v1/forecast" +
      "?latitude=" + place.lat + "&longitude=" + place.lon +
      "&current=temperature_2m,weather_code" +
      "&daily=weather_code,temperature_2m_max,temperature_2m_min" +
      "&temperature_unit=fahrenheit" +
      "&timezone=auto&forecast_days=" + FORECAST_DAYS;
    return fetch(url).then(function (r) {
      if (!r.ok) throw new Error("Forecast request failed");
      return r.json();
    });
  }

  function dayLabel(isoDate) {
    var d = new Date(isoDate + "T00:00:00");
    return d.toLocaleDateString([], { weekday: "short" });
  }

  function render(place, data, opts) {
    opts = opts || {};
    cityLabel.textContent = place.label;

    var code = data.current.weather_code;
    nowIcon.innerHTML = WxIcons.markupFor(code);
    nowTemp.textContent = Math.round(data.current.temperature_2m) + "°";
    nowCondition.textContent = WxIcons.labelFor(code);

    forecastRow.innerHTML = "";
    var frag = document.createDocumentFragment();
    // Skip index 0 (today) — the "4-day forecast" is the days ahead.
    for (var i = 1; i < data.daily.time.length && i <= 4; i++) {
      var cell = document.createElement("div");
      cell.className = "wx-forecast-day";
      cell.innerHTML =
        '<span class="wxf-label">' + dayLabel(data.daily.time[i]) + '</span>' +
        '<span class="wxf-icon">' + WxIcons.markupFor(data.daily.weather_code[i]) + '</span>' +
        '<span class="wxf-temps"><span class="wxf-hi">' + Math.round(data.daily.temperature_2m_max[i]) + '°</span> ' +
        '<span class="wxf-lo">' + Math.round(data.daily.temperature_2m_min[i]) + '°</span></span>';
      frag.appendChild(cell);
    }
    forecastRow.appendChild(frag);

    statusLine.classList.toggle("offline", !!opts.offline);
    if (opts.offline) {
      statusLine.textContent = "Offline — showing update from " + opts.asOf;
    } else {
      statusLine.textContent = "Updated " + new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    }
  }

  function showError(message) {
    nowCondition.textContent = message;
    statusLine.textContent = "";
  }

  function refresh() {
    var place = loadPlace();
    if (!place) return;

    refreshBtn.classList.add("spinning");
    fetchForecast(place)
      .then(function (data) {
        saveCache({ place: place, data: data, savedAt: new Date().toISOString() });
        render(place, data);
      })
      .catch(function () {
        var cached = loadCache();
        if (cached && cached.place.label === place.label) {
          render(place, cached.data, {
            offline: true,
            asOf: new Date(cached.savedAt).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })
          });
        } else {
          showError("Unable to load weather");
        }
      })
      .finally(function () {
        refreshBtn.classList.remove("spinning");
      });
  }

  function openSettings() {
    var place = loadPlace();
    cityInput.value = place ? place.label.split(",")[0] : "";
    settingsError.textContent = "";
    settingsOverlay.classList.remove("hidden");
    cityInput.focus();
  }

  function closeSettings() {
    settingsOverlay.classList.add("hidden");
  }

  function saveSettings() {
    var cityName = cityInput.value.trim();
    if (!cityName) return;
    settingsError.textContent = "Searching…";
    geocode(cityName)
      .then(function (place) {
        savePlace(place);
        closeSettings();
        refresh();
      })
      .catch(function () {
        settingsError.textContent = "City not found — try another search.";
      });
  }

  refreshBtn.addEventListener("click", refresh);
  settingsBtn.addEventListener("click", openSettings);
  cancelBtn.addEventListener("click", closeSettings);
  saveBtn.addEventListener("click", saveSettings);
  cityInput.addEventListener("keydown", function (e) {
    if (e.key === "Enter") saveSettings();
    if (e.key === "Escape") closeSettings();
  });

  // First run: seed a default city so the widget isn't empty, then let the
  // gear icon personalize it.
  if (!loadPlace()) {
    geocode(DEFAULT_CITY).then(savePlace).then(refresh).catch(function () {
      showError("Set a city → gear icon");
    });
  } else {
    refresh();
  }

  setInterval(refresh, AUTO_REFRESH_MS);
})();

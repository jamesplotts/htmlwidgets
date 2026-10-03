// Pure-SVG weather icon set, keyed by category, plus a WMO weather_code ->
// category mapping (Open-Meteo uses WMO codes). No external image assets.
var WxIcons = (function () {
  "use strict";

  var CLOUD = '<path d="M20 46 Q8 46 8 36 Q8 28 16 26 Q18 16 30 16 Q41 16 44 25 Q54 25 54 35 Q54 46 42 46 Z" fill="#e8eef5" stroke="rgba(0,0,0,0.12)" stroke-width="1"/>';

  function svg(inner) {
    return '<svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg">' + inner + '</svg>';
  }

  function sunRays(cx, cy, r1, r2, count) {
    var out = "";
    for (var i = 0; i < count; i++) {
      var a = (i * (360 / count)) * (Math.PI / 180);
      var x1 = cx + r1 * Math.cos(a), y1 = cy + r1 * Math.sin(a);
      var x2 = cx + r2 * Math.cos(a), y2 = cy + r2 * Math.sin(a);
      out += '<line x1="' + x1.toFixed(1) + '" y1="' + y1.toFixed(1) + '" x2="' + x2.toFixed(1) + '" y2="' + y2.toFixed(1) + '" stroke="#ffca28" stroke-width="3" stroke-linecap="round"/>';
    }
    return out;
  }

  var ICONS = {
    sun: function () {
      return svg(sunRays(32, 30, 20, 27, 8) + '<circle cx="32" cy="30" r="14" fill="#ffca28"/>');
    },
    "partly-cloudy": function () {
      return svg(
        sunRays(24, 22, 11, 15, 8) +
        '<circle cx="24" cy="22" r="9" fill="#ffca28"/>' +
        CLOUD
      );
    },
    cloudy: function () {
      return svg(CLOUD);
    },
    fog: function () {
      return svg(
        '<path d="M20 30 Q8 30 8 22 Q8 15 16 14 Q19 6 30 6 Q40 6 43 14 Q52 14 52 22" fill="none" stroke="#d7dfea" stroke-width="0" />' +
        '<g stroke="#c9d3e0" stroke-width="3" stroke-linecap="round" opacity="0.85">' +
        '<line x1="10" y1="30" x2="54" y2="30"/>' +
        '<line x1="14" y1="38" x2="50" y2="38"/>' +
        '<line x1="10" y1="46" x2="54" y2="46"/>' +
        '</g>'
      );
    },
    drizzle: function () {
      return svg(CLOUD + '<g stroke="#64b5f6" stroke-width="2.5" stroke-linecap="round">' +
        '<line x1="22" y1="50" x2="20" y2="56"/>' +
        '<line x1="32" y1="52" x2="30" y2="58"/>' +
        '<line x1="42" y1="50" x2="40" y2="56"/>' +
        '</g>');
    },
    rain: function () {
      return svg(CLOUD + '<g stroke="#4fa3e0" stroke-width="2.8" stroke-linecap="round">' +
        '<line x1="20" y1="50" x2="15" y2="60"/>' +
        '<line x1="30" y1="52" x2="25" y2="62"/>' +
        '<line x1="40" y1="50" x2="35" y2="60"/>' +
        '<line x1="48" y1="48" x2="44" y2="57"/>' +
        '</g>');
    },
    snow: function () {
      function flake(cx, cy) {
        return '<g stroke="#eef3fa" stroke-width="2" stroke-linecap="round">' +
          '<line x1="' + (cx - 4) + '" y1="' + cy + '" x2="' + (cx + 4) + '" y2="' + cy + '"/>' +
          '<line x1="' + cx + '" y1="' + (cy - 4) + '" x2="' + cx + '" y2="' + (cy + 4) + '"/>' +
          '<line x1="' + (cx - 3) + '" y1="' + (cy - 3) + '" x2="' + (cx + 3) + '" y2="' + (cy + 3) + '"/>' +
          '<line x1="' + (cx - 3) + '" y1="' + (cy + 3) + '" x2="' + (cx + 3) + '" y2="' + (cy - 3) + '"/>' +
          '</g>';
      }
      return svg(CLOUD + flake(20, 54) + flake(32, 57) + flake(44, 54));
    },
    thunder: function () {
      return svg(CLOUD + '<polygon points="30,44 22,58 29,58 26,70 40,52 32,52 36,44" fill="#ffd54f"/>');
    }
  };

  var CODE_MAP = {
    0: "sun",
    1: "partly-cloudy", 2: "partly-cloudy",
    3: "cloudy",
    45: "fog", 48: "fog",
    51: "drizzle", 53: "drizzle", 55: "drizzle", 56: "drizzle", 57: "drizzle",
    61: "rain", 63: "rain", 65: "rain", 66: "rain", 67: "rain",
    80: "rain", 81: "rain", 82: "rain",
    71: "snow", 73: "snow", 75: "snow", 77: "snow", 85: "snow", 86: "snow",
    95: "thunder", 96: "thunder", 99: "thunder"
  };

  var LABEL_MAP = {
    0: "Clear sky",
    1: "Mostly clear", 2: "Partly cloudy", 3: "Overcast",
    45: "Fog", 48: "Depositing fog",
    51: "Light drizzle", 53: "Drizzle", 55: "Dense drizzle",
    56: "Freezing drizzle", 57: "Freezing drizzle",
    61: "Light rain", 63: "Rain", 65: "Heavy rain",
    66: "Freezing rain", 67: "Freezing rain",
    80: "Rain showers", 81: "Rain showers", 82: "Violent showers",
    71: "Light snow", 73: "Snow", 75: "Heavy snow", 77: "Snow grains",
    85: "Snow showers", 86: "Heavy snow showers",
    95: "Thunderstorm", 96: "Thunderstorm, hail", 99: "Thunderstorm, hail"
  };

  function categoryFor(code) {
    return CODE_MAP[code] || "cloudy";
  }

  function labelFor(code) {
    return LABEL_MAP[code] || "Unknown";
  }

  function markupFor(code) {
    var category = categoryFor(code);
    return (ICONS[category] || ICONS.cloudy)();
  }

  return { markupFor: markupFor, labelFor: labelFor, categoryFor: categoryFor };
})();

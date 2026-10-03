// Thin client for Radio Garden's unofficial API (see
// github.com/jonasrmichel/radio-garden-openapi for the original spec —
// verified/corrected against the live API, whose response shape has moved
// on a bit since that spec was written). Every call can fail (network,
// Cloudflare, schema drift) and every caller here is expected to handle
// that — this module never assumes success.
//
// Requests go through the plasmoid's backend.httpFetch bridge, not page
// fetch(): confirmed empirically that radio.garden's API sends no
// Access-Control-Allow-Origin at all, so a page-level fetch() from our
// file:// origin gets flatly blocked by CORS (curl "working" against this
// API means nothing here — curl doesn't implement CORS, browsers do).
// Falls back to plain fetch() if no backend was set (e.g. opening this
// file outside the plasmoid), which will likely still hit the same CORS
// wall, but fails the same honest way fetch() always would.
var RadioGarden = (function () {
  "use strict";

  var API_BASE = "https://radio.garden/api";
  var backend = null;
  var pending = {};

  function setBackend(b) {
    backend = b;
    backend.httpFetchFinished.connect(function (requestId, status, body, finalUrl) {
      var p = pending[requestId];
      if (!p) return;
      delete pending[requestId];
      p.resolve({ status: status, body: body, finalUrl: finalUrl });
    });
  }

  function request(url, method) {
    if (backend) {
      return new Promise(function (resolve) {
        backend.httpFetch(url, method || "GET", function (requestId) {
          pending[requestId] = { resolve: resolve };
        });
      });
    }
    return fetch(url, { headers: { "Accept": "application/json" } }).then(function (r) {
      return r.text().then(function (body) {
        return { status: r.status, body: body, finalUrl: r.url };
      });
    });
  }

  function lastPathSegment(url) {
    if (!url) return null;
    var parts = url.split("/").filter(Boolean);
    return parts.length ? parts[parts.length - 1] : null;
  }

  // Both search hits and place-channel listings wrap station data in the
  // same { page: { url, title, place, country, subtitle } } shape.
  function normalizeChannel(source) {
    var page = source.page || source;
    var place = page.place && page.place.title;
    var country = page.country && page.country.title;
    return {
      kind: "channel",
      id: lastPathSegment(page.url),
      title: page.title || "Unknown station",
      place: place || "",
      country: country || "",
      subtitle: page.subtitle || [place, country].filter(Boolean).join(", ")
    };
  }

  function normalizePlace(source) {
    var page = source.page || source;
    return {
      kind: "place",
      placeId: lastPathSegment(page.url),
      title: page.title || "Unknown place",
      subtitle: page.subtitle || "",
      count: page.count || 0
    };
  }

  function getJSON(url) {
    return request(url, "GET").then(function (r) {
      if (r.status === 0) throw new Error("Network error");
      if (r.status < 200 || r.status >= 300) throw new Error("HTTP " + r.status);
      try {
        return JSON.parse(r.body);
      } catch (e) {
        throw new Error("Invalid JSON response");
      }
    });
  }

  function search(query) {
    var url = API_BASE + "/search?q=" + encodeURIComponent(query);
    return getJSON(url).then(function (data) {
      var hits = (data.hits && data.hits.hits) || [];
      return hits.map(function (hit) {
        var source = hit._source || {};
        if (source.type === "channel") return normalizeChannel(source);
        if (source.type === "place") return normalizePlace(source);
        return null;
      }).filter(Boolean);
    });
  }

  function channelsForPlace(placeId) {
    var url = API_BASE + "/ara/content/page/" + encodeURIComponent(placeId) + "/channels";
    return getJSON(url).then(function (data) {
      var content = (data.data && data.data.content) || [];
      var items = (content[0] && content[0].items) || [];
      return items.map(normalizeChannel);
    });
  }

  function listenUrl(channelId) {
    return API_BASE + "/ara/content/listen/" + encodeURIComponent(channelId) + "/channel.mp3";
  }

  // The listen endpoint 302s to the real CDN URL. Setting <audio src> to
  // the listen URL directly works fine (the browser follows the
  // redirect), but we resolve it once and cache the final URL per the
  // "resolved stream URL cached" requirement — and it saves a hop on
  // every subsequent play.
  function resolveStreamUrl(channelId) {
    var url = listenUrl(channelId);
    return request(url, "HEAD")
      .then(function (r) { return r.finalUrl || url; })
      .catch(function () { return url; });
  }

  return {
    setBackend: setBackend,
    search: search,
    channelsForPlace: channelsForPlace,
    listenUrl: listenUrl,
    resolveStreamUrl: resolveStreamUrl
  };
})();

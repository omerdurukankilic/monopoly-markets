'use strict';
// ============================================================================
// Monopoly Markets — client networking (cloud multiplayer)
// ----------------------------------------------------------------------------
// A tiny dependency-free reconnecting WebSocket that speaks to the PartyKit
// server (party/server.js). Kept out of npm-land on purpose so the client stays
// a single self-contained file — PartyKit accepts plain WebSocket connections
// at /parties/main/<room>.
//
// Point it at your deployed server in one of these ways (first wins):
//   1. ?host=<your-app>.<user>.partykit.dev  in the page URL
//   2. window.PARTYKIT_HOST = '<your-app>.<user>.partykit.dev'  before load
//   3. otherwise defaults to 127.0.0.1:1999 for `npm run party:dev`
// ============================================================================
(function () {
  var DEFAULT_HOST = '127.0.0.1:1999';

  function resolveHost() {
    try {
      var q = new URLSearchParams(location.search).get('host');
      if (q) return q;
    } catch (e) { /* ignore */ }
    if (typeof window !== 'undefined' && typeof window.PARTYKIT_HOST === 'string' && window.PARTYKIT_HOST) {
      return window.PARTYKIT_HOST;
    }
    // If the client is served over http(s) from a real host, assume the server
    // is the same origin (e.g. PartyKit serving the static client) — zero
    // config. file:// and localhost fall through to the dev default.
    try {
      if (typeof location !== 'undefined' && /^https?:$/.test(location.protocol) &&
          location.host && !isLocal(location.host)) {
        return location.host;
      }
    } catch (e) { /* ignore */ }
    return DEFAULT_HOST;
  }

  function isLocal(host) {
    return /^(localhost|127\.|0\.0\.0\.0|\[?::1)/.test(host);
  }

  function connect(opts) {
    var host = opts.host || resolveHost();
    var room = opts.room;
    var proto = isLocal(host) ? 'ws' : 'wss';
    var url = proto + '://' + host + '/parties/main/' + encodeURIComponent(room);

    var ws = null, closed = false, retry = 0;

    function open() {
      try { ws = new WebSocket(url); } catch (e) { schedule(); return; }
      ws.onopen = function () { retry = 0; if (opts.onStatus) opts.onStatus('connected'); if (opts.onOpen) opts.onOpen(); };
      ws.onmessage = function (e) {
        var m; try { m = JSON.parse(e.data); } catch (_) { return; }
        if (opts.onMessage) opts.onMessage(m);
      };
      ws.onclose = function () {
        if (closed) return;
        if (opts.onStatus) opts.onStatus('reconnecting');
        schedule();
      };
      ws.onerror = function () { try { ws.close(); } catch (_) { } };
    }
    function schedule() {
      retry++;
      setTimeout(function () { if (!closed) open(); }, Math.min(5000, 400 * retry));
    }

    open();

    return {
      url: url,
      send: function (obj) {
        try { if (ws && ws.readyState === 1) ws.send(JSON.stringify(obj)); } catch (_) { }
      },
      close: function () { closed = true; try { ws.close(); } catch (_) { } },
    };
  }

  var NET = { connect: connect, resolveHost: resolveHost };
  if (typeof window !== 'undefined') window.GameNet = NET;
  if (typeof module !== 'undefined' && module.exports) module.exports = NET;
})();

/**
 * Command Center tracking pixel.
 *
 * Usage, on any page of the storefront:
 *   <script src="https://<your-command-center-domain>/pixel.js" data-key="pk_xxx" async></script>
 *
 * Auto-fires a `page_view` on load. For conversions, call from your
 * theme/checkout thank-you page:
 *   window.cc('track', 'purchase', { valueCents: 4999, currency: 'USD', email: 'buyer@example.com' });
 *
 * Runs entirely first-party on the brand's own domain — the visitor id
 * cookie is set on whatever domain this script is loaded from, not on the
 * Command Center's domain, so it isn't a third-party cookie.
 */
(function () {
  var script = document.currentScript;
  var publicKey = script && script.getAttribute("data-key");
  if (!publicKey) {
    console.warn("[cc-pixel] missing data-key attribute, tracking disabled");
    return;
  }

  var endpoint = script.src.replace(/\/pixel\.js.*$/, "/api/t");
  var COOKIE_NAME = "_cc_vid";

  function readCookie(name) {
    var match = document.cookie.match(new RegExp("(?:^|; )" + name + "=([^;]*)"));
    return match ? decodeURIComponent(match[1]) : null;
  }

  function writeCookie(name, value, days) {
    var expires = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toUTCString();
    document.cookie = name + "=" + encodeURIComponent(value) + "; expires=" + expires + "; path=/; SameSite=Lax";
  }

  function uuid() {
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, function (c) {
      var r = (Math.random() * 16) | 0;
      var v = c === "x" ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }

  var visitorId = readCookie(COOKIE_NAME);
  if (!visitorId) {
    visitorId = uuid();
    writeCookie(COOKIE_NAME, visitorId, 365);
  }

  function clickIdsFromUrl() {
    var params = new URLSearchParams(window.location.search);
    var ids = {};
    ["fbclid", "ttclid", "gclid"].forEach(function (key) {
      var value = params.get(key);
      if (value) ids[key] = value;
    });
    return ids;
  }

  function send(eventName, extra) {
    var payload = Object.assign(
      {
        publicKey: publicKey,
        event: eventName,
        visitorId: visitorId,
        pageUrl: window.location.href,
        clickIds: clickIdsFromUrl(),
      },
      extra || {}
    );

    var body = JSON.stringify(payload);

    // sendBeacon survives page navigation (important for events fired right
    // before a redirect); fall back to fetch with keepalive where it isn't
    // available.
    if (navigator.sendBeacon) {
      navigator.sendBeacon(endpoint, new Blob([body], { type: "application/json" }));
    } else {
      fetch(endpoint, { method: "POST", body: body, keepalive: true, headers: { "Content-Type": "application/json" } }).catch(
        function () {}
      );
    }
  }

  window.cc = function (command, eventName, extra) {
    if (command === "track") {
      send(eventName, extra);
    }
  };

  send("page_view");
})();

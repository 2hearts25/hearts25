// Privacy-conscious, first-party aggregate analytics (1.1.0-P1).
// Sends only: event name, page path, site language, referring host and UTM campaign tags.
// Never sends names, emails, phone numbers, form contents or any other personal data.
(() => {
  const nav = navigator;
  if (nav.doNotTrack === "1" || window.doNotTrack === "1" || nav.globalPrivacyControl === true) return;
  const endpoint = "https://zebeclcvrdmisnxkwode.supabase.co/functions/v1/site-event";
  const publicKey = "__H2H_PUBLIC_ANON_KEY__";
  const storeKey = "h2h-attribution";
  const safe = value => {
    try { value = decodeURIComponent(String(value || "")).trim().toLowerCase(); } catch { return ""; }
    return /^[a-z0-9 _.\-+:]{1,60}$/.test(value) ? value : "";
  };
  const params = new URLSearchParams(location.search);
  const fresh = {};
  for (const name of ["source", "medium", "campaign", "content", "term"]) {
    const value = safe(params.get("utm_" + name));
    if (value) fresh[name] = value;
  }
  let attribution = {};
  try { attribution = JSON.parse(sessionStorage.getItem(storeKey) || "{}"); } catch { attribution = {}; }
  if (Object.keys(fresh).length) {
    attribution = fresh;
    try { sessionStorage.setItem(storeKey, JSON.stringify(attribution)); } catch { /* storage unavailable */ }
  }
  let referrer = "";
  try {
    const host = new URL(document.referrer).hostname.replace(/^www\./, "");
    if (host && host !== location.hostname.replace(/^www\./, "")) referrer = host;
  } catch { /* no referrer */ }
  if (referrer && !sessionStorage.getItem("h2h-ref")) {
    try { sessionStorage.setItem("h2h-ref", referrer); } catch { /* ignore */ }
  }
  try { referrer = sessionStorage.getItem("h2h-ref") || referrer; } catch { /* ignore */ }

  const send = event => {
    try {
      fetch(endpoint, {
        method: "POST", keepalive: true,
        headers: { "Content-Type": "application/json", apikey: publicKey, Authorization: "Bearer " + publicKey },
        body: JSON.stringify({ event, path: location.pathname, language: document.documentElement.lang, ref: referrer, utm: attribution }),
      }).catch(() => {});
    } catch { /* analytics must never break the page */ }
  };

  send("page_view");
  document.addEventListener("click", event => {
    const link = event.target instanceof Element ? event.target.closest("a[href]") : null;
    if (!link) return;
    const href = link.getAttribute("href") || "";
    if (href.startsWith("tel:")) return send("phone_click");
    let pathname = "";
    try { pathname = new URL(href, location.href).pathname; } catch { return; }
    if (/\/register\/?$/.test(pathname)) send("register_click");
    else if (/\/tour\/?$/.test(pathname)) send("tour_click");
    else if (/\/request-information\/?$/.test(pathname)) send("info_click");
  });
  const started = new Set();
  document.addEventListener("focusin", event => {
    const form = event.target instanceof Element ? event.target.closest("form[data-inquiry]") : null;
    const kind = form?.dataset.kind;
    if (form && kind && !started.has(kind)) { started.add(kind); send("form_start_" + kind); }
  });
})();

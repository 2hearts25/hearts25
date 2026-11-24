// 1.1.0-P1 aggregate analytics intake. Accepts only a fixed set of event names plus sanitized
// language, page path, referring host and UTM tags. Stores daily totals; never stores personal data.
const url = Deno.env.get("SUPABASE_URL");
const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const origin = "https://hearts25.com";
const languages = new Set(["en", "es", "ar", "sw", "fr"]);
const events = new Set([
  "page_view", "register_click", "tour_click", "info_click", "phone_click",
  "form_start_registration", "form_start_tour", "form_start_information",
  "form_start_contact", "form_start_enrollment",
]);
const tag = /^[a-z0-9 _.\-+:]{1,60}$/;

function reply(status: number) {
  return new Response(null, {
    status,
    headers: {
      "Access-Control-Allow-Origin": origin,
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "authorization, apikey, content-type",
      "Access-Control-Max-Age": "3600",
      "Cache-Control": "no-store",
      "Vary": "Origin",
    },
  });
}

Deno.serve(async request => {
  if (request.headers.get("origin") !== origin) return reply(403);
  if (request.method === "OPTIONS") return reply(204);
  if (request.method !== "POST") return reply(405);
  if (!url || !key) return reply(204);
  let body: Record<string, unknown>;
  try {
    const text = await request.text();
    if (text.length > 1024) return reply(204);
    body = JSON.parse(text);
  } catch {
    return reply(204);
  }
  const str = (v: unknown) => typeof v === "string" ? v.trim() : "";
  const event = str(body.event);
  const language = str(body.language);
  const path = str(body.path);
  const ref = str(body.ref).toLowerCase();
  if (!events.has(event) || !languages.has(language) || !/^\/[a-z0-9\-/]{0,80}$/.test(path)) return reply(204);
  const utm = (body.utm && typeof body.utm === "object" ? body.utm : {}) as Record<string, unknown>;
  const clean = (name: string) => {
    const v = str(utm[name]).toLowerCase();
    return tag.test(v) ? v : "";
  };
  const referrer = /^[a-z0-9.\-]{1,100}$/.test(ref) ? ref : "";
  try {
    const response = await fetch(url + "/rest/v1/rpc/record_site_event", {
      method: "POST",
      headers: { apikey: key, Authorization: "Bearer " + key, "Content-Type": "application/json" },
      body: JSON.stringify({
        p_event: event, p_language: language, p_path: path, p_referrer: referrer,
        p_source: clean("source"), p_medium: clean("medium"), p_campaign: clean("campaign"),
        p_content: clean("content"), p_term: clean("term"),
      }),
      signal: AbortSignal.timeout(5000),
    });
    await response.body?.cancel();
  } catch { /* analytics must never surface errors */ }
  return reply(204);
});

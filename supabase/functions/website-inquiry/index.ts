import { registrationMailId, sendRegistrationWelcome } from "./registration-welcome.ts";

declare const EdgeRuntime: { waitUntil(promise: Promise<unknown>): void };

const url = Deno.env.get("SUPABASE_URL");
const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const resendKey = Deno.env.get("H2H_RESEND_API_KEY") ?? Deno.env.get("H2H_TOUR_RESEND_API_KEY");
const sender = Deno.env.get("H2H_FROM_EMAIL") ?? Deno.env.get("H2H_TOUR_FROM_EMAIL") ??
  "Heart to Heart Enrichment Center <hello@hearts25.com>";
const staff = Deno.env.get("H2H_STAFF_NOTIFY_EMAIL") ?? Deno.env.get("H2H_TOUR_STAFF_NOTIFY_EMAIL") ??
  "tohearts25@gmail.com";
const origin = "https://hearts25.com";
const languages = new Set(["en", "es", "ar", "sw", "fr"]);
const categories = new Set(["enrollment", "contact", "registration"]);
const ages = new Set(["infant-toddler", "preschool", "school-age", "unsure"]);
const times = new Set(["soon", "1-3-months", "later", "unsure"]);
const encoder = new TextEncoder();
const validName = (value: string) => value.length >= 2 && value.length <= 100 && !/[\u0000-\u001f\u007f]/u.test(value);

function reply(status: number, code: string | null = null) {
  return new Response(code ? JSON.stringify({ code }) : null, {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Access-Control-Allow-Origin": origin,
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "authorization, apikey, content-type",
      "Access-Control-Max-Age": "3600",
      "Cache-Control": "no-store",
      "Vary": "Origin",
    },
  });
}

async function readBody(request: Request) {
  const reader = request.body?.getReader();
  if (!reader) throw new Error("Missing body");
  const decoder = new TextDecoder("utf-8", { fatal: true });
  let length = 0;
  let body = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    length += value.byteLength;
    if (length > 4096) {
      await reader.cancel();
      throw new Error("Body too large");
    }
    body += decoder.decode(value, { stream: true });
  }
  return JSON.parse(body + decoder.decode()) as Record<string, unknown>;
}

async function fingerprint(ip: string | undefined) {
  if (!ip || !key || !/^[\da-f:.]{3,45}$/i.test(ip)) return null;
  const pepper = await crypto.subtle.importKey(
    "raw", encoder.encode(key), { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
  );
  const date = new Date().toISOString().slice(0, 10);
  const bytes = await crypto.subtle.sign("HMAC", pepper, encoder.encode(date + "/" + ip));
  return Array.from(new Uint8Array(bytes), byte => byte.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async request => {
  if (request.headers.get("origin") !== origin) return reply(403, "forbidden");
  if (request.method === "OPTIONS") return reply(204);
  if (request.method !== "POST") return reply(405, "method");
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
    return reply(415, "invalid");
  }
  let payload: Record<string, unknown>;
  try {
    payload = await readBody(request);
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) return reply(400, "invalid");
  } catch {
    return reply(400, "invalid");
  }
  const value = (field: string) => typeof payload[field] === "string"
    ? (payload[field] as string).trim()
    : "";
  if (value("website")) return reply(400, "invalid");

  const kind = value("kind");
  const locale = value("language");
  const name = value("name");
  const email = value("email");
  const phone = value("phone");
  const child = value("childName");
  const registering = kind === "registration";
  const age = value("age");
  const time = value("timeframe");
  if (!categories.has(kind) || !languages.has(locale) || payload.consent !== true ||
      !validName(name) || (registering ? !phone || !validName(child) : !!child) ||
      email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(email) ||
      (phone && !/^[+\d().\s-]{7,32}$/u.test(phone)) ||
      (kind === "contact" ? age || time : !ages.has(age) || (time && !times.has(time)))) {
    return reply(422, "invalid");
  }

  if (!url || !key) return reply(503, "unavailable");
  try {
    const ip = request.headers.get("x-real-ip") ?? undefined;
    const source = await fingerprint(ip);
    const method = registering ? "submit_child_registration" : "submit_website_inquiry";
    const common = {
      p_preferred_language: locale,
      p_email: email,
      p_phone: phone || null,
      p_age_group: age || null,
      p_timeframe: time || null,
      p_source_fingerprint: source,
    };
    const intake = registering ? { p_guardian_name: name, p_child_name: child } : { p_kind: kind, p_adult_name: name };
    const response = await fetch(url + "/rest/v1/rpc/" + method, {
      method: "POST",
      headers: { apikey: key, Authorization: "Bearer " + key, "Content-Type": "application/json" },
      body: JSON.stringify({ ...common, ...intake }),
      signal: AbortSignal.timeout(9000),
    });
    if (!response.ok) return reply(503, "unavailable");
    if (await response.json() !== true) return reply(429, "limited");
    if (registering && !email.toLowerCase().endsWith(".invalid")) {
      if (resendKey) {
        const delivery = registrationMailId(key, email, child, age).then(id =>
          sendRegistrationWelcome({ apiKey: resendKey, from: sender, replyTo: staff }, {
            recipient: email, guardian: name, language: locale, id,
          })
        ).then(status => {
          if (status < 200 || (status >= 300 && status !== 409)) console.warn("registration_mail_failed", status);
        }).catch(() => console.warn("registration_mail_failed", 0));
        EdgeRuntime.waitUntil(delivery);
      } else {
        console.warn("registration_mail_unconfigured");
      }
    }
    return reply(201, "received");
  } catch {
    return reply(503, "unavailable");
  }
});


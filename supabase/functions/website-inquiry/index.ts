import { registrationMailId, sendRegistrationWelcome } from "./registration-welcome.ts";
import { familyMessage } from "./brand-mail.ts";
import { interestMessage } from "./interest-message.ts";

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
const categories = new Set(["enrollment", "contact", "registration", "tour", "information"]);
const ages = new Set(["infant-toddler", "preschool", "school-age", "unsure"]);
const times = new Set(["soon", "1-3-months", "later", "unsure"]);
const encoder = new TextEncoder();
const languageNames: Record<string,string> = {en:"English",es:"Spanish",ar:"Arabic",sw:"Swahili",fr:"French"};
const typeLabels: Record<string,string> = {registration:"Child registration",information:"Information request",tour:"Tour request",contact:"Contact",enrollment:"Enrollment"};
const successPath: Record<string,string> = {registration:"/register/",tour:"/tour/",information:"/request-information/",contact:"/contact/",enrollment:"/enrollment/"};
const tag = /^[a-z0-9 _.\-+:]{1,60}$/;
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
    if (length > 6144) {
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
  const policy = value("policyVersion");
  const p0 = policy === "1.1.0-P0";
  const information = kind === "information";
  const tour = kind === "tour";
  const questions = value("questions");
  const rawAttribution = payload.attribution && typeof payload.attribution === "object" && !Array.isArray(payload.attribution)
    ? payload.attribution as Record<string, unknown> : {};
  const utm = (name: string) => {
    const v = typeof rawAttribution[name] === "string" ? (rawAttribution[name] as string).trim().toLowerCase() : "";
    return tag.test(v) ? v : "";
  };
  const interests = payload.interests ?? [];
  const details = tour ? {
    start_month:value("start_month"), tour_window:value("tour_window"),
    heard_about_us:value("heard_about_us"), notes:value("notes")
  } : information ? { interests, questions } : null;
  if ((tour || information) && !p0) return reply(422,"invalid");
  if (!Array.isArray(interests) || interests.length > 8 || interests.some(item => typeof item !== "string" || !/^[0-7]$/.test(item)) ||
      questions.length > 500 || (tour && (value("notes").length > 500 ||
        value("heard_about_us").length > 100 || value("start_month").length > 7 ||
        !["","morning","afternoon","either"].includes(value("tour_window"))))) return reply(422,"invalid");
  const age = value("age");
  const time = value("timeframe");
  if (!categories.has(kind) || !languages.has(locale) || payload.consent !== true ||
      !validName(name) || (tour && !phone) || (registering ? !phone || !validName(child) : !!child) ||
      email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(email) ||
      (phone && !/^[+\d().\s-]{7,32}$/u.test(phone)) ||
      (kind === "contact" ? age || time : ((!information || !!age) && !ages.has(age)) || (time && !times.has(time)))) {
    return reply(422, "invalid");
  }

  if (!url || !key) return reply(503, "unavailable");
  try {
    const ip = request.headers.get("x-real-ip") ?? undefined;
    const source = await fingerprint(ip);
    const method = (registering ? "submit_child_registration" : "submit_website_inquiry") + (p0 ? "_p0" : "");
    const common = {
      p_preferred_language: locale,
      p_email: email,
      p_phone: phone || null,
      p_age_group: age || null,
      p_timeframe: time || null,
      p_source_fingerprint: source,
    };
    const intake = registering ? { p_guardian_name: name, p_child_name: child } : { p_kind: kind, p_adult_name: name };
    const versioned = p0 ? {p_consent_version:policy,...(!registering ? {p_details:details} : {})} : {};
    const response = await fetch(url + "/rest/v1/rpc/" + method, {
      method: "POST",
      headers: { apikey: key, Authorization: "Bearer " + key, "Content-Type": "application/json" },
      body: JSON.stringify({ ...common, ...intake, ...versioned }),
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
    EdgeRuntime.waitUntil(fetch(url + "/rest/v1/rpc/record_site_event", {
      method: "POST",
      headers: { apikey: key, Authorization: "Bearer " + key, "Content-Type": "application/json" },
      body: JSON.stringify({
        p_event: kind + "_success", p_language: locale, p_path: successPath[kind], p_referrer: "",
        p_source: utm("source"), p_medium: utm("medium"), p_campaign: utm("campaign"),
        p_content: utm("content"), p_term: utm("term"),
      }),
      signal: AbortSignal.timeout(5000),
    }).then(result => result.body?.cancel()).catch(() => console.warn("analytics_event_failed")));
    if (p0 && !email.toLowerCase().endsWith(".invalid")) {
      const webhookSecret = Deno.env.get("H2H_TOUR_SHARED_SECRET");
      const deliveries: Promise<unknown>[] = [];
      const send = async (kindKey: string, reference: string, to: string, subject: string, message: string, html?: string) => {
        if (!resendKey) return;
        const result = await fetch("https://api.resend.com/emails", {
          method:"POST", headers:{Authorization:"Bearer "+resendKey,"Content-Type":"application/json","Idempotency-Key":"heart-to-heart/"+kindKey+"/"+reference},
          body:JSON.stringify({from:sender,to:[to],reply_to:staff,subject,text:message,...(html ? {html} : {})}),
          signal:AbortSignal.timeout(6500),
        });
        await result.body?.cancel();
        if (!result.ok && result.status !== 409) console.warn("intake_notification_failed",result.status);
      };
      if (tour && webhookSecret) {
        deliveries.push(fetch(url+"/functions/v1/tour-request-mailer/webhook/tour-request",{
          method:"POST",headers:{"Content-Type":"application/json","x-webhook-secret":webhookSecret},
          body:JSON.stringify({form_name:"tour-request",id:crypto.randomUUID(),data:{name,email,phone,tour_window:value("tour_window"),start_month:value("start_month"),language:locale}}),
          signal:AbortSignal.timeout(6500),
        }).then(async result=>{await result.body?.cancel();if(!result.ok) console.warn("tour_notification_failed",result.status);}));
      } else if (!tour) {
        const day = new Date().toISOString().slice(0,10);
        const mailId = await registrationMailId(key, email, kind + day + child, locale);
        const reference = "H2H-" + day.replaceAll("-","") + "-" + mailId.slice(0,6).toUpperCase();
        const received = new Date().toLocaleString("en-US",{timeZone:"America/New_York",dateStyle:"medium",timeStyle:"short"});
        deliveries.push(send("staff", mailId, staff, "New Heart to Heart " + (registering ? "registration" : "information request"),
          "Inquiry type: " + typeLabels[kind] + "\nPreferred language: " + languageNames[locale] + " (" + locale + ")\nReceived: " + received + " (Eastern)\nReference: " + reference +
          "\n\nContact details are in the private Supabase records (sign-in required): https://supabase.com/dashboard/project/zebeclcvrdmisnxkwode/editor\n" +
          (registering ? "Table: website_private.child_registrations" : "Table: website_private.inquiries") + ", newest first.\n" +
          "This email intentionally contains no child names or form text."));
        if (!registering) {
          const family = locale === "en" ? interestMessage(name) : familyMessage("information", name, locale);
          deliveries.push(send("information", mailId, email, family.subject, family.text, family.html));
        }
      }
      if (deliveries.length) EdgeRuntime.waitUntil(Promise.allSettled(deliveries).then(results=>{
        if(results.some(result=>result.status==="rejected")) console.warn("intake_notification_failed");
      }));
    }
    return reply(201, "received");
  } catch {
    return reply(503, "unavailable");
  }
});


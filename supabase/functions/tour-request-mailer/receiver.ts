
const formId = "6b05b2aec298f9f8127361bd";
const siteId = "2c0a0593-ea18-4f4f-88bc-dd30a5d39ac5";
const formName = "tour-request";
const limit = 32768;
const fields = [
  ["name", "Name", 200],
  ["phone", "Phone", 80],
  ["email", "Email", 254],
  ["age_group", "Age group", 120],
  ["start_month", "Start month", 120],
  ["tour_window", "Tour window", 120],
  ["heard_about_us", "Heard about us", 300],
  ["notes", "Notes", 4000],
  ["bot-field", "Honeypot", 120],
] as const;

type Field = typeof fields[number][0];
type Values = Record<Field, string>;
type Options = {
  secret?: string;
  resendKey?: string;
  staff?: string;
  from?: string;
  defer: (task: Promise<unknown>) => void;
  fetcher?: typeof fetch;
  log?: (kind: string, status: number) => void;
};

const encoder = new TextEncoder();
const address = "3095 W. 25th Street, Cleveland, OH 44113";
const phone = "(216) 938-6771";
const center = "Heart to Heart Enrichment Center";
const website = "https://hearts25.com";
const license = "Ohio Child Care Center License #000000300622";
const validEmail = (value: string) => /^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/u.test(value);
const object = (value: unknown): Record<string, unknown> | undefined =>
  value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined;
const plain = (value: unknown, max: number): string => typeof value === "string"
  ? value.replaceAll("\u0000", "").trim().slice(0, max)
  : Array.isArray(value) ? value.filter(item => typeof item === "string").join(", ").trim().slice(0, max) : "";
const escape = (value: string) => value.replace(/[&<>"']/g, char => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
})[char] ?? char);

async function hmac(secret: string, value: string) {
  const key = await crypto.subtle.importKey(
    "raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
  );
  const bytes = await crypto.subtle.sign("HMAC", key, encoder.encode(value));
  return new Uint8Array(bytes);
}

async function matches(secret: string, supplied: string | null) {
  if (!supplied || supplied.length > 256) return false;
  const [left, right] = await Promise.all([hmac(secret, secret), hmac(secret, supplied)]);
  let difference = 0;
  for (let index = 0; index < left.length; index++) difference |= left[index] ^ right[index];
  return difference === 0;
}

function hex(bytes: Uint8Array) {
  return Array.from(bytes, byte => byte.toString(16).padStart(2, "0")).join("");
}

async function readJson(request: Request) {
  const reader = request.body?.getReader();
  if (!reader) throw new Error("missing_body");
  const decode = new TextDecoder("utf-8", { fatal: true });
  let length = 0;
  let text = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    length += value.byteLength;
    if (length > limit) {
      await reader.cancel();
      throw new Error("body_too_large");
    }
    text += decode.decode(value, { stream: true });
  }
  return object(JSON.parse(text + decode.decode()));
}

const response = (status: number, code: string) => Response.json(
  { status: code }, { status, headers: { "Cache-Control": "no-store" } },
);

function welcome(data: Values) {
  const first = data.name.split(/\s+/u)[0] || "there";
  const greeting = "Hi " + first + ",";
  const paragraphs = [
    "Thank you for reaching out to Heart to Heart Enrichment Center. We received your tour request and a member of our team will contact you using the phone number you gave us.",
    "In the meantime, you can reach us at " + phone + ", and you are welcome to look over our programs and enrollment steps at " + website + ".",
    "We look forward to meeting you and your family.",
  ];
  const sign = [center, address, phone, license];
  return {
    subject: "Thanks for your interest in Heart to Heart",
    text: [greeting, ...paragraphs, sign.join("\n")].join("\n\n"),
    html: [greeting, ...paragraphs].map(paragraph =>
      "<p>" + escape(paragraph).replace(website, '<a href="' + website + '">' + website + "</a>") + "</p>"
    ).join("") + "<p>" + sign.map(escape).join("<br>") + "</p>",
  };
}

function staffMessage(data: Values) {
  return {
    subject: "New Heart to Heart tour request",
    text: "A family requested a tour. Please use the phone number below to follow up.\n\n" +
      fields.map(([name, label]) => label + ": " + (data[name] || "(blank)")).join("\n"),
  };
}

export function createReceiver(options: Options) {
  const { secret, resendKey, staff, from, defer } = options;
  const sendFetch = options.fetcher ?? fetch;
  const log = options.log ?? ((kind, status) => console.warn("tour_mail_failed", kind, status));
  const configured = !!secret && secret.length >= 32 && !!resendKey && !!staff && validEmail(staff) && !!from;

  async function send(kind: "staff" | "family", id: string, to: string, body: object) {
    try {
      const result = await sendFetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: "Bearer " + resendKey,
          "Content-Type": "application/json",
          "Idempotency-Key": "heart-to-heart/" + kind + "/" + id,
        },
        body: JSON.stringify({ from, to: [to], reply_to: staff, ...body }),
        signal: AbortSignal.timeout(8000),
      });
      if (!result.ok && result.status !== 409) log(kind, result.status);
      await result.body?.cancel().catch(() => {});
    } catch {
      log(kind, 0);
    }
  }

  return async (request: Request): Promise<Response> => {
    const url = new URL(request.url);
    const route = url.pathname.replace(/\/+$/, "");
    if (route.endsWith("/health") && request.method === "GET") return response(200, "ok");
    if (!route.endsWith("/webhook/tour-request")) return response(404, "not_found");
    if (request.method !== "POST") return response(405, "method_not_allowed");
    if (!configured || !secret || !staff) return response(503, "unconfigured");
    const supplied = request.headers.get("x-webhook-secret") ?? url.searchParams.get("secret");
    if (!await matches(secret, supplied)) return response(401, "unauthorized");

    let event: Record<string, unknown> | undefined;
    try {
      event = await readJson(request);
    } catch {
      return response(400, "invalid_body");
    }
    const submission = object(event?.payload) ?? event;
    const data = object(submission?.data);
    if (!submission || !data) return response(422, "invalid_submission");

    const get = (key: string) => plain(submission[key], 200);
    const name = get("form_name") || get("formName") || get("name");
    const eventFormId = get("form_id");
    const eventSiteId = get("site_id");
    if ((name && name !== formName) || (eventFormId && eventFormId !== formId) ||
        (eventSiteId && eventSiteId !== siteId) || (!name && !eventFormId)) {
      return response(200, "ignored_form");
    }
    if (plain(data["bot-field"], 120)) return response(200, "ignored_spam");

    const values = Object.fromEntries(fields.map(([key, _, max]) => [key, plain(data[key], max)])) as Values;
    if (!values.name || !values.phone) return response(422, "missing_name_or_phone");

    async function deliver() {
      const staffId = hex(await hmac(secret!, get("id") || JSON.stringify(values)));
      const tasks = [send("staff", staffId, staff!, staffMessage(values))];
      if (validEmail(values.email)) {
        const address = values.email.toLowerCase();
        const familyId = hex(await hmac(secret!, address));
        tasks.push(send("family", familyId, address, welcome(values)));
      }
      await Promise.all(tasks);
    }

    defer(deliver().catch(() => log("worker", 0)));
    return response(200, "accepted");
  };
}


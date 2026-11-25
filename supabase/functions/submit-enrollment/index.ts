// submit-enrollment — Register a Child (v1.2.1). Independent of the tour and information-request workflows.
// Flow: validate (same engine as the browser) → encrypt → save → reference → Ohio PDF → Heart to Heart PDF → store both (encrypted, private)
//       → ONE Director email with BOTH PDFs → parent welcome email → delivery check. Same stored application feeds both PDFs.
// The application is saved BEFORE any PDF or email work, and every step records its status so a failure is visible and retryable.
import { PDFDocument, PDFHexString, PDFName, PDFOperator, rgb } from "npm:@cantoo/pdf-lib@2.11.1";
import * as fontkit from "npm:fontkit@2.0.4"; // upstream build: the @pdf-lib/fork has a broken Arabic shaper under Deno
import { buildEnrollmentPdfs, h2hFilename, ohioFilename } from "./pdf.mjs";
import { validate, normalise, settle, visibleAcks } from "./core.mjs";
import schema from "./schema.gen.ts";
import en from "./en.gen.ts";
import { b64, hmacHex, loadKeys, safeEqual, seal, sha256Hex, unb64, unseal, type Keys } from "./crypto.ts";
import { getDelivery, sendResend, staffFailureMessage, staffMessage, type Cfg } from "./mail.ts";
import { familyEnrollmentMessage } from "./family-mail.ts";

const FORM_VERSION = "1.2.0-E1"; // the browser form is unchanged in 1.2.1; only PDFs and delivery changed
const RELEASE = "1.2.1";
const LANGS: Record<string, string> = { en: "English", es: "Spanish (Español)", fr: "French (Français)", ar: "Arabic (العربية)", sw: "Swahili (Kiswahili)" };
const PAYLOAD_AAD = "h2h-enrollment-payload-v1";
const MAX_BODY = 450_000;
const env = (k: string, d = "") => Deno.env.get(k) ?? d;
const allowedOrigin = () => env("H2H_ALLOWED_ORIGIN", "https://hearts25.com");

function cors(origin: string | null): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": origin === allowedOrigin() ? origin : allowedOrigin(),
    "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-admin-secret, x-client-info",
    "Access-Control-Allow-Methods": "POST, OPTIONS", Vary: "Origin",
  };
}
const json = (body: unknown, status: number, origin: string | null, extra: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors(origin), "Content-Type": "application/json", "Cache-Control": "no-store", ...extra } });

// ---------- Supabase (service role) ----------
const sbUrl = () => env("SUPABASE_URL");
const sbKey = () => env("SUPABASE_SERVICE_ROLE_KEY");
async function rpc(fn: string, args: Record<string, unknown>) {
  const r = await fetch(`${sbUrl()}/rest/v1/rpc/${fn}`, { method: "POST", headers: { apikey: sbKey(), Authorization: "Bearer " + sbKey(), "Content-Type": "application/json" }, body: JSON.stringify(args), signal: AbortSignal.timeout(15000) });
  if (!r.ok) throw new Error(`rpc ${fn} ${r.status}`);
  const t = await r.text();
  return t ? JSON.parse(t) : null;
}
async function storagePut(path: string, bytes: Uint8Array) {
  const r = await fetch(`${sbUrl()}/storage/v1/object/enrollment-pdfs/${path}`, { method: "POST", headers: { apikey: sbKey(), Authorization: "Bearer " + sbKey(), "Content-Type": "application/octet-stream", "x-upsert": "true" }, body: bytes as BodyInit, signal: AbortSignal.timeout(20000) });
  if (!r.ok) throw new Error(`storage put ${r.status}`);
  await r.body?.cancel();
}
async function storageGet(path: string): Promise<Uint8Array> {
  const r = await fetch(`${sbUrl()}/storage/v1/object/enrollment-pdfs/${path}`, { headers: { apikey: sbKey(), Authorization: "Bearer " + sbKey() }, signal: AbortSignal.timeout(20000) });
  if (!r.ok) { await r.body?.cancel(); throw new Error(`storage get ${r.status}`); }
  return new Uint8Array(await r.arrayBuffer());
}

// ---------- config ----------
let keysP: Promise<Keys> | null = null;
const getKeys = () => (keysP ??= loadKeys(env("H2H_APP_DATA_KEY")));
const configured = () => Boolean(env("H2H_APP_DATA_KEY") && env("H2H_RESEND_API_KEY") && sbUrl() && sbKey());
function mailCfg(): Cfg {
  return {
    resendKey: env("H2H_RESEND_API_KEY"), resendUrl: env("H2H_RESEND_URL", "https://api.resend.com/emails"),
    from: env("H2H_FROM_EMAIL", "Heart to Heart Enrichment Center <hello@hearts25.com>"),
    director: env("H2H_DIRECTOR_EMAIL", "hearttoheart3095@yahoo.com"), bcc: env("H2H_STAFF_BCC", "tohearts25@gmail.com"),
    replyTo: env("H2H_REPLY_TO", "hearttoheart3095@yahoo.com"),
  };
}

// ---------- fonts (served by the site; cached per instance) ----------
let fontsP: Promise<Record<string, Uint8Array>> | null = null;
function getFonts() {
  return (fontsP ??= (async () => {
    const base = env("H2H_FONT_BASE", "https://hearts25.com/assets/fonts/");
    const get = async (n: string) => { const r = await fetch(base + n, { signal: AbortSignal.timeout(15000) }); if (!r.ok) throw new Error("font " + n + " " + r.status); return new Uint8Array(await r.arrayBuffer()); };
    const [notoRegular, notoBold, cairoRegular, cairoBold] = await Promise.all(["NotoSans-Regular.subset.ttf", "NotoSans-Bold.subset.ttf", "Cairo-Regular.subset.ttf", "Cairo-Bold.subset.ttf"].map(get));
    return { notoRegular, notoBold, cairoRegular, cairoBold };
  })().catch((e) => { fontsP = null; throw e; }));
}

// ---------- signatures ----------
type Sig = { role: "parent1" | "parent2"; name: string; relation: string; method: "drawn" | "typed"; png?: string; typedAck?: boolean };
function pngInfo(dataUrl: unknown): { bytes: Uint8Array } | null {
  if (typeof dataUrl !== "string" || dataUrl.length > 260_000 || !dataUrl.startsWith("data:image/png;base64,")) return null;
  let bytes: Uint8Array; try { bytes = unb64(dataUrl.slice(22)); } catch { return null; }
  const sig = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (bytes.length < 600 || bytes.length > 190_000 || sig.some((b, i) => bytes[i] !== b)) return null;
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const w = dv.getUint32(16), h = dv.getUint32(20);
  if (w < 100 || w > 1600 || h < 40 || h > 800) return null;
  return { bytes };
}
function checkSig(s: any, role: "parent1" | "parent2"): { ok: true; sig: Sig } | { ok: false } {
  if (!s || s.role !== role || typeof s.name !== "string" || s.name.trim().length < 2 || s.name.length > 100) return { ok: false };
  if (s.relation !== undefined && (typeof s.relation !== "string" || s.relation.length > 60)) return { ok: false };
  if (s.method === "drawn") { if (!pngInfo(s.png)) return { ok: false }; return { ok: true, sig: { role, name: s.name.trim(), relation: (s.relation ?? "").trim(), method: "drawn", png: s.png } }; }
  if (s.method === "typed") { if (s.typedAck !== true) return { ok: false }; return { ok: true, sig: { role, name: s.name.trim(), relation: (s.relation ?? "").trim(), method: "typed", typedAck: true } }; }
  return { ok: false };
}

const easternDate = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(new Date());
const digits = (s: unknown) => String(s ?? "").replace(/\D/g, "");
// Any valid email the family provided receives the welcome message, whatever their preferred contact method (parent 1 first, then parent 2).
const primaryEmail = (d: Record<string, any>) => (typeof d["p1.email"] === "string" && d["p1.email"].trim()) || (d["p2.has"] === "yes" && typeof d["p2.email"] === "string" && d["p2.email"].trim()) || "";

// ---------- processing: 2 PDFs → storage → ONE staff email → family email → delivery check (idempotent, resumable) ----------
const pdfAad = (ref: string, kind: "ohio" | "h2h") => `h2h-enrollment-pdf-v2:${ref}:${kind}`;
const TERMINAL = new Set(["delivered", "bounced", "complained", "failed", "suppressed", "unverifiable"]);
async function processApplication(reference: string, opts: { force?: boolean } = {}) {
  const row = await rpc("enrollment_get_p1", { p_reference: reference });
  if (!row) return { ok: false, error: "not found" };
  const keys = await getKeys();
  const payload = JSON.parse(new TextDecoder().decode(await unseal(keys, unb64(row.payload_enc), PAYLOAD_AAD)));
  const cfg = mailCfg();
  let ohio: Uint8Array | null = null, h2h: Uint8Array | null = null;
  const mark = (patch: Record<string, unknown>) => rpc("enrollment_mark_p1", { p_id: row.id, p_patch: patch }).catch(() => null);

  // 1+2. Both PDFs are generated from the same stored record and stored privately. Nothing is emailed unless BOTH exist.
  const haveBoth = row.pdf_status === "generated" && row.pdf_path && row.h2h_pdf_path;
  if (!haveBoth || opts.force) {
    try {
      const built = await buildEnrollmentPdfs({
        lib: { PDFDocument, rgb, fontkit, PDFName, PDFHexString, PDFOperator }, fonts: await getFonts(), schema, en, data: payload.answers,
        meta: {
          applicationId: row.reference, submittedAt: payload.submittedAt, language: payload.lang, languageName: LANGS[payload.lang], formVersion: row.form_version,
          acks: payload.acks, parent2Mode: payload.parent2Mode,
          signatures: payload.signatures.map((s: any) => ({ ...s, png: s.png ? pngInfo(s.png)!.bytes : undefined, signedAt: payload.submittedAt })),
        },
      });
      ohio = built.ohio.bytes; h2h = built.h2h.bytes;
      const d = new Date(payload.submittedAt), dir = `${d.getUTCFullYear()}/${String(d.getUTCMonth() + 1).padStart(2, "0")}/${row.reference}`;
      const ohioPath = `${dir}.ohio.pdf.enc`, h2hPath = `${dir}.h2h.pdf.enc`;
      await storagePut(ohioPath, await seal(keys, ohio!, pdfAad(row.reference, "ohio")));
      await storagePut(h2hPath, await seal(keys, h2h!, pdfAad(row.reference, "h2h")));
      await mark({ pdf_status: "generated", pdf_path: ohioPath, pdf_sha256: await sha256Hex(ohio!), pdf_bytes: ohio!.length, pdf_pages: built.ohio.pageCount,
        h2h_pdf_path: h2hPath, h2h_pdf_sha256: await sha256Hex(h2h!), h2h_pdf_bytes: h2h!.length, h2h_pdf_pages: built.h2h.pageCount, pdf_error: "" });
      row.pdf_path = ohioPath; row.h2h_pdf_path = h2hPath; row.pdf_status = "generated";
    } catch (e) {
      console.error("enrollment pdf step failed:", e instanceof Error ? `${e.name}: ${e.message}`.slice(0, 300) : "error");
      await mark({ pdf_status: "failed", pdf_attempts_inc: 1, pdf_error: e instanceof Error ? `${e.name}: ${e.message}` : "error" });
      if ((row.pdf_attempts ?? 0) >= 2) await sendResend(cfg, { from: cfg.from, to: [cfg.director], bcc: [cfg.bcc], ...staffFailureMessage(row.reference) }, `heart-to-heart/enrollment-fail/${row.reference}`);
      return { ok: false, error: "pdf" };
    }
  }

  // 3. ONE staff email with BOTH PDFs attached ("sent" = accepted by Resend; delivery is tracked separately below)
  if (row.staff_email_status !== "sent" || opts.force) {
    try {
      if (!ohio) ohio = await unseal(keys, await storageGet(row.pdf_path), pdfAad(row.reference, "ohio"));
      if (!h2h) h2h = await unseal(keys, await storageGet(row.h2h_pdf_path), pdfAad(row.reference, "h2h"));
      const msg = staffMessage({ reference: row.reference, submittedAt: payload.submittedAt }, { filename: ohioFilename(row.reference), bytes: ohio! }, { filename: h2hFilename(row.reference), bytes: h2h! });
      const idem = `heart-to-heart/enrollment-staff-v121/${row.reference}` + (opts.force ? `/${row.staff_email_attempts}` : "");
      const res = await sendResend(cfg, { from: cfg.from, to: [cfg.director], bcc: [cfg.bcc], reply_to: cfg.replyTo, ...msg }, idem);
      await mark(res.ok ? { staff_email_status: "sent", staff_email_id: res.id, staff_email_attempts_inc: 1, staff_email_error: "" } : { staff_email_status: "failed", staff_email_attempts_inc: 1, staff_email_error: res.error });
      if (!res.ok) return { ok: false, error: "staff-email" };
      row.staff_email_status = "sent"; row.staff_email_id = res.id; row.staff_delivery_status = "in_transit";
    } catch (e) {
      console.error("enrollment staff email step failed:", e instanceof Error ? `${e.name}: ${e.message}`.slice(0, 300) : "error");
      await mark({ staff_email_status: "failed", staff_email_attempts_inc: 1, staff_email_error: e instanceof Error ? e.name : "error" });
      return { ok: false, error: "staff-email" };
    }
  }

  // 4. parent welcome email (no PDFs; never blocks the Director's documents)
  if (row.family_email_status === "pending") {
    const email = primaryEmail(payload.answers);
    if (!email) await mark({ family_email_status: "skipped" });
    else {
      const res = await sendResend(cfg, { from: cfg.from, to: [email], reply_to: cfg.replyTo, ...familyEnrollmentMessage(String(payload.answers["p1.name"] ?? ""), payload.lang, row.reference) }, `heart-to-heart/enrollment-family/${row.reference}`);
      await mark(res.ok ? { family_email_status: "sent", family_email_id: res.id, family_email_error: "" } : { family_email_status: "failed", family_email_error: res.error });
      if (res.ok) { row.family_email_status = "sent"; row.family_email_id = res.id; row.family_delivery_status = "in_transit"; }
    }
  }

  // 5. actual delivery: ask Resend what happened to each accepted email (separate from acceptance). Polled by the scheduled sweep until terminal.
  const checkDelivery = async (kind: "staff" | "family") => {
    const id = row[`${kind}_email_id`], cur = row[`${kind}_delivery_status`] ?? "unknown";
    if (row[`${kind}_email_status`] !== "sent" || !id || TERMINAL.has(cur)) return;
    const d = await getDelivery(cfg, id);
    const checks = (row[`${kind}_delivery_checks`] ?? 0) + 1;
    const status = d.status === "in_transit" && checks >= 60 ? "unverifiable" : d.status;
    await mark({ [`${kind}_delivery_status`]: status, [`${kind}_delivery_event`]: d.event, [`${kind}_delivery_checks_inc`]: 1 });
  };
  await checkDelivery("staff"); await checkDelivery("family");
  return { ok: true };
}

const background = (p: Promise<unknown>) => { const q = p.catch((e) => console.error("background task failed:", e instanceof Error ? `${e.name}: ${e.message}`.slice(0, 300) : "error")); // deno-lint-ignore no-explicit-any
  const rt = (globalThis as any).EdgeRuntime; if (rt?.waitUntil) rt.waitUntil(q); return q; };

// ---------- request handlers ----------
async function submit(req: Request, origin: string | null) {
  if (origin !== allowedOrigin()) return json({ ok: false }, 403, origin);
  if (!configured()) return json({ ok: false, error: "unavailable" }, 503, origin);
  const raw = await req.text();
  if (raw.length > MAX_BODY) return json({ ok: false, error: "too_large" }, 413, origin);
  let body: any; try { body = JSON.parse(raw); } catch { return json({ ok: false, error: "bad_json" }, 400, origin); }
  if (!body || typeof body !== "object" || Array.isArray(body)) return json({ ok: false, error: "bad_body" }, 400, origin);
  if (typeof body.hp === "string" && body.hp.trim() !== "") return json({ ok: true, reference: "H2H-00000000-00000000" }, 201, origin); // honeypot: pretend success
  if (body.v !== FORM_VERSION) return json({ ok: false, error: "version" }, 409, origin);
  if (typeof body.key !== "string" || !/^[0-9a-f-]{36}$/i.test(body.key)) return json({ ok: false, error: "key" }, 400, origin);
  if (!Object.hasOwn(LANGS, body.lang)) return json({ ok: false, error: "lang" }, 400, origin);
  if (!body.data || typeof body.data !== "object" || Array.isArray(body.data)) return json({ ok: false, error: "data" }, 400, origin);

  const answers = settle(body.data, schema) as Record<string, any>;
  const errors: Record<string, string> = { ...validate(answers, schema, { today: easternDate() }).errors };
  const acks: string[] = Array.isArray(body.acks) ? body.acks.filter((x: unknown) => typeof x === "string") : [];
  for (const a of visibleAcks(answers, schema)) if (!acks.includes(a.id)) errors["ack." + a.id] = "required";
  const s1 = checkSig((body.signatures ?? []).find((s: any) => s?.role === "parent1"), "parent1");
  if (!s1.ok) errors["sig.parent1"] = "required";
  const hasP2 = answers["p2.has"] === "yes";
  const p2mode = hasP2 ? body.parent2Mode : "na";
  if (hasP2 && !["now", "later"].includes(p2mode)) errors["parent2Mode"] = "required";
  let s2: Sig | null = null;
  if (hasP2 && p2mode === "now") { const c = checkSig((body.signatures ?? []).find((s: any) => s?.role === "parent2"), "parent2"); if (!c.ok) errors["sig.parent2"] = "required"; else s2 = c.sig; }
  if (Object.keys(errors).length) return json({ ok: false, error: "invalid", errors }, 422, origin);

  const keys = await getKeys();
  const now = new Date().toISOString();
  const signatures = [s1.ok ? { ...s1.sig, relation: s1.sig.relation || String(answers["p1.rel"] ?? "") } : null, s2].filter(Boolean);
  const payload = { answers, acks: acks.filter((a) => visibleAcks(answers, schema).some((v: any) => v.id === a)), signatures, parent2Mode: p2mode, lang: body.lang, formVersion: FORM_VERSION, submittedAt: now, userAgent: String(req.headers.get("user-agent") ?? "").slice(0, 200) };
  const sealed = b64(await seal(keys, new TextEncoder().encode(JSON.stringify(payload)), PAYLOAD_AAD));
  const ip = (req.headers.get("x-forwarded-for") ?? req.headers.get("cf-connecting-ip") ?? "").split(",")[0].trim();
  const contactKey = primaryEmail(answers) || "tel:" + digits(answers["p1.cell"] || answers["p1.home"]);
  const res = await rpc("enrollment_submit_p1", {
    p_idempotency_key: body.key, p_form_version: FORM_VERSION, p_language: body.lang, p_program: answers["c.program"], p_payment_type: answers["c.payment"] ?? null, p_start_date: answers["c.start"] ?? null,
    p_parent2_status: p2mode, p_email_hash: await hmacHex(keys, "contact", contactKey),
    p_child_hash: await hmacHex(keys, "child", [answers["c.first"], answers["c.last"], answers["c.dob"]].join("|")),
    p_source_fingerprint: ip ? await hmacHex(keys, "source", ip) : null, p_payload_enc: sealed, p_key_version: 1,
  });
  if (!res?.ok) return json({ ok: false, error: res?.reason === "rate" ? "rate" : "store" }, res?.reason === "rate" ? 429 : 500, origin);

  // The application is now safely stored. Everything below is retryable.
  const finished = res.duplicate && res.status?.pdf === "generated" && res.status?.staff === "sent";
  if (!finished) background(processApplication(res.reference));
  background(sweep(2)); // opportunistically finish any older unfinished application
  return json({ ok: true, reference: res.reference, duplicate: Boolean(res.duplicate) }, 201, origin);
}

async function sweep(limit: number, minAge = Number(env("H2H_SWEEP_MIN_AGE", "120"))) {
  if (!configured()) return 0;
  const refs: string[] = (await rpc("enrollment_unfinished_p1", { p_older_than_seconds: minAge, p_limit: limit })) ?? [];
  for (const r of refs) await processApplication(r).catch(() => {});
  return refs.length;
}

async function admin(req: Request, origin: string | null) {
  const secret = env("H2H_ADMIN_SECRET");
  if (!secret || !safeEqual(req.headers.get("x-admin-secret") ?? "", secret)) return json({ ok: false }, 401, origin);
  const b = await req.json().catch(() => ({}));
  const ref = typeof b.reference === "string" ? b.reference : "";
  if (b.action === "resend" && /^H2H-\d{8}-[0-9A-F]{8}$/.test(ref)) return json(await processApplication(ref, { force: Boolean(b.force) }), 200, origin);
  if (b.action === "status" && /^H2H-\d{8}-[0-9A-F]{8}$/.test(ref)) {
    const row = await rpc("enrollment_get_p1", { p_reference: ref }); if (!row) return json({ ok: false }, 404, origin);
    const { payload_enc: _p, idempotency_key: _i, contact_email_hash: _e, child_hash: _c, source_fingerprint: _s, ...safe } = row; return json({ ok: true, application: safe }, 200, origin);
  }
  if (b.action === "download" && /^H2H-\d{8}-[0-9A-F]{8}$/.test(ref) && (b.document === "ohio" || b.document === "h2h")) {
    const row = await rpc("enrollment_get_p1", { p_reference: ref }); const path = b.document === "ohio" ? row?.pdf_path : row?.h2h_pdf_path; if (!path) return json({ ok: false }, 404, origin);
    const pdf = await unseal(await getKeys(), await storageGet(path), pdfAad(ref, b.document));
    return new Response(pdf as BodyInit, { status: 200, headers: { ...cors(origin), "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="${b.document === "ohio" ? ohioFilename(ref) : h2hFilename(ref)}"`, "Cache-Control": "no-store" } });
  }
  if (b.action === "sweep") return json({ ok: true, processed: await sweep(10, Number.isFinite(Number(b.minAge)) ? Number(b.minAge) : undefined) }, 200, origin);
  return json({ ok: false, error: "action" }, 400, origin);
}

Deno.serve(async (req) => {
  const origin = req.headers.get("origin");
  const path = new URL(req.url).pathname.replace(/\/+$/, "");
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors(origin) });
  if (req.method !== "POST") return json({ ok: false }, 405, origin);
  try {
    if (path.endsWith("/admin")) return await admin(req, origin);
    if (path.endsWith("/sweep")) { await req.body?.cancel(); background(sweep(3)); return json({ ok: true, queued: true }, 202, origin); }
    return await submit(req, origin);
  } catch (e) {
    return json({ ok: false, error: "server" }, 500, origin);
  }
});

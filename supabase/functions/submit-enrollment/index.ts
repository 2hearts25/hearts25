// submit-enrollment — Register a Child. Serves TWO form versions side by side:
//   1.2.0-E1 (the live website): validated, rendered and delivered by the FROZEN modules in ./v120 — behaviour unchanged.
//   1.3.0-E2 (next website release): contract step, PFCC agreement, insurance, uploads, agreement evidence, verified parent access.
//            Accepted only while the server-side flag `enrollment_v130` is on (website_private.feature_flags).
// Flow (both): validate (same engine as the browser) → encrypt → save → reference → Ohio PDF → Heart to Heart PDF → store both
// (encrypted, private) → ONE Director email with BOTH PDFs → parent email → delivery checks. Every step is retryable.
import { PDFDocument, PDFHexString, PDFName, PDFOperator, rgb } from "npm:@cantoo/pdf-lib@2.11.1";
import * as fontkit from "npm:fontkit@2.0.4"; // upstream build: the @pdf-lib/fork has a broken Arabic shaper under Deno
// ---- 1.3.0-E2 modules
import { buildEnrollmentPdfs, h2hFilename, ohioFilename } from "./pdf.mjs";
import { validate, settle, visibleAcks } from "./core.mjs";
import schema from "./schema.gen.ts";
import en from "./en.gen.ts";
import I18N from "./i18n.gen.ts";
import { CONTRACT, FORM_VERSION, POLICIES, pendingSections } from "./agreements.mjs";
import { agreementTexts, copayStatus, paymentStatus, reportedTerms } from "./evidence.mjs";
import { validateCard, hasForbiddenFields, normalizePan, brandOf, lastFour, maskPanPlain, followUpDue } from "./financial.mjs";
import { inspect, safeName, MAX_FILE_BYTES, CATEGORIES } from "./file-check.mjs";
// ---- 1.2.0-E1 modules (frozen copy of release 1.2.1)
import { buildEnrollmentPdfs as buildLegacyPdfs } from "./v120/pdf.mjs";
import { validate as validateLegacy, settle as settleLegacy, visibleAcks as visibleAcksLegacy } from "./v120/core.mjs";
import schemaLegacy from "./v120/schema.gen.ts";
import enLegacy from "./v120/en.gen.ts";
// ---- shared
import { b64, hmacHex, loadKeys, safeEqual, seal, sha256Hex, unb64, unseal, type Keys } from "./crypto.ts";
import { getDelivery, sendResend, staffFailureMessage, staffMessage, type Cfg, type StaffSummary } from "./mail.ts";
import { familyEnrollmentMessage } from "./family-mail.ts";
import { familyConfirmationWithDocuments, familyDocumentLinkMessage } from "./family-docs-mail.ts";
import { withPaymentNote } from "./family-payment-note.ts";

const LEGACY_VERSION = "1.2.0-E1";
const LANGS: Record<string, string> = { en: "English", es: "Spanish (Español)", fr: "French (Français)", ar: "Arabic (العربية)", sw: "Swahili (Kiswahili)" };
const PAYLOAD_AAD = "h2h-enrollment-payload-v1";
const MAX_BODY = 450_000;
const ACCESS_DAYS = 7;
const env = (k: string, d = "") => Deno.env.get(k) ?? d;
const allowedOrigin = () => env("H2H_ALLOWED_ORIGIN", "https://hearts25.com");
const siteBase = () => env("H2H_SITE_URL", "https://hearts25.com");
const REF_RE = /^H2H-\d{8}-[0-9A-F]{8}$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

function cors(origin: string | null): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": origin === allowedOrigin() ? origin : allowedOrigin(),
    "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-admin-secret, x-client-info, x-upload-token, x-upload-category, x-upload-name, x-upload-replaces",
    "Access-Control-Allow-Methods": "POST, OPTIONS", "Access-Control-Expose-Headers": "Content-Disposition", Vary: "Origin",
  };
}
const json = (body: unknown, status: number, origin: string | null, extra: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors(origin), "Content-Type": "application/json", "Cache-Control": "no-store", ...extra } });
const errName = (e: unknown) => e instanceof Error ? `${e.name}: ${e.message}`.slice(0, 300) : "error"; // never request data

// ---------- Supabase (service role) ----------
const sbUrl = () => env("SUPABASE_URL");
const sbKey = () => env("SUPABASE_SERVICE_ROLE_KEY");
async function rpc(fn: string, args: Record<string, unknown>) {
  const r = await fetch(`${sbUrl()}/rest/v1/rpc/${fn}`, { method: "POST", headers: { apikey: sbKey(), Authorization: "Bearer " + sbKey(), "Content-Type": "application/json" }, body: JSON.stringify(args), signal: AbortSignal.timeout(15000) });
  if (!r.ok) { await r.body?.cancel(); throw new Error(`rpc ${fn} ${r.status}`); }
  const t = await r.text();
  return t ? JSON.parse(t) : null;
}
const PDF_BUCKET = "enrollment-pdfs", DOC_BUCKET = "enrollment-documents";
async function storagePut(path: string, bytes: Uint8Array, bucket = PDF_BUCKET) {
  const r = await fetch(`${sbUrl()}/storage/v1/object/${bucket}/${path}`, { method: "POST", headers: { apikey: sbKey(), Authorization: "Bearer " + sbKey(), "Content-Type": "application/octet-stream", "x-upsert": "true" }, body: bytes as BodyInit, signal: AbortSignal.timeout(30000) });
  if (!r.ok) { await r.body?.cancel(); throw new Error(`storage put ${r.status}`); }
  await r.body?.cancel();
}
async function storageGet(path: string, bucket = PDF_BUCKET): Promise<Uint8Array> {
  const r = await fetch(`${sbUrl()}/storage/v1/object/${bucket}/${path}`, { headers: { apikey: sbKey(), Authorization: "Bearer " + sbKey() }, signal: AbortSignal.timeout(30000) });
  if (!r.ok) { await r.body?.cancel(); throw new Error(`storage get ${r.status}`); }
  return new Uint8Array(await r.arrayBuffer());
}
async function storageDelete(path: string, bucket = DOC_BUCKET) {
  const r = await fetch(`${sbUrl()}/storage/v1/object/${bucket}`, { method: "DELETE", headers: { apikey: sbKey(), Authorization: "Bearer " + sbKey(), "Content-Type": "application/json" }, body: JSON.stringify({ prefixes: [path] }), signal: AbortSignal.timeout(20000) });
  await r.body?.cancel();
  if (!r.ok && r.status !== 404) throw new Error(`storage delete ${r.status}`);
}

// ---------- config, keys, flags ----------
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
type Flags = { enrollment_v130: boolean; enrollment_uploads: boolean; parent_document_access: boolean; staff_document_access: boolean; financial_card_collection: boolean };
let flagCache: { at: number; v: Flags } | null = null;
// Server-side switches live in the database (website_private.feature_flags). If the 1.3.0 migration is not applied yet, or the
// lookup fails, every new capability is OFF: the 1.2.0-E1 workflow never depends on them.
async function flags(): Promise<Flags> {
  if (flagCache && Date.now() - flagCache.at < Number(env("H2H_FLAG_TTL_MS", "30000"))) return flagCache.v;
  let v: Flags = { enrollment_v130: false, enrollment_uploads: false, parent_document_access: false, staff_document_access: false, financial_card_collection: false };
  try { const f = await rpc("enrollment_flags_p2", {}); v = { ...v, ...Object.fromEntries(Object.keys(v).map((k) => [k, f?.[k] === true])) } as Flags; } catch { /* stay off */ }
  flagCache = { at: Date.now(), v };
  return v;
}

// ---------- restricted financial store (optional card information) ----------
// Collection needs BOTH the database flag AND a dedicated key (H2H_FINANCIAL_KEY, different from the application-data key). Without either, the form
// only offers "continue without card information" and the server refuses any card it is sent. Nothing here contacts a card network or charges anything.
const FIN_AAD = (id: string, part: string) => `h2h-card-${part}-v1:${id}`;
let finKeysP: Promise<Keys> | null = null;
const getFinKeys = () => (finKeysP ??= loadKeys(env("H2H_FINANCIAL_KEY")));
const finKeyReady = () => Boolean(env("H2H_FINANCIAL_KEY")) && env("H2H_FINANCIAL_KEY") !== env("H2H_APP_DATA_KEY");
async function cardCollectionOn() { return finKeyReady() && (await flags()).financial_card_collection; }

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
// Any valid email the family provided receives the parent email, whatever their preferred contact method (parent 1 first, then parent 2).
const primaryEmail = (d: Record<string, any>) => (typeof d["p1.email"] === "string" && d["p1.email"].trim()) || (d["p2.has"] === "yes" && typeof d["p2.email"] === "string" && d["p2.email"].trim()) || "";
const randomToken = () => b64(crypto.getRandomValues(new Uint8Array(32))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const utf8 = (s: string) => new TextEncoder().encode(s);

// Upload fields of the 1.3.0 schema: id → { category, max }
const UPLOAD_FIELDS: Record<string, { cat: string; max: number }> = Object.fromEntries((schema as any).steps.flatMap((st: any) => st.fields).filter((f: any) => f.t === "upload").map((f: any) => [f.id, { cat: f.cat, max: f.max }]));
const CAT_MAX: Record<string, number> = Object.fromEntries(Object.values(UPLOAD_FIELDS).map((u) => [u.cat, u.max]));
const docsIn = (answers: Record<string, any>) => Object.entries(UPLOAD_FIELDS).flatMap(([id, u]) => (Array.isArray(answers[id]) ? answers[id] : []).map((x: string) => ({ id: x, category: u.cat, field: id })));
const CAT_LABEL: Record<string, string> = { "insurance-front": "Insurance card (front)", "insurance-back": "Insurance card (back)", immunization: "Immunization record", "physical-exam": "Physical examination / medical statement", "health-care-plan": "Health care plan / doctor’s instructions", "medication-authorization": "Medication authorization", "dietary-statement": "Special-diet statement", custody: "Custody / guardianship / court documents", pfcc: "PFCC authorization or copayment notice", other: "Other enrollment documents" };

// ---------- processing: 2 PDFs → storage → ONE staff email → parent email → delivery checks (idempotent, resumable) ----------
const pdfAad = (ref: string, kind: "ohio" | "h2h") => `h2h-enrollment-pdf-v2:${ref}:${kind}`;
const TERMINAL = new Set(["delivered", "bounced", "complained", "failed", "suppressed", "unverifiable"]);

function outstandingFor(d: Record<string, any>, docs: { category: string }[]): string[] {
  const have = new Set(docs.map((x) => x.category)); const out: string[] = [];
  if (!have.has("immunization") && !["school", "medical", "conscience"].includes(d["d.immun"])) out.push("Immunization record" + (d["d.immun"] === "pending" ? " (parent will bring it)" : d["d.immun"] === "provider" ? " (provider will send it)" : ""));
  if (d["d.immun"] === "medical" && !have.has("immunization")) out.push("Physician’s statement for the medical immunization exemption");
  if (d["d.hcp"] === "pending" && !have.has("health-care-plan")) out.push("Health care plan (DCY 01236)");
  if (d["d.diet"] === "pending" && !have.has("dietary-statement")) out.push("Special-diet medical statement");
  if (d["d.med"] === "pending" && !have.has("medication-authorization")) out.push("Medication authorization (DCY 01217)");
  if (d["ag.handbook"] === "pending") out.push("Parent Handbook receipt (handbook coming soon)");
  for (const [k, n] of [["ag.resCommunity", "Community resources list"], ["ag.transIn", "Transition into care information"], ["ag.transWithin", "Transition within the center information"], ["ag.transOut", "Transition out of care information"]]) if (d[k] === "pending") out.push(n + " receipt");
  if (d["ag.wt"] === "noaccess") out.push("Withdrawal and Termination Policy — parent could not open it; provide a copy");
  if (d["c.payment"] === "pfcc") out.push("PFCC copayment amount and due date — confirm in writing and obtain the parent’s acknowledgment");
  out.push("Parent/Provider Contract sections not yet in effect: " + pendingSections().join(", "));
  if (d["d.separate"] === true) out.push("Parent will provide some documents separately");
  return out;
}

// Finalization = write the immutable agreement evidence and attach the uploaded documents. It is IDEMPOTENT (evidence is written once, a
// replay never rewrites it) and BOUNDED (8 attempts, then the application is flagged needs_attention). Until it succeeds the application is
// never reported "complete", and nothing is silently skipped: the sealed payload carries everything needed to retry exactly.
async function finalizeApplication(row: any, payload: any): Promise<boolean> {
  if (row.finalize_status === "done" || row.finalize_status === "not_applicable") return true;
  if ((row.finalize_attempts ?? 0) >= 8) return false;
  const mark = (patch: Record<string, unknown>) => rpc("enrollment_mark_p2", { p_id: row.id, p_patch: patch }).catch(() => null);
  try {
    // payment-source status is decided from what is actually in the restricted store, never from the form alone
    let payStatus = "not_received", due: string | null = payload.payment?.followUpDue ?? null;
    if (payload.payment) {
      const card = payload.payment.cardIntended ? await rpc("enrollment_card_display_p2", { p_application: row.id, p_purpose: "finalize" }) : null;
      payStatus = paymentStatus({ "fin.notice": payload.payment.choice === "skip" ? "continued" : undefined }, card?.status === "stored");
      if (payload.payment.cardIntended && !card) payStatus = "follow_up_needed";
      if (payStatus === "follow_up_needed" && !due) due = followUpDue(payload.answers["c.start"]);
      if (payStatus === "card_on_file") due = null;
    }
    const docs: any[] = payload.documents ?? [], counts: Record<string, number> = {}; for (const d of docs) counts[d.category] = (counts[d.category] ?? 0) + 1;
    const a = payload.answers;
    const rec = await rpc("enrollment_record_v130_p2", { p_application: row.id, p_agreements: payload.evidence ?? [], p_terms: payload.terms ?? null, p_meta: {
      agreement_sha256: await sha256Hex(utf8((payload.agreements ?? []).map((x: any) => x.sha256).join("|"))), contract_version: payload.contractVersion, contract_status: pendingSections().length ? "partial" : "final",
      copay_status: copayStatus(a), wt_ack_status: a["ag.wt"] === "ack" ? "acknowledged" : "not_received", doc_summary: counts,
      payment_status: payStatus, payment_followup_due: due ?? "",
      access: String(Boolean(primaryEmail(a)) && (await flags()).parent_document_access) } });
    if (!rec?.ok) throw new Error("evidence");
    const wanted = payload.docAttach?.wanted ?? [];
    if (wanted.length) {
      const att = await rpc("enrollment_docs_attach_p2", { p_token_hash: payload.docAttach.tokenHash, p_application: row.id, p_docs: wanted });
      if (!att?.ok) throw new Error("documents");
    }
    const finalized = await mark({ finalize_status: "done", finalize_error: "" });
    if (!finalized?.ok) throw new Error("finalize_status");
    row.finalize_status = "done"; row.payment_status = payStatus; row.payment_followup_due = due;
    return true;
  } catch (e) {
    console.error("finalization failed (will retry):", errName(e));
    await mark({ finalize_status: "failed", finalize_attempts_inc: 1, finalize_error: errName(e) });
    row.finalize_status = "failed"; row.finalize_attempts = (row.finalize_attempts ?? 0) + 1;
    return false;
  }
}

// Payment-source information for the Heart to Heart PDF ONLY: masked number, expiry, cardholder and billing details, status, follow-up date.
// The full card number is never read here.
async function financialForPdf(row: any, payload: any) {
  const status = row.payment_status ?? (payload.payment ? paymentStatus({ "fin.notice": payload.payment.choice === "skip" ? "continued" : undefined }, false) : null);
  const out: Record<string, unknown> = { status, followUpDue: row.payment_followup_due ?? payload.payment?.followUpDue ?? null, intended: Boolean(payload.payment?.cardIntended) };
  if (status === "card_on_file") {
    const d = await rpc("enrollment_card_display_p2", { p_application: row.id, p_purpose: "pdf" });
    if (!d || d.status !== "stored") out.status = "purged";
    else Object.assign(out, JSON.parse(new TextDecoder().decode(await unseal(await getFinKeys(), unb64(d.display_enc), FIN_AAD(row.id, "display")))), { brand: d.brand, consentAt: d.consent_at });
  }
  return out;
}

async function processApplication(reference: string, opts: { force?: boolean } = {}) {
  const row = await rpc("enrollment_get_p1", { p_reference: reference });
  if (!row) return { ok: false, error: "not found" };
  const legacy = row.form_version === LEGACY_VERSION;
  const keys = await getKeys();
  const payload = JSON.parse(new TextDecoder().decode(await unseal(keys, unb64(row.payload_enc), PAYLOAD_AAD)));
  const cfg = mailCfg();
  let ohio: Uint8Array | null = null, h2h: Uint8Array | null = null;
  const mark = (patch: Record<string, unknown>) => rpc("enrollment_mark_p2", { p_id: row.id, p_patch: patch }).catch(() => null);
  if (!legacy && !(await finalizeApplication(row, payload))) return { ok: false, error: "finalization" };

  // 1+2. Both PDFs are generated from the same stored record and stored privately. Nothing is emailed unless BOTH exist.
  const haveBoth = row.pdf_status === "generated" && row.pdf_path && row.h2h_pdf_path;
  if (!haveBoth || opts.force) {
    try {
      const meta = {
        applicationId: row.reference, submittedAt: payload.submittedAt, language: payload.lang, languageName: LANGS[payload.lang], formVersion: row.form_version,
        acks: payload.acks, parent2Mode: payload.parent2Mode,
        signatures: payload.signatures.map((s: any) => ({ ...s, png: s.png ? pngInfo(s.png)!.bytes : undefined, signedAt: payload.submittedAt })),
        ...(legacy ? {} : { v130: { documents: payload.documents ?? [], agreements: payload.agreements ?? [], contractVersion: payload.contractVersion, terms: payload.terms, fin: await financialForPdf(row, payload) } }),
      };
      const lib = { PDFDocument, rgb, fontkit, PDFName, PDFHexString, PDFOperator };
      const built = legacy
        ? await buildLegacyPdfs({ lib, fonts: await getFonts(), schema: schemaLegacy, en: enLegacy, data: payload.answers, meta })
        : await buildEnrollmentPdfs({ lib, fonts: await getFonts(), schema, en, data: payload.answers, meta });
      ohio = built.ohio.bytes; h2h = built.h2h.bytes;
      const d = new Date(payload.submittedAt), dir = `${d.getUTCFullYear()}/${String(d.getUTCMonth() + 1).padStart(2, "0")}/${row.reference}`;
      const ohioPath = `${dir}.ohio.pdf.enc`, h2hPath = `${dir}.h2h.pdf.enc`;
      await storagePut(ohioPath, await seal(keys, ohio!, pdfAad(row.reference, "ohio")));
      await storagePut(h2hPath, await seal(keys, h2h!, pdfAad(row.reference, "h2h")));
      const ohioSha = await sha256Hex(ohio!), h2hSha = await sha256Hex(h2h!);
      await mark({ pdf_status: "generated", pdf_path: ohioPath, pdf_sha256: ohioSha, pdf_bytes: ohio!.length, pdf_pages: built.ohio.pageCount,
        h2h_pdf_path: h2hPath, h2h_pdf_sha256: h2hSha, h2h_pdf_bytes: h2h!.length, h2h_pdf_pages: built.h2h.pageCount, pdf_error: "" });
      row.pdf_path = ohioPath; row.h2h_pdf_path = h2hPath; row.pdf_status = "generated"; row.pdf_sha256 = ohioSha; row.h2h_pdf_sha256 = h2hSha;
    } catch (e) {
      console.error("enrollment pdf step failed:", errName(e));
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
      let summary: StaffSummary | undefined;
      if (!legacy) {
        const a = payload.answers, docs: any[] = payload.documents ?? [];
        const counts: Record<string, number> = {}; for (const x of docs) counts[x.category] = (counts[x.category] ?? 0) + 1;
        summary = {
          lines: [["Parent language", LANGS[payload.lang] ?? payload.lang], ["Form version", row.form_version],
            ["Contract", `${payload.contractVersion} — ${pendingSections().length ? "partially in effect (sections pending approval)" : "in effect"}`],
            ["PFCC copayment", { not_pfcc: "Not a PFCC application", unknown: "Not yet known — awaiting confirmation", parent_reported: "Parent-reported amount — NOT confirmed", zero_reported: "Parent reports $0 — NOT confirmed", confirmed: "Confirmed" }[copayStatus(a) as string] ?? "—"],
            ["Late pickup schedule", a["lp.ack"] === true ? "Accepted (after center closing: $10.00 up to 10 minutes late, then $2.00 per additional minute)" : "NOT accepted"],
            ["Payment source", ({ card_on_file: "ON FILE — card information stored in the restricted financial record (masked in the Heart to Heart PDF; no payment processed or verified)", follow_up_needed: `NEEDS FOLLOW-UP — no card information provided; ask the family for a payment source or alternative arrangement by ${row.payment_followup_due ?? "30 days after enrollment"}. No advance payment is required.`, not_received: "NOT RECEIVED" } as Record<string, string>)[row.payment_status ?? ""] ?? "—"],
            ["Withdrawal & Termination Policy", a["ag.wt"] === "ack" ? `Acknowledged (${POLICIES.withdrawal.revision}, effective ${POLICIES.withdrawal.effectiveDate})` : "NOT received — parent asked for a copy"]],
          received: Object.entries(counts).map(([c, n]) => `${CAT_LABEL[c] ?? c}: ${n} file${n === 1 ? "" : "s"}`),
          outstanding: [...outstandingFor(a, docs), ...(row.finalize_status === "done" || row.finalize_status === "not_applicable" ? [] : ["System: record finalization (agreement evidence / document association) is still retrying automatically — it is not complete yet"])],
          access: docs.length ? "Uploaded files are not attached to this email. Sign in to the staff document page (https://hearts25.com/staff/documents/) with your authorized staff account to review them." : "No files were uploaded with this application.",
        };
      }
      const msg = staffMessage({ reference: row.reference, submittedAt: payload.submittedAt }, { filename: ohioFilename(row.reference), bytes: ohio! }, { filename: h2hFilename(row.reference), bytes: h2h! }, summary);
      const idem = `heart-to-heart/enrollment-staff-v121/${row.reference}` + (opts.force ? `/${row.staff_email_attempts}` : "");
      const res = await sendResend(cfg, { from: cfg.from, to: [cfg.director], bcc: [cfg.bcc], reply_to: cfg.replyTo, ...msg }, idem);
      await mark(res.ok ? { staff_email_status: "sent", staff_email_id: res.id, staff_email_attempts_inc: 1, staff_email_error: "" } : { staff_email_status: "failed", staff_email_attempts_inc: 1, staff_email_error: res.error });
      if (!res.ok) return { ok: false, error: "staff-email" };
      row.staff_email_status = "sent"; row.staff_email_id = res.id; row.staff_delivery_status = "in_transit";
    } catch (e) {
      console.error("enrollment staff email step failed:", errName(e));
      await mark({ staff_email_status: "failed", staff_email_attempts_inc: 1, staff_email_error: e instanceof Error ? e.name : "error" });
      return { ok: false, error: "staff-email" };
    }
  }

  // 4. parent email (never blocks the Director's documents; a failure here never touches the stored application)
  if (row.family_email_status === "pending" || (row.family_email_status === "failed" && (row.family_email_attempts ?? 0) < 6)) {
    const email = primaryEmail(payload.answers);
    if (!email) await mark({ family_email_status: "skipped", ...(["pending", "failed"].includes(row.access_email_status) ? { access_email_status: "skipped" } : {}) });
    else {
      let message = familyEnrollmentMessage(String(payload.answers["p1.name"] ?? ""), payload.lang, row.reference);
      let withAccess = false;
      if (!legacy && ["pending", "failed"].includes(row.access_email_status) && (await flags()).parent_document_access) {
        // The initial link is derived from the application key and the reference (unguessable without the secret), so a retry or a
        // concurrent sweep of the same email always produces the same link instead of revoking the one already sent.
        const token = (await hmacHex(keys, "access-initial", row.reference)).slice(0, 48);
        await rpc("enrollment_access_create_p2", { p_application: row.id, p_token_hash: await hmacHex(keys, "access", token), p_ttl_seconds: ACCESS_DAYS * 86400, p_reason: "initial" });
        message = familyConfirmationWithDocuments(String(payload.answers["p1.name"] ?? ""), payload.lang, row.reference, accessUrl(payload.lang, token), ACCESS_DAYS);
        withAccess = true;
      }
      if (!legacy && row.payment_status === "follow_up_needed") message = withPaymentNote(message, payload.lang, row.payment_followup_due ?? null);
      const res = await sendResend(cfg, { from: cfg.from, to: [email], reply_to: cfg.replyTo, ...message }, `heart-to-heart/enrollment-family/${row.reference}`);
      await mark(res.ok ? { family_email_attempts_inc: 1, family_email_status: "sent", family_email_id: res.id, family_email_error: "", ...(withAccess ? { access_email_status: "sent", access_email_id: res.id } : {}) }
        : { family_email_attempts_inc: 1, family_email_status: "failed", family_email_error: res.error, ...(withAccess ? { access_email_status: "failed", access_email_error: res.error } : {}) });
      if (res.ok) { row.family_email_status = "sent"; row.family_email_id = res.id; row.family_delivery_status = "in_transit"; if (withAccess) { row.access_email_status = "sent"; row.access_email_id = res.id; row.access_delivery_status = "in_transit"; } }
    }
  }

  // 5. actual delivery: ask Resend what happened to each accepted email (separate from acceptance). Polled by the scheduled sweep.
  const checkDelivery = async (kind: "staff" | "family" | "access") => {
    const id = row[`${kind}_email_id`], cur = row[`${kind}_delivery_status`] ?? "unknown";
    if (row[`${kind}_email_status`] !== "sent" || !id || TERMINAL.has(cur)) return;
    const d = await getDelivery(cfg, id);
    const checks = (row[`${kind}_delivery_checks`] ?? 0) + 1;
    const status = d.status === "in_transit" && checks >= 60 ? "unverifiable" : d.status;
    await mark({ [`${kind}_delivery_status`]: status, [`${kind}_delivery_event`]: d.event, [`${kind}_delivery_checks_inc`]: 1 });
  };
  await checkDelivery("staff"); await checkDelivery("family"); if (!legacy) await checkDelivery("access");
  return { ok: true };
}
const accessUrl = (lang: string, token: string) => `${siteBase()}/${lang === "en" ? "" : lang + "/"}register/documents/#t=${token}`;

const background = (p: Promise<unknown>) => { const q = p.catch((e) => console.error("background task failed:", errName(e))); // deno-lint-ignore no-explicit-any
  const rt = (globalThis as any).EdgeRuntime; if (rt?.waitUntil) rt.waitUntil(q); return q; };

// ---------- request handlers: application submission ----------
async function submit(req: Request, origin: string | null) {
  if (origin !== allowedOrigin()) return json({ ok: false }, 403, origin);
  if (!configured()) return json({ ok: false, error: "unavailable" }, 503, origin);
  const raw = await req.text();
  if (raw.length > MAX_BODY) return json({ ok: false, error: "too_large" }, 413, origin);
  let body: any; try { body = JSON.parse(raw); } catch { return json({ ok: false, error: "bad_json" }, 400, origin); }
  if (!body || typeof body !== "object" || Array.isArray(body)) return json({ ok: false, error: "bad_body" }, 400, origin);
  if (typeof body.hp === "string" && body.hp.trim() !== "") return json({ ok: true, reference: "H2H-00000000-00000000" }, 201, origin); // honeypot: pretend success
  const current = body.v === FORM_VERSION;
  if (body.v !== LEGACY_VERSION && !current) return json({ ok: false, error: "version" }, 409, origin);
  if (current && !(await flags()).enrollment_v130) return json({ ok: false, error: "version" }, 409, origin); // the new form is not activated yet
  if (current && body.contractVersion !== CONTRACT.version) return json({ ok: false, error: "version" }, 409, origin); // stale page: reload
  if (typeof body.key !== "string" || !/^[0-9a-f-]{36}$/i.test(body.key)) return json({ ok: false, error: "key" }, 400, origin);
  if (!Object.hasOwn(LANGS, body.lang)) return json({ ok: false, error: "lang" }, 400, origin);
  if (!body.data || typeof body.data !== "object" || Array.isArray(body.data)) return json({ ok: false, error: "data" }, 400, origin);

  // Version-specific validation: a 1.2.0-E1 application is checked ONLY against the 1.2.0-E1 rules (no new required fields).
  const S = current ? schema : schemaLegacy, V = current ? validate : validateLegacy, ST = current ? settle : settleLegacy, VA = current ? visibleAcks : visibleAcksLegacy;
  const answers = ST(body.data, S) as Record<string, any>;
  const errors: Record<string, string> = { ...V(answers, S, { today: easternDate() }).errors };
  const acks: string[] = Array.isArray(body.acks) ? body.acks.filter((x: unknown) => typeof x === "string") : [];
  for (const a of VA(answers, S)) if (!acks.includes(a.id)) errors["ack." + a.id] = "required";
  const s1 = checkSig((body.signatures ?? []).find((s: any) => s?.role === "parent1"), "parent1");
  if (!s1.ok) errors["sig.parent1"] = "required";
  const hasP2 = answers["p2.has"] === "yes";
  const p2mode = hasP2 ? body.parent2Mode : "na";
  if (hasP2 && !["now", "later"].includes(p2mode)) errors["parent2Mode"] = "required";
  let s2: Sig | null = null;
  if (hasP2 && p2mode === "now") { const c = checkSig((body.signatures ?? []).find((s: any) => s?.role === "parent2"), "parent2"); if (!c.ok) errors["sig.parent2"] = "required"; else s2 = c.sig; }

  // 1.3.0: every referenced upload must be a stored file of THIS family's upload session, in the matching category.
  const keys = await getKeys();
  const wanted = current ? docsIn(answers) : [];
  let tokenHash = "", documents: any[] = [];
  if (wanted.length) {
    if (!(await flags()).enrollment_uploads || typeof body.uploadToken !== "string" || body.uploadToken.length < 20) for (const w of wanted) errors[w.field] = "upload";
    else {
      tokenHash = await hmacHex(keys, "upload", body.uploadToken);
      const chk = await rpc("enrollment_docs_check_p2", { p_token_hash: tokenHash, p_docs: wanted.map(({ id, category }) => ({ id, category })) });
      if (!chk?.ok) { const bad = new Set(chk?.bad ?? []); for (const w of wanted) if (bad.has(w.id)) errors[w.field] = "upload"; }
      else documents = chk.documents;
    }
  }
  // Optional card information (1.3.0-E2). The card is validated here but is NEVER part of the answers, the payload, a log line or an email.
  let cardIn: { name: string; number: string; expM: string; expY: string; addr: string; city: string; state: string; zip: string } | null = null;
  if (current) {
    const c = body.card;
    if (answers["fin.choice"] === "provide") {
      if (!(await cardCollectionOn()) || !c || typeof c !== "object" || Array.isArray(c) || hasForbiddenFields(c)) errors["fin.choice"] = "choice";
      else if (Object.keys(validateCard(c, new Date(easternDate() + "T12:00:00Z"))).length) errors["fin.choice"] = "card";
      else cardIn = { name: String(c.name).trim(), number: normalizePan(c.number), expM: String(c.expM).padStart(2, "0"), expY: String(c.expY), addr: String(c.addr).trim(), city: String(c.city).trim(), state: String(c.state), zip: String(c.zip).trim() };
    } else if (c !== undefined) errors["fin.choice"] = "choice"; // a card was sent without the parent choosing to provide one
  }
  if (Object.keys(errors).length) return json({ ok: false, error: "invalid", errors }, 422, origin);

  const now = new Date().toISOString();
  const signatures = [s1.ok ? { ...s1.sig, relation: s1.sig.relation || String(answers["p1.rel"] ?? "") } : null, s2].filter(Boolean);
  const acksKept = acks.filter((a) => VA(answers, S).some((v: any) => v.id === a));
  const formVersion = current ? FORM_VERSION : LEGACY_VERSION;
  // 1.3.0: the exact agreement text shown to the family (their language + English), hashed; stored encrypted, append-only.
  let agreements: any[] = [], evidenceRows: any[] = [], agreementSha = "";
  if (current) {
    const recs = agreementTexts({ L: (I18N as any)[body.lang], EN: (I18N as any).en, data: { ...answers, __formVersion: FORM_VERSION }, acks: acksKept as any, lang: body.lang,
      card: cardIn ? { name: cardIn.name, masked: maskPanPlain(cardIn.number), expM: cardIn.expM, expY: cardIn.expY } : null });
    for (const r of recs) {
      const sha = await sha256Hex(utf8(r.text));
      agreements.push({ kind: r.kind, version: r.version, language: r.language, status: r.status, sha256: sha, enSha256: await sha256Hex(utf8(r.textEn)) });
      evidenceRows.push({ kind: r.kind, version: r.version, language: r.language, status: r.status, text_sha256: sha, accepted_at: now,
        payload_enc: b64(await seal(keys, utf8(JSON.stringify({ text: r.text, textEn: r.textEn, signers: signatures.map((s: any) => ({ role: s.role, name: s.name, method: s.method })), submittedAt: now })), "h2h-agreement-v1:" + r.kind)) });
    }
    agreementSha = await sha256Hex(utf8(agreements.map((a) => a.sha256).join("|")));
  }
  const terms = current ? reportedTerms(answers) : null;
  // Everything finalization needs is kept in the sealed payload (never the card), so a temporary failure can be retried exactly: the evidence
  // rows (already encrypted, with their hashes), the upload-session binding, and the payment-source choice. No card number is ever in here.
  const payment = current ? { choice: answers["fin.choice"] ?? null, cardIntended: Boolean(cardIn), followUpDue: cardIn ? null : followUpDue(answers["c.start"]) } : null;
  const payload = { answers, acks: acksKept, signatures, parent2Mode: p2mode, lang: body.lang, formVersion, submittedAt: now, userAgent: String(req.headers.get("user-agent") ?? "").slice(0, 200),
    ...(current ? { contractVersion: CONTRACT.version, agreements, documents, terms, payment, evidence: evidenceRows, docAttach: { tokenHash, wanted: wanted.map(({ id, category }) => ({ id, category })) } } : {}) };
  const sealed = b64(await seal(keys, new TextEncoder().encode(JSON.stringify(payload)), PAYLOAD_AAD));
  const ip = (req.headers.get("x-forwarded-for") ?? req.headers.get("cf-connecting-ip") ?? "").split(",")[0].trim();
  const contactKey = primaryEmail(answers) || "tel:" + digits(answers["p1.cell"] || answers["p1.home"]);
  const res = await rpc("enrollment_submit_p1", {
    p_idempotency_key: body.key, p_form_version: formVersion, p_language: body.lang, p_program: answers["c.program"], p_payment_type: answers["c.payment"] ?? null, p_start_date: answers["c.start"] ?? null,
    p_parent2_status: p2mode, p_email_hash: await hmacHex(keys, "contact", contactKey),
    p_child_hash: await hmacHex(keys, "child", [answers["c.first"], answers["c.last"], answers["c.dob"]].join("|")),
    p_source_fingerprint: ip ? await hmacHex(keys, "source", ip) : null, p_payload_enc: sealed, p_key_version: 1,
  });
  if (!res?.ok) return json({ ok: false, error: res?.reason === "rate" ? "rate" : "store" }, res?.reason === "rate" ? 429 : 500, origin);

  // The application is now safely stored. Everything below is retryable, and a duplicate submission never rewrites anything.
  if (current && !res.duplicate) {
    // 1. the card (if any) goes into the restricted store BEFORE anything else, because it exists only in this request. Up to 3 tries.
    if (cardIn) {
      let stored = false;
      for (let i = 0; i < 3 && !stored; i++) {
        try {
          const fk = await getFinKeys(), pan = cardIn.number;
          const r = await rpc("enrollment_card_store_p2", { p_application: res.id, p_brand: brandOf(pan), p_last4: lastFour(pan),
            p_pan_enc: b64(await seal(fk, utf8(pan), FIN_AAD(res.id, "pan"))),
            p_display_enc: b64(await seal(fk, utf8(JSON.stringify({ name: cardIn.name, masked: maskPanPlain(pan), expM: cardIn.expM, expY: cardIn.expY, addr: cardIn.addr, city: cardIn.city, state: cardIn.state, zip: cardIn.zip })), FIN_AAD(res.id, "display"))),
            p_consent_at: now, p_consent_sha: await sha256Hex(utf8(agreements.find((x) => x.kind === "financial-information")?.sha256 ?? "")) });
          stored = Boolean(r?.ok);
        } catch (e) { console.error("card store attempt failed:", errName(e)); }
      }
      cardIn = null; delete body.card; // drop the card from memory as soon as it is stored (or has definitively failed)
      if (!stored) console.error("card could not be stored for a saved application (reference logged):", res.reference);
    }
    // 2. evidence + document association: idempotent and retried by the sweep until it succeeds (never silently omitted)
    await finalizeApplication({ id: res.id, finalize_status: "pending", finalize_attempts: 0 }, payload);
  }
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

// ---------- 1.3.0: supporting-document uploads ----------
// Server-authorized, short-lived upload sessions. The browser never receives storage credentials or a storage URL: it sends the
// file to this function, which validates the real bytes, encrypts them (AES-GCM, per-document AAD) and stores them in a private
// bucket under random ids. Files stay quarantined until authorized staff review them.
async function uploadSession(req: Request, origin: string | null) {
  if (origin !== allowedOrigin()) return json({ ok: false }, 403, origin);
  const f = await flags(); if (!configured() || !f.enrollment_v130 || !f.enrollment_uploads) return json({ ok: false, error: "unavailable" }, 503, origin);
  await req.body?.cancel();
  const keys = await getKeys(); const token = randomToken();
  const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim();
  const r = await rpc("enrollment_upload_session_p2", { p_token_hash: await hmacHex(keys, "upload", token), p_source: ip ? await hmacHex(keys, "source", ip) : null, p_ttl_seconds: 3 * 3600 });
  if (!r?.ok) return json({ ok: false, error: "rate" }, 429, origin);
  return json({ ok: true, token, expiresIn: 3 * 3600, maxBytes: MAX_FILE_BYTES }, 201, origin);
}
async function uploadFile(req: Request, origin: string | null) {
  if (origin !== allowedOrigin()) return json({ ok: false }, 403, origin);
  const f = await flags(); if (!configured() || !f.enrollment_v130 || !f.enrollment_uploads) return json({ ok: false, error: "unavailable" }, 503, origin);
  const token = req.headers.get("x-upload-token") ?? "", category = req.headers.get("x-upload-category") ?? "", replaces = req.headers.get("x-upload-replaces") || null;
  let name = ""; try { name = decodeURIComponent(req.headers.get("x-upload-name") ?? ""); } catch { name = ""; }
  if (token.length < 20 || !CATEGORIES.includes(category) || !CAT_MAX[category] || (replaces && !UUID_RE.test(replaces))) { await req.body?.cancel(); return json({ ok: false, error: "bad_request" }, 400, origin); }
  if (Number(req.headers.get("content-length") ?? 0) > MAX_FILE_BYTES) { await req.body?.cancel(); return json({ ok: false, error: "size" }, 413, origin); }
  const bytes = new Uint8Array(await req.arrayBuffer());
  const check = inspect(bytes, name);
  if (!check.ok) return json({ ok: false, error: check.reason }, check.reason === "size" ? 413 : 422, origin);
  const keys = await getKeys(); const tokenHash = await hmacHex(keys, "upload", token);
  const sha = await sha256Hex(bytes);
  const nameEnc = b64(await seal(keys, utf8(safeName(name)), "h2h-doc-name-v1"));
  const begin = await rpc("enrollment_doc_begin_p2", { p_token_hash: tokenHash, p_category: category, p_mime: check.mime, p_bytes: bytes.length, p_sha256: sha, p_filename_enc: nameEnc, p_replaces: replaces, p_max_in_category: CAT_MAX[category] });
  if (!begin?.ok) { const reason = begin?.reason ?? "error"; return json({ ok: false, error: reason }, reason === "session" ? 401 : reason === "expired" ? 410 : reason === "replaces" ? 403 : 409, origin); }
  if (begin.duplicate && begin.status === "stored") return json({ ok: true, id: begin.id, duplicate: true, bytes: bytes.length, mime: check.mime }, 200, origin);
  try {
    await storagePut(begin.path, await seal(keys, bytes, "h2h-doc-v1:" + begin.id), DOC_BUCKET);
    await rpc("enrollment_doc_stored_p2", { p_token_hash: tokenHash, p_doc: begin.id, p_scan: "structure_checked" });
  } catch (e) {
    console.error("upload store failed:", errName(e));
    await rpc("enrollment_doc_reject_p2", { p_token_hash: tokenHash, p_doc: begin.id, p_reason: "store_failed" }).catch(() => null);
    return json({ ok: false, error: "store" }, 502, origin);
  }
  return json({ ok: true, id: begin.id, bytes: bytes.length, mime: check.mime }, 201, origin);
}
async function uploadRemove(req: Request, origin: string | null) {
  if (origin !== allowedOrigin()) return json({ ok: false }, 403, origin);
  const b = await req.json().catch(() => ({}));
  if (typeof b.token !== "string" || !UUID_RE.test(String(b.id))) return json({ ok: false }, 400, origin);
  const keys = await getKeys();
  const r = await rpc("enrollment_doc_remove_p2", { p_token_hash: await hmacHex(keys, "upload", b.token), p_doc: b.id });
  if (r?.ok && r.path) background(storageDelete(r.path).then(() => rpc("enrollment_doc_deleted_p2", { p_doc: b.id })));
  return json({ ok: Boolean(r?.ok) }, r?.ok ? 200 : 404, origin);
}

// ---------- 1.3.0: verified parent access to the two finalized PDFs ----------
// Possession of the emailed link proves control of the address given in THIS application (the link is never sent anywhere else);
// the child's date of birth is required as well, so a mistyped address cannot open the records. Links expire, are revocable,
// lock after 5 failed checks, and only ever release the exact PDFs stored for management (hash-verified).
async function accessHandler(req: Request, origin: string | null, action: string) {
  if (origin !== allowedOrigin()) return json({ ok: false }, 403, origin);
  if (!configured() || !(await flags()).parent_document_access) return json({ ok: false, error: "unavailable" }, 503, origin);
  const b = await req.json().catch(() => ({}));
  if (typeof b.token !== "string" || b.token.length < 20 || b.token.length > 100) return json({ ok: false, error: "expired" }, 404, origin);
  const keys = await getKeys(); const th = await hmacHex(keys, "access", b.token);
  if (action === "renew") {
    const st = await rpc("enrollment_access_check_p2", { p_token_hash: th, p_use: false, p_fail: false });
    if (st?.reference) background(renewAccess(st.reference)); // always the same generic answer, whether or not the link was real
    return json({ ok: true }, 202, origin);
  }
  const st = await rpc("enrollment_access_check_p2", { p_token_hash: th, p_use: false, p_fail: false });
  if (!st?.ok) return json({ ok: false, error: st?.reason === "locked" ? "locked" : "expired" }, st?.reason === "locked" ? 423 : 404, origin);
  const row = await rpc("enrollment_get_p1", { p_reference: st.reference });
  if (!row || row.pdf_status !== "generated" || !row.pdf_path || !row.h2h_pdf_path) return json({ ok: false, error: "not_ready" }, 409, origin);
  const payload = JSON.parse(new TextDecoder().decode(await unseal(keys, unb64(row.payload_enc), PAYLOAD_AAD)));
  if (typeof b.dob !== "string" || b.dob !== payload.answers["c.dob"]) {
    const f = await rpc("enrollment_access_check_p2", { p_token_hash: th, p_use: false, p_fail: true });
    return json({ ok: false, error: f?.reason === "locked" ? "locked" : "mismatch" }, f?.reason === "locked" ? 423 : 401, origin);
  }
  if (action === "open") return json({ ok: true, reference: row.reference, documents: ["ohio", "h2h"] }, 200, origin);
  if (b.document !== "ohio" && b.document !== "h2h") return json({ ok: false }, 400, origin);
  const pdf = await unseal(keys, await storageGet(b.document === "ohio" ? row.pdf_path : row.h2h_pdf_path), pdfAad(row.reference, b.document));
  if (await sha256Hex(pdf) !== (b.document === "ohio" ? row.pdf_sha256 : row.h2h_pdf_sha256)) return json({ ok: false, error: "integrity" }, 500, origin);
  await rpc("enrollment_access_check_p2", { p_token_hash: th, p_use: true, p_fail: false });
  return new Response(pdf as BodyInit, { status: 200, headers: { ...cors(origin), "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="${b.document === "ohio" ? ohioFilename(row.reference) : h2hFilename(row.reference)}"`, "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } });
}
async function renewAccess(reference: string) {
  const row = await rpc("enrollment_get_p1", { p_reference: reference }); if (!row) return;
  if (!(await rpc("enrollment_access_renew_ok_p2", { p_application: row.id }))) return;
  const keys = await getKeys();
  const payload = JSON.parse(new TextDecoder().decode(await unseal(keys, unb64(row.payload_enc), PAYLOAD_AAD)));
  const email = primaryEmail(payload.answers); if (!email) return; // only ever the address given in the application
  const token = randomToken();
  await rpc("enrollment_access_create_p2", { p_application: row.id, p_token_hash: await hmacHex(keys, "access", token), p_ttl_seconds: ACCESS_DAYS * 86400, p_reason: "renewal" });
  await rpc("enrollment_log_p2", { p_doc: null, p_application: row.id, p_action: "parent_access_renewed", p_actor: "parent-link", p_detail: null });
  const cfg = mailCfg();
  const res = await sendResend(cfg, { from: cfg.from, to: [email], reply_to: cfg.replyTo, ...familyDocumentLinkMessage(payload.lang, row.reference, accessUrl(payload.lang, token), ACCESS_DAYS) }, `heart-to-heart/enrollment-access/${row.reference}/${token.slice(0, 12)}`);
  await rpc("enrollment_mark_p1", { p_id: row.id, p_patch: res.ok ? { access_email_status: "sent", access_email_id: res.id, access_email_error: "" } : { access_email_status: "failed", access_email_error: res.error } });
}

// ---------- 1.3.0: staff access to uploaded documents (Supabase Auth + allowlist) ----------
async function staffUser(req: Request): Promise<{ id: string; email: string; role: string } | null> {
  const auth = req.headers.get("authorization") ?? ""; if (!auth.startsWith("Bearer ")) return null;
  const r = await fetch(`${sbUrl()}/auth/v1/user`, { headers: { apikey: sbKey(), Authorization: auth }, signal: AbortSignal.timeout(10000) });
  if (!r.ok) { await r.body?.cancel(); return null; }
  const u = await r.json().catch(() => null); if (!u?.id || !UUID_RE.test(u.id)) return null;
  if (env("H2H_STAFF_REQUIRE_MFA") === "true") { try { const claims = JSON.parse(atob(auth.slice(7).split(".")[1].replace(/-/g, "+").replace(/_/g, "/"))); if (claims.aal !== "aal2") return null; } catch { return null; } }
  const ok = await rpc("enrollment_staff_ok_p2", { p_user: u.id });
  return ok?.ok ? { id: u.id, email: ok.email, role: ok.role } : null;
}
async function staff(req: Request, origin: string | null) {
  if (origin !== allowedOrigin()) return json({ ok: false }, 403, origin);
  if (!configured() || !(await flags()).staff_document_access) return json({ ok: false, error: "unavailable" }, 503, origin);
  const user = await staffUser(req); if (!user) return json({ ok: false, error: "unauthorized" }, 401, origin);
  const actor = "staff:" + user.id;
  const b = await req.json().catch(() => ({}));
  const keys = await getKeys();
  if (b.action === "list" && REF_RE.test(b.reference)) {
    const docs = await rpc("enrollment_docs_for_app_p2", { p_reference: b.reference });
    const out = [];
    for (const d of docs ?? []) { let filename = ""; try { filename = new TextDecoder().decode(await unseal(keys, unb64(d.filename_enc), "h2h-doc-name-v1")); } catch { filename = "(name unavailable)"; }
      out.push({ id: d.id, category: d.category, label: CAT_LABEL[d.category] ?? d.category, mime: d.mime, bytes: d.bytes, sha256: d.sha256, scan: d.scan, review: d.review, storedAt: d.stored_at, filename }); }
    await rpc("enrollment_log_p2", { p_doc: null, p_application: null, p_action: "list", p_actor: actor, p_detail: b.reference });
    return json({ ok: true, reference: b.reference, documents: out }, 200, origin);
  }
  if (b.action === "download" && REF_RE.test(b.reference) && UUID_RE.test(String(b.id))) {
    const d = (await rpc("enrollment_docs_for_app_p2", { p_reference: b.reference }) ?? []).find((x: any) => x.id === b.id);
    if (!d) return json({ ok: false }, 404, origin);
    const bytes = await unseal(keys, await storageGet(d.path, DOC_BUCKET), "h2h-doc-v1:" + d.id);
    if (await sha256Hex(bytes) !== d.sha256) return json({ ok: false, error: "integrity" }, 500, origin);
    await rpc("enrollment_log_p2", { p_doc: d.id, p_application: null, p_action: "download", p_actor: actor, p_detail: d.scan });
    const ext = d.mime === "application/pdf" ? "pdf" : d.mime === "image/png" ? "png" : "jpg";
    return new Response(bytes as BodyInit, { status: 200, headers: { ...cors(origin), "Content-Type": "application/octet-stream", "Content-Disposition": `attachment; filename="${b.reference}_${d.category}_${d.id.slice(0, 8)}.${ext}"`, "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" } });
  }
  if (b.action === "review" && UUID_RE.test(String(b.id)) && ["accepted", "rejected"].includes(b.review)) return json(await rpc("enrollment_doc_review_p2", { p_doc: b.id, p_review: b.review, p_staff: actor }), 200, origin);
  if (b.action === "confirmTerms" && REF_RE.test(b.reference) && Number.isInteger(b.copayCents) && b.copayCents >= 0 && b.copayCents <= 99999 && ["mon", "tue", "wed", "thu", "fri"].includes(b.dueDay))
    return json(await rpc("enrollment_terms_confirm_p2", { p_reference: b.reference, p_copay_cents: b.copayCents, p_due_day: b.dueDay, p_staff: actor }), 200, origin);
  return json({ ok: false, error: "action" }, 400, origin);
}

// ---------- operator endpoint (secret header; never public) ----------
async function admin(req: Request, origin: string | null) {
  const secret = env("H2H_ADMIN_SECRET");
  if (!secret || !safeEqual(req.headers.get("x-admin-secret") ?? "", secret)) return json({ ok: false }, 401, origin);
  const b = await req.json().catch(() => ({}));
  const ref = typeof b.reference === "string" ? b.reference : "";
  if (b.action === "resend" && REF_RE.test(ref)) return json(await processApplication(ref, { force: Boolean(b.force) }), 200, origin);
  if (b.action === "status" && REF_RE.test(ref)) {
    const row = await rpc("enrollment_get_p1", { p_reference: ref }); if (!row) return json({ ok: false }, 404, origin);
    const { payload_enc: _p, idempotency_key: _i, contact_email_hash: _e, child_hash: _c, source_fingerprint: _s, ...safe } = row; return json({ ok: true, application: safe }, 200, origin);
  }
  if (b.action === "download" && REF_RE.test(ref) && (b.document === "ohio" || b.document === "h2h")) {
    const row = await rpc("enrollment_get_p1", { p_reference: ref }); const path = b.document === "ohio" ? row?.pdf_path : row?.h2h_pdf_path; if (!path) return json({ ok: false }, 404, origin);
    const pdf = await unseal(await getKeys(), await storageGet(path), pdfAad(ref, b.document));
    return new Response(pdf as BodyInit, { status: 200, headers: { ...cors(origin), "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="${b.document === "ohio" ? ohioFilename(ref) : h2hFilename(ref)}"`, "Cache-Control": "no-store" } });
  }
  if (b.action === "sweep") return json({ ok: true, processed: await sweep(10, Number.isFinite(Number(b.minAge)) ? Number(b.minAge) : undefined) }, 200, origin);
  if (b.action === "cleanup") return json({ ok: true, deleted: await cleanup(50) }, 200, origin);
  return json({ ok: false, error: "action" }, 400, origin);
}
// Deletes the stored objects of abandoned, removed, replaced and rejected uploads. Attached, stored documents are never deleted
// here: retention-based deletion waits for management's retention periods (docs/MANAGEMENT_DECISIONS.md).
async function cleanup(limit: number) {
  let n = 0;
  try {
    const items: { id: string; path: string }[] = (await rpc("enrollment_cleanup_candidates_p2", { p_limit: limit })) ?? [];
    for (const it of items) { try { await storageDelete(it.path); await rpc("enrollment_doc_deleted_p2", { p_doc: it.id }); n++; } catch (e) { console.error("cleanup item failed:", errName(e)); } }
  } catch { /* 1.3.0 migration not applied: nothing to clean */ }
  try { await rpc("enrollment_card_purge_due_p2", { p_limit: 25 }); } catch { /* migration 2 not applied, or nothing due */ }
  return n;
}

Deno.serve(async (req) => {
  const origin = req.headers.get("origin");
  const path = new URL(req.url).pathname.replace(/\/+$/, "");
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors(origin) });
  if (req.method !== "POST") return json({ ok: false }, 405, origin);
  try {
    if (path.endsWith("/admin")) return await admin(req, origin);
    if (path.endsWith("/sweep")) { await req.body?.cancel(); background(sweep(3).then(() => cleanup(20))); return json({ ok: true, queued: true }, 202, origin); }
    if (path.endsWith("/financial/status")) { await req.body?.cancel(); if (origin !== allowedOrigin()) return json({ ok: false }, 403, origin); return json({ ok: true, enabled: await cardCollectionOn() }, 200, origin); }
    if (path.endsWith("/upload/session")) return await uploadSession(req, origin);
    if (path.endsWith("/upload/file")) return await uploadFile(req, origin);
    if (path.endsWith("/upload/remove")) return await uploadRemove(req, origin);
    if (path.endsWith("/access/open")) return await accessHandler(req, origin, "open");
    if (path.endsWith("/access/download")) return await accessHandler(req, origin, "download");
    if (path.endsWith("/access/renew")) return await accessHandler(req, origin, "renew");
    if (path.endsWith("/staff")) return await staff(req, origin);
    return await submit(req, origin);
  } catch (e) {
    console.error("request failed:", errName(e));
    return json({ ok: false, error: "server" }, 500, origin);
  }
});

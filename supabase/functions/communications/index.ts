// communications — Heart to Heart contact register administration, double-opt-in newsletter signup, Resend synchronization, monthly newsletter and critical notifications.
// Everything that SENDS is behind database flags (comms_newsletter_send, comms_critical_send) that ship OFF. Uses its OWN Resend key (COMMS_RESEND_KEY); the enrollment sending
// credentials are never read here. Contact data stays in website_private (service role only). No child, health, custody or financial data is handled by this function.
const env = (k: string, d = "") => Deno.env.get(k) ?? d;
const sbUrl = () => env("SUPABASE_URL"), sbKey = () => env("SUPABASE_SERVICE_ROLE_KEY");
const allowedOrigin = () => env("H2H_ALLOWED_ORIGIN", "https://hearts25.com");
const FROM = () => env("COMMS_FROM", "Heart to Heart Enrichment Center <hello@hearts25.com>");
const REPLY = () => env("COMMS_REPLY_TO", "hearttoheart3095@yahoo.com");
const PHONE = "(216) 938-6771", ADDRESS = "3095 W. 25th Street, Cleveland, OH 44113", SITE = "https://hearts25.com";
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const EMAIL_RE = /^[^\s@]{1,64}@[^\s@]{1,255}\.[^\s@]{2,}$/;
const LANGS = ["en", "es", "fr", "ar", "sw"];
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
const errName = (e: unknown) => e instanceof Error ? `${e.name}: ${e.message}`.slice(0, 200) : "error";
const esc = (s: unknown) => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));

function cors(origin: string | null, admin: boolean): Record<string, string> {
  return { "Access-Control-Allow-Origin": admin ? "*" : (origin === allowedOrigin() ? origin : allowedOrigin()), "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-cron-secret, x-client-info",
    "Access-Control-Allow-Methods": "POST, GET, OPTIONS", Vary: "Origin" };
}
const json = (b: unknown, status = 200, origin: string | null = null, admin = false) => new Response(JSON.stringify(b), { status, headers: { ...cors(origin, admin), "Content-Type": "application/json", "Cache-Control": "no-store" } });
const html = (body: string, status = 200) => new Response(body, { status, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "Referrer-Policy": "no-referrer", "X-Frame-Options": "DENY", "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'" } });

async function rpc(fn: string, args: Record<string, unknown> = {}) {
  const r = await fetch(`${sbUrl()}/rest/v1/rpc/${fn}`, { method: "POST", headers: { apikey: sbKey(), Authorization: "Bearer " + sbKey(), "Content-Type": "application/json" }, body: JSON.stringify(args), signal: AbortSignal.timeout(25000) });
  if (!r.ok) { await r.body?.cancel(); throw new Error(`rpc ${fn} ${r.status}`); }
  const t = await r.text(); return t ? JSON.parse(t) : null;
}

// ---------- tokens (HMAC) for the emailed confirm / unsubscribe links ----------
const enc = new TextEncoder();
async function hmac(msg: string) {
  const secret = env("COMMS_TOKEN_SECRET"); if (secret.length < 24) throw new Error("token secret not configured");
  const k = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return Array.from(new Uint8Array(await crypto.subtle.sign("HMAC", k, enc.encode(msg))), b => b.toString(16).padStart(2, "0")).join("");
}
const safeEq = (a: string, b: string) => { if (a.length !== b.length) return false; let d = 0; for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i); return d === 0; };
async function makeLink(contactId: string, action: "confirm" | "unsub", lang: string, days: number) {
  const exp = Math.floor(Date.now() / 1000) + days * 86400, t = await hmac(`${contactId}|${action}|${exp}`);
  return `${env("COMMS_PUBLIC_URL", sbUrl() + "/functions/v1/communications")}?a=${action}&c=${contactId}&e=${exp}&l=${lang}&t=${t}`;
}
async function checkToken(u: URL, action: string) {
  const c = u.searchParams.get("c") ?? "", e = Number(u.searchParams.get("e")), t = u.searchParams.get("t") ?? "";
  if (!UUID_RE.test(c) || !Number.isFinite(e) || e < Date.now() / 1000) return null;
  return safeEq(await hmac(`${c}|${action}|${e}`), t) ? c : null;
}

// ---------- Resend (own key) ----------
const resendOn = () => env("COMMS_RESEND_KEY").length > 10;
async function resend(path: string, method = "GET", body?: unknown, idem?: string) {
  const r = await fetch(env("COMMS_RESEND_URL", "https://api.resend.com") + path, { method, headers: { Authorization: "Bearer " + env("COMMS_RESEND_KEY"), "Content-Type": "application/json", ...(idem ? { "Idempotency-Key": idem } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(25000) });
  const data = await r.json().catch(() => null); return { ok: r.ok, status: r.status, data };
}

// ---------- localized double-opt-in copy ----------
const CONFIRM: Record<string, { subject: string; head: string; body: string; button: string; done: string; undone: string; unsubHead: string; unsubBody: string; unsubButton: string; bad: string; foot: string }> = {
  en: { subject: "Please confirm your Heart to Heart newsletter subscription", head: "Confirm your subscription", body: "Someone asked to receive the Heart to Heart monthly newsletter at this email address. To start, please confirm. If this wasn't you, ignore this message and nothing will change.", button: "Yes, subscribe me",
    done: "You're subscribed. Thank you! You can unsubscribe at any time from any newsletter.", undone: "You have been unsubscribed. You will no longer receive the monthly newsletter. Closure and safety notices for enrolled families are separate and are not affected.", unsubHead: "Unsubscribe from the newsletter", unsubBody: "Select the button to stop receiving the Heart to Heart monthly newsletter. Closure and safety notices for enrolled families are not affected.", unsubButton: "Unsubscribe", bad: "This link is invalid or has expired.", foot: "Your choice will not affect your child's enrollment, eligibility or care." },
  es: { subject: "Confirme su suscripción al boletín de Heart to Heart", head: "Confirme su suscripción", body: "Alguien pidió recibir el boletín mensual de Heart to Heart en este correo. Para empezar, confirme por favor. Si no fue usted, ignore este mensaje y no cambiará nada.", button: "Sí, suscríbame",
    done: "Quedó suscrito. ¡Gracias! Puede cancelar la suscripción en cualquier momento desde cualquier boletín.", undone: "Se canceló su suscripción. Ya no recibirá el boletín mensual. Los avisos de cierre y seguridad para familias inscritas son aparte y no se ven afectados.", unsubHead: "Cancelar la suscripción al boletín", unsubBody: "Seleccione el botón para dejar de recibir el boletín mensual de Heart to Heart. Los avisos de cierre y seguridad para familias inscritas no se ven afectados.", unsubButton: "Cancelar suscripción", bad: "Este enlace no es válido o ya venció.", foot: "Su decisión no afectará la inscripción, la elegibilidad ni el cuidado de su hijo." },
  fr: { subject: "Veuillez confirmer votre abonnement à la lettre d'information de Heart to Heart", head: "Confirmez votre abonnement", body: "Quelqu'un a demandé à recevoir la lettre d'information mensuelle de Heart to Heart à cette adresse. Pour commencer, veuillez confirmer. Si ce n'était pas vous, ignorez ce message : rien ne changera.", button: "Oui, abonnez-moi",
    done: "Vous êtes abonné(e). Merci ! Vous pouvez vous désabonner à tout moment depuis n'importe quelle lettre.", undone: "Vous êtes désabonné(e) et ne recevrez plus la lettre mensuelle. Les avis de fermeture et de sécurité pour les familles inscrites sont distincts et ne sont pas concernés.", unsubHead: "Se désabonner de la lettre d'information", unsubBody: "Sélectionnez le bouton pour ne plus recevoir la lettre mensuelle de Heart to Heart. Les avis de fermeture et de sécurité pour les familles inscrites ne sont pas concernés.", unsubButton: "Se désabonner", bad: "Ce lien est invalide ou a expiré.", foot: "Votre choix n'affectera ni l'inscription, ni l'admissibilité, ni les soins de votre enfant." },
  ar: { subject: "يرجى تأكيد اشتراكك في نشرة Heart to Heart", head: "أكّد اشتراكك", body: "طلب شخص ما استلام النشرة الشهرية لمركز Heart to Heart على هذا البريد الإلكتروني. للبدء، يرجى التأكيد. وإن لم تكن أنت، فتجاهل هذه الرسالة ولن يتغير شيء.", button: "نعم، اشتركوا بي",
    done: "تم اشتراكك. شكرًا لك! يمكنك إلغاء الاشتراك في أي وقت من أي نشرة.", undone: "تم إلغاء اشتراكك ولن تتلقى النشرة الشهرية بعد الآن. إشعارات الإغلاق والسلامة للعائلات المسجَّلة منفصلة ولا تتأثر.", unsubHead: "إلغاء الاشتراك في النشرة", unsubBody: "اضغط على الزر لإيقاف استلام النشرة الشهرية. إشعارات الإغلاق والسلامة للعائلات المسجَّلة لا تتأثر.", unsubButton: "إلغاء الاشتراك", bad: "هذا الرابط غير صالح أو انتهت صلاحيته.", foot: "اختيارك لن يؤثر على تسجيل طفلك أو أهليته أو رعايته." },
  sw: { subject: "Tafadhali thibitisha usajili wako wa jarida la Heart to Heart", head: "Thibitisha usajili wako", body: "Mtu aliomba kupokea jarida la kila mwezi la Heart to Heart kwa barua pepe hii. Ili kuanza, tafadhali thibitisha. Ikiwa si wewe, puuza ujumbe huu na hakuna kitakachobadilika.", button: "Ndiyo, nisajili",
    done: "Umesajiliwa. Asante! Unaweza kujiondoa wakati wowote kutoka kwa jarida lolote.", undone: "Umeondolewa. Hutapokea tena jarida la kila mwezi. Taarifa za kufungwa na usalama kwa familia zilizosajiliwa ni tofauti na haziathiriwi.", unsubHead: "Jiondoe kwenye jarida", unsubBody: "Chagua kitufe ili uache kupokea jarida la kila mwezi la Heart to Heart. Taarifa za kufungwa na usalama kwa familia zilizosajiliwa haziathiriwi.", unsubButton: "Jiondoe", bad: "Kiungo hiki si sahihi au kimeisha muda.", foot: "Chaguo lako halitaathiri usajili, ustahiki wala malezi ya mtoto wako." },
};
const rtl = (l: string) => l === "ar";
const shell = (l: string, inner: string) => `<!doctype html><html lang="${l}" dir="${rtl(l) ? "rtl" : "ltr"}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>Heart to Heart</title>
<style>body{font-family:system-ui,Segoe UI,Arial,sans-serif;background:#faf6f0;color:#2b2b2b;margin:0}main{max-width:520px;margin:8vh auto;background:#fff;border-radius:14px;padding:28px;box-shadow:0 2px 12px #0001}h1{font-size:1.35rem;margin:.2em 0 .6em;color:#7a2e4d}button{background:#7a2e4d;color:#fff;border:0;border-radius:8px;padding:12px 20px;font-size:1rem;cursor:pointer}p.small{font-size:.85rem;color:#666}</style></head><body><main>${inner}<p class="small">Heart to Heart Enrichment Center · ${esc(ADDRESS)} · ${PHONE}</p></main></body></html>`;

// ---------- email templates ----------
const para = (s: string) => esc(s).split(/\n{2,}/).map(p => `<p style="margin:0 0 12px">${p.replace(/\n/g, "<br>")}</p>`).join("");
const wrapEmail = (l: string, title: string, inner: string, footer: string) => `<!doctype html><html lang="${l}" dir="${rtl(l) ? "rtl" : "ltr"}"><body style="margin:0;background:#faf6f0"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:20px 10px">
<table role="presentation" width="600" style="max-width:600px;width:100%;background:#ffffff;border-radius:12px;font-family:Arial,Helvetica,sans-serif;color:#2b2b2b;font-size:16px;line-height:1.5"><tr><td style="background:#7a2e4d;color:#fff;padding:18px 24px;border-radius:12px 12px 0 0;font-size:20px;font-weight:bold">Heart to Heart Enrichment Center</td></tr>
<tr><td style="padding:24px"><h1 style="font-size:22px;color:#7a2e4d;margin:0 0 14px">${esc(title)}</h1>${inner}</td></tr>
<tr><td style="padding:16px 24px 22px;border-top:1px solid #eee;font-size:13px;color:#666">${footer}</td></tr></table></td></tr></table></body></html>`;
const contactBlock = `<p style="margin:0 0 4px"><strong>Heart to Heart Enrichment Center</strong></p><p style="margin:0">${esc(ADDRESS)}<br>Phone ${PHONE} · <a href="${SITE}">${SITE.replace("https://", "")}</a></p>`;
export function newsletterHtml(c: { title?: string; content: Record<string, string>; month?: string }) {
  const S: [string, string][] = [["director", "A note from the Director"], ["news", "Center news"], ["enrollment", "Enrollment updates"], ["resources", "Family resources"], ["events", "Community events"]];
  const inner = S.map(([k, h]) => c.content?.[k] ? `<h2 style="font-size:18px;color:#7a2e4d;margin:22px 0 8px">${h}</h2>${para(c.content[k])}` : "").join("") +
    `<h2 style="font-size:18px;color:#7a2e4d;margin:22px 0 8px">Contact us</h2>${contactBlock}`;
  return wrapEmail("en", c.title || "Heart to Heart newsletter", inner,
    `${contactBlock}<p style="margin:10px 0 0">You are receiving this monthly newsletter because you chose to subscribe. <a href="{{{RESEND_UNSUBSCRIBE_URL}}}">Unsubscribe</a> at any time. Your choice does not affect your child's enrollment, eligibility or care, and closure and safety notices are separate.</p>`);
}
export function criticalHtml(subject: string, body: string) {
  return wrapEmail("en", subject, para(body) + `<p style="margin:14px 0 0">Questions? Call us at <strong>${PHONE}</strong>.</p>`,
    `<p style="margin:0 0 8px">This is an important service notice for current Heart to Heart families and staff. It is not marketing and is sent regardless of newsletter choices. This email supplements, and does not replace, our regular phone and in-person notification procedures.</p>${contactBlock}`);
}
export const criticalText = (subject: string, body: string) => `${subject}\n\n${body}\n\nQuestions? Call ${PHONE}.\nHeart to Heart Enrichment Center, ${ADDRESS}`;

// ---------- admin auth ----------
async function adminUser(req: Request) {
  const auth = req.headers.get("authorization") ?? ""; if (!auth.startsWith("Bearer ")) return null;
  const r = await fetch(`${sbUrl()}/auth/v1/user`, { headers: { apikey: sbKey(), Authorization: auth }, signal: AbortSignal.timeout(10000) });
  if (!r.ok) { await r.body?.cancel(); return null; }
  const u = await r.json().catch(() => null); if (!u?.id || !UUID_RE.test(u.id)) return null;
  if (env("COMMS_REQUIRE_MFA") === "true") { try { const c = JSON.parse(atob(auth.slice(7).split(".")[1].replace(/-/g, "+").replace(/_/g, "/"))); if (c.aal !== "aal2") return null; } catch { return null; } }
  const ok = await rpc("comms_admin_ok_p4", { p_user: u.id }); return ok?.ok ? { id: u.id as string, ...ok } : null;
}
async function limited(key: string, limit: number, window: number) { try { return !(await rpc("comms_rate_p4", { p_key: key, p_limit: limit, p_window_seconds: window })); } catch { return true; } }
const ipOf = (req: Request) => (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || "unknown";

// ---------- Resend synchronization (register → Resend; the register always wins) ----------
async function syncBatch(limit = 40) {
  if (!(await rpc("comms_flag_p4", { p_key: "comms_resend_sync" }))) return { skipped: "flag_off" };
  if (!resendOn()) return { skipped: "resend_not_configured" };
  const rows = await rpc("resend_sync_batch_p4", { p_limit: limit }) as any[]; let ok = 0, failed = 0;
  for (const r of rows) {
    let rid: string | null = r.resend_contact_id, err: string | null = null;
    try {
      if (!rid) {
        const body: any = { email: r.email, first_name: r.first_name ?? undefined, last_name: r.last_name ?? undefined, unsubscribed: false };
        if (env("COMMS_RESEND_SEGMENT_ID")) body.segments = [{ id: env("COMMS_RESEND_SEGMENT_ID") }];
        if (env("COMMS_RESEND_TOPIC_ID")) body.topics = [{ id: env("COMMS_RESEND_TOPIC_ID"), subscription: "opt_in" }];
        let x = await resend("/contacts", "POST", body);
        if (!x.ok && (x.status === 409 || x.status === 422)) { const g = await resend("/contacts/" + encodeURIComponent(r.email)); if (g.ok && g.data?.id) { rid = g.data.id; x = { ok: true, status: 200, data: g.data }; } }
        if (!x.ok) err = "create " + x.status; else rid = rid ?? x.data?.id ?? null;
        if (!err && rid && !r.unsubscribed) { /* newly created and subscribed: done */ }
        else if (!err && rid && r.unsubscribed) { const p = await resend("/contacts/" + rid, "PATCH", { unsubscribed: true }); if (!p.ok) err = "patch " + p.status; }
        else if (!err && rid) { const p = await resend("/contacts/" + rid, "PATCH", { unsubscribed: false, first_name: r.first_name ?? undefined, last_name: r.last_name ?? undefined }); if (!p.ok) err = "patch " + p.status; }
      } else {
        const p = await resend("/contacts/" + rid, "PATCH", { unsubscribed: r.unsubscribed, first_name: r.first_name ?? undefined, last_name: r.last_name ?? undefined }); if (!p.ok) err = "patch " + p.status;
      }
    } catch (e) { err = errName(e); }
    await rpc("resend_sync_mark_p4", { p_id: r.id, p_resend_id: rid, p_unsub: r.unsubscribed, p_as_of: r.as_of, p_error: err });
    err ? failed++ : ok++; await sleep(600); // Resend allows 2 requests/second
  }
  return { synced: ok, failed };
}
async function reconcile() {
  if (!resendOn()) return { skipped: "resend_not_configured" };
  let after: string | undefined, pushed = 0, applied = 0, unknown = 0, pages = 0;
  while (pages++ < 20) {
    const g = await resend(`/contacts?limit=100${after ? "&after=" + after : ""}`); if (!g.ok) return { error: "list " + g.status, pushed, applied };
    const list = (g.data?.data ?? []) as any[]; if (!list.length) break;
    const res = await rpc("resend_reconcile_p4", { p: list.map(c => ({ id: c.id, email: c.email, unsubscribed: !!c.unsubscribed })) });
    applied += res.applied_provider_unsubs; unknown += res.unknown_in_register;
    for (const p of res.push_unsub as any[]) { await resend("/contacts/" + p.resend_id, "PATCH", { unsubscribed: true }); pushed++; await sleep(600); }
    if (!g.data?.has_more) break; after = list[list.length - 1].id;
  }
  return { pushed_unsubscribes: pushed, applied_provider_unsubscribes: applied, unknown_in_register: unknown };
}

// ---------- newsletter campaign runner (flag-gated; approval + content hash enforced in the database) ----------
async function runCampaign(actor: string, id: string | null) {
  const claim = await rpc("campaign_claim_p4", { p_id: id, p_actor: actor }); if (!claim?.ok) return claim;
  const c = claim.campaign; let broadcast: string | null = null, err: string | null = null, n = 0;
  try {
    if (!resendOn()) throw new Error("resend not configured");
    if (!env("COMMS_RESEND_SEGMENT_ID")) throw new Error("segment not configured");
    for (let i = 0; i < 20; i++) { const s = await syncBatch(50); if ((s as any).skipped) throw new Error("sync " + (s as any).skipped); if (!(s as any).synced && !(s as any).failed) break; } // push every pending change first
    const rc = await reconcile(); if ((rc as any).error) throw new Error("reconcile " + (rc as any).error); // verify status immediately before sending
    n = (await rpc("comms_counts_p4")).newsletter;
    if (n < 1) throw new Error("no eligible subscribers");
    const b = await resend("/broadcasts", "POST", { segment_id: env("COMMS_RESEND_SEGMENT_ID"), ...(env("COMMS_RESEND_TOPIC_ID") ? { topic_id: env("COMMS_RESEND_TOPIC_ID") } : {}), from: FROM(), reply_to: REPLY(), subject: c.subject, name: `Newsletter ${c.month}`, html: newsletterHtml(c) }, `campaign-${c.id}`);
    if (!b.ok || !b.data?.id) throw new Error("create broadcast " + b.status); broadcast = b.data.id;
    const s = await resend(`/broadcasts/${broadcast}/send`, "POST", {}, `campaign-send-${c.id}`); if (!s.ok) throw new Error("send broadcast " + s.status);
  } catch (e) { err = errName(e); }
  await rpc("campaign_finish_p4", { p_id: c.id, p_broadcast: broadcast, p_recipients: n, p_error: err });
  return { ok: !err, error: err, recipients: n, broadcast };
}

// ---------- critical notifications ----------
async function sendCritical(actor: string, sendId: string, confirm: number) {
  const go = await rpc("critical_begin_p4", { p_send: sendId, p_confirm_count: confirm, p_actor: actor }); if (!go?.ok) return go;
  const list = go.recipients as { contact_id: string; email: string }[]; const html = criticalHtml(go.subject, go.body), text = criticalText(go.subject, go.body);
  for (let i = 0; i < list.length; i += 100) {
    const chunk = list.slice(i, i + 100); let ids: string[] = [], err: string | null = null;
    if (!resendOn()) err = "email service not configured";
    else {
      const r = await resend("/emails/batch", "POST", chunk.map(c => ({ from: FROM(), reply_to: REPLY(), to: [c.email], subject: go.subject, html, text, tags: [{ name: "category", value: "critical" }] })), `critical-${sendId}-${i}`);
      if (r.ok) ids = (r.data?.data ?? []).map((d: any) => d.id); else err = `provider ${r.status}${r.data?.message ? ": " + String(r.data.message).slice(0, 120) : ""}`;
    }
    for (let j = 0; j < chunk.length; j++) await rpc("critical_mark_p4", { p_send: sendId, p_contact: chunk[j].contact_id, p_status: ids[j] ? "sent" : "failed", p_email_id: ids[j] ?? null, p_error: ids[j] ? null : (err ?? "no id returned") });
  }
  await rpc("critical_finish_p4", { p_send: sendId });
  return { ok: true, report: await rpc("critical_report_p4", { p_send: sendId }) };
}

// ---------- webhook (Svix signature verified; idempotent) ----------
async function verifySvix(req: Request, raw: string) {
  const secret = env("COMMS_WEBHOOK_SECRET"); const id = req.headers.get("svix-id") ?? "", ts = req.headers.get("svix-timestamp") ?? "", sig = req.headers.get("svix-signature") ?? "";
  if (!secret || !id || !ts || !sig || Math.abs(Date.now() / 1000 - Number(ts)) > 300) return null;
  const keyBytes = Uint8Array.from(atob(secret.replace(/^whsec_/, "")), c => c.charCodeAt(0));
  const k = await crypto.subtle.importKey("raw", keyBytes, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = btoa(String.fromCharCode(...new Uint8Array(await crypto.subtle.sign("HMAC", k, enc.encode(`${id}.${ts}.${raw}`)))));
  return sig.split(" ").some(s => safeEq(s.split(",")[1] ?? "", mac)) ? id : null;
}
async function webhook(req: Request) {
  const raw = await req.text(); const id = await verifySvix(req, raw); if (!id) return json({ ok: false }, 401);
  let ev: any; try { ev = JSON.parse(raw); } catch { return json({ ok: false }, 400); }
  const type: string = ev.type ?? "", d = ev.data ?? {}, to = (Array.isArray(d.to) ? d.to[0] : d.to) ?? d.email ?? "";
  if (type === "contact.updated" || type === "contact.deleted") { if (type === "contact.deleted" || d.unsubscribed === true) await rpc("contact_delivery_event_p4", { p_event_id: id, p_type: "provider_unsubscribed", p_email: d.email ?? "", p_detail: type }); return json({ ok: true }); }
  const map: Record<string, string> = { "email.delivered": "delivered", "email.bounced": "bounced", "email.failed": "failed", "email.complained": "bounced", "email.suppressed": "suppressed" };
  if (d.email_id && map[type]) await rpc("critical_delivery_event_p4", { p_email_id: d.email_id, p_status: map[type], p_error: d.bounce?.message ?? d.failed?.reason ?? type });
  if (type === "email.bounced" && String(d.bounce?.type ?? "").toLowerCase().startsWith("perm")) await rpc("contact_delivery_event_p4", { p_event_id: id, p_type: "bounced", p_email: to, p_detail: String(d.bounce?.message ?? "bounced") });
  else if (type === "email.complained") await rpc("contact_delivery_event_p4", { p_event_id: id, p_type: "complained", p_email: to, p_detail: null });
  else if (type === "email.suppressed") await rpc("contact_delivery_event_p4", { p_event_id: id, p_type: "suppressed", p_email: to, p_detail: String(d.suppressed?.message ?? "suppressed") });
  return json({ ok: true });
}

// ---------- public newsletter signup (double opt-in) ----------
async function publicSubscribe(req: Request, b: any, origin: string | null) {
  if (origin !== allowedOrigin()) return json({ ok: false }, 403, origin);
  if (b.website) return json({ ok: true }, 200, origin); // honeypot
  const email = String(b.email ?? "").trim().toLowerCase(), lang = LANGS.includes(b.language) ? b.language : "en";
  if (!EMAIL_RE.test(email) || email.length > 254) return json({ ok: false, error: "invalid_email" }, 422, origin);
  if (await limited("sub:ip:" + ipOf(req), 10, 3600) || await limited("sub:em:" + email, 3, 3600)) return json({ ok: false, error: "rate_limited" }, 429, origin);
  if (!(await rpc("comms_flag_p4", { p_key: "comms_capture" }))) return json({ ok: true, disabled: true }, 200, origin);
  const src = ["footer", "website-tour", "website-information", "website-contact"].includes(b.source) ? b.source : "footer";
  const r = await rpc("contact_capture_p4", { p: { email, name: String(b.name ?? "").slice(0, 120) || null, language: lang, source: "newsletter-" + src, roles: ["community"],
    newsletter: { choice: "yes", trust: "public", source: src, version: "NL-1.0", event_key: null } } });
  // Only the address owner can complete the subscription: a confirmation link goes to that address. Responses never reveal whether the address already existed.
  if (r?.newsletter === "confirmation_requested" && resendOn() && r.id) {
    try {
      const link = await makeLink(r.id, "confirm", lang, 3), C = CONFIRM[lang];
      await resend("/emails", "POST", { from: FROM(), reply_to: REPLY(), to: [email], subject: C.subject, html: wrapEmail(lang, C.head, `<p>${esc(C.body)}</p><p style="margin:20px 0"><a href="${esc(link)}" style="background:#7a2e4d;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none;display:inline-block">${esc(C.button)}</a></p><p style="font-size:13px;color:#666">${esc(C.foot)}</p>`, contactBlock), text: `${C.head}\n\n${C.body}\n\n${link}\n\n${C.foot}`, tags: [{ name: "category", value: "newsletter-confirmation" }] });
    } catch (e) { console.error("confirmation email failed:", errName(e)); }
  }
  return json({ ok: true }, 200, origin);
}

// ---------- link pages (GET shows a button; POST performs: scanners that pre-fetch links change nothing) ----------
async function linkPage(req: Request, u: URL) {
  const action = u.searchParams.get("a") as "confirm" | "unsub", l = LANGS.includes(u.searchParams.get("l") ?? "") ? u.searchParams.get("l")! : "en", C = CONFIRM[l];
  const c = await checkToken(u, action);
  if (!c) return html(shell(l, `<h1>${esc(C.bad)}</h1>`), 400);
  if (req.method === "POST") {
    const r = await rpc("contact_verified_p4", { p_id: c, p_action: action, p_lang: l, p_event_key: `link:${action}:${c}:${u.searchParams.get("e")}` });
    return html(shell(l, `<h1>${esc(r?.ok ? (action === "confirm" ? C.done : C.undone) : C.bad)}</h1>`), r?.ok ? 200 : 400);
  }
  return html(shell(l, `<h1>${esc(action === "confirm" ? C.head : C.unsubHead)}</h1><p>${esc(action === "confirm" ? C.body : C.unsubBody)}</p><form method="post"><button type="submit">${esc(action === "confirm" ? C.button : C.unsubButton)}</button></form><p class="small">${esc(C.foot)}</p>`));
}

// ---------- admin actions ----------
async function admin(a: string, b: any, who: { email: string; can_manage: boolean; can_send_critical: boolean; can_approve_newsletter: boolean }) {
  const actor = who.email;
  const need = (ok: boolean) => { if (!ok) throw Object.assign(new Error("forbidden"), { status: 403 }); };
  switch (a) {
    case "whoami": return { ok: true, email: who.email, can_manage: who.can_manage, can_send_critical: who.can_send_critical, can_approve_newsletter: who.can_approve_newsletter };
    case "counts": return await rpc("comms_counts_p4");
    case "contact_list": return await rpc("contact_list_p4", { p_filter: b.filter ?? {} });
    case "contact_add": need(who.can_manage); return await rpc("contact_add_p4", { p: b.contact ?? {}, p_actor: actor });
    case "contact_update": need(who.can_manage); return await rpc("contact_update_p4", { p_id: b.id, p: b.fields ?? {}, p_actor: actor });
    case "relationship_set": need(who.can_manage); return await rpc("relationship_set_p4", { p_contact: b.id, p_kind: b.kind, p_ref: b.ref ?? null, p_status: b.status, p_actor: actor });
    case "marketing": need(who.can_manage); return await rpc("contact_marketing_p4", { p_id: b.id, p_action: b.op, p_evidence: b.evidence ?? null, p_actor: actor });
    case "request_confirmation": {
      need(who.can_manage); const r = await rpc("contact_marketing_p4", { p_id: b.id, p_action: "request_confirmation", p_evidence: null, p_actor: actor }); if (!r?.ok || !resendOn()) return r;
      const g = await rpc("contact_list_p4", { p_filter: { q: b.email ?? "", limit: 5 } }); const c = (g.rows as any[]).find(x => x.id === b.id); if (!c) return r;
      const l = LANGS.includes(c.language) ? c.language : "en", C = CONFIRM[l], link = await makeLink(b.id, "confirm", l, 3);
      await resend("/emails", "POST", { from: FROM(), reply_to: REPLY(), to: [c.email], subject: C.subject, html: wrapEmail(l, C.head, `<p>${esc(C.body)}</p><p style="margin:20px 0"><a href="${esc(link)}" style="background:#7a2e4d;color:#fff;padding:12px 20px;border-radius:8px;text-decoration:none;display:inline-block">${esc(C.button)}</a></p>`, contactBlock), text: `${C.head}\n\n${C.body}\n\n${link}` });
      return { ok: true, sent: true };
    }
    case "deliverability": need(who.can_manage); return await rpc("contact_deliverability_p4", { p_id: b.id, p_value: b.value, p_actor: actor });
    case "import": need(who.can_manage); return await rpc("contact_import_p4", { p_rows: b.rows ?? [], p_dry: b.dry !== false, p_actor: actor, p_label: b.label ?? "import" });
    case "export": need(who.can_manage); return { ok: true, rows: await rpc("contact_export_p4", { p_filter: b.filter ?? {}, p_actor: actor }) };
    case "queue_run": need(who.can_manage); return await rpc("contact_queue_run_p4", { p_limit: 100 });
    case "sync": need(who.can_manage); return await syncBatch(40);
    case "reconcile": need(who.can_manage); return await reconcile();
    case "campaign_list": return { ok: true, campaigns: await rpc("campaign_list_p4") };
    case "campaign_save": need(who.can_manage); return await rpc("campaign_save_p4", { p: b.campaign ?? {}, p_actor: actor });
    case "campaign_prepare_next": need(who.can_manage); return await rpc("campaign_prepare_next_p4", { p_actor: actor });
    case "campaign_preview": { const g = (await rpc("campaign_list_p4") as any[]).find(c => c.id === b.id); return g ? { ok: true, subject: g.subject, html: newsletterHtml(g) } : { ok: false, error: "not_found" }; }
    case "campaign_approve": need(who.can_approve_newsletter); return await rpc("campaign_approve_p4", { p_id: b.id, p_actor: actor });
    case "campaign_run": need(who.can_approve_newsletter); return await runCampaign(actor, b.id ?? null);
    case "critical_templates": return { ok: true, templates: await rpc("critical_templates_p4") };
    case "critical_prepare": {
      need(who.can_send_critical); const subj = String(b.subject ?? ""), body = String(b.body ?? "");
      if (/\{\{[^}]*\}\}/.test(subj + body)) return { ok: false, error: "unresolved_placeholders" };
      if (/https?:\/\/|unsubscribe|newsletter|sale|discount/i.test(subj + body) && !b.allow_links) return { ok: false, error: "promotional_or_link_content" };
      return await rpc("critical_prepare_p4", { p_template: b.template, p_subject: subj || null, p_body: body || null, p_actor: actor });
    }
    case "critical_send": need(who.can_send_critical); return await sendCritical(actor, b.send_id, Number(b.confirm_count));
    case "critical_report": need(who.can_send_critical); return { ok: true, report: await rpc("critical_report_p4", { p_send: b.send_id }) };
    default: return { ok: false, error: "unknown_action" };
  }
}

Deno.serve(async (req) => {
  const u = new URL(req.url), origin = req.headers.get("origin"), a = u.searchParams.get("a") ?? "";
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors(origin, true) });
  try {
    if ((a === "confirm" || a === "unsub") && (req.method === "GET" || req.method === "POST")) return await linkPage(req, u);
    if (req.method !== "POST") return json({ ok: false }, 405, origin);
    if (a === "webhook") return await webhook(req);
    const raw = await req.text(); if (raw.length > 2_000_000) return json({ ok: false, error: "too_large" }, 413, origin, true);
    let b: any = {}; try { b = raw ? JSON.parse(raw) : {}; } catch { return json({ ok: false, error: "bad_json" }, 400, origin, true); }
    if (b.action === "subscribe") return await publicSubscribe(req, b, origin);
    if (b.action === "tick") { // scheduled maintenance: capture retries, Resend sync, draft for next month; sends only if the flags AND an approved, due campaign exist
      const sec = env("COMMS_CRON_SECRET"); if (sec.length < 24 || !safeEq(req.headers.get("x-cron-secret") ?? "", sec)) return json({ ok: false }, 401, origin, true);
      const out: Record<string, unknown> = { queue: await rpc("contact_queue_run_p4", { p_limit: 100 }), sync: await syncBatch(40), reconcile: b.reconcile ? await reconcile() : "skipped" };
      out.draft = await rpc("campaign_prepare_next_p4", { p_actor: "scheduler" }); out.campaign = await runCampaign("scheduler", null); return json({ ok: true, ...out }, 200, origin, true);
    }
    const who = await adminUser(req); if (!who) return json({ ok: false, error: "unauthorized" }, 401, origin, true);
    if (await limited("admin:" + who.id, 120, 60)) return json({ ok: false, error: "rate_limited" }, 429, origin, true);
    return json(await admin(String(b.action ?? ""), b, who), 200, origin, true);
  } catch (e: any) {
    if (e?.status === 403) return json({ ok: false, error: "forbidden" }, 403, origin, true);
    console.error("communications error:", errName(e)); return json({ ok: false, error: "server_error" }, 500, origin, true);
  }
});

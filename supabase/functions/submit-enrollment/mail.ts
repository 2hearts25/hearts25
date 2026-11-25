import { b64 } from "./crypto.ts";

export type Cfg = { resendKey: string; resendUrl: string; from: string; director: string; bcc: string; replyTo: string };

export async function sendResend(cfg: Cfg, body: Record<string, unknown>, idem: string, fetcher: typeof fetch = fetch) {
  let status = 0, id = "", error = "";
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const r = await fetcher(cfg.resendUrl, {
        method: "POST",
        headers: { Authorization: "Bearer " + cfg.resendKey, "Content-Type": "application/json", "Idempotency-Key": idem },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(20000),
      });
      status = r.status;
      const text = await r.text().catch(() => "");
      if (r.ok) { try { id = JSON.parse(text).id ?? ""; } catch { /* ignore */ } return { ok: true, status, id, error: "" }; }
      error = `HTTP ${status}`; // never store the response body: it can echo recipient addresses
    } catch (e) {
      status = 0; error = e instanceof Error ? e.name : "network";
    }
    if (status !== 0 && status !== 429 && status < 500) break; // permanent failure
    if (attempt < 2) await new Promise((res) => setTimeout(res, 600 * (attempt + 1) ** 2));
  }
  return { ok: false, status, id, error };
}

const esc = (v: string) => v.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] ?? c);

export type StaffInfo = { reference: string; submittedAt: string };
export type Attachment = { filename: string; bytes: Uint8Array };

// ONE email, BOTH documents attached. The body deliberately carries only the reference, submission time, status, an attachment
// notice and review instructions: NO child/family names, DOB, address, phone, health, allergy or custody details (those live only in the PDFs).
// Refuses to build a message unless exactly the two required PDFs are present, so an email with a single attachment can never be sent.
// 1.3.0-E2: optional status summary (no names, health or file contents) — language, contract/copay/withdrawal status,
// document categories received, outstanding items and how to reach uploaded files securely. Attachments are unchanged.
export type StaffSummary = { lines: [string, string][]; received: string[]; outstanding: string[]; access: string };
export function staffMessage(i: StaffInfo, ohio: Attachment, h2h: Attachment, extra?: StaffSummary) {
  if (!ohio?.bytes?.length || !h2h?.bytes?.length || ohio.filename === h2h.filename) throw new Error("both enrollment PDFs are required");
  const when = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", dateStyle: "medium", timeStyle: "short" }).format(new Date(i.submittedAt)) + " ET";
  const lines: [string, string][] = [["Application ID", i.reference], ["Submitted", when], ["Status", "Received — both enrollment documents generated"], ...(extra?.lines ?? [])];
  const summaryText = extra ? ["", "Supporting documents received (uploaded, NOT yet reviewed by staff):", ...(extra.received.length ? extra.received.map((x) => "- " + x) : ["- none uploaded"]), "", "Outstanding:", ...(extra.outstanding.length ? extra.outstanding.map((x) => "- " + x) : ["- nothing listed"]), "", extra.access] : [];
  const summaryHtml = extra ? `<p style="margin-top:16px"><strong>Supporting documents received</strong> <span style="color:#5b6684">(uploaded, not yet reviewed by staff)</span></p><ul style="font-size:14px">${(extra.received.length ? extra.received : ["none uploaded"]).map((x) => `<li>${esc(x)}</li>`).join("")}</ul><p><strong>Outstanding</strong></p><ul style="font-size:14px">${(extra.outstanding.length ? extra.outstanding : ["nothing listed"]).map((x) => `<li>${esc(x)}</li>`).join("")}</ul><p style="font-size:14px">${esc(extra.access)}</p>` : "";
  const instructions = [
    `1. ${ohio.filename} — Ohio child enrollment and health records (content-equivalent of DCY 01234). Review it, then complete the administrator signature and annual-review sections.`,
    `2. ${h2h.filename} — Heart to Heart internal enrollment records (family questionnaire, authorizations and agreements). Keep for the center’s files.`,
    "Items marked PENDING in either document are still outstanding. Neither document is an approval of enrollment.",
  ];
  const text = ["A new child enrollment application was submitted on hearts25.com.", "", ...lines.map(([k, v]) => `${k}: ${v}`), "",
    "Both enrollment documents are attached to this email:", ...instructions, ...summaryText, "",
    "The attachments contain confidential information about a child and family. Store and share them only as needed for enrollment and licensing.", "",
    "Heart to Heart Enrichment Center · automated notification"].join("\n");
  const html = `<div style="font-family:Arial,sans-serif;color:#12204f;max-width:600px;margin:auto;line-height:1.5"><div style="background:#12204f;color:#fff;padding:14px 20px;border-bottom:3px solid #ffd522"><strong>Heart to Heart Enrichment Center</strong></div><div style="padding:20px;border:1px solid #c9d5ed;border-top:0"><h2 style="margin:0 0 12px;font-size:20px;color:#c00055">New child enrollment application</h2><table role="presentation" cellpadding="6" style="border-collapse:collapse;font-size:15px">${lines.map(([k, v]) => `<tr><td style="color:#5b6684;border-bottom:1px solid #eee">${esc(k)}</td><td style="border-bottom:1px solid #eee"><strong>${esc(v)}</strong></td></tr>`).join("")}</table><p style="margin-top:16px"><strong>Both enrollment documents are attached:</strong></p><ol style="padding-left:20px;font-size:14px"><li><strong>${esc(ohio.filename)}</strong> — Ohio child enrollment and health records (content-equivalent of DCY 01234). Review it, then complete the administrator signature and annual-review sections.</li><li><strong>${esc(h2h.filename)}</strong> — Heart to Heart internal enrollment records (family questionnaire, authorizations and agreements). Keep for the center’s files.</li></ol><p style="font-size:14px">Items marked PENDING in either document are still outstanding. Neither document is an approval of enrollment.</p>${summaryHtml}<p style="font-size:13px;color:#5b6684">The attachments contain confidential information about a child and family. Store and share them only as needed for enrollment and licensing.</p></div></div>`;
  return { subject: `New Child Enrollment Application — ${i.reference}`, text, html, attachments: [{ filename: ohio.filename, content: b64(ohio.bytes) }, { filename: h2h.filename, content: b64(h2h.bytes) }] };
}

export type Delivery = "in_transit" | "delivered" | "delayed" | "bounced" | "complained" | "failed" | "suppressed" | "unverifiable";
// Reads the provider's delivery event for an email we sent. Acceptance (a 2xx from send) is NOT delivery: only Resend's last_event says
// whether the recipient's mail server accepted the message. A restricted (send-only) API key cannot read this → "unverifiable".
export async function getDelivery(cfg: Cfg, id: string, fetcher: typeof fetch = fetch): Promise<{ status: Delivery; event: string }> {
  try {
    const r = await fetcher(`${cfg.resendUrl.replace(/\/+$/, "")}/${encodeURIComponent(id)}`, { headers: { Authorization: "Bearer " + cfg.resendKey }, signal: AbortSignal.timeout(15000) });
    if (r.status === 401 || r.status === 403) { await r.body?.cancel(); return { status: "unverifiable", event: `HTTP ${r.status}` }; }
    if (!r.ok) { await r.body?.cancel(); return { status: "in_transit", event: `HTTP ${r.status}` }; }
    const j = await r.json().catch(() => ({})); const ev = String(j?.last_event ?? "");
    const map: Record<string, Delivery> = { delivered: "delivered", opened: "delivered", clicked: "delivered", bounced: "bounced", complained: "complained", delivery_delayed: "delayed", failed: "failed", suppressed: "suppressed", canceled: "failed" };
    return { status: map[ev] ?? "in_transit", event: ev.slice(0, 40) };
  } catch (e) { return { status: "in_transit", event: e instanceof Error ? e.name : "network" }; }
}

// Sent only when the PDF could not be produced after retries: still no names or health details.
export function staffFailureMessage(reference: string) {
  const text = `A child enrollment application was received and saved securely (Application ID: ${reference}), but its PDF could not be created or emailed automatically yet.\nThe system will keep retrying. No action is needed unless you do not receive the PDF within a few hours; then contact the website administrator with the Application ID.`;
  return { subject: `Enrollment saved — PDF delayed — ${reference}`, text, html: `<p style="font-family:Arial,sans-serif">${esc(text).replace(/\n/g, "<br>")}</p>` };
}

// In-memory stand-ins for Supabase REST/Storage and Resend so the real Edge function can be exercised offline.
import { createServer } from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
export function startMock(port) {
  const db = { rows: new Map(), idem: new Map() }; const storage = new Map(); const emails = []; const resendKeys = new Map();
  const ctl = { failResend: 0, failFonts: 0, resendCalls: 0 };
  const read = req => new Promise(r => { const c = []; req.on('data', d => c.push(d)); req.on('end', () => r(Buffer.concat(c))); });
  const send = (res, code, body, type = 'application/json') => { res.writeHead(code, { 'Content-Type': type }); res.end(typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body)); };
  const srv = createServer(async (req, res) => {
    const u = new URL(req.url, 'http://x'); const body = await read(req);
    if (u.pathname.startsWith('/rest/v1/rpc/')) {
      const fn = u.pathname.split('/').pop(); const a = body.length ? JSON.parse(body) : {};
      if (fn === 'enrollment_submit_p1') {
        let row = db.idem.get(a.p_idempotency_key);
        if (!row) row = [...db.rows.values()].find(r => r.contact_email_hash === a.p_email_hash && r.child_hash === a.p_child_hash && Date.now() - r.t < 864e5);
        if (row) return send(res, 200, { ok: true, duplicate: true, id: row.id, reference: row.reference, status: { pdf: row.pdf_status, staff: row.staff_email_status, family: row.family_email_status } });
        const id = crypto.randomUUID(); const reference = 'H2H-20261124-' + id.replace(/-/g, '').slice(0, 8).toUpperCase();
        const r = { id, reference, t: Date.now(), created_at: new Date().toISOString(), idempotency_key: a.p_idempotency_key, form_version: a.p_form_version, language: a.p_language, program: a.p_program, contact_email_hash: a.p_email_hash, child_hash: a.p_child_hash, source_fingerprint: a.p_source_fingerprint, payload_enc: a.p_payload_enc, parent2_status: a.p_parent2_status, pdf_status: 'pending', pdf_attempts: 0, pdf_path: null, pdf_pages: null, h2h_pdf_path: null, staff_delivery_status: 'unknown', family_delivery_status: 'unknown', staff_email_status: 'pending', staff_email_attempts: 0, family_email_status: 'pending', status: 'received' };
        db.rows.set(reference, r); db.idem.set(a.p_idempotency_key, r);
        return send(res, 200, { ok: true, duplicate: false, id, reference, status: { pdf: 'pending', staff: 'pending', family: 'pending' } });
      }
      if (fn === 'enrollment_get_p1') return send(res, 200, db.rows.get(a.p_reference) ?? null);
      if (fn === 'enrollment_mark_p1') {
        const r = [...db.rows.values()].find(x => x.id === a.p_id); if (!r) return send(res, 200, { ok: false }); const p = a.p_patch;
        for (const k of ['pdf_status', 'pdf_path', 'pdf_sha256', 'pdf_bytes', 'pdf_pages', 'pdf_error', 'h2h_pdf_path', 'h2h_pdf_sha256', 'h2h_pdf_bytes', 'h2h_pdf_pages', 'staff_delivery_status', 'staff_delivery_event', 'family_delivery_status', 'family_delivery_event', 'staff_email_status', 'staff_email_id', 'staff_email_error', 'family_email_status', 'family_email_id', 'family_email_error']) if (k in p) r[k] = p[k];
        if (p.staff_email_status === 'sent') { r.staff_delivery_status = 'in_transit'; r.staff_delivery_checks = 0; } if (p.family_email_status === 'sent') { r.family_delivery_status = 'in_transit'; r.family_delivery_checks = 0; } r.staff_delivery_checks = (r.staff_delivery_checks ?? 0) + (p.staff_delivery_checks_inc ?? 0); r.family_delivery_checks = (r.family_delivery_checks ?? 0) + (p.family_delivery_checks_inc ?? 0); r.pdf_attempts += p.pdf_attempts_inc ?? 0; r.staff_email_attempts += p.staff_email_attempts_inc ?? 0;
        r.status = r.pdf_status === 'generated' && r.staff_email_status === 'sent' && ['bounced','complained','failed','suppressed'].includes(r.staff_delivery_status) ? 'needs_attention' : r.pdf_status === 'generated' && r.staff_email_status === 'sent' ? 'complete' : (r.pdf_status === 'failed' || r.staff_email_status === 'failed' ? 'needs_attention' : 'received');
        return send(res, 200, { ok: true });
      }
      if (fn === 'enrollment_unfinished_p1') return send(res, 200, [...db.rows.values()].filter(r => (r.pdf_status !== 'generated' || !r.h2h_pdf_path || r.staff_email_status !== 'sent' || (r.staff_email_status === 'sent' && ['unknown','in_transit','delayed'].includes(r.staff_delivery_status ?? 'unknown')) || (r.family_email_status === 'sent' && ['unknown','in_transit','delayed'].includes(r.family_delivery_status ?? 'unknown')) || r.family_email_status === 'pending') && Date.now() - r.t >= a.p_older_than_seconds * 1000).map(r => r.reference));
    }
    if (u.pathname.startsWith('/storage/v1/object/enrollment-pdfs/')) {
      const k = u.pathname.replace('/storage/v1/object/enrollment-pdfs/', '');
      if (req.method === 'POST') { if (ctl.failStorageH2h && k.includes('.h2h.')) return send(res, 500, {}); storage.set(k, body); return send(res, 200, { Key: k }); }
      if (req.method === 'GET') return storage.has(k) ? send(res, 200, storage.get(k), 'application/octet-stream') : send(res, 404, {});
    }
    if (u.pathname.startsWith('/resend/emails/') && req.method === 'GET') {
      ctl.deliveryCalls = (ctl.deliveryCalls ?? 0) + 1; if (ctl.deliveryForbidden) return send(res, 401, { name: 'restricted_api_key' });
      const id = u.pathname.split('/').pop(); const m = emails.find(e => e.id === id); if (!m) return send(res, 404, {});
      return send(res, 200, { id, last_event: ctl.events?.[id] ?? ctl.defaultEvent ?? 'sent' });
    }
    if (u.pathname === '/resend/emails') {
      ctl.resendCalls++;
      if (ctl.failResend > 0) { ctl.failResend--; return send(res, 503, { message: 'down' }); }
      const key = req.headers['idempotency-key']; if (resendKeys.has(key)) return send(res, 200, { id: resendKeys.get(key) });
      const id = 'em_' + crypto.randomUUID(); resendKeys.set(key, id); emails.push({ id, key, auth: req.headers.authorization, body: JSON.parse(body) });
      return send(res, 200, { id });
    }
    if (u.pathname.startsWith('/fonts/')) { const f = new URL('../../public/assets/fonts/' + u.pathname.slice(7), import.meta.url); if (ctl.failFonts > 0) { ctl.failFonts--; return send(res, 500, 'x'); } return existsSync(f) ? send(res, 200, readFileSync(f), 'font/ttf') : send(res, 404, ''); }
    send(res, 404, { error: 'no route ' + u.pathname });
  });
  return new Promise(r => srv.listen(port, '127.0.0.1', () => r({ srv, db, storage, emails, ctl, close: () => srv.close() })));
}

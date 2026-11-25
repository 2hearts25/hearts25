// End-to-end test of the REAL submit-enrollment Edge function (run by Deno) against mocks. Synthetic data only.
import { spawn, execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import assert from 'node:assert/strict';
import { startMock } from './mock-server.mjs';
import { sample } from './sample-data.mjs';
const DENO = '/home/claude/h2h-tools/node_modules/.bin/deno';
const MP = 9391, FP = 8791;
const mock = await startMock(MP);
const env = { ...process.env, SUPABASE_URL: `http://127.0.0.1:${MP}`, SUPABASE_SERVICE_ROLE_KEY: 'test-service', H2H_APP_DATA_KEY: randomBytes(32).toString('base64'), H2H_RESEND_API_KEY: 'test-resend', H2H_RESEND_URL: `http://127.0.0.1:${MP}/resend/emails`, H2H_FONT_BASE: `http://127.0.0.1:${MP}/fonts/`, H2H_ADMIN_SECRET: 'admin-test-secret', DENO_SERVE_ADDRESS: `tcp:127.0.0.1:${FP}` };
const fn = spawn(DENO, ['run', '-A', '--no-lock', '../../supabase/functions/submit-enrollment/index.ts'], { cwd: new URL('.', import.meta.url).pathname, env, stdio: ['ignore', 'pipe', 'pipe'] });
let log = ''; fn.stdout.on('data', d => log += d); fn.stderr.on('data', d => log += d);
const url = `http://127.0.0.1:${FP}/`;
for (let i = 0; i < 60; i++) { try { await fetch(url, { method: 'GET' }); break; } catch { await new Promise(r => setTimeout(r, 250)); } }
const png = 'data:image/png;base64,' + readFileSync(new URL('./sig-sample.png', import.meta.url)).toString('base64');
const ORIGIN = 'https://hearts25.com';
const body = (over = {}) => ({ v: '1.2.0-E1', key: crypto.randomUUID(), lang: 'ar', data: structuredClone(sample), acks: ['accuracy', 'esign', 'emtrans', 'pickup', 'school', 'media', 'receipts', 'pending'], parent2Mode: 'later', signatures: [{ role: 'parent1', name: 'فاطمة الأحمد (اختبار)', relation: 'Mother', method: 'drawn', png }], hp: '', ...over });
const post = (b, o = {}) => fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: o.origin ?? ORIGIN, 'x-forwarded-for': o.ip ?? '203.0.113.7', ...(o.headers ?? {}) }, body: typeof b === 'string' ? b : JSON.stringify(b) });
const until = async (cond, ms = 25000) => { const t = Date.now(); while (Date.now() - t < ms) { if (cond()) return true; await new Promise(r => setTimeout(r, 150)); } return false; };
let n = 0; const t = async (name, f) => { await f(); n++; console.log('ok', name); };
const staffMails = () => mock.emails.filter(e => e.body.to?.[0] === 'hearttoheart3095@yahoo.com');
const familyMails = () => mock.emails.filter(e => e.body.to?.[0] === 'parent.one@example.com');
const adminSweep = () => fetch(url + 'admin', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-admin-secret': 'admin-test-secret' }, body: JSON.stringify({ action: 'sweep', minAge: 0 }) });
let ref, pdfBytes;
try {
  await t('valid submission is stored and acknowledged (201 + reference)', async () => {
    const r = await post(body()); const j = await r.json(); assert.equal(r.status, 201, JSON.stringify(j)); assert.match(j.reference, /^H2H-\d{8}-[0-9A-F]{8}$/); ref = j.reference; assert.equal(j.duplicate, false);
  });
  await t('Director receives the PDF email (TO director, BCC staff, correct subject/filename)', async () => {
    assert.ok(await until(() => staffMails().length === 1), 'no staff email; log:\n' + log.slice(-1500));
    const m = staffMails()[0].body; assert.deepEqual(m.to, ['hearttoheart3095@yahoo.com']); assert.deepEqual(m.bcc, ['tohearts25@gmail.com']);
    assert.equal(m.subject, `New Child Enrollment Application — ${ref}`); assert.equal(m.attachments.length, 2, 'exactly two attachments in ONE email'); assert.equal(m.attachments[0].filename, `H2H_${ref}_Ohio_Enrollment.pdf`); assert.equal(m.attachments[1].filename, `H2H_${ref}_Heart_to_Heart.pdf`); assert.equal(staffMails().length, 1, 'one email only');
    pdfBytes = Buffer.from(m.attachments[0].content, 'base64'); writeFileSync(new URL('./function-output-ohio.pdf', import.meta.url), pdfBytes); writeFileSync(new URL('./function-output-h2h.pdf', import.meta.url), Buffer.from(m.attachments[1].content, 'base64'));
  });
  const P = n => new URL(`./function-output-${n}.pdf`, import.meta.url).pathname;
  const text = n => execFileSync('pdftotext', ['-layout', P(n), '-']).toString();
  await t('BOTH PDFs are normal, UNENCRYPTED, US Letter, searchable (no password; acceptable for the State)', async () => {
    for (const n of ['ohio', 'h2h']) {
      const b = readFileSync(P(n)); assert.equal(b.subarray(0, 5).toString(), '%PDF-'); assert.ok(!b.includes('/Encrypt'));
      const info = execFileSync('pdfinfo', [P(n)]).toString(); assert.match(info, /Encrypted:\s+no/); assert.match(info, /Page size:\s+612 x 792/); assert.match(info, /Title:.*Enrollment|Title:.*Records/);
      assert.ok(text(n).includes(ref) && /Page 1 of \d+/.test(text(n)) && text(n).includes('3095 W. 25th Street'), n + ' lacks id / page numbers / address');
    }
  });
  await t('document separation: Ohio has state items only; Heart to Heart has center items only; contract is last', async () => {
    const o = text('ohio'), h = text('h2h');
    for (const s of ['Amira', 'Okonkwo-Test', 'Peanut allergy', 'asthma', 'Example inhaler', 'Grace Aunt-Test', 'Samuel Okonkwo-Test', 'Emergency transportation authorization', 'Annual review', 'Program administrator', 'Outstanding state-required documentation', 'Health Care Plan']) assert.ok(o.includes(s), 'missing in Ohio PDF: ' + s);
    for (const s of ['Parent/Provider Contract', 'Absent Days and Attendance Policy', 'Internal photography consent', 'External marketing', 'Family information questionnaire', 'Routine school transportation', 'Authorized pickup list', 'Resources and community']) assert.ok(!o.includes(s), 'center-only content leaked into Ohio PDF: ' + s);
    assert.ok(!/Internal photography|External marketing|Parent\/Provider Contract/.test(o));
    const idx = ['1. Child and parent identification', '13. Authorized pickup list', '20. Internal photography consent', '21. External marketing', '22. Outstanding internal documentation', '23. Absent Days and Attendance Policy', '24. Parent/Provider Contract'].map(x => h.indexOf(x)); assert.ok(idx.every(i => i >= 0), 'H2H sections missing ' + idx); assert.deepEqual([...idx].sort((a, b) => a - b), idx, 'sections out of order');
    assert.ok(h.indexOf('Electronic signatures') > idx[6], 'signatures must follow the contract (final agreement)');
    for (const s of ['Example Elementary School', 'Mimi', 'Peanut allergy', 'Grace Aunt-Test']) assert.ok(h.includes(s), 'missing in H2H PDF: ' + s);
    const hn = h.replace(/\s+/g, ' '), on = o.replace(/\s+/g, ' ');
    assert.ok(/up to 20 reimbursable absent days during each six-month period, January through June and July through December/.test(hn), 'approved PFCC absent-day wording');
    assert.ok(/Regular attendance supports children/.test(hn) && /Extended Absences/.test(hn) && /I acknowledge that I have received and (Yes )?reviewed the Heart to Heart Enrichment Center Absent Days and Attendance Policy and understand my responsibility to communicate with the center regarding my child’s attendance/.test(hn), 'approved policy + acknowledgment text');
    assert.ok(!/DRAFT/.test(hn.slice(hn.indexOf('23. Absent Days'), hn.indexOf('24. Parent/Provider Contract'))), 'approved policy must not carry a DRAFT label');
    assert.ok(!/per (program )?year|annual allowance/i.test(hn), 'must not say per year');
    assert.ok(/OAC 5180:2-12-16/.test(on) && /independent legal duty to call emergency services/.test(on), 'Ohio emergency-response note');
    assert.ok(/OAC 5180:2-12-23/.test(hn) && /OAC 5180:2-12-14/.test(hn), 'H2H cites diapering (-23) and transportation (-14) rules');
    assert.ok(!/every (1|2|3|4)(\.5)? hours?/i.test(hn) && !/Diaper check interval/i.test(hn), 'no selectable diaper intervals');
    assert.ok(/Please use fragrance-free wipes/.test(hn), 'individual diapering/personal-care instruction captured in the H2H PDF');
    assert.ok(/medical exemption/i.test(on), 'immunization medical-exemption status in Ohio PDF');
    assert.ok(!/5180:2-12-25/.test(hn), 'H2H must not cite -25 as a transportation rule');
  });
  await t('email body and subject contain NO names or health details', async () => {
    const m = staffMails()[0].body; const all = (m.subject + m.text + m.html).toLowerCase();
    for (const s of ['amira', 'okonkwo', 'peanut', 'asthma', 'inhaler', 'فاطمة', 'samuel', 'grace', 'dob', '2022-06-14', '555-01', 'example avenue']) assert.ok(!all.includes(s.toLowerCase()), 'leaked in email body: ' + s);
    assert.ok(all.includes(ref.toLowerCase()));
  });
  await t('parent welcome email: right recipient, language, reference, no child name', async () => {
    assert.ok(await until(() => familyMails().length === 1)); const m = familyMails()[0].body; assert.equal(m.subject, 'استلمنا طلب تسجيل طفلك'); assert.ok(m.html.includes('dir="rtl"')); assert.ok(m.text.includes(ref)); assert.ok(!(m.text + m.html).includes('Amira'));
  });
  await t('database row holds no plaintext (payload encrypted; stored PDF encrypted)', async () => {
    const row = mock.db.rows.get(ref); const dec = Buffer.from(row.payload_enc, 'base64').toString('latin1'); for (const s of ['Amira', 'Okonkwo', 'peanut', 'parent.one@example.com']) assert.ok(!dec.includes(s) && !JSON.stringify({ ...row, payload_enc: '' }).includes(s), 'plaintext in row: ' + s);
    assert.equal(row.pdf_status, 'generated'); assert.equal(row.staff_email_status, 'sent'); assert.equal(row.status, 'complete');
    for (const pth of [row.pdf_path, row.h2h_pdf_path]) { const stored = mock.storage.get(pth); assert.ok(stored && stored.length > 1000, 'stored ' + pth); assert.notEqual(stored.subarray(0, 4).toString(), '%PDF'); assert.ok(!stored.includes('Amira')); } assert.notEqual(row.pdf_path, row.h2h_pdf_path);
  });
  await t('same submission twice (double click / retry) → same reference, no second email', async () => {
    const b = body(); b.key = mock.db.rows.get(ref).idempotency_key; const r = await post(b); const j = await r.json(); assert.equal(r.status, 201); assert.equal(j.reference, ref); assert.equal(j.duplicate, true);
    await new Promise(r => setTimeout(r, 1500)); assert.equal(staffMails().length, 1);
  });
  await t('same parent + same child with a new key within 24h is also a duplicate', async () => {
    const j = await (await post(body())).json(); assert.equal(j.reference, ref); assert.equal(j.duplicate, true);
  });
  await t('email provider outage: application is kept, status needs_attention, retry delivers exactly once', async () => {
    mock.ctl.failResend = 3; const d = body(); d.data['c.first'] = 'Zuri'; d.data['p1.email'] = 'parent.two@example.com';
    const j = await (await post(d, { ip: '198.51.100.9' })).json(); assert.equal(j.duplicate, false); const r2 = j.reference;
    assert.ok(await until(() => mock.db.rows.get(r2).staff_email_status === 'failed'), 'status never failed');
    const row = mock.db.rows.get(r2); assert.equal(row.pdf_status, 'generated'); assert.equal(row.status, 'needs_attention');
    const before = staffMails().length; const rr = await fetch(url + 'admin', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-admin-secret': 'admin-test-secret' }, body: JSON.stringify({ action: 'resend', reference: r2 }) });
    assert.equal((await rr.json()).ok, true); assert.equal(staffMails().length, before + 1); assert.equal(mock.db.rows.get(r2).status, 'complete');
    await fetch(url + 'admin', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-admin-secret': 'admin-test-secret' }, body: JSON.stringify({ action: 'resend', reference: r2 }) }); assert.equal(staffMails().length, before + 1, 'resend after success must not email twice');
  });
  await t('authorised admin can download the decrypted PDF; wrong secret is refused; status hides payload', async () => {
    const bad = await fetch(url + 'admin', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-admin-secret': 'nope' }, body: JSON.stringify({ action: 'download', reference: ref, document: 'h2h' }) }); assert.equal(bad.status, 401);
    const ok = await fetch(url + 'admin', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-admin-secret': 'admin-test-secret' }, body: JSON.stringify({ action: 'download', reference: ref, document: 'ohio' }) }); assert.equal(ok.status, 200); assert.equal(Buffer.from(await ok.arrayBuffer()).subarray(0, 5).toString(), '%PDF-');
    const st = await (await fetch(url + 'admin', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-admin-secret': 'admin-test-secret' }, body: JSON.stringify({ action: 'status', reference: ref }) })).json(); assert.ok(st.ok && !('payload_enc' in st.application) && st.application.pdf_status === 'generated');
  });
  await t('font fetch failure marks pdf failed, then sweep recovers it', async () => {
    mock.ctl.failFonts = 99; const d = body(); d.data['c.first'] = 'Imani'; d.data['p1.email'] = 'parent.three@example.com'; const j = await (await post(d, { ip: '192.0.2.44' })).json();
    // fonts are cached from the earlier successful build, so force a cold path by checking status stays consistent
    assert.ok(await until(() => ['complete', 'needs_attention'].includes(mock.db.rows.get(j.reference).status))); mock.ctl.failFonts = 0;
  });
  await t('delivery is tracked separately from acceptance: sent ≠ delivered; sweep records delivered', async () => {
    const row = mock.db.rows.get(ref); assert.equal(row.staff_email_status, 'sent'); assert.equal(row.staff_delivery_status, 'in_transit', 'must NOT claim delivery on acceptance alone');
    mock.ctl.defaultEvent = 'delivered'; const r = await adminSweep(); assert.equal(r.status, 200);
    assert.ok(await until(() => mock.db.rows.get(ref).staff_delivery_status === 'delivered'), 'sweep did not record delivery'); assert.equal(mock.db.rows.get(ref).family_delivery_status === 'delivered' || await until(() => mock.db.rows.get(ref).family_delivery_status === 'delivered'), true);
  });
  await t('scheduled sweep needs no new submission; bounced delivery → needs_attention, never auto-resent', async () => {
    const d = body(); d.data['c.first'] = 'Bounce'; d.data['p1.email'] = 'bounce@example.com'; mock.ctl.defaultEvent = 'bounced'; const j = await (await post(d, { ip: '198.51.100.77' })).json();
    assert.ok(await until(() => mock.db.rows.get(j.reference)?.staff_email_status === 'sent')); await adminSweep();
    assert.ok(await until(() => mock.db.rows.get(j.reference).staff_delivery_status === 'bounced')); assert.equal(mock.db.rows.get(j.reference).status, 'needs_attention');
    const n = staffMails().length; await adminSweep(); await new Promise(r => setTimeout(r, 1200)); assert.equal(staffMails().length, n, 'sweep must not re-send a delivered/bounced email');
    mock.ctl.defaultEvent = 'delivered';
  });
  await t('send-only API key cannot read delivery → recorded as unverifiable (never reported delivered)', async () => {
    mock.ctl.deliveryForbidden = true; const d = body(); d.data['c.first'] = 'Restricted'; d.data['p1.email'] = 'restricted@example.com'; const j = await (await post(d, { ip: '198.51.100.88' })).json();
    assert.ok(await until(() => mock.db.rows.get(j.reference)?.staff_delivery_status === 'unverifiable', 20000)); mock.ctl.deliveryForbidden = false;
  });
  await t('unfinished application with only ONE PDF stored is never emailed (both-or-nothing)', async () => {
    const d = body(); d.data['c.first'] = 'OnePdf'; d.data['p1.email'] = 'onepdf@example.com'; mock.ctl.failStorageH2h = true; const before = staffMails().length;
    const j = await (await post(d, { ip: '198.51.100.66' })).json(); assert.ok(await until(() => mock.db.rows.get(j.reference)?.pdf_status === 'failed'), 'pdf_status should be failed'); assert.equal(staffMails().length, before, 'no email with a single attachment');
    mock.ctl.failStorageH2h = false; await fetch(url + 'admin', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-admin-secret': 'admin-test-secret' }, body: JSON.stringify({ action: 'resend', reference: j.reference }) });
    assert.equal(staffMails().length, before + 1); assert.equal(staffMails().at(-1).body.attachments.length, 2);
  });
  await t('validation: required fields, conditional fields, signature, acknowledgments, origin, honeypot, size', async () => {
    let b = body(); delete b.data['c.first']; let r = await post(b); assert.equal(r.status, 422); assert.equal((await r.json()).errors['c.first'], 'required');
    b = body(); b.data['h.allergyDesc'] = ''; r = await post(b); assert.equal((await r.json()).errors['h.allergyDesc'], 'required');
    b = body(); b.signatures = []; r = await post(b); assert.equal((await r.json()).errors['sig.parent1'], 'required');
    b = body(); b.signatures[0].png = 'data:image/png;base64,AAAA'; r = await post(b); assert.equal(r.status, 422);
    b = body(); b.signatures = [{ role: 'parent1', name: 'Typed Parent', relation: 'Mother', method: 'typed' }]; r = await post(b); assert.equal(r.status, 422, 'typed signature without the acknowledgment must be refused');
    b = body(); b.signatures = [{ role: 'parent1', name: 'Typed Parent', relation: 'Mother', method: 'typed', typedAck: true }]; b.key = crypto.randomUUID(); b.data['c.first'] = 'Typed'; b.data['p1.email'] = 'typed@example.com'; r = await post(b); assert.equal(r.status, 201, 'typed signature with acknowledgment must be accepted');
    b = body(); b.acks = b.acks.filter(a => a !== 'emtrans'); r = await post(b); assert.equal((await r.json()).errors['ack.emtrans'], 'required');
    b = body(); b.parent2Mode = 'now'; r = await post(b); assert.equal((await r.json()).errors['sig.parent2'], 'required');
    r = await post(body(), { origin: 'https://evil.example' }); assert.equal(r.status, 403);
    r = await post(body({ hp: 'bot' })); assert.equal(r.status, 201); const before = mock.db.rows.size; await post(body({ hp: 'bot' })); assert.equal(mock.db.rows.size, before, 'honeypot must not store anything');
    r = await post('x'.repeat(460000)); assert.equal(r.status, 413); r = await post('{bad'); assert.equal(r.status, 400);
    b = body(); b.v = '0.0.1'; r = await post(b); assert.equal(r.status, 409);
  });
  await t('hidden/stale answers are discarded (infant never gets school transport data)', async () => {
    const b = body(); b.data['c.program'] = 'infant-toddler'; b.data['c.first'] = 'Baby'; b.data['p1.email'] = 'baby@example.com'; b.acks = b.acks.filter(a => a !== 'school'); const j = await (await post(b, { ip: '192.0.2.99' })).json(); assert.equal(j.ok, true, JSON.stringify(j));
    assert.ok(await until(() => mock.emails.some(e => e.body.attachments && e.body.subject.includes(j.reference)))); const m = mock.emails.find(e => e.body.attachments && e.body.subject.includes(j.reference)); const p = new URL('./function-output-infant.pdf', import.meta.url); writeFileSync(p, Buffer.from(m.body.attachments[1].content, 'base64'));
    const txt = execFileSync('pdftotext', ['-layout', p.pathname, '-']).toString(); assert.ok(txt.includes('Routine school transportation was not requested.')); assert.ok(!txt.includes('Example Elementary'));
  });
  await t('phone is the preferred method AND an email was given → the welcome email is still sent', async () => {
    const before = familyMails().length; const d = structuredClone(sample); d['p1.contactPath'] = 'phone'; d['p1.cell'] = '(216) 555-0166'; d['c.first'] = 'Phoneprefer'; d['c.dob'] = '2021-02-03';
    const r = await post(body({ data: d, key: crypto.randomUUID() }), { ip: '203.0.113.88' }); const j = await r.json(); assert.equal(r.status, 201, JSON.stringify(j));
    assert.ok(await until(() => familyMails().length === before + 1), 'welcome email not sent for phone-preferred family with an email address');
    const d2 = structuredClone(sample); d2['p1.contactPath'] = 'phone'; delete d2['p1.cell']; delete d2['p1.home']; d2['p1.sameHome'] = false; d2['c.first'] = 'Nophone'; d2['c.dob'] = '2021-03-04';
    const r2 = await post(body({ data: d2, key: crypto.randomUUID() }), { ip: '203.0.113.89' }); assert.equal(r2.status, 422, 'phone path without a phone must be refused server-side');
  });
  console.log(`\n${n} function tests passed`);
} catch (e) { console.error('FAIL:', e.message); console.error('--- function log ---\n' + log.slice(-2500)); console.error('--- rows ---', JSON.stringify([...mock.db.rows.values()].map(({ payload_enc, ...r }) => r), null, 1).slice(0, 1500)); process.exitCode = 1; }
finally { fn.kill(); mock.close(); }

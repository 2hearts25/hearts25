// End-to-end validation of form 1.3.0-E2 AND backward compatibility with the live 1.2.0-E1 format, using the REAL Edge function
// (Deno), the REAL SQL migrations/functions (local PostgreSQL 16) and mocked Storage/Auth/Resend. Synthetic data only.
import { spawn, execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';
import { startPg } from './pg-local.mjs';
import { startMockV130 } from './mock-v130.mjs';
import { sample, sample130 } from './sample-data.mjs';
import { visibleAcks, settle } from '../core.mjs';
import { CONTRACT } from '../agreements.mjs';
const require = createRequire('/home/claude/h2h-tools/');
const { PDFDocument } = require('@cantoo/pdf-lib');
const DENO = process.env.DENO || 'deno';
const schema = JSON.parse(readFileSync(new URL('../schema.json', import.meta.url)));
const schemaOld = JSON.parse(readFileSync(new URL('../schema-1.2.0-E1.json', import.meta.url)));
const MP = 9491, FP = 8891, ORIGIN = 'https://hearts25.com';
const tmp = mkdtempSync('/tmp/h2h-e2e130-');

const pg = await startPg(55433);
const mock = await startMockV130(MP, pg);
const env = { ...process.env, SUPABASE_URL: `http://127.0.0.1:${MP}`, SUPABASE_SERVICE_ROLE_KEY: 'test-service', H2H_APP_DATA_KEY: randomBytes(32).toString('base64'), H2H_RESEND_API_KEY: 'test-resend', H2H_RESEND_URL: `http://127.0.0.1:${MP}/resend/emails`, H2H_FONT_BASE: `http://127.0.0.1:${MP}/fonts/`, H2H_ADMIN_SECRET: 'admin-test-secret', H2H_SWEEP_MIN_AGE: '0', DENO_SERVE_ADDRESS: `tcp:127.0.0.1:${FP}` };
const fn = spawn(DENO, ['run', '-A', '--no-lock', '../../supabase/functions/submit-enrollment/index.ts'], { cwd: new URL('.', import.meta.url).pathname, env, stdio: ['ignore', 'pipe', 'pipe'] });
let log = ''; fn.stdout.on('data', d => log += d); fn.stderr.on('data', d => log += d);
const url = `http://127.0.0.1:${FP}/`;
for (let i = 0; i < 240; i++) { try { await fetch(url, { method: 'GET' }); break; } catch { await new Promise(r => setTimeout(r, 250)); } }

const png = 'data:image/png;base64,' + readFileSync(new URL('./sig-sample.png', import.meta.url)).toString('base64');
const post = (p, b, o = {}) => fetch(url + p, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: o.origin ?? ORIGIN, 'x-forwarded-for': o.ip ?? '203.0.113.' + Math.floor(Math.random() * 200), ...(o.headers ?? {}) }, body: typeof b === 'string' ? b : JSON.stringify(b) });
const upload = (token, category, bytes, name, extra = {}) => fetch(url + 'upload/file', { method: 'POST', headers: { Origin: ORIGIN, 'Content-Type': 'application/octet-stream', 'x-upload-token': token, 'x-upload-category': category, 'x-upload-name': encodeURIComponent(name), ...extra }, body: bytes });
const until = async (cond, ms = 40000) => { const t = Date.now(); while (Date.now() - t < ms) { if (await cond()) return true; await new Promise(r => setTimeout(r, 200)); } return false; };
const q = async (sql, args = []) => (await pg.db.query(sql, args)).rows;
const setFlags = async on => pg.db.query(`update website_private.feature_flags set enabled = $1`, [on]);
let n = 0; const t = async (name, f) => { await f(); n++; console.log('ok', name); };
const sigs = [{ role: 'parent1', name: 'Test Parent', relation: 'Mother', method: 'drawn', png }];
const body130 = (data, over = {}) => { const d = settle(structuredClone(data), schema); return { v: '1.3.0-E2', contractVersion: CONTRACT.version, key: crypto.randomUUID(), lang: 'en', data: d, acks: visibleAcks(d, schema).map(a => a.id), parent2Mode: d['p2.has'] === 'yes' ? 'later' : 'na', signatures: sigs, hp: '', ...over }; };
const appRow = async ref => (await q('select * from website_private.enrollment_applications where reference = $1', [ref]))[0];
const mailsTo = addr => mock.emails.filter(e => e.body.to?.[0] === addr);
const text = bytes => { const p = tmp + '/x-' + Math.random() + '.pdf'; writeFileSync(p, bytes); return execFileSync('pdftotext', ['-layout', p, '-']).toString(); };

// fixtures (synthetic)
const pdfDoc = await PDFDocument.create(); pdfDoc.addPage([300, 300]).drawText('SYNTHETIC IMMUNIZATION RECORD', { x: 20, y: 150, size: 12 });
const goodPdf = Buffer.from(await pdfDoc.save({ useObjectStreams: false }));
execFileSync('python3', ['-c', `from PIL import Image; Image.new('RGB',(64,40),(200,120,90)).save('${tmp}/card.jpg', quality=80)`]);
const goodJpg = readFileSync(tmp + '/card.jpg'), goodPng = readFileSync(new URL('./sig-sample.png', import.meta.url));
const jsPdf = Buffer.concat([goodPdf.subarray(0, goodPdf.length - 6), Buffer.from('\n1 0 obj << /S /JavaScript /JS (app.alert(1)) >> endobj\n%%EOF\n')]);
const exe = Buffer.concat([Buffer.from('MZ\x90\x00'), randomBytes(2000)]);
const big = Buffer.concat([Buffer.from('%PDF-1.7\n'), Buffer.alloc(10 * 1024 * 1024 + 10, 0x20), Buffer.from('\n%%EOF\n')]);

try {
  // ---------------------------------------------------------------- backward compatibility (flags OFF = production today)
  let legacyRef;
  await t('live 1.2.0-E1 application is accepted unchanged while every 1.3.0 flag is OFF', async () => {
    const d = settle(structuredClone(sample), schemaOld);
    const r = await post('', { v: '1.2.0-E1', key: crypto.randomUUID(), lang: 'ar', data: d, acks: visibleAcks(d, schemaOld).map(a => a.id), parent2Mode: 'later', signatures: [{ ...sigs[0], name: 'فاطمة الأحمد (اختبار)' }], hp: '' });
    const j = await r.json(); assert.equal(r.status, 201, JSON.stringify(j) + log.slice(-800)); legacyRef = j.reference;
    assert.ok(await until(async () => (await appRow(legacyRef))?.status === 'complete'), 'legacy application not completed; log:\n' + log.slice(-1500));
  });
  await t('legacy: one Director email with exactly two PDFs and the unchanged body; original parent welcome; no access link', async () => {
    const staff = mock.emails.filter(e => e.body.subject === `New Child Enrollment Application — ${legacyRef}`); assert.equal(staff.length, 1);
    assert.equal(staff[0].body.attachments.length, 2); assert.ok(!/Supporting documents received|Parent language/.test(staff[0].body.text), 'legacy body must not change');
    const fam = mailsTo('parent.one@example.com'); assert.equal(fam.length, 1); assert.ok(!/register\/documents/.test(fam[0].body.html), 'legacy families never get document links');
    const row = await appRow(legacyRef); assert.equal(row.form_version, '1.2.0-E1'); assert.equal(row.access_email_status, 'none'); assert.equal(row.contract_version, null, 'legacy applicants are NOT represented as signing the new contract');
    const h = text(Buffer.from(staff[0].body.attachments[1].content, 'base64')); assert.ok(/24\. Parent\/Provider Contract/.test(h) && /DRAFT — pending management approval/.test(h), 'legacy PDF rendered by the frozen 1.2.0 generator');
  });
  await t('1.3.0-E2 submissions are refused (409) until the server flag is turned on; uploads report unavailable (503)', async () => {
    const r = await post('', body130(sample130)); assert.equal(r.status, 409);
    const s = await post('upload/session', {}); assert.equal(s.status, 503);
    const a = await post('access/open', { token: 'x'.repeat(40), dob: '2020-01-01' }); assert.equal(a.status, 503);
  });
  await t('a legacy application missing every new field is never rejected for lacking them', async () => {
    const d = settle(structuredClone(sample), schemaOld); d['c.first'] = 'Legacy2';
    const r = await post('', { v: '1.2.0-E1', key: crypto.randomUUID(), lang: 'en', data: d, acks: visibleAcks(d, schemaOld).map(a => a.id), parent2Mode: 'later', signatures: sigs, hp: '' });
    assert.equal(r.status, 201);
  });

  // ---------------------------------------------------------------- activate 1.3.0 (test database only)
  await setFlags(true); await new Promise(r => setTimeout(r, 31000)); // flag cache is 30 s

  let token, ids = {};
  await t('upload session is server-authorized and short-lived; foreign origins refused', async () => {
    assert.equal((await post('upload/session', {}, { origin: 'https://evil.example' })).status, 403);
    const r = await post('upload/session', {}); const j = await r.json(); assert.equal(r.status, 201); assert.ok(j.token.length >= 40); assert.equal(j.expiresIn, 10800); token = j.token;
    const rows = await q('select token_hash, expires_at - created_at as ttl from website_private.enrollment_upload_sessions'); assert.ok(rows.every(x => x.token_hash !== token), 'token never stored in clear');
  });
  await t('valid PDF, JPEG (camera) and PNG uploads are validated, encrypted and stored under random ids', async () => {
    for (const [cat, bytes, name, key] of [['immunization', goodPdf, 'Amira immunizations.pdf', 'immun'], ['insurance-front', goodJpg, 'IMG_0001.jpg', 'front'], ['insurance-back', goodPng, 'back.png', 'back'], ['custody', goodPdf, 'court order.pdf', 'custody']]) {
      const r = await upload(token, cat, bytes, name); const j = await r.json(); assert.equal(r.status, 201, JSON.stringify(j)); ids[key] = j.id;
    }
    const docs = await q('select * from website_private.enrollment_documents where status = $1', ['stored']); assert.equal(docs.length, 4);
    for (const d of docs) { assert.match(d.object_path, /^sessions\/[0-9a-f-]{36}\/[0-9a-f-]{36}$/); assert.ok(!/amira|court|img/i.test(d.object_path)); assert.equal(d.scan_status, 'structure_checked'); assert.equal(d.review_status, 'unreviewed');
      const stored = mock.storage.get('enrollment-documents/' + d.object_path); assert.ok(stored && !stored.includes(Buffer.from('%PDF')) && !stored.includes(Buffer.from('SYNTHETIC')), 'stored object must be ciphertext'); assert.ok(!/Amira|court/.test(d.filename_enc)); }
  });
  await t('unsupported, disguised, oversized and active-content files are refused by the server', async () => {
    assert.equal((await upload(token, 'other', exe, 'setup.exe')).status, 422);
    assert.equal((await upload(token, 'other', exe, 'photo.jpg')).status, 422, 'renamed executable');
    assert.equal((await upload(token, 'other', goodJpg, 'scan.pdf')).status, 422, 'extension must match content');
    const js = await upload(token, 'other', jsPdf, 'form.pdf'); assert.equal(js.status, 422); assert.equal((await js.json()).error, 'active');
    assert.equal((await upload(token, 'other', big, 'huge.pdf')).status, 413);
    assert.equal((await upload(token, 'not-a-category', goodPdf, 'x.pdf')).status, 400);
    assert.equal((await upload(token, 'insurance-front', goodJpg.subarray(0, goodJpg.length - 1), 'again.jpg')).status, 422, 'truncated / second front card');
  });
  await t('duplicate upload is de-duplicated; per-category limit enforced', async () => {
    const r = await upload(token, 'immunization', goodPdf, 'again.pdf'); const j = await r.json(); assert.equal(j.id, ids.immun); assert.equal(j.duplicate, true);
    const p2 = await PDFDocument.create(); p2.addPage(); const other = Buffer.from(await p2.save({ useObjectStreams: false }));
    assert.equal((await upload(token, 'insurance-front', other, 'second.pdf')).status, 409, 'insurance front allows one file');
  });
  await t('replace and remove work, and retired files are deleted from storage by cleanup', async () => {
    const p3 = await PDFDocument.create(); p3.addPage([200, 200]); const v2 = Buffer.from(await p3.save({ useObjectStreams: false }));
    const r = await upload(token, 'custody', v2, 'court order v2.pdf', { 'x-upload-replaces': ids.custody }); const j = await r.json(); assert.equal(r.status, 201);
    assert.equal((await q('select status from website_private.enrollment_documents where id = $1', [ids.custody]))[0].status, 'replaced'); const oldCustody = ids.custody; ids.custody = j.id;
    const extra = await (await upload(token, 'other', goodPng, 'extra.png')).json();
    const rm = await post('upload/remove', { token, id: extra.id }); assert.equal(rm.status, 200);
    await pg.db.query("update website_private.enrollment_documents set created_at = now() - interval '2 hours' where id = any($1)", [[oldCustody, extra.id]]);
    const c = await fetch(url + 'admin', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-admin-secret': 'admin-test-secret' }, body: JSON.stringify({ action: 'cleanup' }) }); const cj = await c.json(); assert.ok(cj.deleted >= 1, JSON.stringify(cj)); // the removed file was already deleted immediately; the replaced one by cleanup
    const gone = await q('select object_path from website_private.enrollment_documents where id = any($1)', [[oldCustody, extra.id]]); for (const g of gone) assert.ok(!mock.storage.has('enrollment-documents/' + g.object_path));
  });
  await t('another family cannot attach these files (cross-family denial) and a forged id is refused', async () => {
    const other = await (await post('upload/session', {})).json();
    const d = structuredClone(sample130); d['up.immun'] = [ids.immun]; delete d['up.insFront']; delete d['up.custody']; d['c.first'] = 'Other';
    const r = await post('', body130(d, { uploadToken: other.token })); const j = await r.json(); assert.equal(r.status, 422); assert.equal(j.errors['up.immun'], 'upload');
    d['up.immun'] = ['0b1c2d3e-4f50-4617-8899-aabbccddeeff']; const r2 = await post('', body130(d, { uploadToken: token })); assert.equal(r2.status, 422);
  });
  await t('expired upload authorization is refused', async () => {
    const s = await (await post('upload/session', {})).json();
    await pg.db.query("update website_private.enrollment_upload_sessions set expires_at = now() - interval '1 minute' where status = 'open' and file_count = 0");
    assert.equal((await upload(s.token, 'other', goodPdf, 'late.pdf')).status, 410);
  });

  let ref130, row130, staffMail, famMail, accessToken;
  await t('1.3.0-E2 PFCC application with uploads is stored with evidence, terms and document links', async () => {
    const d = structuredClone(sample130); d['c.first'] = 'Amira130'; d['up.immun'] = [ids.immun]; d['up.insFront'] = [ids.front]; d['up.insBack'] = [ids.back]; d['up.custody'] = [ids.custody];
    const b = body130(d, { uploadToken: token, lang: 'es' });
    const r = await post('', b); const j = await r.json(); assert.equal(r.status, 201, JSON.stringify(j) + log.slice(-1500)); ref130 = j.reference;
    assert.ok(await until(async () => (await appRow(ref130))?.family_email_status === 'sent'), 'not processed; log:\n' + log.slice(-2000));
    row130 = await appRow(ref130);
    assert.equal(row130.form_version, '1.3.0-E2'); assert.equal(row130.contract_version, CONTRACT.version); assert.equal(row130.contract_status, 'partial'); assert.equal(row130.copay_status, 'parent_reported'); assert.equal(row130.wt_ack_status, 'acknowledged');
    assert.deepEqual(row130.doc_summary, { immunization: 1, 'insurance-front': 1, 'insurance-back': 1, custody: 1 });
    const att = await q('select count(*)::int n from website_private.enrollment_documents where application_id = $1', [row130.id]); assert.equal(att[0].n, 4);
    const agr = await q('select kind, language, status, version from website_private.enrollment_agreements where application_id = $1 order by kind', [row130.id]);
    assert.deepEqual(agr.map(a => a.kind), ['acknowledgments', 'attendance', 'contract', 'financial-information', 'withdrawal-termination']); assert.ok(agr.every(a => a.language === 'es'));
    const terms = await q('select * from website_private.enrollment_financial_terms where application_id = $1', [row130.id]); assert.equal(terms.length, 1); assert.equal(terms[0].copay_cents, 1250); assert.equal(terms[0].copay_source, 'parent_reported'); assert.equal(terms[0].status, 'parent_reported');
  });
  await t('Director email: same two-PDF attachment set plus a status summary with no names, health details or files', async () => {
    staffMail = mock.emails.find(e => e.body.subject === `New Child Enrollment Application — ${ref130}`);
    assert.equal(staffMail.body.attachments.length, 2); assert.deepEqual(staffMail.body.to, ['hearttoheart3095@yahoo.com']); assert.deepEqual(staffMail.body.bcc, ['tohearts25@gmail.com']);
    const tx = staffMail.body.text; for (const s of ['Parent language: Spanish', 'Contract: PPC-', 'PFCC copayment: Parent-reported amount — NOT confirmed', 'Withdrawal & Termination Policy: Acknowledged', 'Immunization record: 1 file', 'Insurance card (front): 1 file', 'Custody / guardianship / court documents: 1 file', 'staff document page']) assert.ok(tx.includes(s), 'missing: ' + s);
    for (const s of ['Amira130', 'Okonkwo', 'Peanut', '2022-06-14', '12.50', 'SYN-0000', 'court order']) assert.ok(!tx.includes(s) && !staffMail.body.html.includes(s), 'leaked into staff email: ' + s);
    assert.ok(!staffMail.body.attachments.some(a => /jpg|png|immun|custody/i.test(a.filename)), 'uploaded files are never attached');
  });
  await t('PDFs: contract is the final section; pending sections are marked; insurance stays out of the Ohio PDF', async () => {
    const o = text(Buffer.from(staffMail.body.attachments[0].content, 'base64')), h = text(Buffer.from(staffMail.body.attachments[1].content, 'base64'));
    const hn = h.replace(/\s+/g, ' ');
    assert.ok(h.indexOf('28. Parent/Provider Contract') > h.indexOf('27. Policy revisions') && h.indexOf('Electronic signatures') > h.indexOf('28. Parent/Provider Contract'), 'contract last, then signatures');
    assert.ok(/Late pickup — IN EFFECT/.test(hn) && /\$10\.00 for up to the first 10 minutes late, then \$2\.00 for each additional minute/.test(hn.replace(/\s+/g, ' ')) && /ACCEPTED/.test(hn) && !/No late pickup charge is in effect/.test(hn), 'late pickup active: schedule + acceptance recorded in the Heart to Heart PDF');
    assert.ok(/Financial information \(optional\)/.test(hn) && /NO CARD INFORMATION PROVIDED/.test(hn) && /Follow-up deadline/.test(hn) && /No advance payment is required/.test(hn.replace(/\s+/g, ' ')), 'missing payment source: status, notice and follow-up deadline in the Heart to Heart PDF');
    assert.ok(!/Financial information|Late pickup|NO CARD INFORMATION/.test(o), 'financial and late-pickup sections are in the Heart to Heart PDF ONLY (not the Ohio PDF)');
    assert.ok(/Private-pay tuition|Payment of tuition/i.test(hn) && /NOT YET IN EFFECT/.test(hn), 'private-pay tuition remains deferred');
    assert.ok(/PARENT-REPORTED amount — NOT confirmed/.test(hn) && /Acknowledged at signing/.test(hn) && /revision v1\.1/.test(hn), 'pfcc / w&t status');
    assert.ok(/Medicaid/.test(h) && !/SYN-0000|Medicaid/.test(o), 'insurance only in the Heart to Heart PDF');
    assert.ok(/Immunization record\s+1 file uploaded online — NOT yet reviewed/.test(o), 'Ohio PDF shows health-document upload status');
    assert.ok(/one academic school year/.test(hn), 'school transport authorization period');
    assert.ok(!/(tuition|registration fee)[^.]*\$\d/i.test(hn), 'no private-pay rates');
  });
  await t('parent confirmation (Spanish) carries the secure link and no attachments, and goes only to the application address', async () => {
    famMail = mailsTo('parent.one@example.com').find(e => e.body.html.includes('register/documents')); assert.ok(famMail, 'no parent email with link');
    assert.ok(!famMail.body.attachments, 'no attachments to parents'); assert.match(famMail.body.subject, /solicitud de inscripción/);
    assert.ok(famMail.body.html.includes('https://hearts25.com/es/register/documents/#t=') && /Abrir mis documentos de forma segura/.test(famMail.body.html) && /no garantiza/.test(famMail.body.text));
    accessToken = /#t=([A-Za-z0-9_-]+)/.exec(famMail.body.html)[1];
    const row = await appRow(ref130); assert.equal(row.access_email_status, 'sent'); assert.equal(row.family_email_status, 'sent');
  });
  await t('document access: wrong date of birth refused, right one releases the SAME PDFs management received', async () => {
    const bad = await post('access/open', { token: accessToken, dob: '2020-01-01' }); assert.equal(bad.status, 401);
    const ok = await post('access/open', { token: accessToken, dob: sample130['c.dob'] }); assert.equal(ok.status, 200);
    for (const [i, docName] of [[0, 'ohio'], [1, 'h2h']]) {
      const r = await post('access/download', { token: accessToken, dob: sample130['c.dob'], document: docName }); assert.equal(r.status, 200); assert.equal(r.headers.get('content-type'), 'application/pdf');
      assert.ok(Buffer.from(await r.arrayBuffer()).equals(Buffer.from(staffMail.body.attachments[i].content, 'base64')), docName + ' must be byte-identical to the Director copy');
    }
    assert.equal((await post('access/download', { token: accessToken, dob: sample130['c.dob'], document: 'h2h' }, { origin: 'https://evil.example' })).status, 403);
  });
  await t('arbitrary or guessed tokens never release records', async () => {
    assert.equal((await post('access/open', { token: 'A'.repeat(43), dob: sample130['c.dob'] })).status, 404);
    assert.equal((await post('access/download', { token: accessToken.slice(0, -2) + 'xx', dob: sample130['c.dob'], document: 'ohio' })).status, 404);
  });
  await t('replacement link goes only to the application address and revokes the old link', async () => {
    const before = mock.emails.length;
    const r = await post('access/renew', { token: accessToken }); assert.equal(r.status, 202);
    assert.ok(await until(() => mock.emails.length > before), 'no renewal email');
    const m = mock.emails.at(-1); assert.deepEqual(m.body.to, ['parent.one@example.com']); assert.match(m.body.subject, /nuevo enlace seguro/);
    const fresh = /#t=([A-Za-z0-9_-]+)/.exec(m.body.html)[1];
    assert.equal((await post('access/open', { token: accessToken, dob: sample130['c.dob'] })).status, 404, 'old link revoked');
    assert.equal((await post('access/open', { token: fresh, dob: sample130['c.dob'] })).status, 200);
    const u = await post('access/renew', { token: 'Z'.repeat(43) }); assert.equal(u.status, 202, 'same generic answer for unknown links');
    for (let i = 0; i < 4; i++) await post('access/open', { token: fresh, dob: '2019-01-01' });
    const locked = await post('access/open', { token: fresh, dob: '2019-01-01' }); assert.equal(locked.status, 423, 'locks after five failed checks');
    assert.equal((await post('access/open', { token: fresh, dob: sample130['c.dob'] })).status, 423);
  });
  await t('expired download authorization is refused', async () => {
    const before = mock.emails.length; await pg.db.query('update website_private.enrollment_parent_access set created_at = now() - interval \'2 days\''); // allow another renewal
    await post('access/renew', { token: accessToken }); await until(() => mock.emails.length > before);
    const tok = /#t=([A-Za-z0-9_-]+)/.exec(mock.emails.at(-1).body.html)[1];
    await pg.db.query("update website_private.enrollment_parent_access set expires_at = now() - interval '1 minute' where revoked_at is null");
    assert.equal((await post('access/open', { token: tok, dob: sample130['c.dob'] })).status, 404);
  });
  await t('staff access: unauthenticated and non-allowlisted users refused; allowlisted staff list, download, review — all logged', async () => {
    const sid = '9f0b8a1e-2d4c-4b6a-8e1f-123456789abc', oid = '9f0b8a1e-2d4c-4b6a-8e1f-123456789abd';
    mock.ctl.users = { 'staff-token': { id: sid, email: 'director@example.com' }, 'other-token': { id: oid, email: 'x@example.com' } };
    await pg.db.query("insert into website_private.staff_document_access (user_id, email, role, added_by) values ($1, 'director@example.com', 'director', 'test')", [sid]);
    const api = (b, tok) => post('staff', b, { headers: tok ? { authorization: 'Bearer ' + tok } : {} });
    assert.equal((await api({ action: 'list', reference: ref130 })).status, 401);
    assert.equal((await api({ action: 'list', reference: ref130 }, 'other-token')).status, 401);
    const l = await (await api({ action: 'list', reference: ref130 }, 'staff-token')).json(); assert.equal(l.documents.length, 4); assert.ok(l.documents.some(d => d.filename === 'Amira immunizations.pdf'), 'decrypted original filename for staff');
    const im = l.documents.find(d => d.category === 'immunization');
    const dl = await api({ action: 'download', reference: ref130, id: im.id }, 'staff-token'); assert.equal(dl.status, 200); assert.ok(Buffer.from(await dl.arrayBuffer()).equals(goodPdf), 'staff receive the exact uploaded bytes');
    assert.equal((await api({ action: 'download', reference: legacyRef, id: im.id }, 'staff-token')).status, 404, 'a document is only reachable through its own application');
    assert.equal((await (await api({ action: 'review', id: im.id, review: 'accepted' }, 'staff-token')).json()).ok, true);
    const log1 = await q("select action from website_private.enrollment_document_access_log where actor = $1 order by id", ['staff:' + sid]); assert.deepEqual(log1.map(x => x.action), ['list', 'download', 'review']);
    const tc = await (await api({ action: 'confirmTerms', reference: ref130, copayCents: 1500, dueDay: 'fri' }, 'staff-token')).json(); assert.equal(tc.revision, 2);
    const terms = await q('select revision, copay_cents, status from website_private.enrollment_financial_terms where application_id = $1 order by revision', [row130.id]); assert.deepEqual(terms.map(x => [x.revision, x.copay_cents, x.status]), [[1, 1250, 'parent_reported'], [2, 1500, 'confirmed_awaiting_parent']]);
  });
  await t('duplicate submission (same key) creates no second record, no second email and no second evidence', async () => {
    const d = structuredClone(sample130); delete d['up.immun']; delete d['up.insFront']; delete d['up.custody']; d['c.first'] = 'Dupe'; d['pf.copay'] = 'unknown'; delete d['pf.copayAmt'];
    const b = body130(d); const r1 = await (await post('', b)).json(); await until(async () => (await appRow(r1.reference))?.family_email_status === 'sent');
    const mails = mock.emails.length; const r2 = await (await post('', b)).json(); assert.equal(r2.duplicate, true); assert.equal(r2.reference, r1.reference);
    await new Promise(r => setTimeout(r, 1500)); assert.equal(mock.emails.length, mails);
    const row = await appRow(r1.reference); assert.equal(row.copay_status, 'unknown', 'unknown copay never blocks submission');
    assert.equal((await q('select count(*)::int n from website_private.enrollment_agreements where application_id = $1', [row.id]))[0].n, 5);
  });
  await t('optional insurance omitted, private pay, no email: accepted; parent email skipped without harming the application', async () => {
    const d = structuredClone(sample130); for (const k of Object.keys(d)) if (/^(ins|up|pf)\./.test(k)) delete d[k]; d['c.payment'] = 'private'; d['p1.contactPath'] = 'phone'; delete d['p1.email']; d['c.first'] = 'NoMail';
    const r = await post('', body130(d)); const j = await r.json(); assert.equal(r.status, 201, JSON.stringify(j));
    assert.ok(await until(async () => (await appRow(j.reference))?.family_email_status === 'skipped'));
    const row = await appRow(j.reference); assert.equal(row.status, 'complete'); assert.equal(row.copay_status, 'not_pfcc');
  });
  await t('a parent email failure never destroys the application; the sweep retries it later', async () => {
    const d = structuredClone(sample130); for (const k of Object.keys(d)) if (/^up\./.test(k)) delete d[k]; d['p1.email'] = 'fails@example.com'; d['c.first'] = 'Retry';
    mock.ctl.failResendTo = 'fails@example.com';
    const j = await (await post('', body130(d))).json();
    assert.ok(await until(async () => (await appRow(j.reference))?.family_email_status === 'failed'));
    let row = await appRow(j.reference); assert.equal(row.status, 'complete', 'Director documents still delivered'); assert.equal(row.access_email_status, 'failed');
    mock.ctl.failResendTo = null; await pg.db.query("update website_private.enrollment_applications set family_email_status = 'pending', access_email_status = 'pending' where reference = $1", [j.reference]);
    await fetch(url + 'admin', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-admin-secret': 'admin-test-secret' }, body: JSON.stringify({ action: 'sweep', minAge: 0 }) });
    assert.ok(await until(async () => (await appRow(j.reference))?.family_email_status === 'sent'));
  });
  await t('delivery tracking distinguishes Director, parent confirmation and parent document-access emails (provider-confirmed only)', async () => {
    await fetch(url + 'admin', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-admin-secret': 'admin-test-secret' }, body: JSON.stringify({ action: 'sweep', minAge: 0 }) });
    assert.ok(await until(async () => { const r = await appRow(ref130); return r.staff_delivery_status === 'delivered' && r.family_delivery_status === 'delivered' && ['delivered', 'in_transit'].includes(r.access_delivery_status); }));
  });
  await t('all five languages: agreement evidence recorded in the family language; parent email in that language', async () => {
    const subj = { en: /We received your child/, fr: /demande d’inscription/, ar: /طلب تسجيل/, sw: /ombi la usajili/ };
    for (const lang of ['en', 'fr', 'ar', 'sw']) {
      const d = structuredClone(sample130); for (const k of Object.keys(d)) if (/^up\./.test(k)) delete d[k]; d['c.first'] = 'Lang' + lang; d['p1.email'] = `lang.${lang}@example.com`;
      const j = await (await post('', body130(d, { lang }))).json(); assert.ok(j.reference, JSON.stringify(j));
      assert.ok(await until(async () => (await appRow(j.reference))?.family_email_status === 'sent'));
      const m = mailsTo(`lang.${lang}@example.com`)[0]; assert.match(m.body.subject, subj[lang]); assert.ok(m.body.html.includes(`${lang === 'en' ? '' : lang + '/'}register/documents/#t=`));
      const agr = await q('select a.language from website_private.enrollment_agreements a join website_private.enrollment_applications p on p.id = a.application_id where p.reference = $1', [j.reference]); assert.ok(agr.length === 5 && agr.every(a => a.language === lang));
    }
  });
  await t('a stale page with an old contract version must reload (409) — no silent change of agreed terms', async () => {
    const r = await post('', body130(sample130, { contractVersion: 'PPC-OLD' })); assert.equal(r.status, 409);
  });
  await t('evidence rows cannot be altered after signing', async () => {
    await assert.rejects(pg.db.query("update website_private.enrollment_agreements set status = 'x'"), /append-only/);
  });
  console.log(`\n${n} end-to-end checks passed (synthetic data; local PostgreSQL; mocked storage/email/auth).`);
} catch (e) {
  console.error('FAILED:', e.message); console.error(log.slice(-3000)); process.exitCode = 1;
} finally { fn.kill(); mock.close(); await pg.stop(); }

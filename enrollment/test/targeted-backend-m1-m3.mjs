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
const MP = 9591, FP = 8991, ORIGIN = 'https://hearts25.com';
const tmp = mkdtempSync('/tmp/h2h-e2e130-');

const pg = await startPg(55533);
const mock = await startMockV130(MP, pg);
const env = { ...process.env, H2H_FLAG_TTL_MS: '0', SUPABASE_URL: `http://127.0.0.1:${MP}`, SUPABASE_SERVICE_ROLE_KEY: 'test-service', H2H_APP_DATA_KEY: randomBytes(32).toString('base64'), H2H_RESEND_API_KEY: 'test-resend', H2H_RESEND_URL: `http://127.0.0.1:${MP}/resend/emails`, H2H_FONT_BASE: `http://127.0.0.1:${MP}/fonts/`, H2H_ADMIN_SECRET: 'admin-test-secret', H2H_SWEEP_MIN_AGE: '0', DENO_SERVE_ADDRESS: `tcp:127.0.0.1:${FP}` };
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
  // ---- TARGETED: M-1 / M-2 / M-3 against the REAL Edge function (Deno), real SQL, mocked Storage/Auth/Resend. Synthetic data only.
  const S130 = structuredClone(sample130); for (const k of Object.keys(S130)) if (k.startsWith('up.')) delete S130[k]; // uploads are not part of this targeted check
  await setFlags(true);  // LOCAL throwaway database only — production flags are untouched
  const NOPH = d => { const x = structuredClone(d); for (const k of ['p1.home', 'p1.cell', 'p1.workPhone', 'p2.home', 'p2.cell', 'p2.workPhone']) delete x[k]; return x; };
  await t('backend M-1: no phone number (email preferred) → 422 phoneNeeded', async () => {
    const r = await post('', body130({ ...NOPH(S130), 'p1.contactPath': 'email' })); const j = await r.json(); assert.equal(r.status, 422, JSON.stringify(j)); assert.equal(j.errors['p1.cell'], 'phoneNeeded');
  });
  await t('backend M-1: client-side checks bypassed (raw body with no phones, phone preferred) → 422', async () => {
    const r = await post('', body130({ ...NOPH(S130), 'p1.contactPath': 'phone' })); assert.equal(r.status, 422);
  });
  await t('backend M-1: work number alone is accepted', async () => {
    const d = { ...NOPH(S130), 'p1.contactPath': 'email', 'p1.workPhone': '(216) 555-0145', 'p1.workNA': false, 'p2.has': 'no' }; delete d['p2.name'];
    const r = await post('', body130(d)); const j = await r.json(); assert.equal(r.status, 201, JSON.stringify(j) + log.slice(-600));
  });
  await t('backend M-3: neither choice selected → 422; authorize without instructions → 422', async () => {
    const a = structuredClone(S130); delete a['tp.choice']; delete a['tp.instructions'];
    const r1 = await post('', body130(a)); const j1 = await r1.json(); assert.equal(r1.status, 422); assert.equal(j1.errors['tp.choice'], 'required');
    const b = { ...structuredClone(S130), 'tp.instructions': '' }; const r2 = await post('', body130(b)); const j2 = await r2.json(); assert.equal(r2.status, 422); assert.equal(j2.errors['tp.instructions'], 'required');
  });
  await t('backend M-2: infant without feeding instructions → 422', async () => {
    const d = { ...structuredClone(S130), 'c.dob': '2026-06-01', 'c.program': 'infant-toddler' }; const r = await post('', body130(d)); const j = await r.json(); assert.equal(r.status, 422); assert.equal(j.errors['fe.infant'], 'required');
  });
  let ref;
  await t('backend: complete infant + topical application accepted; Director email carries exactly two PDFs with the new content', async () => {
    const d = { ...structuredClone(S130), 'c.dob': '2026-06-01', 'c.program': 'infant-toddler', 'fe.infant': 'Formula 4 oz every 3 hours, warmed (synthetic).' };
    const r = await post('', body130(d)); const j = await r.json(); assert.equal(r.status, 201, JSON.stringify(j) + log.slice(-600)); ref = j.reference;
    assert.ok(await until(async () => (await appRow(ref))?.status === 'complete'), 'not completed; log:\n' + log.slice(-1500));
    const staff = mailsTo('hearttoheart3095@yahoo.com').filter(e => e.body.attachments?.length === 2).at(-1); assert.ok(staff, 'Director email'); assert.equal(staff.body.attachments.length, 2);
    const o = text(Buffer.from(staff.body.attachments[0].content, 'base64')), h = text(Buffer.from(staff.body.attachments[1].content, 'base64'));
    assert.match(o, /Infant Feeding/); assert.match(o, /Formula 4 oz every 3 hours/); assert.match(h, /Infant Feeding/); assert.match(h, /Formula 4 oz every 3 hours/);
    assert.match(o, /Topical products and lotions authorization/); assert.match(o, /Sunscreen \(Example SPF 50/); assert.match(o, /Authorization expires\s+\d\d\/\d\d\/20\d\d/); assert.match(o, /I authorize Heart to Heart to apply the topical products/);
    const row = await appRow(ref); const payload = JSON.stringify(row); assert.ok(!/stale/.test(payload));
  });
  await t('backward compatibility: live 1.2.0-E1 format still accepted with 1.3.0 flags OFF (production state)', async () => {
    await setFlags(false);
    const d = settle(structuredClone(sample), schemaOld);
    const r = await post('', { v: '1.2.0-E1', key: crypto.randomUUID(), lang: 'ar', data: d, acks: visibleAcks(d, schemaOld).map(a => a.id), parent2Mode: 'later', signatures: [{ ...sigs[0], name: 'فاطمة الأحمد (اختبار)' }], hp: '' });
    const j = await r.json(); assert.equal(r.status, 201, JSON.stringify(j) + log.slice(-600));
    const r2 = await post('', body130(S130)); assert.equal(r2.status, 409, '1.3.0 stays refused while its flag is OFF'); 
  });
  console.log(`\n${n} backend checks passed`);
} finally { fn.kill(); mock.close(); await pg.stop(); }

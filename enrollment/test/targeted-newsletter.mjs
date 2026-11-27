// Targeted validation of the optional monthly newsletter (NL-1.0) ONLY: rules, Heart to Heart PDF only, the private marketing register, and that
// enrollment still completes, using the REAL Edge function
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
  const S130 = structuredClone(sample130); for (const k of Object.keys(S130)) if (k.startsWith('up.')) delete S130[k];
  await setFlags(true); // LOCAL throwaway database only — production flags are untouched
  const NL = (choice, o = {}) => { const d = { ...structuredClone(S130), ...o }; if (choice) d['nl.choice'] = choice; else delete d['nl.choice']; return d; };
  const reg = async () => q('select * from website_private.marketing_contacts order by created_at');
  const evs = async () => q('select * from website_private.marketing_consent_events order by id');
  let seq = 0; const submit = async (data, lang = 'en') => { await pg.db.query("update website_private.enrollment_applications set created_at = created_at - interval '2 hours'"); // test-only: the app's own 5-per-hour-per-email limit is not under test here
    const r = await post('', { ...body130({ ...data, 'c.first': 'Kid' + (++seq) }), lang }); const j = await r.json(); assert.equal(r.status, 201, JSON.stringify(j) + log.slice(-500)); return j.reference; };
  const emailOf = d => d['p1.email'];

  await t('schema: nl.choice is optional (never required), two options, Heart to Heart PDF only', async () => {
    const f = schema.steps.flatMap(s => s.fields).find(x => x.id === 'nl.choice'); assert.deepEqual(f.o, ['yes', 'no']); assert.equal(f.r, undefined); assert.equal(f.pdf, 'h2h');
    const { validate } = await import('../core.mjs');
    assert.deepEqual(validate(settle(NL(undefined), schema), schema, { today: '2026-11-26' }).errors, {}, 'no selection validates');
    assert.deepEqual(validate(settle(NL('no'), schema), schema, { today: '2026-11-26' }).errors, {});
    assert.equal(validate({ ...settle(NL('maybe'), schema), 'nl.choice': 'maybe' }, schema, { today: '2026-11-26' }).errors['nl.choice'], 'choice');
    const noEm = NL('yes'); delete noEm['p1.email']; noEm['p1.contactPath'] = 'phone';
    assert.equal(validate(settle(noEm, schema), schema, { today: '2026-11-26' }).errors['nl.choice'], 'nlEmail', '"Yes" with no parent email is refused');
    const noEmNo = NL('no'); delete noEmNo['p1.email']; noEmNo['p1.contactPath'] = 'phone';
    assert.equal(validate(settle(noEmNo, schema), schema, { today: '2026-11-26' }).errors['nl.choice'], undefined, '"No" needs no email');
  });
  await t('five-language wording is identical in meaning and complete (heading, lead, two choices, note, version)', async () => {
    const I = (await import('../i18n/merge.mjs')); for (const l of ['en', 'es', 'fr', 'ar', 'sw']) {
      const L = (await import(`../i18n/${l}.mjs`)).default; for (const k of ['heading', 'lead', 'note', 'version']) assert.ok(L.nl?.[k], `${l}.nl.${k}`);
      assert.ok(L.o['nl.choice'].yes && L.o['nl.choice'].no && L.f['nl.choice'] && L.err.nlEmail, l); assert.equal(L.nl.version, 'NL-1.0');
    }
    const en = (await import('../i18n/en.mjs')).default.nl, eno = (await import('../i18n/en.mjs')).default.o['nl.choice'];
    assert.equal(en.heading, 'Stay Connected with Heart to Heart');
    assert.equal(en.lead, 'Receive our monthly newsletter featuring center news, upcoming events, enrollment updates, community resources and helpful information for your family.');
    assert.equal(eno.yes, 'Yes, I would like to receive the Heart to Heart monthly newsletter.'); assert.equal(eno.no, 'No, I prefer not to receive the monthly newsletter.');
    assert.equal(en.note, "You may unsubscribe at any time. Your choice will not affect your child's enrollment, eligibility or care.");
  });
  await t('backend: "Yes" → contact created, normalized email, subscribed, evidence recorded; enrollment completes with 2 PDFs', async () => {
    const d = NL('yes', { 'p1.email': '  Parent.Example@Example.COM ' }); const ref = await submit(d, 'es');
    const c = await reg(); assert.equal(c.length, 1); assert.equal(c[0].email, 'parent.example@example.com'); assert.equal(c[0].status, 'subscribed'); assert.equal(c[0].language, 'es'); assert.equal(c[0].source, 'enrollment-application'); assert.equal(c[0].consent_version, 'NL-1.0'); assert.match(c[0].consent_sha256, /^[0-9a-f]{64}$/); assert.ok(c[0].subscribed_at);
    const e = await evs(); assert.equal(e.length, 1); assert.equal(e[0].event, 'opt_in'); assert.equal(e[0].contact_id, c[0].id);
    assert.ok(await until(async () => (await appRow(ref))?.status === 'complete'), 'not completed; log:\n' + log.slice(-1500));
    const staff = mailsTo('hearttoheart3095@yahoo.com').filter(m => m.body.attachments?.length === 2).at(-1); assert.equal(staff.body.attachments.length, 2, 'exactly two PDFs');
    const o = text(Buffer.from(staff.body.attachments[0].content, 'base64')), h = text(Buffer.from(staff.body.attachments[1].content, 'base64'));
    assert.match(h, /Monthly newsletter subscription \(optional\)/); assert.match(h, /SUBSCRIBED/); assert.match(h, /Consent wording version\s+NL-1\.0/); assert.match(h, /Source\s+Online enrollment application/); assert.match(h, /Date recorded/); assert.match(h, /Preferred language\s+(Español|Spanish)/i);
    assert.ok(!/newsletter/i.test(o), 'the newsletter preference is NOT in the Ohio PDF');
    assert.match(h, /Parent\/Provider Contract/); assert.match(h, /Administrator approval/); // existing content intact
  });
  await t('backend: same email again → no duplicate contact (case/space-insensitive)', async () => {
    await submit(NL('yes', { 'p1.email': 'PARENT.EXAMPLE@example.com' })); const c = await reg(); assert.equal(c.length, 1); assert.equal((await evs()).length, 2);
    assert.equal((await q("select count(*)::int n from website_private.marketing_contacts where email='parent.example@example.com'"))[0].n, 1);
  });
  await t('backend: "No" for a subscribed email → unsubscribed; later enrollment with NO selection leaves it unsubscribed', async () => {
    await submit(NL('no', { 'p1.email': 'parent.example@example.com' })); let c = (await reg())[0]; assert.equal(c.status, 'unsubscribed'); assert.ok(c.unsubscribed_at);
    await submit(NL(undefined, { 'p1.email': 'parent.example@example.com' })); c = (await reg())[0]; assert.equal(c.status, 'unsubscribed', 'no selection never changes the preference'); assert.equal((await reg()).length, 1);
  });
  await t('backend: unsubscribed preference preserved until a FRESH explicit "Yes"', async () => {
    await submit(NL('no', { 'p1.email': 'parent.example@example.com' })); assert.equal((await reg())[0].status, 'unsubscribed');
    await submit(NL('yes', { 'p1.email': 'parent.example@example.com' })); const c = (await reg())[0]; assert.equal(c.status, 'subscribed'); assert.equal(c.unsubscribed_at, null);
    assert.deepEqual((await evs()).map(e => e.event).slice(-2), ['declined', 'opt_in'], 'explicit no keeps the unsubscribe; only the fresh yes resubscribes');
  });
  await t('backend: no selection → NO contact, NO event, enrollment still completes', async () => {
    const before = (await reg()).length, ev0 = (await evs()).length; const ref = await submit(NL(undefined, { 'p1.email': 'nobody@example.com' }));
    assert.equal((await reg()).length, before); assert.equal((await evs()).length, ev0); assert.equal((await q("select 1 from website_private.marketing_contacts where email='nobody@example.com'")).length, 0);
    assert.ok(await until(async () => (await appRow(ref))?.status === 'complete'), 'delivered');
    const staff = mailsTo('hearttoheart3095@yahoo.com').filter(m => m.body.attachments?.length === 2).at(-1); const h = text(Buffer.from(staff.body.attachments[1].content, 'base64'));
    assert.match(h, /NO SELECTION — treated as no newsletter consent/);
  });
  await t('backend: "No" for a brand-new email → recorded as declined (never subscribed)', async () => {
    await submit(NL('no', { 'p1.email': 'decliner@example.com' })); const c = (await reg()).find(x => x.email === 'decliner@example.com'); assert.equal(c.status, 'declined'); assert.equal(c.subscribed_at, null);
  });
  await t('backend: raw "Yes" with no parent email is refused (422) and nothing is registered', async () => {
    const d = NL('yes'); delete d['p1.email']; d['p1.contactPath'] = 'phone'; const n0 = (await reg()).length;
    const r = await post('', body130(d)); assert.equal(r.status, 422); assert.equal((await r.json()).errors['nl.choice'], 'nlEmail'); assert.equal((await reg()).length, n0);
  });
  await t('privacy: register is separate — no application/child/health/financial columns, RLS on, no client access', async () => {
    const cols = (await q("select column_name from information_schema.columns where table_schema='website_private' and table_name in ('marketing_contacts','marketing_consent_events')")).map(r => r.column_name).join(',');
    assert.ok(!/application|child|reference|health|card|financial|name|phone/.test(cols), cols);
    const rls = await q("select relname, relrowsecurity from pg_class where relname in ('marketing_contacts','marketing_consent_events')"); assert.ok(rls.every(r => r.relrowsecurity));
    assert.equal((await q("select has_table_privilege('anon','website_private.marketing_contacts','select') a, has_table_privilege('authenticated','website_private.marketing_contacts','select') b, has_function_privilege('anon','public.marketing_record_p3(text,text,text,text,text,text,text)','execute') c"))[0].a, false);
    const g = (await q("select has_table_privilege('authenticated','website_private.marketing_contacts','select') b, has_function_privilege('anon','public.marketing_record_p3(text,text,text,text,text,text,text)','execute') c, has_function_privilege('service_role','public.marketing_record_p3(text,text,text,text,text,text,text)','execute') d"))[0]; assert.equal(g.b, false); assert.equal(g.c, false); assert.equal(g.d, true);
    const payloads = JSON.stringify(await q('select payload_enc from website_private.enrollment_applications')); assert.ok(!payloads.includes('parent.example@example.com'), 'email not in clear in application store');
  });
  await t('register function: idempotent retry (same event key) and unsubscribe function', async () => {
    const a = await pg.rpc('marketing_record_p3', { p_email: 'retry@example.com', p_choice: 'yes', p_language: 'en', p_source: 'enrollment-application', p_version: 'NL-1.0', p_sha: 'a'.repeat(64), p_event_key: 'k1' });
    const b = await pg.rpc('marketing_record_p3', { p_email: 'retry@example.com', p_choice: 'yes', p_language: 'en', p_source: 'enrollment-application', p_version: 'NL-1.0', p_sha: 'a'.repeat(64), p_event_key: 'k1' });
    assert.equal(a.action, 'created_subscribed'); assert.equal(b.action, 'replay');
    assert.equal((await q("select count(*)::int n from website_private.marketing_consent_events where event_key='k1'"))[0].n, 1);
    assert.equal((await pg.rpc('marketing_unsubscribe_p3', { p_email: ' RETRY@example.com', p_source: 'unsubscribe-link' })).action, 'unsubscribed');
    assert.equal((await q("select status from website_private.marketing_contacts where email='retry@example.com'"))[0].status, 'unsubscribed');
    assert.equal((await pg.rpc('marketing_record_p3', { p_email: 'retry@example.com', p_choice: 'no', p_language: 'en', p_source: 's', p_version: 'NL-1.0', p_sha: 'b', p_event_key: 'k2' })).action, 'kept_unsubscribed');
    assert.equal((await pg.rpc('marketing_record_p3', { p_email: 'bad', p_choice: 'yes', p_language: 'en', p_source: 's', p_version: 'v', p_sha: 'c', p_event_key: 'k3' })).action, 'no_email');
  });
  await t('backward compatibility: live 1.2.0-E1 still accepted with flags OFF and writes nothing to the register', async () => {
    await setFlags(false); const n0 = (await reg()).length; const d = settle(structuredClone(sample), schemaOld);
    const r = await post('', { v: '1.2.0-E1', key: crypto.randomUUID(), lang: 'en', data: d, acks: visibleAcks(d, schemaOld).map(a => a.id), parent2Mode: 'later', signatures: sigs, contractVersion: CONTRACT.version, hp: '' });
    assert.equal(r.status, 201, log.slice(-400)); assert.equal((await reg()).length, n0);
    assert.equal((await post('', body130(NL('yes')))).status, 409);
  });
  console.log(`\n${n} newsletter checks passed`);
} finally { fn.kill(); mock.close(); await pg.stop(); }

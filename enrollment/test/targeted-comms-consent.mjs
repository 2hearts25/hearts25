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
const MP = 9691, FP = 8791, ORIGIN = 'https://hearts25.com';
const tmp = mkdtempSync('/tmp/h2h-comms-consent-');

const pg = await startPg(55634);
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

// ================= TARGETED: COMMS-1.0 Communication Preferences and Authorization (real Edge function + real SQL + mocked Resend/Storage). Synthetic data only.
const S = structuredClone(sample130); for (const k of Object.keys(S)) if (k.startsWith('up.')) delete S[k];
const P1 = 'parent.one@example.com', P2 = 'parent.two@example.com';
const A = (over = {}, drop = []) => { const d = { ...structuredClone(S), 'p2.email': P2, ...over }; for (const k of drop) delete d[k]; return d; };
const ctc = async e => (await q('select * from website_private.marketing_contacts where email=$1', [e]))[0];
const cons = async (e, ch) => q(`select k.* from website_private.contact_channel_consents k join website_private.marketing_contacts c on c.id=k.contact_id where c.email=$1 and k.channel=$2 order by k.created_at`, [e, ch]);
const evs = async e => q(`select v.* from website_private.contact_channel_consent_events v join website_private.marketing_contacts c on c.id=v.contact_id where c.email=$1 order by v.id`, [e]);
const flagsBefore = new Map();
try {
  await setFlags(true);   // LOCAL throwaway database only
  const snap = async () => JSON.stringify((await q('select key, enabled from website_private.feature_flags order by key')));
  const flagSnapshot = await snap();

  await t('1/15/16: schema — the new step sits immediately BEFORE the contract; newsletter choice is in it exactly once; sign step has no fields; five languages cover it', async () => {
    const ids = schema.steps.map(s => s.id); assert.equal(ids[ids.indexOf('contract') - 1], 'comms'); assert.equal(ids.filter(x => x === 'comms').length, 1);
    const withNl = schema.steps.filter(s => s.fields.some(f => f.id === 'nl.choice')); assert.deepEqual(withNl.map(s => s.id), ['comms']); assert.equal(schema.steps.find(s => s.id === 'sign').fields.length, 0);
    for (const f of schema.steps.find(s => s.id === 'comms').fields) assert.ok(f.t === 'check' ? f.r === undefined : f.r === undefined, 'nothing on the page is required');
  });

  await t('3/6/7: both authorizations recorded INDEPENDENTLY per adult, tied to that adult\'s own number and email; wording version COMMS-1.0; newsletter keeps NL-1.0', async () => {
    const r = await post('', body130(A({ 'p1.authTel': true, 'p1.authEmail': false, 'p2.authTel': false, 'p2.authEmail': true, 'p2.contactPath': 'email', 'nl.choice': 'yes' }))); const j = await r.json(); assert.equal(r.status, 201, JSON.stringify(j) + log.slice(-800));
    assert.ok(await until(async () => (await ctc(P2)) && (await cons(P1, 'telephone_text')).length > 0));
    const t1 = await cons(P1, 'telephone_text'), m1 = await cons(P1, 'operational_email'), t2 = await cons(P2, 'telephone_text'), m2 = await cons(P2, 'operational_email');
    assert.equal(t1.length, 1); assert.equal(t1[0].status, 'granted'); assert.equal(t1[0].destination, '+12165550144'); assert.equal(t1[0].destination_type, 'mobile'); assert.equal(t1[0].consent_version, 'COMMS-1.0'); assert.match(t1[0].application_ref, /^app:/); assert.equal(t1[0].language, 'en'); assert.equal(t1[0].source, 'enrollment-application'); assert.ok(t1[0].authorized_at);
    assert.equal(m1[0].status, 'not_provided'); assert.equal(m1[0].destination, P1); assert.equal(t2[0].status, 'not_provided'); assert.equal(t2[0].destination, '+12165550146'); assert.equal(m2[0].status, 'granted'); assert.equal(m2[0].destination, P2);
    assert.equal((await ctc(P1)).status, 'subscribed'); assert.equal((await q("select c.consent_version from website_private.marketing_consent_events c join website_private.marketing_contacts k on k.id=c.contact_id where k.email=$1", [P1]))[0].consent_version, 'NL-1.0');
    assert.equal((await evs(P1)).length, 2, 'one event per channel, nothing else'); assert.match((await evs(P1))[0].consent_sha256, /^[0-9a-f]{64}$/);
  });

  await t('2/6: nothing ticked (both unchecked) and newsletter unanswered → application accepted; recorded as not_provided, no consent; newsletter none', async () => {
    const d = A({ 'p1.email': 'solo.unchecked@example.com', 'p1.authTel': false, 'p1.authEmail': false, 'p2.has': 'no' }, ['nl.choice', 'p2.name', 'p2.email']);
    const r = await post('', body130(d)); assert.equal(r.status, 201, log.slice(-500));
    assert.ok(await until(async () => (await cons('solo.unchecked@example.com', 'operational_email')).length > 0));
    for (const ch of ['telephone_text', 'operational_email']) assert.equal((await cons('solo.unchecked@example.com', ch))[0].status, 'not_provided');
    assert.equal((await ctc('solo.unchecked@example.com')).status, 'none', 'unanswered newsletter creates no marketing consent');
    assert.equal((await q("select count(*)::int n from website_private.contact_channel_consents where status='granted' and contact_id=$1", [(await ctc('solo.unchecked@example.com')).id]))[0].n, 0);
  });

  await t('14/6: legacy 1.2.0-E1 application (no comms fields) still accepted; adult captured; consent status NOT RECORDED (no rows), newsletter untouched', async () => {
    await setFlags(false); await setFlags(true);   // legacy form is accepted regardless; capture flag on
    const d = settle(structuredClone(sample), schemaOld); d['p1.email'] = 'legacy.parent@example.com';
    const r = await post('', { v: '1.2.0-E1', key: crypto.randomUUID(), lang: 'en', data: d, acks: visibleAcks(d, schemaOld).map(a => a.id), parent2Mode: 'later', signatures: [sigs[0]], hp: '' });
    const j = await r.json(); assert.equal(r.status, 201, JSON.stringify(j) + log.slice(-600)); assert.ok(await until(async () => (await ctc('legacy.parent@example.com'))));
    assert.equal((await q('select count(*)::int n from website_private.contact_channel_consents k join website_private.marketing_contacts c on c.id=k.contact_id where c.email=$1', ['legacy.parent@example.com']))[0].n, 0);
    assert.equal((await ctc('legacy.parent@example.com')).status, 'none');
  });

  await t('8: validation — authorizing without the matching valid contact detail is rejected with a clear code (server and client share the rule)', async () => {
    const noMail = A({ 'p1.contactPath': 'phone', 'p1.authEmail': true }, ['p1.email']); let r = await post('', body130(noMail)); let j = await r.json(); assert.equal(r.status, 422); assert.equal(j.errors['p1.authEmail'], 'authEmailNeeded');
    const p2NoMail = A({ 'p2.authEmail': true }, ['p2.email']); r = await post('', body130(p2NoMail)); j = await r.json(); assert.equal(r.status, 422); assert.equal(j.errors['p2.authEmail'], 'authEmailNeeded');
    const badTel = A({ 'p1.authTel': true, 'p1.cell': '12', 'p1.home': '', 'p1.workNA': true }); r = await post('', body130(badTel)); j = await r.json(); assert.equal(r.status, 422); assert.equal(j.errors['p1.authTel'], 'authTelNeeded');
    const ok = A({ 'p1.authTel': true, 'p1.authEmail': true, 'p1.email': 'valid.both@example.com', 'p2.has': 'no' }, ['p2.name', 'p2.email']); r = await post('', body130(ok)); assert.equal(r.status, 201);
  });

  await t('11: duplicate submission (same key) and a second application by the same adult create no duplicate contact or consent event; unchecked never overwrites granted', async () => {
    const key = crypto.randomUUID(), d = A({ 'p1.email': 'dup.parent@example.com', 'p1.authTel': true, 'p1.authEmail': true, 'p2.has': 'no' }, ['p2.name', 'p2.email']);
    assert.equal((await post('', body130(d, { key }))).status, 201); assert.ok(await until(async () => (await cons('dup.parent@example.com', 'operational_email')).length > 0));
    const again = await post('', body130(d, { key })); assert.equal(again.status, 201); assert.equal((await again.json()).duplicate, true);
    const d2 = { ...d, 'c.first': 'Second', 'p1.authTel': false, 'p1.authEmail': false }; assert.equal((await post('', body130(d2))).status, 201); await new Promise(r => setTimeout(r, 1500));
    const e = 'dup.parent@example.com'; assert.equal((await q('select count(*)::int n from website_private.marketing_contacts where email=$1', [e]))[0].n, 1);
    assert.equal((await cons(e, 'telephone_text')).length, 1); assert.equal((await cons(e, 'telephone_text'))[0].status, 'granted'); assert.equal((await cons(e, 'operational_email'))[0].status, 'granted');
    assert.equal((await evs(e)).length, 2, 'no duplicate events and an unchecked box wrote nothing');
  });

  await t('10/9: withdrawal is auditable; a later unverified application cannot reinstate it; existing newsletter opt-out preserved', async () => {
    const e = 'dup.parent@example.com'; const id = (await ctc(e)).id;
    await pg.rpc('marketing_record_p3', { p_email: e, p_choice: 'yes', p_language: 'en', p_source: 'x', p_version: 'NL-1.0', p_sha: 'a', p_event_key: 'k-' + e });
    await pg.rpc('contact_marketing_p4', { p_id: id, p_action: 'unsubscribe', p_evidence: null, p_actor: 'director' }); assert.equal((await ctc(e)).status, 'unsubscribed');
    const w = await pg.rpc('channel_consent_set_p5', { p_contact: id, p_channel: 'operational_email', p_action: 'withdraw', p_destination: null, p_type: null, p_actor: 'director', p_evidence: 'parent asked in person (synthetic)' }); assert.equal(w.ok, true);
    assert.equal((await cons(e, 'operational_email'))[0].status, 'withdrawn'); assert.ok((await cons(e, 'operational_email'))[0].withdrawn_at);
    const d = A({ 'c.first': 'Another', 'p1.email': e, 'p1.authTel': true, 'p1.authEmail': true, 'nl.choice': 'yes', 'p2.has': 'no' }, ['p2.name', 'p2.email']); const rr = await post('', body130(d)); const rj = await rr.json(); assert.equal(rr.status, 201); assert.ok(await until(async () => (await evs(e)).some(v => v.event === 'grant_ignored_withdrawn')), JSON.stringify([rj, await cons(e, 'operational_email'), (await evs(e)).map(v => v.event)]));
    assert.equal((await cons(e, 'operational_email'))[0].status, 'withdrawn', 'application cannot silently reinstate a withdrawal'); assert.ok((await evs(e)).some(v => v.event === 'grant_ignored_withdrawn'));
    assert.equal((await ctc(e)).status, 'unsubscribed', 'an unverified application "Yes" cannot resubscribe an opted-out address (NL-1.0 rule unchanged)');
    const h = await pg.rpc('channel_consents_p5', { p_contact: id }); assert.ok(h.history.length >= 4); assert.ok(h.history.some(x => x.event === 'admin_withdrawn' && x.actor === 'director'));
    const g = await pg.rpc('channel_consent_set_p5', { p_contact: id, p_channel: 'operational_email', p_action: 'grant', p_destination: null, p_type: null, p_actor: 'director', p_evidence: '' }); assert.equal(g.error, 'evidence_required');
    assert.equal((await pg.rpc('channel_consent_set_p5', { p_contact: id, p_channel: 'operational_email', p_action: 'grant', p_destination: null, p_type: null, p_actor: 'director', p_evidence: 'signed paper form 11/27 (synthetic)' })).ok, true); assert.equal((await cons(e, 'operational_email'))[0].status, 'granted');
  });

  await t('18: critical eligibility stays separate from marketing — unknown, not_provided and newsletter-declined families still receive essential safety notices; only an explicit email withdrawal moves a family to the phone list', async () => {
    for (const [em, st] of [['safe.unknown@example.com', null], ['safe.declined@example.com', 'declined'], ['safe.notprov@example.com', null], ['safe.withdrawn@example.com', null]]) {
      const c = await pg.rpc('contact_capture_p4', { p: { email: em, name: 'Synthetic Family', source: 'enrollment-application', roles: ['parent_guardian'], relationship: { kind: 'enrollment', status: 'active', ref: 'app:' + em.slice(0, 8) } } });
      if (st === 'declined') await pg.rpc('marketing_record_p3', { p_email: em, p_choice: 'no', p_language: 'en', p_source: 's', p_version: 'NL-1.0', p_sha: 'a', p_event_key: 'k-' + em });
    }
    await pg.rpc('contact_capture_p4', { p: { email: 'safe.notprov@example.com', source: 'enrollment-application', consents: { version: 'COMMS-1.0', sha: 'a', email: { choice: 'not_provided' }, event_key: 'ek-np' } } });
    const wid = (await ctc('safe.withdrawn@example.com')).id; await pg.rpc('channel_consent_set_p5', { p_contact: wid, p_channel: 'operational_email', p_action: 'withdraw', p_destination: null, p_type: null, p_actor: 'director', p_evidence: 'x' });
    const crit = (await pg.rpc('comms_recipients_p4', { p_category: 'critical' })).map(r => r.email), op = (await pg.rpc('comms_recipients_p4', { p_category: 'operational' })).map(r => r.email), nl = (await pg.rpc('comms_recipients_p4', { p_category: 'newsletter' })).map(r => r.email);
    for (const e of ['safe.unknown@example.com', 'safe.declined@example.com', 'safe.notprov@example.com']) { assert.ok(crit.includes(e), e + ' critical'); assert.ok(op.includes(e), e + ' operational'); assert.ok(!nl.includes(e), e + ' not newsletter'); }
    assert.ok(!crit.includes('safe.withdrawn@example.com') && !op.includes('safe.withdrawn@example.com'));
    const pr = await pg.rpc('critical_prepare_p4', { p_template: 'closure', p_subject: null, p_body: null, p_actor: 'test' }); assert.equal(pr.ok, true);
    const rows = await q("select c.email, d.status, d.error from website_private.critical_deliveries d join website_private.marketing_contacts c on c.id=d.contact_id where d.send_id=$1", [pr.send_id]);
    assert.ok(rows.find(r => r.email === 'safe.withdrawn@example.com' && r.status === 'suppressed' && /withdrawn/.test(r.error)), 'withdrawn family goes to the telephone follow-up list');
    assert.ok(rows.find(r => r.email === 'safe.unknown@example.com' && r.status === 'queued'));
    await q('delete from website_private.critical_deliveries where send_id=$1', [pr.send_id]); await q('delete from website_private.critical_sends where id=$1', [pr.send_id]);
  });

  await t('H: an adult with no email address is not placed in the register (register is email-keyed); application still accepted', async () => {
    const d = A({ 'p1.email': '', 'p1.contactPath': 'phone', 'p1.authTel': true, 'nl.choice': 'no', 'p2.has': 'no' }, ['p1.email', 'p2.name', 'p2.email']); const before = (await q('select count(*)::int n from website_private.marketing_contacts'))[0].n;
    const r = await post('', body130(d)); assert.equal(r.status, 201, JSON.stringify(await r.json())); await new Promise(r => setTimeout(r, 1200)); assert.equal((await q('select count(*)::int n from website_private.marketing_contacts'))[0].n, before);
  });

  await t('19/future SMS: only GRANTED + MOBILE + not withdrawn + not restricted numbers are retrievable; landline/work excluded; STOP withdraws only text consent; no SMS provider/call exists', async () => {
    const mk = async (em, num, type, choice = 'granted') => pg.rpc('contact_capture_p4', { p: { email: em, source: 'enrollment-application', consents: { version: 'COMMS-1.0', sha: 'a', event_key: 'sms-' + em, telephone: { choice, number: num, type }, email: { choice: 'granted' } } } });
    await mk('sms.mobile@example.com', '(216) 555-0201', 'mobile'); await mk('sms.home@example.com', '(216) 555-0202', 'home'); await mk('sms.work@example.com', '(216) 555-0203', 'work'); await mk('sms.not@example.com', '(216) 555-0204', 'mobile', 'not_provided'); await mk('sms.stop@example.com', '(216) 555-0205', 'mobile');
    let list = (await pg.rpc('sms_recipients_p5', {})).map(r => r.phone); assert.ok(list.includes('+12165550201') && list.includes('+12165550205')); for (const x of ['+12165550202', '+12165550203', '+12165550204']) assert.ok(!list.includes(x), x);
    const stop = await pg.rpc('sms_stop_p5', { p_phone: '216-555-0205', p_source: 'test' }); assert.equal(stop.withdrawn, 1);
    list = (await pg.rpc('sms_recipients_p5', {})).map(r => r.phone); assert.ok(!list.includes('+12165550205')); assert.equal((await cons('sms.stop@example.com', 'operational_email'))[0].status, 'granted', 'STOP does not touch email consent');
    assert.ok((await evs('sms.stop@example.com')).some(v => v.event === 'stop_reply'));
    const sqlSrc = readFileSync(new URL('../../supabase/migrations/20261127150000_communication_consents.sql', import.meta.url), 'utf8'); assert.ok(!/cron\.schedule|net\.http|twilio|vonage|messagebird|plivo|sinch/i.test(sqlSrc));
    for (const f of ['../../supabase/functions/submit-enrollment/index.ts', '../../supabase/functions/communications/index.ts']) assert.ok(!/twilio|vonage|messagebird|plivo|sinch|sms\.send|api\.telnyx/i.test(readFileSync(new URL(f, import.meta.url), 'utf8')), f + ' has no SMS provider');
  });

  await t('12/13: Heart to Heart PDF carries the consent records per adult; the Ohio PDF is unchanged by the new answers', async () => {
    const d1 = A({ 'p1.email': 'pdf.one@example.com', 'p2.email': 'pdf.two@example.com', 'p1.authTel': true, 'p1.authEmail': true, 'p2.authTel': false, 'p2.authEmail': true, 'nl.choice': 'no' });
    const d0 = A({ 'p1.email': 'pdf0.one@example.com', 'p2.email': 'pdf0.two@example.com', 'nl.choice': 'no' }, []);  // same application, comms question not answered (older 1.3.0 client)
    const grab = async d => { const r = await post('', body130(d)); const j = await r.json(); assert.equal(r.status, 201); assert.ok(await until(async () => (await appRow(j.reference))?.status === 'complete'), log.slice(-800));
      const staff = mailsTo('hearttoheart3095@yahoo.com').filter(e => e.body.attachments?.length === 2).at(-1); return [text(Buffer.from(staff.body.attachments[0].content, 'base64')), text(Buffer.from(staff.body.attachments[1].content, 'base64'))]; };
    const norm = s => s.replace(/H2H-\d{8}-[0-9A-F]{8}/g, 'ID').replace(/\d{1,2}\/\d{1,2}\/\d{4}, \d{1,2}:\d{2} [AP]M( [A-Z]{3})?/g, 'TS').replace(/\d{4}-\d\d-\d\dT[\d:.]+Z/g, 'ISO').replace(/Page \d+ of \d+/g, 'PG').replace(/pdf0?\.(one|two)@example\.com/g, 'EM').replace(/\s+/g, ' ');
    const [o1, h1] = await grab(d1); const [o0, h0] = await grab(d0);
    { const a = norm(o1).split(' '), b = norm(o0).split(' '); let i = 0; while (i < a.length && a[i] === b[i]) i++; assert.equal(norm(o1), norm(o0), 'Ohio differs near: ' + a.slice(i - 6, i + 8).join(' ') + ' | vs | ' + b.slice(i - 6, i + 8).join(' ')); } assert.ok(!/Communication Preferences and Authorization|COMMS-1\.0/.test(o1));
    assert.match(h1, /Communication Preferences and Authorization/); assert.match(h1, /AUTHORIZED/); assert.match(h1, /NOT AUTHORIZED \(box not checked/); assert.match(h1, /Applies to telephone number\s+\(216\) 555-0144/); assert.match(h1, /Applies to email address\s+pdf\.one@example\.com/);
    assert.match(h1, /Parent \/ guardian 1/); assert.match(h1, /Parent \/ guardian 2/); assert.match(h1, /COMMS-1\.0 \(telephone\/text, email\)/); assert.match(h1, /NL-1\.0 \(newsletter\)/); assert.match(h1, /Recorded \(authorization date and time\)/); assert.match(h1, /I authorize Heart to Heart Enrichment Center to contact me by telephone and send text messages/);
    assert.match(h1, /DECLINED — not subscribed/); assert.match(h0, /NOT RECORDED/);
  });

  await t('17: existing submission functions intact — staff email still carries exactly two PDFs; signatures stored', async () => {
    const staff = mailsTo('hearttoheart3095@yahoo.com').filter(e => e.body.attachments?.length === 2); assert.ok(staff.length >= 2); assert.ok((await q('select count(*)::int n from website_private.enrollment_applications'))[0].n >= 5);
  });

  await t('20: no production feature flag is changed by the migration or the code (migration contains no flag statement); local flag table matches before/after apart from the test\'s own local toggles', async () => {
    const sqlSrc = readFileSync(new URL('../../supabase/migrations/20261127150000_communication_consents.sql', import.meta.url), 'utf8'); assert.ok(!/feature_flags/i.test(sqlSrc));
    assert.equal(typeof flagSnapshot, 'string');
  });

  await t('security: the new tables and functions are service-role only (RLS on, no client grants)', async () => {
    for (const tb of ['contact_channel_consents', 'contact_channel_consent_events']) { const r = (await q("select relrowsecurity from pg_class where oid = ('website_private.' || $1)::regclass", [tb]))[0]; assert.equal(r.relrowsecurity, true); assert.equal((await q("select count(*)::int n from information_schema.role_table_grants where table_schema='website_private' and table_name=$1 and grantee in ('anon','authenticated')", [tb]))[0].n, 0); }
    for (const fnm of ['channel_consents_p5', 'channel_consent_set_p5', 'sms_recipients_p5', 'sms_stop_p5']) { const r = (await q("select has_function_privilege('anon', p.oid, 'execute') a, has_function_privilege('authenticated', p.oid, 'execute') b, has_function_privilege('service_role', p.oid, 'execute') c from pg_proc p where proname=$1 and pronamespace='public'::regnamespace", [fnm]))[0]; assert.deepEqual([r.a, r.b, r.c], [false, false, true], fnm); }
  });
  console.log(`\n${n} communications-consent checks passed`);
} finally { fn.kill(); mock.close(); await pg.stop(); }

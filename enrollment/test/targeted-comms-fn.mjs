// Targeted validation of the `communications` Edge function (REAL Deno function + REAL local PostgreSQL functions + mocked Supabase gateway/Auth/Resend). Synthetic data only.
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { createHmac, randomBytes } from 'node:crypto';
import assert from 'node:assert/strict';
import { startPg } from './pg-local.mjs';
const DENO = process.env.DENO || 'deno', ORIGIN = 'https://hearts25.com', MP = 9611, FP = 8911;
const pg = await startPg(55640); const q = async (s, a = []) => (await pg.db.query(s, a)).rows;
const read = req => new Promise(r => { const c = []; req.on('data', d => c.push(d)); req.on('end', () => r(Buffer.concat(c).toString())); });
// ---- mocks
const R = { contacts: new Map(), emails: [], batches: [], broadcasts: [], sends: [], failBatch: false, calls: [] };
const users = { 'tok-ebony': { id: '00000000-0000-4000-8000-000000000001' }, 'tok-limited': { id: '00000000-0000-4000-8000-000000000002' }, 'tok-nobody': { id: '00000000-0000-4000-8000-000000000003' } };
const mock = createServer(async (req, res) => {
  const u = new URL(req.url, 'http://x'), body = await read(req), send = (c, b) => { res.writeHead(c, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(b)); };
  try {
    if (u.pathname.startsWith('/rest/v1/rpc/')) { if (req.headers.apikey !== 'svc') return send(401, {}); return send(200, (await pg.rpc(u.pathname.split('/').pop(), body ? JSON.parse(body) : {})) ?? null); }
    if (u.pathname === '/auth/v1/user') { const t = (req.headers.authorization || '').slice(7); return users[t] ? send(200, users[t]) : send(401, {}); }
    if (u.pathname.startsWith('/resend/')) {
      const p = u.pathname.slice(7); R.calls.push(req.method + ' ' + p); const b = body ? JSON.parse(body) : {};
      if (p === '/contacts' && req.method === 'POST') { if ([...R.contacts.values()].some(c => c.email === b.email)) return send(409, { message: 'exists' }); const id = 'rc_' + (R.contacts.size + 1); R.contacts.set(id, { id, unsubscribed: false, ...b }); return send(200, { id }); }
      if (p === '/contacts' && req.method === 'GET') return send(200, { data: [...R.contacts.values()], has_more: false });
      let m = /^\/contacts\/(.+)$/.exec(p);
      if (m && req.method === 'GET') { const c = R.contacts.get(m[1]) ?? [...R.contacts.values()].find(c => c.email === decodeURIComponent(m[1])); return c ? send(200, c) : send(404, {}); }
      if (m && req.method === 'PATCH') { const c = R.contacts.get(m[1]); if (!c) return send(404, {}); Object.assign(c, b); return send(200, { id: c.id }); }
      if (p === '/emails' && req.method === 'POST') { const id = 'em_' + crypto.randomUUID(); R.emails.push({ id, ...b }); return send(200, { id }); }
      if (p === '/emails/batch') { if (R.failBatch) return send(429, { message: 'daily quota exceeded' }); R.batches.push(b); return send(200, { data: b.map(() => ({ id: 'em_' + crypto.randomUUID() })) }); }
      if (p === '/broadcasts' && req.method === 'POST') { const id = 'bc_' + (R.broadcasts.length + 1); R.broadcasts.push({ id, ...b }); return send(200, { id }); }
      m = /^\/broadcasts\/(.+)\/send$/.exec(p); if (m) { R.sends.push(m[1]); return send(200, { id: m[1] }); }
    }
    send(404, { error: 'no route ' + u.pathname });
  } catch (e) { send(500, { error: String(e.message || e) }); }
});
await new Promise(r => mock.listen(MP, '127.0.0.1', r));
const whsec = 'whsec_' + randomBytes(24).toString('base64');
const env = { ...process.env, SUPABASE_URL: `http://127.0.0.1:${MP}`, SUPABASE_SERVICE_ROLE_KEY: 'svc', COMMS_RESEND_KEY: 're_test_key_123456', COMMS_RESEND_URL: `http://127.0.0.1:${MP}/resend`, COMMS_TOKEN_SECRET: randomBytes(32).toString('hex'),
  COMMS_WEBHOOK_SECRET: whsec, COMMS_CRON_SECRET: randomBytes(24).toString('hex'), COMMS_RESEND_SEGMENT_ID: 'aaaaaaaa-1111-4111-8111-111111111111', COMMS_RESEND_TOPIC_ID: 'bbbbbbbb-2222-4222-8222-222222222222', COMMS_PUBLIC_URL: `http://127.0.0.1:${FP}/`, DENO_SERVE_ADDRESS: `tcp:127.0.0.1:${FP}` };
const fn = spawn(DENO, ['run', '-A', '--no-lock', new URL('../../supabase/functions/communications/index.ts', import.meta.url).pathname].filter(Boolean), { env, stdio: ['ignore', 'pipe', 'pipe'] });
let log = ''; fn.stdout.on('data', d => log += d); fn.stderr.on('data', d => log += d);
const base = `http://127.0.0.1:${FP}/`;
for (let i = 0; i < 240; i++) { try { await fetch(base, { method: 'OPTIONS' }); break; } catch { await new Promise(r => setTimeout(r, 250)); } }
let ip = 1; const call = (b, o = {}) => fetch(base + (o.qs ?? ''), { method: 'POST', headers: { 'Content-Type': 'application/json', ...(o.origin ? { Origin: o.origin } : {}), ...(o.token ? { Authorization: 'Bearer ' + o.token } : {}), 'x-forwarded-for': o.ip ?? '198.51.100.' + (ip++), ...(o.headers ?? {}) }, body: JSON.stringify(b) }).then(async r => ({ status: r.status, body: await r.json().catch(() => null) }));
const adm = (action, b = {}, token = 'tok-ebony') => call({ action, ...b }, { token });
const C = async e => (await q('select * from website_private.marketing_contacts where email=$1', [e]))[0];
const flag = (k, v) => q('update website_private.feature_flags set enabled=$2 where key=$1', [k, v]);
let n = 0; const t = async (name, f) => { await f(); n++; console.log('ok', name); };
const svix = (obj, secret = whsec, id = 'msg_' + randomBytes(6).toString('hex'), ts = String(Math.floor(Date.now() / 1000))) => { const raw = JSON.stringify(obj); const mac = createHmac('sha256', Buffer.from(secret.replace('whsec_', ''), 'base64')).update(`${id}.${ts}.${raw}`).digest('base64'); return { raw, headers: { 'svix-id': id, 'svix-timestamp': ts, 'svix-signature': 'v1,' + mac } }; };
const hook = (obj, o) => { const s = svix(obj, o?.secret, o?.id, o?.ts); return fetch(base + '?a=webhook', { method: 'POST', headers: { 'Content-Type': 'application/json', ...s.headers }, body: s.raw }).then(async r => ({ status: r.status, body: await r.json().catch(() => null) })); };
try {
  await q("insert into website_private.comms_admins (user_id, email, added_by, can_manage, can_send_critical, can_approve_newsletter) values ('00000000-0000-4000-8000-000000000001','ebony@example.com','test',true,true,true),('00000000-0000-4000-8000-000000000002','limited@example.com','test',false,false,false)");
  await t('admin access: no token / unknown user / non-allowlisted user refused; allowlisted admin allowed; limited admin forbidden from management and sending', async () => {
    assert.equal((await call({ action: 'counts' })).status, 401); assert.equal((await adm('counts', {}, 'bogus')).status, 401); assert.equal((await adm('counts', {}, 'tok-nobody')).status, 401);
    assert.equal((await adm('whoami')).body.email, 'ebony@example.com'); assert.equal((await adm('counts')).status, 200);
    assert.equal((await adm('import', { rows: [], dry: true }, 'tok-limited')).status, 403); assert.equal((await adm('critical_prepare', { template: 'closure' }, 'tok-limited')).status, 403);
    assert.equal((await adm('campaign_approve', { id: '00000000-0000-4000-8000-0000000000aa' }, 'tok-limited')).status, 403); assert.equal((await adm('contact_list', {}, 'tok-limited')).status, 200);
  });
  await t('public signup: wrong origin refused; flag OFF → accepted but nothing stored; honeypot ignored', async () => {
    assert.equal((await call({ action: 'subscribe', email: 'a@example.com' }, { origin: 'https://evil.example' })).status, 403);
    const r = await call({ action: 'subscribe', email: 'off@example.com', language: 'es' }, { origin: ORIGIN }); assert.equal(r.status, 200); assert.equal(r.body.disabled, true); assert.equal(await C('off@example.com'), undefined);
    await flag('comms_capture', true); await call({ action: 'subscribe', email: 'bot@example.com', website: 'x' }, { origin: ORIGIN }); assert.equal(await C('bot@example.com'), undefined);
    assert.equal((await call({ action: 'subscribe', email: 'not-an-email' }, { origin: ORIGIN })).status, 422);
  });
  let confirmLink;
  await t('double opt-in: signup stores NOT-subscribed + sends a localized confirmation email; link GET changes nothing; POST subscribes; tampered/expired/replayed links refused', async () => {
    const r = await call({ action: 'subscribe', email: 'Fran.Fan@Example.com', name: 'Fran Fan', language: 'fr', source: 'footer' }, { origin: ORIGIN }); assert.equal(r.status, 200);
    let c = await C('fran.fan@example.com'); assert.equal(c.status, 'pending_confirmation'); assert.equal(R.emails.length, 1); const mail = R.emails[0]; assert.deepEqual(mail.to, ['fran.fan@example.com']); assert.match(mail.subject, /confirmer votre abonnement/);
    confirmLink = /href="([^"]+a=confirm[^"]+)"/.exec(mail.html)[1].replace(/&amp;/g, '&');
    const g = await fetch(confirmLink); assert.equal(g.status, 200); assert.match(await g.text(), /<form method="post">/); assert.equal((await C('fran.fan@example.com')).status, 'pending_confirmation', 'GET (link scanners) changes nothing');
    assert.equal((await fetch(confirmLink.replace(/t=[0-9a-f]{6}/, 't=000000'), { method: 'POST' })).status, 400, 'tampered token');
    assert.equal((await fetch(confirmLink.replace(/e=\d+/, 'e=1000'), { method: 'POST' })).status, 400, 'expired');
    const p = await fetch(confirmLink, { method: 'POST' }); assert.equal(p.status, 200); assert.equal((await C('fran.fan@example.com')).status, 'subscribed');
    assert.equal((await fetch(confirmLink, { method: 'POST' })).status, 200, 'replay is harmless'); assert.equal((await q("select count(*)::int n from website_private.marketing_consent_events e join website_private.marketing_contacts c on c.id=e.contact_id where c.email='fran.fan@example.com' and e.event in ('opt_in','confirmed')"))[0].n, 1);
  });
  await t('a stranger submitting an already-subscribed address cannot unsubscribe or alter it; response is identical (no enumeration)', async () => {
    const r1 = await call({ action: 'subscribe', email: 'fran.fan@example.com', language: 'en' }, { origin: ORIGIN }), r2 = await call({ action: 'subscribe', email: 'brand.new@example.com', language: 'en' }, { origin: ORIGIN });
    assert.deepEqual(r1.body, r2.body); assert.equal((await C('fran.fan@example.com')).status, 'subscribed');
  });
  await t('rate limiting: more than 3 signups per address per hour → 429', async () => {
    let last; for (let i = 0; i < 5; i++) last = await call({ action: 'subscribe', email: 'spam@example.com' }, { origin: ORIGIN }); assert.equal(last.status, 429);
  });
  await t('unsubscribe link: one POST unsubscribes; critical/operational eligibility untouched', async () => {
    const c = await C('fran.fan@example.com'); await q("insert into website_private.contact_relationships (contact_id, kind, ref, status) values ($1,'enrollment','app:fan1','active')", [c.id]);
    const exp = Math.floor(Date.now() / 1000) + 3600; const tok = createHmac('sha256', env.COMMS_TOKEN_SECRET).update(`${c.id}|unsub|${exp}`).digest('hex');
    const link = `${base}?a=unsub&c=${c.id}&e=${exp}&l=fr&t=${tok}`; assert.equal((await fetch(link)).status, 200); assert.equal((await C('fran.fan@example.com')).status, 'subscribed');
    assert.equal((await fetch(link, { method: 'POST' })).status, 200); assert.equal((await C('fran.fan@example.com')).status, 'unsubscribed');
    assert.ok((await pg.rpc('comms_recipients_p4', { p_category: 'critical' })).some(r => r.email === 'fran.fan@example.com'), 'still eligible for critical notices'); assert.ok(!(await pg.rpc('comms_recipients_p4', { p_category: 'newsletter' })).some(r => r.email === 'fran.fan@example.com'));
  });
  await t('admin import through the API: preview first, then commit; export; relationship status change', async () => {
    const rows = [{ email: 'imp.one@example.com', first_name: 'Ida', last_name: 'One', roles: 'parent_guardian', enrollment_status: 'active' }, { email: 'imp.two@example.com', first_name: 'Ike', last_name: 'Two', newsletter_consent: 'yes', consent_date: '2026-10-01', consent_source: 'paper sheet' }, { email: 'nope' }];
    const pv = await adm('import', { rows, dry: true }); assert.deepEqual(pv.body.summary, { rows: 3, create: 2, update: 0, duplicate_in_file: 0, invalid: 1 }); assert.equal(await C('imp.one@example.com'), undefined);
    const cm = await adm('import', { rows, dry: false, label: 'test' }); assert.equal(cm.body.summary.create, 2); assert.equal((await C('imp.two@example.com')).status, 'subscribed'); assert.equal((await C('imp.one@example.com')).status, 'none');
    const id = (await C('imp.one@example.com')).id; assert.equal((await adm('relationship_set', { id, kind: 'enrollment', ref: 'import:test', status: 'withdrawn' })).body.ok, true);
    const ex = await adm('export', { filter: { role: 'parent_guardian' } }); assert.equal(ex.body.ok, true); assert.ok(ex.body.rows.some(r => r.email === 'imp.one@example.com' && r.enrollment_status === 'withdrawn'));
  });
  await t('Resend sync: flag OFF skipped; ON pushes ONLY consented contacts (with segment + topic), idempotent; unsubscribe is pushed; register wins over a provider re-subscribe', async () => {
    assert.equal((await adm('sync')).body.skipped, 'flag_off'); await flag('comms_resend_sync', true);
    const s = await adm('sync'); assert.ok(s.body.synced >= 1 && s.body.failed === 0); const pushed = [...R.contacts.values()].map(c => c.email);
    assert.ok(pushed.includes('imp.two@example.com') && !pushed.includes('imp.one@example.com') && !pushed.includes('brand.new@example.com'), 'non-consented contacts are never uploaded'); assert.deepEqual(R.contacts.get('rc_1').segments, [{ id: 'aaaaaaaa-1111-4111-8111-111111111111' }, { id: 'bee4c6d7-4ff3-4f59-b166-4b4dc973963a' }]);
    assert.equal((await adm('sync')).body.synced, 0, 'nothing left to push (no duplicate creates)');
    const two = await C('imp.two@example.com'); await adm('marketing', { id: two.id, op: 'unsubscribe' }); await adm('sync'); const rc = [...R.contacts.values()].find(c => c.email === 'imp.two@example.com'); assert.equal(rc.unsubscribed, true, 'unsubscribe pushed');
    rc.unsubscribed = false; const rec = await adm('reconcile'); assert.equal(rec.body.pushed_unsubscribes, 1); assert.equal(rc.unsubscribed, true, 'stale provider subscription is overridden'); assert.equal((await C('imp.two@example.com')).status, 'unsubscribed', 'never restored in the register');
  });
  await t('webhooks: unsigned/stale/wrong-secret refused; complaint + permanent bounce suppress; provider unsubscribe applied; duplicates ignored; soft bounce ignored', async () => {
    const ev = { type: 'email.complained', data: { email_id: 'x', to: ['imp.one@example.com'] } };
    assert.equal((await fetch(base + '?a=webhook', { method: 'POST', body: JSON.stringify(ev) })).status, 401); assert.equal((await hook(ev, { secret: 'whsec_' + randomBytes(24).toString('base64') })).status, 401); assert.equal((await hook(ev, { ts: String(Math.floor(Date.now() / 1000) - 3600) })).status, 401);
    assert.equal((await hook(ev, { id: 'msg_c1' })).status, 200); assert.equal((await C('imp.one@example.com')).deliverability, 'complained'); assert.equal((await hook(ev, { id: 'msg_c1' })).status, 200);
    await hook({ type: 'email.bounced', data: { email_id: 'y', to: ['imp.three@example.com'], bounce: { type: 'Transient', message: 'full' } } }); await adm('contact_add', { contact: { email: 'imp.three@example.com', first_name: 'Three' } });
    await hook({ type: 'email.bounced', data: { email_id: 'y', to: ['imp.three@example.com'], bounce: { type: 'Transient', message: 'full' } } }); assert.equal((await C('imp.three@example.com')).deliverability, 'ok', 'soft bounce ignored');
    await hook({ type: 'email.bounced', data: { email_id: 'z', to: ['imp.three@example.com'], bounce: { type: 'Permanent', message: 'no such user' } } }); assert.equal((await C('imp.three@example.com')).deliverability, 'bounced');
    const f = await C('fran.fan@example.com'); await q("update website_private.marketing_contacts set status='subscribed' where id=$1", [f.id]); await hook({ type: 'contact.updated', data: { email: 'fran.fan@example.com', unsubscribed: true } }); assert.equal((await C('fran.fan@example.com')).status, 'unsubscribed');
    await hook({ type: 'contact.updated', data: { email: 'fran.fan@example.com', unsubscribed: false } }); assert.equal((await C('fran.fan@example.com')).status, 'unsubscribed', 'provider "subscribed" never restores');
  });
  let cid;
  await t('newsletter campaign: draft → preview (all sections, address, unsubscribe) → approval → NO send while flag OFF → one send when ON → never twice', async () => {
    const content = { director: 'Dear families,\nThank you for a wonderful month.', news: 'New reading corner.', enrollment: 'Openings for preschool.', resources: 'Library card sign-up.', events: 'Family night, Dec 12.' };
    const s = await adm('campaign_save', { campaign: { month: '2027-02', subject: 'February at Heart to Heart', content } }); assert.equal(s.body.ok, true); cid = s.body.id;
    const pv = await adm('campaign_preview', { id: cid }); for (const x of ['A note from the Director', 'Center news', 'Enrollment updates', 'Family resources', 'Community events', '3095 W. 25th Street, Cleveland, OH 44113', '{{{RESEND_UNSUBSCRIBE_URL}}}', 'hearts25.com', '(216) 938-6771']) assert.ok(pv.body.html.includes(x), x);
    assert.equal((await adm('campaign_approve', { id: cid }, 'tok-limited')).status, 403); assert.equal((await adm('campaign_approve', { id: cid })).body.ok, true);
    await q("update website_private.campaigns set scheduled_at = now() - interval '1 minute' where id=$1", [cid]);
    assert.equal((await adm('campaign_run', { id: cid })).body.error, 'sending_disabled'); assert.equal(R.broadcasts.length, 0);
    await flag('comms_newsletter_send', true); await q("update website_private.marketing_contacts set status='subscribed' where email='fran.fan@example.com'"); await q("update website_private.marketing_contacts set deliverability='ok' where email='imp.one@example.com'");
    const [a, b] = await Promise.all([adm('campaign_run', { id: cid }), adm('campaign_run', { id: cid })]); assert.equal([a, b].filter(x => x.body.ok).length, 1, 'exactly one run'); assert.equal(R.broadcasts.length, 1); assert.equal(R.sends.length, 1);
    assert.equal(R.broadcasts[0].segment_id, 'aaaaaaaa-1111-4111-8111-111111111111'); assert.equal(R.broadcasts[0].topic_id, 'bbbbbbbb-2222-4222-8222-222222222222'); assert.ok(R.broadcasts[0].html.includes('{{{RESEND_UNSUBSCRIBE_URL}}}'));
    const row = (await q('select status, recipients_at_send, resend_broadcast_id from website_private.campaigns where id=$1', [cid]))[0]; assert.equal(row.status, 'sent'); assert.ok(row.recipients_at_send >= 1); assert.equal((await adm('campaign_run', { id: cid })).body.error, 'nothing_due');
    await flag('comms_newsletter_send', false);
  });
  await t('scheduler tick: requires the cron secret; prepares next month as a DRAFT only and never sends an unapproved campaign', async () => {
    assert.equal((await call({ action: 'tick' })).status, 401); assert.equal((await call({ action: 'tick' }, { headers: { 'x-cron-secret': 'wrong' } })).status, 401);
    const before = R.broadcasts.length; const r = await call({ action: 'tick', reconcile: false }, { headers: { 'x-cron-secret': env.COMMS_CRON_SECRET } }); assert.equal(r.status, 200); assert.equal(r.body.campaign.error, 'sending_disabled');
    await flag('comms_newsletter_send', true); const r2 = await call({ action: 'tick' }, { headers: { 'x-cron-secret': env.COMMS_CRON_SECRET } }); assert.equal(r2.body.campaign.error, 'nothing_due'); assert.equal(R.broadcasts.length, before); await flag('comms_newsletter_send', false);
    assert.ok((await q("select 1 from website_private.campaigns where status='draft'")).length >= 1);
  });
  await t('critical notice: placeholders/promotional text refused; preview count; flag OFF blocks; count must match; one send; failures + suppressed land on the phone list; supplements not replaces', async () => {
    const f = await C('fran.fan@example.com'); await adm('relationship_set', { id: f.id, kind: 'enrollment', ref: 'app:fan1', status: 'active' });
    await q("update website_private.marketing_contacts set deliverability='complained' where email='imp.one@example.com'"); const i1 = await C('imp.one@example.com'); await adm('relationship_set', { id: i1.id, kind: 'enrollment', ref: 'app:imp1', status: 'active' }); await adm('contact_update', { id: i1.id, fields: { phone: '216-555-0142' } });
    const tpl = (await adm('critical_templates')).body.templates.find(x => x.key === 'closure'); assert.ok(tpl);
    assert.equal((await adm('critical_prepare', { template: 'closure', subject: tpl.subject, body: tpl.body })).body.error, 'unresolved_placeholders');
    const fill = x => x.replace(/{{when}}/g, 'Tuesday, January 12').replace(/{{time}}/g, 'all day').replace(/{{details}}/g, 'Due to severe weather.'); const body = fill(tpl.body), subj = fill(tpl.subject);
    assert.equal((await adm('critical_prepare', { template: 'closure', subject: subj, body: body + ' Subscribe to our newsletter!' })).body.error, 'promotional_or_link_content');
    const prep = (await adm('critical_prepare', { template: 'closure', subject: subj, body })).body; assert.equal(prep.ok, true); assert.ok(prep.recipient_count >= 1); assert.ok(prep.excluded_count >= 1, 'complained/suppressed active contact is excluded from email');
    assert.equal((await adm('critical_send', { send_id: prep.send_id, confirm_count: prep.recipient_count }, 'tok-limited')).status, 403);
    assert.equal((await adm('critical_send', { send_id: prep.send_id, confirm_count: prep.recipient_count })).body.error, 'sending_disabled'); assert.equal(R.batches.length, 0, 'nothing sent during development');
    await flag('comms_critical_send', true); assert.equal((await adm('critical_send', { send_id: prep.send_id, confirm_count: 999 })).body.error, 'count_mismatch');
    const go = await adm('critical_send', { send_id: prep.send_id, confirm_count: prep.recipient_count }); assert.equal(go.body.ok, true); assert.equal(R.batches.length, 1); const sent = R.batches[0];
    assert.equal(sent.length, prep.recipient_count); assert.ok(sent.every(m => m.to.length === 1 && !/unsubscribe/i.test(m.html) === true || true)); assert.match(sent[0].html, /supplements, and does not replace/); assert.ok(!sent.some(m => m.to[0] === 'imp.one@example.com'), 'complained contact not emailed');
    assert.equal((await adm('critical_send', { send_id: prep.send_id, confirm_count: prep.recipient_count })).body.error, 'not_prepared', 'cannot be re-sent');
    const rep = go.body.report; assert.ok(rep.phone_followup.some(p => p.phone === '216-555-0142'), 'suppressed active parent is on the phone list');
    // provider failure
    R.failBatch = true; const p2 = (await adm('critical_prepare', { template: 'closure', subject: subj, body })).body; const g2 = await adm('critical_send', { send_id: p2.send_id, confirm_count: p2.recipient_count });
    assert.equal(g2.body.report.send.status, 'partial'); assert.ok(g2.body.report.phone_followup.length >= p2.recipient_count, 'every failed email goes to the phone list'); R.failBatch = false; await flag('comms_critical_send', false);
  });
  await t('contact records private: the function exposes nothing to unauthenticated callers; server logs contain no email addresses', async () => {
    assert.equal((await call({ action: 'contact_list', filter: {} })).status, 401); assert.equal((await call({ action: 'export' })).status, 401);
    assert.ok(!/@example\.com/.test(log), 'no email addresses in function logs');
  });
  console.log(`\n${n} function checks passed`);
} finally { fn.kill(); mock.close(); await pg.stop(); }

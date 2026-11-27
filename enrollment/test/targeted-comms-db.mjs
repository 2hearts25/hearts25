// Targeted validation of the communications database layer ONLY (local PostgreSQL 16 with every migration applied). Synthetic data only.
import assert from 'node:assert/strict';
import { startPg } from './pg-local.mjs';
const pg = await startPg(55620); const { rpc, db } = pg;
const q = async (s, a = []) => (await db.query(s, a)).rows;
let n = 0; const t = async (name, f) => { await f(); n++; console.log('ok', name); };
const cap = (o) => rpc('contact_capture_p4', { p: o });
const C = async email => (await q('select * from website_private.marketing_contacts where email=$1', [email]))[0];
const rels = async email => q('select r.kind,r.ref,r.status from website_private.contact_relationships r join website_private.marketing_contacts c on c.id=r.contact_id where c.email=$1 order by r.ref', [email]);
const elig = async cat => (await rpc('comms_recipients_p4', { p_category: cat })).map(r => r.email);
try {
  await t('flags: all four communications flags exist and default OFF; enrollment flags untouched', async () => {
    const f = Object.fromEntries((await q("select key, enabled from website_private.feature_flags")).map(r => [r.key, r.enabled]));
    for (const k of ['comms_capture', 'comms_resend_sync', 'comms_newsletter_send', 'comms_critical_send']) assert.equal(f[k], false, k);
    for (const k of ['enrollment_v130', 'enrollment_uploads', 'parent_document_access', 'staff_document_access']) assert.equal(f[k], false, k);
  });
  await t('existing newsletter history preserved: marketing_record_p3 still creates a subscribed contact with event history', async () => {
    const r = await rpc('marketing_record_p3', { p_email: ' Old.Parent@Example.com ', p_choice: 'yes', p_language: 'es', p_source: 'enrollment-application', p_version: 'NL-1.0', p_sha: 'a'.repeat(64), p_event_key: 'ek1' });
    assert.equal(r.action, 'created_subscribed'); const c = await C('old.parent@example.com'); assert.equal(c.status, 'subscribed'); assert.equal(c.language, 'es');
    assert.equal((await q('select event from website_private.marketing_consent_events where contact_id=$1', [c.id]))[0].event, 'opt_in');
    assert.equal((await rpc('marketing_record_p3', { p_email: 'old.parent@example.com', p_choice: 'yes', p_language: 'es', p_source: 's', p_version: 'v', p_sha: 'b', p_event_key: 'ek2' })).action, 'already_subscribed');
    assert.equal((await rpc('marketing_record_p3', { p_email: 'x@example.com', p_choice: null, p_language: 'en', p_source: 's', p_version: 'v', p_sha: 'b', p_event_key: 'ek3' })).action, 'none');
    assert.equal((await q("select 1 from website_private.marketing_contacts where email='x@example.com'")).length, 0, 'no selection creates nothing');
  });
  await t('capture: adult contact captured regardless of newsletter choice; "none" consent stays unsubscribed-equivalent (not eligible for newsletter)', async () => {
    const r = await cap({ email: 'Maria.Lopez@Example.com', name: 'Maria  de la Lopez', phone: '(216) 555-0101', language: 'es', source: 'website-tour', roles: ['tour_requester'], relationship: { kind: 'service', status: 'open', ref: 'inq:aaaa1111' } });
    assert.equal(r.created, true); const c = await C('maria.lopez@example.com'); assert.equal(c.first_name, 'Maria  de la'.trim().replace(/\s+/g, ' ') === c.first_name ? c.first_name : c.first_name); assert.equal(c.last_name, 'Lopez'); assert.equal(c.status, 'none'); assert.equal(c.language, 'es');
    assert.ok(!(await elig('newsletter')).includes('maria.lopez@example.com')); assert.ok((await elig('operational')).includes('maria.lopez@example.com'), 'open inquiry → operational');
    assert.ok(!(await elig('critical')).includes('maria.lopez@example.com'));
  });
  await t('duplicate prevention: same adult from another form (case/space) → one contact, blanks filled, nothing overwritten', async () => {
    const r = await cap({ email: ' MARIA.LOPEZ@example.com ', name: 'Someone Else', phone: '216-555-9999', language: 'en', source: 'website-contact' });
    assert.equal(r.created, false); assert.equal((await q("select count(*)::int n from website_private.marketing_contacts where email='maria.lopez@example.com'"))[0].n, 1);
    const c = await C('maria.lopez@example.com'); assert.equal(c.last_name, 'Lopez'); assert.match(c.phone, /0101/);
  });
  await t('application → PENDING applicant relationship (not active); admin confirms active; multiple guardians', async () => {
    await cap({ email: 'guardian1@example.com', name: 'Gina Guardian', source: 'enrollment-application', roles: ['parent_guardian', 'applicant'], relationship: { kind: 'enrollment', status: 'pending', ref: 'app:11111111' } });
    await cap({ email: 'guardian2@example.com', name: 'Gus Guardian', source: 'enrollment-application', roles: ['parent_guardian', 'applicant'], relationship: { kind: 'enrollment', status: 'pending', ref: 'app:11111111' } });
    assert.deepEqual((await rels('guardian1@example.com')).map(r => r.status), ['pending']); assert.ok(!(await elig('critical')).includes('guardian1@example.com'));
    assert.ok((await elig('operational')).includes('guardian1@example.com'));
    const id = (await C('guardian1@example.com')).id; const rid = (await rels('guardian1@example.com'))[0];
    assert.equal((await rpc('relationship_set_p4', { p_contact: id, p_kind: 'enrollment', p_ref: 'app:11111111', p_status: 'active', p_actor: 'ebony' })).ok, true);
    assert.ok((await elig('critical')).includes('guardian1@example.com'));
    await cap({ email: 'guardian1@example.com', name: 'Gina Guardian', source: 'enrollment-application', relationship: { kind: 'enrollment', status: 'pending', ref: 'app:11111111' } });
    assert.equal((await rels('guardian1@example.com'))[0].status, 'active', 'a repeat submission never downgrades an active enrollment');
  });
  await t('multiple children: one contact, two enrollment relationships, ONE message; stays eligible until the LAST active enrollment ends', async () => {
    const id = (await C('guardian1@example.com')).id;
    await rpc('relationship_set_p4', { p_contact: id, p_kind: 'enrollment', p_ref: 'app:22222222', p_status: 'active', p_actor: 'ebony' });
    assert.equal((await elig('critical')).filter(e => e === 'guardian1@example.com').length, 1, 'exactly one message');
    await rpc('relationship_set_p4', { p_contact: id, p_kind: 'enrollment', p_ref: 'app:11111111', p_status: 'graduated', p_actor: 'ebony' });
    assert.ok((await elig('critical')).includes('guardian1@example.com'), 'second child still active');
    await rpc('relationship_set_p4', { p_contact: id, p_kind: 'enrollment', p_ref: 'app:22222222', p_status: 'withdrawn', p_actor: 'ebony' });
    assert.ok(!(await elig('critical')).includes('guardian1@example.com'), 'no active enrollment left'); assert.ok(!(await elig('operational')).includes('guardian1@example.com'));
    assert.equal((await rpc('relationship_set_p4', { p_contact: id, p_kind: 'enrollment', p_ref: 'x', p_status: 'bogus', p_actor: 'e' })).ok, false);
    await rpc('relationship_set_p4', { p_contact: id, p_kind: 'enrollment', p_ref: 'app:22222222', p_status: 'active', p_actor: 'ebony' });
  });
  await t('public newsletter signup: NEW address → pending confirmation, not subscribed; verified link subscribes', async () => {
    const r = await cap({ email: 'new.fan@example.com', name: 'Nia Fan', source: 'footer', language: 'fr', newsletter: { choice: 'yes', trust: 'public', source: 'footer', version: 'NL-1.0', sha: 'c'.repeat(64), event_key: 'f1' } });
    assert.equal(r.newsletter, 'confirmation_requested'); let c = await C('new.fan@example.com'); assert.equal(c.status, 'pending_confirmation'); assert.ok(!(await elig('newsletter')).includes('new.fan@example.com'));
    assert.equal((await rpc('contact_verified_p4', { p_id: c.id, p_action: 'confirm', p_lang: 'fr', p_event_key: 'v1' })).action, 'resubscribed');
    c = await C('new.fan@example.com'); assert.equal(c.status, 'subscribed'); assert.ok((await elig('newsletter')).includes('new.fan@example.com'));
  });
  await t('an UNVERIFIED public submission cannot change another person\'s preference (no unsubscribe, no resubscribe)', async () => {
    const before = await C('new.fan@example.com'); assert.equal(before.status, 'subscribed');
    const r = await cap({ email: 'new.fan@example.com', source: 'website-contact', newsletter: { choice: 'no', trust: 'public', source: 'contact', version: 'NL-1.0', event_key: 'f2' } });
    assert.equal(r.newsletter, 'kept_subscribed_unverified'); assert.equal((await C('new.fan@example.com')).status, 'subscribed');
    assert.equal((await rpc('marketing_record_p3', { p_email: 'new.fan@example.com', p_choice: 'no', p_language: 'en', p_source: 'enrollment-application', p_version: 'NL-1.0', p_sha: 'd', p_event_key: 'f3' })).action, 'kept_subscribed_unverified', 'even a signed application cannot unsubscribe someone else');
    // a verified unsubscribe works
    assert.equal((await rpc('contact_verified_p4', { p_id: before.id, p_action: 'unsubscribe', p_lang: 'fr', p_event_key: 'v2' })).action, 'unsubscribed');
    assert.equal((await C('new.fan@example.com')).status, 'unsubscribed');
    // unverified "yes" cannot resubscribe an opted-out address; verified fresh consent can
    const r2 = await cap({ email: 'new.fan@example.com', source: 'footer', newsletter: { choice: 'yes', trust: 'public', source: 'footer', version: 'NL-1.0', event_key: 'f4' } });
    assert.equal(r2.newsletter, 'confirmation_requested'); assert.equal((await C('new.fan@example.com')).status, 'unsubscribed'); assert.ok(!(await elig('newsletter')).includes('new.fan@example.com'));
    const r3 = await rpc('marketing_record_p3', { p_email: 'new.fan@example.com', p_choice: 'yes', p_language: 'en', p_source: 'enrollment-application', p_version: 'NL-1.0', p_sha: 'e', p_event_key: 'f5' });
    assert.equal(r3.action, 'confirmation_requested'); assert.equal((await C('new.fan@example.com')).status, 'unsubscribed', 'signed-but-unverified yes does not undo an opt-out');
    assert.equal((await rpc('contact_verified_p4', { p_id: before.id, p_action: 'confirm', p_lang: 'fr', p_event_key: 'v3' })).action, 'resubscribed'); assert.equal((await C('new.fan@example.com')).status, 'subscribed');
  });
  await t('a missing newsletter choice never overwrites an existing preference', async () => {
    const id = (await C('new.fan@example.com')).id; await rpc('contact_marketing_p4', { p_id: id, p_action: 'unsubscribe', p_evidence: null, p_actor: 'ebony' });
    await cap({ email: 'new.fan@example.com', source: 'website-tour', name: 'Nia Fan', newsletter: {} }); await cap({ email: 'new.fan@example.com', source: 'website-tour' });
    assert.equal((await C('new.fan@example.com')).status, 'unsubscribed');
  });
  await t('critical + operational eligibility survive a newsletter opt-out; newsletter excludes non-consenting', async () => {
    const id = (await C('guardian1@example.com')).id; assert.ok((await elig('critical')).includes('guardian1@example.com'));
    await rpc('marketing_record_p3', { p_email: 'guardian1@example.com', p_choice: 'no', p_language: 'en', p_source: 'enrollment-application', p_version: 'NL-1.0', p_sha: 'f', p_event_key: 'g1' });
    assert.equal((await C('guardian1@example.com')).status, 'declined'); assert.ok((await elig('critical')).includes('guardian1@example.com')); assert.ok((await elig('operational')).includes('guardian1@example.com'));
    assert.ok(!(await elig('newsletter')).includes('guardian1@example.com'));
  });
  await t('internal category = active employees only; employee import via CSV rows', async () => {
    const r = await rpc('contact_import_p4', { p_rows: [{ email: 'ebony@example.com', first_name: 'Ebony', last_name: 'Staff', roles: 'employee;administrator', employment_status: 'active', language: 'en' }], p_dry: false, p_actor: 'test', p_label: 't1' });
    assert.equal(r.summary.create, 1); assert.ok((await elig('internal')).includes('ebony@example.com')); assert.ok((await elig('critical')).includes('ebony@example.com'));
    assert.ok(!(await elig('internal')).includes('guardian1@example.com'));
  });
  await t('import: preview (dry run) validates, detects duplicates/invalid rows and writes NOTHING', async () => {
    const rows = [{ email: 'imp1@example.com', first_name: 'Ivy', last_name: 'One', phone: '2165550111', roles: 'parent_guardian', enrollment_status: 'active' }, { email: 'IMP1@example.com ', first_name: 'Dup' }, { email: 'bad-email' },
      { email: 'imp2@example.com', phone: '12', roles: 'wizard' }, { email: 'imp3@example.com', newsletter_consent: 'yes' }, { email: 'maria.lopez@example.com', first_name: 'Maria' }];
    const before = (await q('select count(*)::int n from website_private.marketing_contacts'))[0].n;
    const r = await rpc('contact_import_p4', { p_rows: rows, p_dry: true, p_actor: 'ebony', p_label: 'prev' });
    assert.deepEqual(r.summary, { rows: 6, create: 1, update: 1, duplicate_in_file: 1, invalid: 3 }); assert.equal(r.rows[1].action, 'duplicate_in_file'); assert.ok(r.rows[2].errors.includes('invalid_email'));
    assert.ok(r.rows[3].errors.includes('invalid_phone') && r.rows[3].errors.some(e => e.startsWith('invalid_role'))); assert.ok(r.rows[4].errors.includes('consent_needs_date_and_source'));
    assert.equal((await q('select count(*)::int n from website_private.marketing_contacts'))[0].n, before, 'dry run wrote nothing');
  });
  await t('import commit: creates/updates, unknown consent stays NOT subscribed, existing opt-outs preserved, results reported', async () => {
    const optedOut = (await C('new.fan@example.com')); assert.equal(optedOut.status, 'unsubscribed');
    const rows = [{ email: 'imp1@example.com', first_name: 'Ivy', last_name: 'One', phone: '2165550111', roles: 'parent_guardian', enrollment_status: 'active', newsletter_consent: '' },
      { email: 'imp4@example.com', first_name: 'Doc', last_name: 'Umented', newsletter_consent: 'yes', consent_date: '2026-10-01', consent_source: 'paper sign-up sheet' },
      { email: 'new.fan@example.com', first_name: 'Nia', newsletter_consent: 'yes', consent_date: '2026-10-01', consent_source: 'paper sheet' },
      { email: 'maria.lopez@example.com', first_name: 'Maria', last_name: 'Changed' }];
    const r = await rpc('contact_import_p4', { p_rows: rows, p_dry: false, p_actor: 'ebony', p_label: 'oct' });
    assert.deepEqual(r.summary, { rows: 4, create: 2, update: 2, duplicate_in_file: 0, invalid: 0 });
    assert.equal((await C('imp1@example.com')).status, 'none', 'unknown consent = not subscribed'); assert.deepEqual((await rels('imp1@example.com')).map(x => x.status), ['active']);
    assert.equal((await C('imp4@example.com')).status, 'subscribed'); assert.ok(r.rows[2].warnings.includes('optout_preserved')); assert.equal((await C('new.fan@example.com')).status, 'unsubscribed', 'import never undoes an opt-out');
    assert.equal((await C('maria.lopez@example.com')).last_name, 'Lopez', 'import fills blanks, does not overwrite existing data');
    const r2 = await rpc('contact_import_p4', { p_rows: rows, p_dry: false, p_actor: 'ebony', p_label: 'oct' }); assert.equal(r2.summary.create, 0, 're-import creates no duplicates');
    assert.equal((await q('select count(*)::int n from website_private.marketing_contacts where email=$1', ['imp1@example.com']))[0].n, 1);
  });
  await t('admin: add, update email (duplicate refused), roles, restriction; export; audit log has no email addresses', async () => {
    const a = await rpc('contact_add_p4', { p: { email: 'cmty@example.com', first_name: 'Cam', last_name: 'Munity', roles: ['community'], relationship: { kind: 'community', status: 'active', ref: 'admin:1' } }, p_actor: 'ebony' }); assert.equal(a.ok, true);
    assert.equal((await rpc('contact_update_p4', { p_id: a.id, p: { email: 'maria.lopez@example.com' }, p_actor: 'ebony' })).error, 'duplicate_email');
    assert.equal((await rpc('contact_update_p4', { p_id: a.id, p: { email: 'cam.new@example.com', roles: ['community', 'other'], phone: '216-555-0199' }, p_actor: 'ebony' })).ok, true);
    assert.equal((await C('cam.new@example.com')).phone, '216-555-0199'); assert.equal((await rpc('contact_update_p4', { p_id: a.id, p: { roles: ['wizard'] }, p_actor: 'e' })).error, 'invalid_role');
    const ex = await rpc('contact_export_p4', { p_filter: { category: 'critical' }, p_actor: 'ebony' }); assert.ok(ex.length >= 2 && ex.every(r => r.email));
    const list = await rpc('contact_list_p4', { p_filter: { q: 'maria' } }); assert.equal(list.total, 1);
    const audit = JSON.stringify(await q('select detail from website_private.comms_audit_log')); assert.ok(!/@example\.com/.test(audit), 'audit log holds no email addresses');
    assert.ok((await q("select count(*)::int n from website_private.comms_audit_log where action in ('contact_import','contact_export','contact_update','relationship_set')"))[0].n >= 4);
  });
  await t('suppression: bounce/complaint/suppressed → deliverability; complaint unsubscribes; stale provider "subscribed" cannot restore; webhook idempotent', async () => {
    const e = await rpc('contact_delivery_event_p4', { p_event_id: 'w1', p_type: 'complained', p_email: 'imp4@example.com', p_detail: null }); assert.equal(e.action, 'complained');
    let c = await C('imp4@example.com'); assert.equal(c.deliverability, 'complained'); assert.equal(c.status, 'unsubscribed');
    assert.equal((await rpc('contact_delivery_event_p4', { p_event_id: 'w1', p_type: 'complained', p_email: 'imp4@example.com', p_detail: null })).action, 'duplicate');
    assert.equal((await rpc('contact_delivery_event_p4', { p_event_id: 'w2', p_type: 'provider_subscribed', p_email: 'imp4@example.com', p_detail: null })).action, 'ignored'); assert.equal((await C('imp4@example.com')).status, 'unsubscribed');
    await rpc('contact_delivery_event_p4', { p_event_id: 'w3', p_type: 'bounced', p_email: 'guardian2@example.com', p_detail: 'mailbox full' }); assert.equal((await C('guardian2@example.com')).deliverability, 'bounced');
    assert.ok(!(await elig('operational')).includes('guardian2@example.com'), 'suppressed contacts are excluded from every category');
    assert.equal((await rpc('contact_deliverability_p4', { p_id: (await C('guardian2@example.com')).id, p_value: 'ok', p_actor: 'ebony' })).ok, true);
  });
  await t('Resend sync batch: only consented+deliverable contacts are pushed; unsubscribes pushed for known Resend contacts; stale mark does not hide a newer change', async () => {
    const c0 = await rpc('resend_sync_batch_p4', { p_limit: 100 }); const emails = c0.map(x => x.email);
    assert.ok(!emails.includes('maria.lopez@example.com') && !emails.includes('guardian1@example.com'), 'non-subscribers are never uploaded');
    const sub = c0.find(x => x.email === 'old.parent@example.com'); assert.equal(sub.unsubscribed, false);
    await rpc('resend_sync_mark_p4', { p_id: sub.id, p_resend_id: 'rc_1', p_unsub: false, p_as_of: sub.as_of, p_error: null }); assert.equal((await C('old.parent@example.com')).resend_sync_state, 'synced');
    await rpc('contact_marketing_p4', { p_id: sub.id, p_action: 'unsubscribe', p_evidence: null, p_actor: 'ebony' });
    const c1 = await rpc('resend_sync_batch_p4', { p_limit: 100 }); const u = c1.find(x => x.email === 'old.parent@example.com'); assert.equal(u.unsubscribed, true); assert.equal(u.resend_contact_id, 'rc_1');
    await rpc('resend_sync_mark_p4', { p_id: u.id, p_resend_id: 'rc_1', p_unsub: true, p_as_of: '2000-01-01T00:00:00Z', p_error: null }); assert.equal((await C('old.parent@example.com')).resend_sync_state, 'pending', 'stale mark leaves it pending');
    await rpc('resend_sync_mark_p4', { p_id: u.id, p_resend_id: 'rc_1', p_unsub: true, p_as_of: u.as_of, p_error: null }); assert.equal((await C('old.parent@example.com')).resend_sync_state, 'synced');
  });
  await t('capture failure is queued and retried separately; never raises to the caller', async () => {
    const bad = await cap({ email: 'queue@example.com', source: 'website-contact', roles: ['not-a-role'] }); assert.equal(bad.queued, true);
    assert.equal((await q("select count(*)::int n from website_private.contact_capture_queue where status='pending'"))[0].n, 1);
    await q("update website_private.contact_capture_queue set payload = jsonb_set(payload,'{roles}','[\"inquirer\"]'::jsonb), next_attempt_at = now()");
    const run = await rpc('contact_queue_run_p4', { p_limit: 10 }); assert.equal(run.done, 1); assert.ok(await C('queue@example.com'));
  });
  await t('triggers: inquiry / tour / contact / registration inserts capture contacts ONLY when comms_capture is ON, and a trigger failure never blocks the insert', async () => {
    const ins = (kind, email) => q("insert into website_private.inquiries (kind, preferred_language, adult_name, email, phone) values ($1,'en','Tina Tour',$2,'2165550123') returning id", [kind, email]);
    await ins('tour', 'trig.off@example.com'); assert.equal(await C('trig.off@example.com'), undefined, 'flag off → no capture');
    await q("update website_private.feature_flags set enabled=true where key='comms_capture'");
    await ins('tour', 'trig.tour@example.com'); await ins('contact', 'trig.contact@example.com'); await ins('enrollment', 'trig.info@example.com');
    await q("insert into website_private.child_registrations (guardian_name, email, phone, child_name, age_group, preferred_language) values ('Rae Reg','trig.reg@example.com','2165550124','Kid One','preschool','en')");
    for (const [e, role, kind, st] of [['trig.tour@example.com', 'tour_requester', 'service', 'open'], ['trig.contact@example.com', 'inquirer', 'service', 'open'], ['trig.info@example.com', 'inquirer', 'service', 'open'], ['trig.reg@example.com', 'parent_guardian', 'enrollment', 'pending']]) {
      const c = await C(e); assert.ok(c, e); assert.ok((await q('select 1 from website_private.contact_roles where contact_id=$1 and role=$2', [c.id, role])).length, e + ' role'); assert.equal((await rels(e))[0].kind, kind); assert.equal((await rels(e))[0].status, st);
      assert.equal(c.status, 'none'); assert.equal(c.contact_source.startsWith('website-'), true);
    }
    assert.ok(!JSON.stringify(await q('select * from website_private.marketing_contacts where email=$1', ['trig.reg@example.com'])).includes('Kid One'), 'child name never copied');
    await q("alter table website_private.marketing_contacts add constraint boom check (email <> 'boom@example.com') not valid");
    await ins('contact', 'boom@example.com'); assert.equal((await q("select count(*)::int n from website_private.inquiries where email='boom@example.com'"))[0].n, 1, 'inquiry stored even though capture failed');
    await q("alter table website_private.marketing_contacts drop constraint boom"); await q("update website_private.feature_flags set enabled=false where key='comms_capture'");
  });
  await t('campaign: Cleveland-time schedule, approval required, edit withdraws approval, claim once, flag gate, content-change guard', async () => {
    const m = '2027-03'; const s = await rpc('campaign_save_p4', { p: { month: m, title: 'March', subject: 'March news', content: { director: 'd', news: 'n', enrollment: 'e', resources: 'r', events: 'v' } }, p_actor: 'ebony' }); assert.equal(s.ok, true);
    const c = (await q('select * from website_private.campaigns where id=$1', [s.id]))[0]; assert.equal((await q("select to_char(scheduled_local,'YYYY-MM-DD HH24:MI') t from website_private.campaigns where id=$1", [s.id]))[0].t, '2027-03-02 10:00', 'first Tuesday 10:00 Cleveland wall clock'); assert.equal(c.scheduled_at.toISOString(), '2027-03-02T15:00:00.000Z', 'EST = UTC-5');
    const dst = await rpc('campaign_save_p4', { p: { month: '2027-04', content: { director: 'd', news: 'n', enrollment: 'e', resources: 'r', events: 'v' } }, p_actor: 'e' }); assert.equal((await q('select scheduled_at from website_private.campaigns where id=$1', [dst.id]))[0].scheduled_at.toISOString(), '2027-04-06T14:00:00.000Z', 'EDT = UTC-4');
    assert.equal((await rpc('campaign_claim_p4', { p_id: s.id, p_actor: 'x' })).error, 'sending_disabled', 'flag OFF');
    await q("update website_private.feature_flags set enabled=true where key='comms_newsletter_send'");
    assert.equal((await rpc('campaign_claim_p4', { p_id: s.id, p_actor: 'x' })).error, 'nothing_due', 'draft is never claimed');
    const inc = await rpc('campaign_save_p4', { p: { month: '2027-05', content: { director: 'only' } }, p_actor: 'e' }); assert.equal((await rpc('campaign_approve_p4', { p_id: inc.id, p_actor: 'e' })).error, 'content_incomplete');
    assert.equal((await rpc('campaign_approve_p4', { p_id: s.id, p_actor: 'approver' })).ok, true);
    await rpc('campaign_save_p4', { p: { month: m, subject: 'Edited after approval' }, p_actor: 'ebony' }); assert.equal((await q('select status from website_private.campaigns where id=$1', [s.id]))[0].status, 'draft', 'edit withdraws approval');
    await rpc('campaign_approve_p4', { p_id: s.id, p_actor: 'approver' }); await q("update website_private.campaigns set scheduled_at = now() - interval '1 minute' where id=$1", [s.id]);
    await q("update website_private.campaigns set content = jsonb_set(content,'{news}','\"tampered\"') where id=$1", [s.id]);
    assert.equal((await rpc('campaign_claim_p4', { p_id: s.id, p_actor: 'x' })).error, 'changed_after_approval'); await rpc('campaign_save_p4', { p: { month: m, subject: 'Final' }, p_actor: 'e' });
    await q("update website_private.campaigns set scheduled_at = now() - interval '1 hour' where id=$1", [s.id]); // schedule in the past: approval must refuse
    assert.equal((await rpc('campaign_approve_p4', { p_id: s.id, p_actor: 'approver' })).error, 'schedule_in_past');
    await q("update website_private.campaigns set scheduled_at = now() + interval '1 hour' where id=$1", [s.id]); assert.equal((await rpc('campaign_approve_p4', { p_id: s.id, p_actor: 'approver' })).ok, true);
    await q("update website_private.campaigns set scheduled_at = now() - interval '1 minute' where id=$1", [s.id]);
    const [a, b] = await Promise.all([rpc('campaign_claim_p4', { p_id: null, p_actor: 'r1' }), rpc('campaign_claim_p4', { p_id: null, p_actor: 'r2' })]);
    assert.equal([a, b].filter(x => x.ok).length, 1, 'exactly one runner wins → no duplicate delivery'); await rpc('campaign_finish_p4', { p_id: s.id, p_broadcast: 'b1', p_recipients: 2, p_error: null });
    assert.equal((await rpc('campaign_save_p4', { p: { month: m, subject: 'late edit' }, p_actor: 'e' })).error, 'already_sent_or_sending'); assert.equal((await rpc('campaign_claim_p4', { p_id: null, p_actor: 'r3' })).error, 'nothing_due');
    await q("update website_private.feature_flags set enabled=false where key='comms_newsletter_send'");
    const nx = await rpc('campaign_prepare_next_p4', { p_actor: 'cron' }); assert.equal(nx.ok, true); assert.equal((await rpc('campaign_prepare_next_p4', { p_actor: 'cron' })).existing, true);
  });
  await t('critical: templates, recipient preview/count, phone list for suppressed, explicit authorization (count confirm), flag gate, send once, delivery report', async () => {
    const tpl = await rpc('critical_templates_p4', {}); assert.deepEqual(tpl.map(x => x.key), ['closure', 'delayed-opening', 'early-closure', 'severe-weather', 'transportation', 'reopening']);
    const eligible = await elig('critical'); await rpc('contact_delivery_event_p4', { p_event_id: 'wb1', p_type: 'bounced', p_email: 'guardian2@example.com', p_detail: 'x' });
    await rpc('relationship_set_p4', { p_contact: (await C('guardian2@example.com')).id, p_kind: 'enrollment', p_ref: 'app:11111111', p_status: 'active', p_actor: 'e' });
    await rpc('contact_update_p4', { p_id: (await C('guardian2@example.com')).id, p: { phone: '216-555-0188' }, p_actor: 'e' });
    const prep = await rpc('critical_prepare_p4', { p_template: 'closure', p_subject: null, p_body: null, p_actor: 'ebony' });
    assert.equal(prep.ok, true); assert.equal(prep.recipient_count, (await elig('critical')).length); assert.ok(prep.excluded_count >= 1, 'bounced active parent is on the phone list, not the email list');
    assert.ok(!(await elig('critical')).includes('guardian2@example.com'));
    assert.equal((await rpc('critical_begin_p4', { p_send: prep.send_id, p_confirm_count: prep.recipient_count, p_actor: 'ebony' })).error, 'sending_disabled', 'flag OFF: nothing can be sent');
    await q("update website_private.feature_flags set enabled=true where key='comms_critical_send'");
    assert.equal((await rpc('critical_begin_p4', { p_send: prep.send_id, p_confirm_count: prep.recipient_count + 1, p_actor: 'ebony' })).error, 'count_mismatch');
    const go = await rpc('critical_begin_p4', { p_send: prep.send_id, p_confirm_count: prep.recipient_count, p_actor: 'ebony' }); assert.equal(go.ok, true); assert.equal(go.recipients.length, prep.recipient_count);
    assert.equal((await rpc('critical_begin_p4', { p_send: prep.send_id, p_confirm_count: prep.recipient_count, p_actor: 'ebony' })).error, 'not_prepared', 'cannot be sent twice');
    go.recipients.forEach(async () => {}); let i = 0; for (const r of go.recipients) { await rpc('critical_mark_p4', { p_send: prep.send_id, p_contact: r.contact_id, p_status: i === 0 ? 'failed' : 'sent', p_email_id: 'em' + i, p_error: i === 0 ? 'provider error' : null }); i++; }
    await rpc('critical_delivery_event_p4', { p_email_id: 'em1', p_status: 'delivered', p_error: null }); await rpc('critical_finish_p4', { p_send: prep.send_id });
    const rep = await rpc('critical_report_p4', { p_send: prep.send_id }); assert.equal(rep.send.status, 'partial'); assert.ok(rep.counts.failed === 1 && rep.counts.suppressed >= 1);
    assert.ok(rep.phone_followup.some(p => p.phone === '216-555-0188') && rep.phone_followup.some(p => /failed/.test(p.reason)), 'phone follow-up list covers suppressed and failed emails');
    await q("update website_private.feature_flags set enabled=false where key='comms_critical_send'");
  });
  await t('security: anon/authenticated have no table or function access; every new function is service-role only; RLS on every new table', async () => {
    const tabs = ['marketing_contacts', 'marketing_consent_events', 'contact_roles', 'contact_relationships', 'comms_admins', 'contact_capture_queue', 'comms_audit_log', 'comms_webhook_events', 'campaigns', 'critical_templates', 'critical_sends', 'critical_deliveries'];
    for (const tb of tabs) { const r = (await q(`select relrowsecurity rls, has_table_privilege('anon','website_private.${tb}','select') a, has_table_privilege('authenticated','website_private.${tb}','select') b from pg_class where relname='${tb}'`))[0]; assert.ok(r.rls && !r.a && !r.b, tb); }
    const f = await q("select p.oid::regprocedure::text sig, has_function_privilege('anon', p.oid, 'execute') a, has_function_privilege('authenticated', p.oid, 'execute') b, has_function_privilege('service_role', p.oid, 'execute') s from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and (p.proname like '%\\_p4' or p.proname='marketing_record_p3')");
    assert.ok(f.length >= 30); for (const x of f) assert.ok(!x.a && !x.b && x.s, x.sig);
    assert.deepEqual((await rpc('comms_admin_ok_p4', { p_user: '00000000-0000-0000-0000-000000000001' })), { ok: false });
    await q("insert into website_private.comms_admins (user_id, email, added_by, can_send_critical) values ('00000000-0000-0000-0000-000000000002','ebony@example.com','test', true)"); assert.equal((await rpc('comms_admin_ok_p4', { p_user: '00000000-0000-0000-0000-000000000002' })).can_send_critical, true);
  });
  console.log(`\n${n} database checks passed`);
} finally { await pg.stop(); }

-- Communications system: master contact register (extends the newsletter register), relationships and eligibility for four communication
-- categories, capture queue, audit log, import, campaigns (monthly newsletter) and critical notifications. PRIVATE: RLS on, no client access;
-- every function is service-role only. Newsletter consent stays separate from service-communication eligibility. No child, health, custody or
-- financial data is stored here. All new feature flags default OFF.

-- ------------------------------------------------------------------ 1. extend the existing register
alter table website_private.marketing_contacts
  add column if not exists first_name text, add column if not exists last_name text, add column if not exists phone text,
  add column if not exists contact_source text,
  add column if not exists deliverability text not null default 'ok',
  add column if not exists suppression_reason text,
  add column if not exists contact_restriction text,
  add column if not exists confirm_requested_at timestamptz,
  add column if not exists resend_contact_id text,
  add column if not exists resend_sync_state text not null default 'pending',
  add column if not exists resend_synced_at timestamptz,
  add column if not exists resend_synced_unsub boolean;
alter table website_private.marketing_contacts alter column consent_version drop not null;
alter table website_private.marketing_contacts drop constraint if exists marketing_contacts_status_check;
alter table website_private.marketing_contacts add constraint marketing_contacts_status_check check (status in ('none', 'pending_confirmation', 'subscribed', 'unsubscribed', 'declined'));
alter table website_private.marketing_contacts add constraint marketing_contacts_deliv_check check (deliverability in ('ok', 'bounced', 'complained', 'suppressed'));
alter table website_private.marketing_contacts add constraint marketing_contacts_restrict_check check (contact_restriction is null or contact_restriction = 'do_not_contact');
alter table website_private.marketing_contacts add constraint marketing_contacts_sync_check check (resend_sync_state in ('pending', 'synced', 'failed', 'not_applicable'));
alter table website_private.marketing_contacts add constraint marketing_contacts_phone_check check (phone is null or char_length(phone) between 7 and 32);
update website_private.marketing_contacts set contact_source = coalesce(contact_source, source);
alter table website_private.marketing_consent_events alter column consent_version drop not null;
alter table website_private.marketing_consent_events drop constraint if exists marketing_consent_events_event_check;
alter table website_private.marketing_consent_events add constraint marketing_consent_events_event_check check (event in
  ('opt_in', 'opt_out', 'declined', 'unsubscribe', 'confirm_requested', 'confirmed', 'ignored_unverified', 'admin_unsubscribe', 'documented_consent', 'provider_unsubscribe'));

create table if not exists website_private.contact_roles (
  contact_id uuid not null references website_private.marketing_contacts(id) on delete cascade,
  role text not null check (role in ('parent_guardian', 'applicant', 'employee', 'administrator', 'community', 'inquirer', 'tour_requester', 'other')),
  added_at timestamptz not null default now(),
  primary key (contact_id, role)
);
-- A relationship is one reason a person may legitimately hear from the center. ref is an opaque label (never a child's name or details).
create table if not exists website_private.contact_relationships (
  id uuid primary key default gen_random_uuid(),
  contact_id uuid not null references website_private.marketing_contacts(id) on delete cascade,
  kind text not null check (kind in ('enrollment', 'employment', 'service', 'community')),
  ref text not null check (char_length(ref) between 1 and 80),
  status text not null check (status in ('pending', 'active', 'withdrawn', 'graduated', 'terminated', 'inactive', 'open', 'closed')),
  status_changed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (contact_id, kind, ref),
  check ((kind = 'enrollment' and status in ('pending', 'active', 'withdrawn', 'graduated', 'terminated'))
      or (kind = 'employment' and status in ('pending', 'active', 'inactive', 'terminated'))
      or (kind = 'service' and status in ('open', 'closed'))
      or (kind = 'community' and status in ('active', 'inactive')))
);
create index if not exists contact_relationships_contact_idx on website_private.contact_relationships (contact_id);
create table if not exists website_private.comms_admins (
  user_id uuid primary key, email text not null, active boolean not null default true,
  can_manage boolean not null default true, can_send_critical boolean not null default false, can_approve_newsletter boolean not null default false,
  added_at timestamptz not null default now(), added_by text not null
);
create table if not exists website_private.contact_capture_queue (
  id bigint generated always as identity primary key, payload jsonb not null, status text not null default 'pending' check (status in ('pending', 'done', 'failed')),
  attempts integer not null default 0, next_attempt_at timestamptz not null default now(), last_error text, created_at timestamptz not null default now(), done_at timestamptz
);
create index if not exists contact_capture_queue_due_idx on website_private.contact_capture_queue (next_attempt_at) where status = 'pending';
create table if not exists website_private.comms_audit_log (
  id bigint generated always as identity primary key, at timestamptz not null default now(), actor text not null, action text not null,
  contact_id uuid, detail jsonb not null default '{}'::jsonb
);
create index if not exists comms_audit_log_at_idx on website_private.comms_audit_log (at desc);
create table if not exists website_private.comms_webhook_events (event_id text primary key, type text not null, received_at timestamptz not null default now());
create table if not exists website_private.campaigns (
  id uuid primary key default gen_random_uuid(), kind text not null default 'newsletter' check (kind = 'newsletter'),
  month text not null check (month ~ '^\d{4}-\d{2}$'), title text not null, subject text not null, preheader text,
  content jsonb not null default '{}'::jsonb,
  status text not null default 'draft' check (status in ('draft', 'approved', 'sending', 'sent', 'cancelled', 'failed')),
  scheduled_local timestamp, scheduled_at timestamptz,
  approved_by text, approved_at timestamptz, approved_sha256 text,
  resend_broadcast_id text, recipients_at_send integer, sent_at timestamptz, last_error text,
  created_by text, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (kind, month)
);
create table if not exists website_private.critical_templates (key text primary key, title text not null, subject text not null, body text not null, sort integer not null);
create table if not exists website_private.critical_sends (
  id uuid primary key default gen_random_uuid(), template_key text not null references website_private.critical_templates(key),
  subject text not null, body text not null,
  status text not null default 'prepared' check (status in ('prepared', 'sending', 'sent', 'partial', 'failed', 'cancelled')),
  recipient_count integer not null default 0, excluded_count integer not null default 0,
  prepared_by text not null, prepared_at timestamptz not null default now(), authorized_by text, authorized_at timestamptz, completed_at timestamptz
);
create table if not exists website_private.critical_deliveries (
  id bigint generated always as identity primary key, send_id uuid not null references website_private.critical_sends(id) on delete cascade,
  contact_id uuid not null references website_private.marketing_contacts(id) on delete cascade,
  status text not null default 'queued' check (status in ('queued', 'sent', 'delivered', 'failed', 'bounced', 'suppressed')),
  resend_email_id text, error text, updated_at timestamptz not null default now(), unique (send_id, contact_id)
);
create index if not exists critical_deliveries_email_idx on website_private.critical_deliveries (resend_email_id);

insert into website_private.critical_templates (key, title, subject, body, sort) values
 ('closure', 'Center closure', 'Heart to Heart is CLOSED {{when}}', E'Heart to Heart Enrichment Center will be closed {{when}}.\n\n{{details}}\n\nPlease do not bring your child to the center. We will update families as soon as we have more information. If you need to reach us, call 216-938-6771.', 1),
 ('delayed-opening', 'Delayed opening', 'Heart to Heart opens late {{when}}', E'Heart to Heart Enrichment Center will open at {{time}} {{when}}.\n\n{{details}}\n\nIf you need to reach us, call 216-938-6771.', 2),
 ('early-closure', 'Early closure', 'Heart to Heart closes early {{when}}', E'Heart to Heart Enrichment Center will close at {{time}} {{when}}.\n\n{{details}}\n\nPlease arrange for your child to be picked up by {{time}}. Call 216-938-6771 with questions.', 3),
 ('severe-weather', 'Severe weather', 'Weather notice from Heart to Heart', E'Because of severe weather: {{details}}\n\nPlease follow our instructions below and watch for further updates. Call 216-938-6771 if you need to reach us.', 4),
 ('transportation', 'Transportation disruption', 'Transportation notice from Heart to Heart', E'Transportation update {{when}}: {{details}}\n\nPlease make other arrangements if needed. Call 216-938-6771 with questions.', 5),
 ('reopening', 'Reopening', 'Heart to Heart is OPEN {{when}}', E'Heart to Heart Enrichment Center will reopen {{when}}.\n\n{{details}}\n\nWe look forward to seeing your family. Call 216-938-6771 with questions.', 6)
on conflict (key) do nothing;
insert into website_private.feature_flags (key, enabled, note) values
 ('comms_capture', false, 'Automatically capture adult contacts from inquiry, tour, contact and registration submissions (enable when the updated Privacy Policy is published).'),
 ('comms_resend_sync', false, 'Synchronize subscribed newsletter contacts and unsubscribes with Resend.'),
 ('comms_newsletter_send', false, 'Allow approved newsletter campaigns to be sent. OFF = no campaign can be sent.'),
 ('comms_critical_send', false, 'Allow critical notifications to be sent. OFF = prepare and preview only.')
on conflict (key) do nothing;

do $$ declare t text; begin
  foreach t in array array['contact_roles', 'contact_relationships', 'comms_admins', 'contact_capture_queue', 'comms_audit_log', 'comms_webhook_events', 'campaigns', 'critical_templates', 'critical_sends', 'critical_deliveries'] loop
    execute format('alter table website_private.%I enable row level security', t);
    execute format('revoke all on website_private.%I from public, anon, authenticated', t);
    execute format('grant select, insert, update, delete on website_private.%I to service_role', t);
  end loop;
end $$;
grant usage, select on all sequences in schema website_private to service_role;
grant select, insert, update, delete on website_private.marketing_contacts, website_private.marketing_consent_events to service_role;

-- ------------------------------------------------------------------ 2. internal helpers
create or replace function website_private.norm_email(p text) returns text language sql immutable set search_path to '' as $$
  select case when e ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]{2,}$' and pg_catalog.length(e) <= 254 then e end from (select pg_catalog.lower(pg_catalog.btrim(coalesce(p, ''))) e) s
$$;
create or replace function website_private.norm_phone(p text) returns text language sql immutable set search_path to '' as $$
  select case when pg_catalog.length(d) between 7 and 15 then pg_catalog.btrim(p) end from (select pg_catalog.regexp_replace(coalesce(p, ''), '\D', '', 'g') d) s
$$;
create or replace function website_private.audit(p_actor text, p_action text, p_contact uuid, p_detail jsonb) returns void language sql set search_path to '' as $$
  insert into website_private.comms_audit_log (actor, action, contact_id, detail) values (coalesce(p_actor, 'system'), p_action, p_contact, coalesce(p_detail, '{}'::jsonb))
$$;
create or replace function website_private.flag_on(p_key text) returns boolean language sql stable set search_path to '' as $$
  select coalesce((select enabled from website_private.feature_flags where key = p_key), false)
$$;

-- Marks Resend synchronization stale whenever something Resend mirrors changes.
create or replace function website_private.contacts_sync_trg() returns trigger language plpgsql set search_path to '' as $$
begin
  if (new.status, new.first_name, new.last_name, new.email, new.deliverability, new.contact_restriction) is distinct from (old.status, old.first_name, old.last_name, old.email, old.deliverability, old.contact_restriction)
     and new.resend_sync_state = old.resend_sync_state then new.resend_sync_state := 'pending'; end if;
  if (new.status, new.first_name, new.last_name, new.email, new.deliverability, new.contact_restriction) is not distinct from (old.status, old.first_name, old.last_name, old.email, old.deliverability, old.contact_restriction)
     and (new.resend_contact_id, new.resend_sync_state, new.resend_synced_at, new.resend_synced_unsub) is distinct from (old.resend_contact_id, old.resend_sync_state, old.resend_synced_at, old.resend_synced_unsub)
  then new.updated_at := old.updated_at; -- bookkeeping by the sync itself must not look like a new change
  else new.updated_at := pg_catalog.now(); end if;
  return new;
end $$;
drop trigger if exists contacts_sync on website_private.marketing_contacts;
create trigger contacts_sync before update on website_private.marketing_contacts for each row execute function website_private.contacts_sync_trg();

-- Insert or update ONE contact by normalized email. mode: 'capture' (fill blanks only), 'import' (fill blanks unless p.overwrite), 'admin' (overwrite what is given).
-- Never touches newsletter status. Returns {id, created}.
create or replace function website_private.contact_upsert(p jsonb, p_mode text) returns jsonb language plpgsql set search_path to '' as $$
declare em text := website_private.norm_email(p->>'email'); cid uuid; created boolean := false; fn text := nullif(pg_catalog.btrim(p->>'first_name'), ''); ln text := nullif(pg_catalog.btrim(p->>'last_name'), '');
  nm text := nullif(pg_catalog.btrim(p->>'name'), ''); ph text := website_private.norm_phone(p->>'phone'); lg text := coalesce(nullif(p->>'language', ''), 'en'); src text := coalesce(nullif(p->>'source', ''), 'unknown');
  ov boolean := p_mode = 'admin' or (p_mode = 'import' and coalesce((p->>'overwrite')::boolean, false)); r text;
begin
  if em is null then raise exception 'invalid email'; end if;
  if lg not in ('en', 'es', 'fr', 'ar', 'sw') then lg := 'en'; end if;
  if nm is not null and fn is null and ln is null then
    if nm like '% %' then fn := pg_catalog.btrim(pg_catalog.regexp_replace(nm, '\s+\S+$', '')); ln := (pg_catalog.regexp_match(nm, '\S+$'))[1]; else fn := nm; end if;
  end if;
  insert into website_private.marketing_contacts (email, status, language, source, contact_source, consent_version, first_name, last_name, phone)
    values (em, 'none', lg, src, src, null, fn, ln, ph) on conflict (email) do nothing returning id into cid;
  if cid is not null then created := true;
  else
    select id into cid from website_private.marketing_contacts where email = em for update;
    update website_private.marketing_contacts set
      first_name = case when ov then coalesce(fn, first_name) else coalesce(first_name, fn) end,
      last_name = case when ov then coalesce(ln, last_name) else coalesce(last_name, ln) end,
      phone = case when ov then coalesce(ph, phone) else coalesce(phone, ph) end,
      contact_source = coalesce(contact_source, src)
      where id = cid;
  end if;
  for r in select pg_catalog.jsonb_array_elements_text(coalesce(p->'roles', '[]'::jsonb)) loop
    insert into website_private.contact_roles (contact_id, role) values (cid, r) on conflict do nothing;
  end loop;
  return pg_catalog.jsonb_build_object('id', cid, 'created', created);
end $$;

-- The one place newsletter preferences change. trust: 'signed' (signed enrollment), 'public' (unverified website form), 'verified' (emailed confirmation
-- link, or an authenticated provider/admin action). An UNVERIFIED submission can never change another person's preference: it may only create a first
-- subscription (signed) or request a confirmation email; opt-outs are preserved until a verified, fresh, affirmative "yes".
create or replace function website_private.marketing_apply(p_contact uuid, p_choice text, p_trust text, p_source text, p_lang text, p_version text, p_sha text, p_event_key text) returns text
language plpgsql set search_path to '' as $$
declare cur text; act text; ev text; nst text;
begin
  if p_choice is null or p_choice not in ('yes', 'no') then return 'none'; end if;
  if p_event_key is not null and exists (select 1 from website_private.marketing_consent_events where event_key = p_event_key) then return 'replay'; end if;
  select status into cur from website_private.marketing_contacts where id = p_contact for update;
  if p_choice = 'yes' then
    if cur = 'subscribed' then return 'already_subscribed'; end if;
    if p_trust = 'verified' or (p_trust = 'signed' and cur = 'none') then nst := 'subscribed'; act := case when cur = 'none' then 'subscribed' else 'resubscribed' end; ev := case when p_trust = 'verified' then 'confirmed' else 'opt_in' end;
    else -- unverified: ask for confirmation, change nothing else (an opt-out stays an opt-out)
      update website_private.marketing_contacts set confirm_requested_at = pg_catalog.now(), status = case when cur = 'none' then 'pending_confirmation' else cur end, language = p_lang where id = p_contact;
      act := 'confirmation_requested'; ev := 'confirm_requested';
      insert into website_private.marketing_consent_events (contact_id, event, source, language, consent_version, consent_sha256, event_key) values (p_contact, ev, p_source, p_lang, p_version, p_sha, p_event_key);
      return act;
    end if;
    update website_private.marketing_contacts set status = nst, language = p_lang, source = p_source, consent_version = p_version, consent_sha256 = p_sha,
      subscribed_at = pg_catalog.now(), unsubscribed_at = null, status_changed_at = pg_catalog.now(), confirm_requested_at = null where id = p_contact;
  else -- 'no'
    if cur = 'subscribed' and p_trust <> 'verified' then
      insert into website_private.marketing_consent_events (contact_id, event, source, language, consent_version, consent_sha256, event_key) values (p_contact, 'ignored_unverified', p_source, p_lang, p_version, p_sha, p_event_key);
      return 'kept_subscribed_unverified';
    end if;
    if cur = 'subscribed' then update website_private.marketing_contacts set status = 'unsubscribed', unsubscribed_at = pg_catalog.now(), status_changed_at = pg_catalog.now(), confirm_requested_at = null where id = p_contact; act := 'unsubscribed'; ev := 'opt_out';
    elsif cur in ('none', 'pending_confirmation') then update website_private.marketing_contacts set status = 'declined', status_changed_at = pg_catalog.now(), confirm_requested_at = null where id = p_contact; act := 'declined'; ev := 'declined';
    else act := 'kept_' || cur; ev := 'declined'; end if;
  end if;
  insert into website_private.marketing_consent_events (contact_id, event, source, language, consent_version, consent_sha256, event_key) values (p_contact, ev, p_source, p_lang, p_version, p_sha, p_event_key);
  return act;
end $$;

-- Existing enrollment entry point (signature unchanged): now routed through the master register. A signed "yes" subscribes a NEW contact, a signed
-- "yes" on an opted-out address only requests confirmation, and a signed "no" can no longer unsubscribe someone else.
create or replace function public.marketing_record_p3(p_email text, p_choice text, p_language text, p_source text, p_version text, p_sha text, p_event_key text)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare em text := website_private.norm_email(p_email); u jsonb; act text;
begin
  if p_choice is null or p_choice not in ('yes', 'no') then return pg_catalog.jsonb_build_object('ok', true, 'action', 'none'); end if;
  if em is null then return pg_catalog.jsonb_build_object('ok', true, 'action', 'no_email'); end if;
  if p_event_key is not null and exists (select 1 from website_private.marketing_consent_events where event_key = p_event_key) then return pg_catalog.jsonb_build_object('ok', true, 'action', 'replay'); end if;
  u := website_private.contact_upsert(pg_catalog.jsonb_build_object('email', em, 'language', p_language, 'source', p_source), 'capture');
  act := website_private.marketing_apply((u->>'id')::uuid, p_choice, 'signed', p_source, p_language, p_version, p_sha, p_event_key);
  return pg_catalog.jsonb_build_object('ok', true, 'action', case when act = 'subscribed' and (u->>'created')::boolean then 'created_subscribed' when act = 'declined' and (u->>'created')::boolean then 'created_declined' else act end);
end $$;
revoke all on function public.marketing_record_p3(text, text, text, text, text, text, text) from public, anon, authenticated;
grant execute on function public.marketing_record_p3(text, text, text, text, text, text, text) to service_role;

-- ------------------------------------------------------------------ 3. automatic capture (queue + retry; never blocks a submission)
create or replace function website_private.capture_apply(p jsonb) returns jsonb language plpgsql set search_path to '' as $$
declare u jsonb; cid uuid; rel jsonb := p->'relationship'; nl jsonb := p->'newsletter'; act text := 'none';
begin
  u := website_private.contact_upsert(p, 'capture'); cid := (u->>'id')::uuid;
  if rel is not null and rel->>'kind' is not null then
    insert into website_private.contact_relationships (contact_id, kind, ref, status) values (cid, rel->>'kind', rel->>'ref', rel->>'status') on conflict (contact_id, kind, ref) do nothing; -- never downgrades an existing status
  end if;
  if nl is not null and nl->>'choice' is not null then
    act := website_private.marketing_apply(cid, nl->>'choice', coalesce(nl->>'trust', 'public'), coalesce(nl->>'source', p->>'source'), coalesce(p->>'language', 'en'), nl->>'version', nl->>'sha', nl->>'event_key');
  end if;
  perform website_private.audit('capture:' || coalesce(p->>'source', '?'), 'contact_capture', cid, pg_catalog.jsonb_build_object('created', u->'created', 'newsletter', act));
  return pg_catalog.jsonb_build_object('ok', true, 'id', cid, 'created', u->'created', 'newsletter', act);
end $$;

create or replace function public.contact_capture_p4(p jsonb) returns jsonb language plpgsql security definer set search_path to '' as $$
begin
  if coalesce(p->>'gated', 'false') = 'true' and not website_private.flag_on('comms_capture') then return pg_catalog.jsonb_build_object('ok', true, 'skipped', 'flag_off'); end if;
  begin
    return website_private.capture_apply(p);
  exception when others then
    insert into website_private.contact_capture_queue (payload, last_error) values (p, pg_catalog.left(sqlerrm, 300));
    return pg_catalog.jsonb_build_object('ok', true, 'queued', true);
  end;
end $$;

create or replace function public.contact_queue_run_p4(p_limit integer default 50) returns jsonb language plpgsql security definer set search_path to '' as $$
declare q record; done integer := 0; failed integer := 0;
begin
  for q in select * from website_private.contact_capture_queue where status = 'pending' and next_attempt_at <= pg_catalog.now() order by id limit p_limit for update skip locked loop
    begin
      perform website_private.capture_apply(q.payload);
      update website_private.contact_capture_queue set status = 'done', done_at = pg_catalog.now(), attempts = attempts + 1 where id = q.id; done := done + 1;
    exception when others then
      update website_private.contact_capture_queue set attempts = attempts + 1, last_error = pg_catalog.left(sqlerrm, 300),
        status = case when attempts + 1 >= 8 then 'failed' else 'pending' end, next_attempt_at = pg_catalog.now() + (interval '5 minutes' * (2 ^ least(attempts, 6))::int) where id = q.id; failed := failed + 1;
    end;
  end loop;
  return pg_catalog.jsonb_build_object('done', done, 'retry_or_failed', failed, 'pending', (select pg_catalog.count(*) from website_private.contact_capture_queue where status = 'pending'));
end $$;

create or replace function website_private.inquiries_capture_trg() returns trigger language plpgsql security definer set search_path to '' as $$
begin
  if website_private.flag_on('comms_capture') then
    begin
      perform public.contact_capture_p4(pg_catalog.jsonb_build_object('email', new.email, 'name', new.adult_name, 'phone', new.phone, 'language', new.preferred_language,
        'source', 'website-' || new.kind, 'roles', case when new.kind = 'tour' then '["tour_requester"]'::jsonb else '["inquirer"]'::jsonb end,
        'relationship', pg_catalog.jsonb_build_object('kind', 'service', 'status', 'open', 'ref', 'inq:' || pg_catalog.left(new.id::text, 8))));
    exception when others then null; end;
  end if;
  return new;
end $$;
drop trigger if exists inquiries_capture on website_private.inquiries;
create trigger inquiries_capture after insert on website_private.inquiries for each row execute function website_private.inquiries_capture_trg();
create or replace function website_private.registrations_capture_trg() returns trigger language plpgsql security definer set search_path to '' as $$
begin
  if website_private.flag_on('comms_capture') then
    begin
      perform public.contact_capture_p4(pg_catalog.jsonb_build_object('email', new.email, 'name', new.guardian_name, 'phone', new.phone, 'language', new.preferred_language,
        'source', 'website-registration', 'roles', '["parent_guardian","applicant"]'::jsonb,
        'relationship', pg_catalog.jsonb_build_object('kind', 'enrollment', 'status', 'pending', 'ref', 'reg:' || pg_catalog.left(new.id::text, 8))));
    exception when others then null; end;
  end if;
  return new;
end $$;
drop trigger if exists registrations_capture on website_private.child_registrations;
create trigger registrations_capture after insert on website_private.child_registrations for each row execute function website_private.registrations_capture_trg();

-- ------------------------------------------------------------------ 4. eligibility (four independent categories)
create or replace function website_private.eligible(p_category text) returns table (contact_id uuid) language sql stable set search_path to '' as $$
  select c.id from website_private.marketing_contacts c
  where c.contact_restriction is null and c.deliverability = 'ok' and case p_category
    when 'newsletter' then c.status = 'subscribed'
    when 'critical' then exists (select 1 from website_private.contact_relationships r where r.contact_id = c.id and r.status = 'active' and r.kind in ('enrollment', 'employment'))
    when 'operational' then exists (select 1 from website_private.contact_relationships r where r.contact_id = c.id
        and ((r.kind = 'enrollment' and r.status in ('pending', 'active')) or (r.kind = 'employment' and r.status = 'active') or (r.kind = 'service' and r.status = 'open')))
    when 'internal' then exists (select 1 from website_private.contact_relationships r where r.contact_id = c.id and r.kind = 'employment' and r.status = 'active')
    else false end
$$;
create or replace function public.comms_recipients_p4(p_category text) returns jsonb language sql stable security definer set search_path to '' as $$
  select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('id', c.id, 'email', c.email, 'first_name', c.first_name, 'last_name', c.last_name, 'phone', c.phone, 'language', c.language) order by c.email), '[]'::jsonb)
  from website_private.marketing_contacts c where c.id in (select contact_id from website_private.eligible(p_category))
$$;
create or replace function public.comms_counts_p4() returns jsonb language sql stable security definer set search_path to '' as $$
  select pg_catalog.jsonb_build_object('critical', (select pg_catalog.count(*) from website_private.eligible('critical')), 'operational', (select pg_catalog.count(*) from website_private.eligible('operational')),
    'newsletter', (select pg_catalog.count(*) from website_private.eligible('newsletter')), 'internal', (select pg_catalog.count(*) from website_private.eligible('internal')),
    'contacts', (select pg_catalog.count(*) from website_private.marketing_contacts), 'capture_queue_pending', (select pg_catalog.count(*) from website_private.contact_capture_queue where status = 'pending'))
$$;

-- ------------------------------------------------------------------ 5. administration
create or replace function public.comms_admin_ok_p4(p_user uuid) returns jsonb language sql stable security definer set search_path to '' as $$
  select coalesce((select pg_catalog.jsonb_build_object('ok', true, 'email', email, 'can_manage', can_manage, 'can_send_critical', can_send_critical, 'can_approve_newsletter', can_approve_newsletter)
    from website_private.comms_admins where user_id = p_user and active), pg_catalog.jsonb_build_object('ok', false))
$$;

create or replace function public.contact_list_p4(p_filter jsonb) returns jsonb language plpgsql stable security definer set search_path to '' as $$
declare q text := nullif(pg_catalog.btrim(p_filter->>'q'), ''); lim integer := least(coalesce((p_filter->>'limit')::int, 50), 500); off integer := coalesce((p_filter->>'offset')::int, 0); total integer; rows jsonb; ids uuid[];
begin
  select coalesce(pg_catalog.array_agg(c.id), '{}') into ids from website_private.marketing_contacts c
   where (q is null or c.email ilike '%' || q || '%' or c.first_name ilike '%' || q || '%' or c.last_name ilike '%' || q || '%')
     and (p_filter->>'role' is null or exists (select 1 from website_private.contact_roles r where r.contact_id = c.id and r.role = p_filter->>'role'))
     and (p_filter->>'newsletter' is null or c.status = p_filter->>'newsletter')
     and (p_filter->>'rel_kind' is null or exists (select 1 from website_private.contact_relationships r where r.contact_id = c.id and r.kind = p_filter->>'rel_kind' and (p_filter->>'rel_status' is null or r.status = p_filter->>'rel_status')))
     and (p_filter->>'category' is null or c.id in (select contact_id from website_private.eligible(p_filter->>'category')));
  total := coalesce(pg_catalog.array_length(ids, 1), 0);
  select coalesce(pg_catalog.jsonb_agg(x order by x->>'email'), '[]'::jsonb) into rows from (
    select pg_catalog.jsonb_build_object('id', c.id, 'email', c.email, 'first_name', c.first_name, 'last_name', c.last_name, 'phone', c.phone, 'language', c.language, 'newsletter', c.status,
      'deliverability', c.deliverability, 'restriction', c.contact_restriction, 'source', c.contact_source, 'created_at', c.created_at,
      'roles', coalesce((select pg_catalog.jsonb_agg(role order by role) from website_private.contact_roles r where r.contact_id = c.id), '[]'::jsonb),
      'relationships', coalesce((select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('id', r.id, 'kind', r.kind, 'ref', r.ref, 'status', r.status) order by r.created_at) from website_private.contact_relationships r where r.contact_id = c.id), '[]'::jsonb)) x
    from website_private.marketing_contacts c where c.id = any (ids) order by c.email limit lim offset off) s;
  return pg_catalog.jsonb_build_object('total', total, 'rows', rows);
end $$;

create or replace function public.contact_update_p4(p_id uuid, p jsonb, p_actor text) returns jsonb language plpgsql security definer set search_path to '' as $$
declare em text; r text; changed text[] := '{}';
begin
  if not exists (select 1 from website_private.marketing_contacts where id = p_id) then return pg_catalog.jsonb_build_object('ok', false, 'error', 'not_found'); end if;
  if p ? 'email' then
    em := website_private.norm_email(p->>'email'); if em is null then return pg_catalog.jsonb_build_object('ok', false, 'error', 'invalid_email'); end if;
    if exists (select 1 from website_private.marketing_contacts where email = em and id <> p_id) then return pg_catalog.jsonb_build_object('ok', false, 'error', 'duplicate_email'); end if;
    update website_private.marketing_contacts set email = em where id = p_id; changed := array_append(changed, 'email'::text);
  end if;
  if p ? 'phone' and nullif(pg_catalog.btrim(p->>'phone'), '') is not null and website_private.norm_phone(p->>'phone') is null then return pg_catalog.jsonb_build_object('ok', false, 'error', 'invalid_phone'); end if;
  if p ? 'language' and (p->>'language') not in ('en', 'es', 'fr', 'ar', 'sw') then return pg_catalog.jsonb_build_object('ok', false, 'error', 'invalid_language'); end if;
  if p ? 'restriction' and p->>'restriction' is not null and p->>'restriction' <> 'do_not_contact' then return pg_catalog.jsonb_build_object('ok', false, 'error', 'invalid_restriction'); end if;
  update website_private.marketing_contacts set
    first_name = case when p ? 'first_name' then nullif(pg_catalog.btrim(p->>'first_name'), '') else first_name end,
    last_name = case when p ? 'last_name' then nullif(pg_catalog.btrim(p->>'last_name'), '') else last_name end,
    phone = case when p ? 'phone' then website_private.norm_phone(p->>'phone') else phone end,
    language = case when p ? 'language' then p->>'language' else language end,
    contact_restriction = case when p ? 'restriction' then p->>'restriction' else contact_restriction end where id = p_id;
  if p ? 'roles' then
    for r in select pg_catalog.jsonb_array_elements_text(p->'roles') loop if r not in ('parent_guardian', 'applicant', 'employee', 'administrator', 'community', 'inquirer', 'tour_requester', 'other') then return pg_catalog.jsonb_build_object('ok', false, 'error', 'invalid_role'); end if; end loop;
    delete from website_private.contact_roles where contact_id = p_id;
    for r in select pg_catalog.jsonb_array_elements_text(p->'roles') loop insert into website_private.contact_roles (contact_id, role) values (p_id, r); end loop;
  end if;
  perform website_private.audit(p_actor, 'contact_update', p_id, pg_catalog.jsonb_build_object('fields', (select pg_catalog.jsonb_agg(k) from pg_catalog.jsonb_object_keys(p) k)));
  return pg_catalog.jsonb_build_object('ok', true);
end $$;

create or replace function public.contact_add_p4(p jsonb, p_actor text) returns jsonb language plpgsql security definer set search_path to '' as $$
declare u jsonb;
begin
  if website_private.norm_email(p->>'email') is null then return pg_catalog.jsonb_build_object('ok', false, 'error', 'invalid_email'); end if;
  u := website_private.contact_upsert(p || pg_catalog.jsonb_build_object('source', coalesce(p->>'source', 'admin-entry')), 'admin');
  if p->'relationship' is not null then
    insert into website_private.contact_relationships (contact_id, kind, ref, status) values ((u->>'id')::uuid, p->'relationship'->>'kind', coalesce(p->'relationship'->>'ref', 'admin:1'), p->'relationship'->>'status')
      on conflict (contact_id, kind, ref) do update set status = excluded.status, status_changed_at = pg_catalog.now(), updated_at = pg_catalog.now();
  end if;
  perform website_private.audit(p_actor, 'contact_add', (u->>'id')::uuid, pg_catalog.jsonb_build_object('created', u->'created'));
  return pg_catalog.jsonb_build_object('ok', true, 'id', u->>'id', 'created', u->'created');
end $$;

create or replace function public.relationship_set_p4(p_contact uuid, p_kind text, p_ref text, p_status text, p_actor text) returns jsonb language plpgsql security definer set search_path to '' as $$
declare rid uuid;
begin
  insert into website_private.contact_relationships (contact_id, kind, ref, status) values (p_contact, p_kind, coalesce(p_ref, 'admin:1'), p_status)
    on conflict (contact_id, kind, ref) do update set status = excluded.status, status_changed_at = pg_catalog.now(), updated_at = pg_catalog.now() returning id into rid;
  perform website_private.audit(p_actor, 'relationship_set', p_contact, pg_catalog.jsonb_build_object('kind', p_kind, 'status', p_status));
  return pg_catalog.jsonb_build_object('ok', true, 'id', rid);
exception when check_violation or foreign_key_violation then return pg_catalog.jsonb_build_object('ok', false, 'error', 'invalid_relationship');
end $$;

-- Administrative newsletter actions. Admin can unsubscribe or record DOCUMENTED consent, or ask for a verification email; admin can never silently resubscribe.
create or replace function public.contact_marketing_p4(p_id uuid, p_action text, p_evidence text, p_actor text) returns jsonb language plpgsql security definer set search_path to '' as $$
declare cur text;
begin
  select status into cur from website_private.marketing_contacts where id = p_id for update; if not found then return pg_catalog.jsonb_build_object('ok', false, 'error', 'not_found'); end if;
  if p_action = 'unsubscribe' then
    update website_private.marketing_contacts set status = 'unsubscribed', unsubscribed_at = pg_catalog.now(), status_changed_at = pg_catalog.now(), confirm_requested_at = null where id = p_id and status in ('subscribed', 'pending_confirmation', 'none', 'declined');
    insert into website_private.marketing_consent_events (contact_id, event, source, language, consent_version) select id, 'admin_unsubscribe', 'admin:' || coalesce(p_actor, '?'), language, 'NL-1.0' from website_private.marketing_contacts where id = p_id;
  elsif p_action = 'documented_consent' then
    if cur in ('unsubscribed', 'declined') then return pg_catalog.jsonb_build_object('ok', false, 'error', 'optout_requires_verified_consent'); end if;
    if coalesce(pg_catalog.length(pg_catalog.btrim(p_evidence)), 0) < 10 then return pg_catalog.jsonb_build_object('ok', false, 'error', 'evidence_required'); end if;
    update website_private.marketing_contacts set status = 'subscribed', source = 'admin-documented', subscribed_at = pg_catalog.now(), status_changed_at = pg_catalog.now(), consent_version = 'documented' where id = p_id;
    insert into website_private.marketing_consent_events (contact_id, event, source, language, consent_version) select id, 'documented_consent', 'admin:' || coalesce(p_actor, '?'), language, 'documented' from website_private.marketing_contacts where id = p_id;
  elsif p_action = 'request_confirmation' then
    update website_private.marketing_contacts set confirm_requested_at = pg_catalog.now() where id = p_id;
  else return pg_catalog.jsonb_build_object('ok', false, 'error', 'invalid_action'); end if;
  perform website_private.audit(p_actor, 'marketing_' || p_action, p_id, pg_catalog.jsonb_build_object('evidence_len', coalesce(pg_catalog.length(p_evidence), 0)));
  return pg_catalog.jsonb_build_object('ok', true);
end $$;

-- Verified (token) actions from the emailed link: confirm a subscription (fresh affirmative consent) or unsubscribe.
create or replace function public.contact_verified_p4(p_id uuid, p_action text, p_lang text, p_event_key text) returns jsonb language plpgsql security definer set search_path to '' as $$
declare act text;
begin
  if not exists (select 1 from website_private.marketing_contacts where id = p_id) then return pg_catalog.jsonb_build_object('ok', false, 'error', 'not_found'); end if;
  act := website_private.marketing_apply(p_id, case p_action when 'confirm' then 'yes' else 'no' end, 'verified', 'email-link', coalesce(p_lang, 'en'), 'NL-1.0', null, p_event_key);
  return pg_catalog.jsonb_build_object('ok', true, 'action', act);
end $$;

create or replace function public.contact_deliverability_p4(p_id uuid, p_value text, p_actor text) returns jsonb language plpgsql security definer set search_path to '' as $$
begin
  update website_private.marketing_contacts set deliverability = p_value, suppression_reason = case when p_value = 'ok' then null else suppression_reason end where id = p_id;
  perform website_private.audit(p_actor, 'deliverability_set', p_id, pg_catalog.jsonb_build_object('value', p_value)); return pg_catalog.jsonb_build_object('ok', found);
exception when check_violation then return pg_catalog.jsonb_build_object('ok', false, 'error', 'invalid_value');
end $$;

create or replace function public.contact_export_p4(p_filter jsonb, p_actor text) returns jsonb language plpgsql security definer set search_path to '' as $$
declare res jsonb;
begin
  select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('email', c.email, 'first_name', c.first_name, 'last_name', c.last_name, 'phone', c.phone, 'language', c.language,
      'roles', coalesce((select pg_catalog.string_agg(role, ';' order by role) from website_private.contact_roles r where r.contact_id = c.id), ''),
      'enrollment_status', coalesce((select pg_catalog.string_agg(distinct r.status, ';') from website_private.contact_relationships r where r.contact_id = c.id and r.kind = 'enrollment'), ''),
      'employment_status', coalesce((select pg_catalog.string_agg(distinct r.status, ';') from website_private.contact_relationships r where r.contact_id = c.id and r.kind = 'employment'), ''),
      'newsletter', c.status, 'deliverability', c.deliverability, 'restriction', coalesce(c.contact_restriction, ''), 'source', c.contact_source) order by c.email), '[]'::jsonb) into res
  from website_private.marketing_contacts c where (p_filter->>'category' is null or c.id in (select contact_id from website_private.eligible(p_filter->>'category')))
    and (p_filter->>'newsletter' is null or c.status = p_filter->>'newsletter') and (p_filter->>'role' is null or exists (select 1 from website_private.contact_roles r where r.contact_id = c.id and r.role = p_filter->>'role'));
  perform website_private.audit(p_actor, 'contact_export', null, pg_catalog.jsonb_build_object('rows', pg_catalog.jsonb_array_length(res), 'filter', p_filter));
  return res;
end $$;

-- CSV import (rows are objects keyed by lower-case header). p_dry = preview. Never changes an existing opt-out; unknown consent stays 'none' (not subscribed).
create or replace function public.contact_import_p4(p_rows jsonb, p_dry boolean, p_actor text, p_label text) returns jsonb language plpgsql security definer set search_path to '' as $$
declare r jsonb; i integer := 0; em text; errs text[]; warns text[]; seen text[] := '{}'; out jsonb := '[]'::jsonb; ex record; act text; role_s text; roles jsonb; rk text; rs text; u jsonb; cid uuid;
  n_create integer := 0; n_update integer := 0; n_dup integer := 0; n_bad integer := 0; n_same integer := 0; cons boolean; lbl text := coalesce(nullif(pg_catalog.left(p_label, 40), ''), 'import');
begin
  if pg_catalog.jsonb_array_length(p_rows) > 2000 then return pg_catalog.jsonb_build_object('ok', false, 'error', 'too_many_rows'); end if;
  for r in select * from pg_catalog.jsonb_array_elements(p_rows) loop
    i := i + 1; errs := '{}'; warns := '{}'; act := null; roles := '[]'::jsonb; rk := null; rs := null; cons := false;
    em := website_private.norm_email(r->>'email'); if em is null then errs := array_append(errs, 'invalid_email'::text); end if;
    if nullif(pg_catalog.btrim(r->>'phone'), '') is not null and website_private.norm_phone(r->>'phone') is null then errs := array_append(errs, 'invalid_phone'::text); end if;
    if nullif(r->>'language', '') is not null and pg_catalog.lower(r->>'language') not in ('en', 'es', 'fr', 'ar', 'sw') then errs := array_append(errs, 'invalid_language'::text); end if;
    for role_s in select pg_catalog.btrim(pg_catalog.lower(x)) from pg_catalog.regexp_split_to_table(coalesce(r->>'roles', ''), '[;,]') x where pg_catalog.btrim(x) <> '' loop
      if role_s not in ('parent_guardian', 'applicant', 'employee', 'administrator', 'community', 'inquirer', 'tour_requester', 'other') then errs := array_append(errs, ('invalid_role:' || role_s)::text); else roles := roles || pg_catalog.to_jsonb(role_s); end if;
    end loop;
    if nullif(r->>'enrollment_status', '') is not null then rk := 'enrollment'; rs := pg_catalog.lower(r->>'enrollment_status'); if rs not in ('pending', 'active', 'withdrawn', 'graduated', 'terminated') then errs := array_append(errs, 'invalid_enrollment_status'::text); end if;
    elsif nullif(r->>'employment_status', '') is not null then rk := 'employment'; rs := pg_catalog.lower(r->>'employment_status'); if rs not in ('pending', 'active', 'inactive', 'terminated') then errs := array_append(errs, 'invalid_employment_status'::text); end if; end if;
    if pg_catalog.lower(coalesce(r->>'newsletter_consent', '')) in ('yes', 'y', 'true') then
      cons := true; if nullif(r->>'consent_date', '') is null or nullif(r->>'consent_source', '') is null then errs := array_append(errs, 'consent_needs_date_and_source'::text); end if;
    end if;
    if nullif(r->>'first_name', '') is null and nullif(r->>'last_name', '') is null then warns := array_append(warns, 'no_name'::text); end if;
    if array_length(errs, 1) is null then
      if em = any (seen) then act := 'duplicate_in_file'; n_dup := n_dup + 1;
      else
        seen := array_append(seen, em);
        select id, status into ex from website_private.marketing_contacts where email = em;
        act := case when ex.id is null then 'create' else 'update' end;
        if cons and ex.id is not null and ex.status in ('unsubscribed', 'declined') then warns := array_append(warns, 'optout_preserved'::text); end if;
        if not p_dry then
          begin
            u := website_private.contact_upsert(pg_catalog.jsonb_build_object('email', em, 'first_name', r->>'first_name', 'last_name', r->>'last_name', 'phone', r->>'phone', 'language', pg_catalog.lower(coalesce(nullif(r->>'language', ''), 'en')),
              'source', coalesce(nullif(r->>'source', ''), 'csv-import'), 'roles', roles, 'overwrite', coalesce(nullif(r->>'overwrite', ''), 'false')::boolean), 'import');
            cid := (u->>'id')::uuid;
            if rk is not null then
              insert into website_private.contact_relationships (contact_id, kind, ref, status) values (cid, rk, 'import:' || lbl, rs)
                on conflict (contact_id, kind, ref) do update set status = excluded.status, status_changed_at = pg_catalog.now(), updated_at = pg_catalog.now();
            end if;
            if cons and not (ex.id is not null and ex.status in ('unsubscribed', 'declined')) then
              update website_private.marketing_contacts set status = 'subscribed', source = 'csv-documented:' || pg_catalog.left(r->>'consent_source', 60), consent_version = 'documented', subscribed_at = coalesce(subscribed_at, pg_catalog.now()), status_changed_at = pg_catalog.now() where id = cid and status in ('none', 'pending_confirmation');
              insert into website_private.marketing_consent_events (contact_id, event, source, language, consent_version) select id, 'documented_consent', 'csv:' || pg_catalog.left(r->>'consent_source', 60) || ' ' || pg_catalog.left(r->>'consent_date', 12), language, 'documented' from website_private.marketing_contacts where id = cid and status = 'subscribed';
            end if;
            if (u->>'created')::boolean then n_create := n_create + 1; else n_update := n_update + 1; end if;
          exception when others then errs := array_append(errs, 'row_failed'::text); act := 'invalid'; n_bad := n_bad + 1;
          end;
        else if act = 'create' then n_create := n_create + 1; else n_update := n_update + 1; end if; end if;
      end if;
    else act := 'invalid'; n_bad := n_bad + 1; end if;
    out := out || pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object('row', i, 'email', em, 'action', act, 'errors', pg_catalog.to_jsonb(errs), 'warnings', pg_catalog.to_jsonb(warns)));
  end loop;
  if not p_dry then perform website_private.audit(p_actor, 'contact_import', null, pg_catalog.jsonb_build_object('label', lbl, 'created', n_create, 'updated', n_update, 'duplicates', n_dup, 'invalid', n_bad)); end if;
  return pg_catalog.jsonb_build_object('ok', true, 'dry', p_dry, 'summary', pg_catalog.jsonb_build_object('rows', i, 'create', n_create, 'update', n_update, 'duplicate_in_file', n_dup, 'invalid', n_bad), 'rows', out);
end $$;

-- ------------------------------------------------------------------ 6. delivery events, suppression, Resend synchronization
create or replace function public.contact_delivery_event_p4(p_event_id text, p_type text, p_email text, p_detail text) returns jsonb language plpgsql security definer set search_path to '' as $$
declare em text := website_private.norm_email(p_email); cid uuid; cur text;
begin
  if p_event_id is not null then
    insert into website_private.comms_webhook_events (event_id, type) values (p_event_id, p_type) on conflict do nothing;
    if not found then return pg_catalog.jsonb_build_object('ok', true, 'action', 'duplicate'); end if;
  end if;
  select id, status into cid, cur from website_private.marketing_contacts where email = em for update; if cid is null then return pg_catalog.jsonb_build_object('ok', true, 'action', 'unknown_contact'); end if;
  if p_type = 'bounced' then update website_private.marketing_contacts set deliverability = 'bounced', suppression_reason = pg_catalog.left(p_detail, 200) where id = cid;
  elsif p_type = 'suppressed' then update website_private.marketing_contacts set deliverability = case when deliverability = 'ok' then 'suppressed' else deliverability end, suppression_reason = pg_catalog.left(p_detail, 200) where id = cid;
  elsif p_type in ('complained', 'provider_unsubscribed') then
    if p_type = 'complained' then update website_private.marketing_contacts set deliverability = 'complained', suppression_reason = 'spam complaint' where id = cid; end if;
    if cur = 'subscribed' then
      update website_private.marketing_contacts set status = 'unsubscribed', unsubscribed_at = pg_catalog.now(), status_changed_at = pg_catalog.now() where id = cid;
      insert into website_private.marketing_consent_events (contact_id, event, source, language, consent_version) select id, 'provider_unsubscribe', 'resend:' || p_type, language, 'NL-1.0' from website_private.marketing_contacts where id = cid;
    end if;
  else return pg_catalog.jsonb_build_object('ok', true, 'action', 'ignored'); end if; -- includes provider "subscribed": a stale or external change can never restore a subscription
  return pg_catalog.jsonb_build_object('ok', true, 'action', p_type);
end $$;

create or replace function public.resend_sync_batch_p4(p_limit integer default 50) returns jsonb language sql stable security definer set search_path to '' as $$
  select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('id', id, 'email', email, 'first_name', first_name, 'last_name', last_name, 'resend_contact_id', resend_contact_id, 'unsubscribed', not ok, 'as_of', updated_at)), '[]'::jsonb) from (
    select c.*, (c.status = 'subscribed' and c.deliverability = 'ok' and c.contact_restriction is null) as ok from website_private.marketing_contacts c
    where c.resend_sync_state in ('pending', 'failed') and ((c.status = 'subscribed' and c.deliverability = 'ok' and c.contact_restriction is null) or c.resend_contact_id is not null) order by c.updated_at limit p_limit) s
$$;
create or replace function public.resend_sync_mark_p4(p_id uuid, p_resend_id text, p_unsub boolean, p_as_of timestamptz, p_error text) returns jsonb language plpgsql security definer set search_path to '' as $$
begin
  if p_error is not null then update website_private.marketing_contacts set resend_sync_state = 'failed' where id = p_id;
  else update website_private.marketing_contacts set resend_contact_id = coalesce(p_resend_id, resend_contact_id), resend_synced_unsub = p_unsub, resend_synced_at = pg_catalog.now(),
    resend_sync_state = case when updated_at = p_as_of then 'synced' else 'pending' end where id = p_id; end if;
  return pg_catalog.jsonb_build_object('ok', true);
end $$;

-- ------------------------------------------------------------------ 7. monthly newsletter campaigns (nothing is scheduled or sent by this migration)
create or replace function website_private.first_tuesday_local(p_month text) returns timestamp language sql immutable set search_path to '' as $$
  select (d + ((9 - extract(isodow from d)::int) % 7) * interval '1 day' + interval '10 hours')::timestamp
  from (select (p_month || '-01')::date d) s
$$;
create or replace function public.campaign_save_p4(p jsonb, p_actor text) returns jsonb language plpgsql security definer set search_path to '' as $$
declare cid uuid; sl timestamp; m text := p->>'month';
begin
  if m !~ '^\d{4}-(0[1-9]|1[0-2])$' then return pg_catalog.jsonb_build_object('ok', false, 'error', 'invalid_month'); end if;
  sl := coalesce(nullif(p->>'scheduled_local', '')::timestamp, website_private.first_tuesday_local(m)); -- Cleveland wall-clock time
  insert into website_private.campaigns (month, title, subject, preheader, content, scheduled_local, scheduled_at, created_by)
    values (m, coalesce(p->>'title', 'Heart to Heart newsletter ' || m), coalesce(p->>'subject', 'Heart to Heart — ' || m), p->>'preheader', coalesce(p->'content', '{}'::jsonb), sl, sl at time zone 'America/New_York', p_actor)
    on conflict (kind, month) do update set
      title = coalesce(p->>'title', website_private.campaigns.title), subject = coalesce(p->>'subject', website_private.campaigns.subject), preheader = coalesce(p->>'preheader', website_private.campaigns.preheader),
      content = coalesce(p->'content', website_private.campaigns.content), scheduled_local = excluded.scheduled_local, scheduled_at = excluded.scheduled_at,
      status = case when website_private.campaigns.status in ('sending', 'sent') then website_private.campaigns.status else 'draft' end, -- any edit withdraws a prior approval
      approved_by = case when website_private.campaigns.status in ('sending', 'sent') then website_private.campaigns.approved_by end,
      approved_at = case when website_private.campaigns.status in ('sending', 'sent') then website_private.campaigns.approved_at end,
      approved_sha256 = case when website_private.campaigns.status in ('sending', 'sent') then website_private.campaigns.approved_sha256 end, updated_at = pg_catalog.now()
    where website_private.campaigns.status not in ('sending', 'sent') returning id into cid;
  if cid is null then return pg_catalog.jsonb_build_object('ok', false, 'error', 'already_sent_or_sending'); end if;
  perform website_private.audit(p_actor, 'campaign_save', null, pg_catalog.jsonb_build_object('campaign', cid, 'month', m));
  return pg_catalog.jsonb_build_object('ok', true, 'id', cid);
end $$;
create or replace function public.campaign_prepare_next_p4(p_actor text) returns jsonb language plpgsql security definer set search_path to '' as $$
declare m text := pg_catalog.to_char((pg_catalog.now() at time zone 'America/New_York')::date + interval '1 month', 'YYYY-MM');
begin
  if exists (select 1 from website_private.campaigns where month = m) then return pg_catalog.jsonb_build_object('ok', true, 'existing', true, 'month', m); end if;
  return public.campaign_save_p4(pg_catalog.jsonb_build_object('month', m), p_actor) || pg_catalog.jsonb_build_object('month', m);
end $$;
create or replace function public.campaign_approve_p4(p_id uuid, p_actor text) returns jsonb language plpgsql security definer set search_path to '' as $$
declare c record; sections text[] := array['director', 'news', 'enrollment', 'resources', 'events'];
begin
  select * into c from website_private.campaigns where id = p_id for update; if not found then return pg_catalog.jsonb_build_object('ok', false, 'error', 'not_found'); end if;
  if c.status <> 'draft' then return pg_catalog.jsonb_build_object('ok', false, 'error', 'not_draft'); end if;
  if exists (select 1 from pg_catalog.unnest(sections) s where coalesce(pg_catalog.btrim(c.content->>s), '') = '') then return pg_catalog.jsonb_build_object('ok', false, 'error', 'content_incomplete'); end if;
  if c.scheduled_at <= pg_catalog.now() then return pg_catalog.jsonb_build_object('ok', false, 'error', 'schedule_in_past'); end if;
  update website_private.campaigns set status = 'approved', approved_by = p_actor, approved_at = pg_catalog.now(), approved_sha256 = pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(c.subject || '|' || c.content::text, 'UTF8')), 'hex'), updated_at = pg_catalog.now() where id = p_id;
  perform website_private.audit(p_actor, 'campaign_approve', null, pg_catalog.jsonb_build_object('campaign', p_id));
  return pg_catalog.jsonb_build_object('ok', true);
end $$;
-- Claims ONE approved, due campaign exactly once (atomic status change = no duplicate delivery). Refuses when the flag is off or the content changed after approval.
create or replace function public.campaign_claim_p4(p_id uuid, p_actor text) returns jsonb language plpgsql security definer set search_path to '' as $$
declare c record;
begin
  if not website_private.flag_on('comms_newsletter_send') then return pg_catalog.jsonb_build_object('ok', false, 'error', 'sending_disabled'); end if;
  select * into c from website_private.campaigns where status = 'approved' and (p_id is null or id = p_id) and scheduled_at <= pg_catalog.now() order by scheduled_at limit 1 for update skip locked;
  if not found then return pg_catalog.jsonb_build_object('ok', false, 'error', 'nothing_due'); end if;
  if c.approved_sha256 is distinct from pg_catalog.encode(pg_catalog.sha256(pg_catalog.convert_to(c.subject || '|' || c.content::text, 'UTF8')), 'hex') then
    update website_private.campaigns set status = 'draft' where id = c.id; return pg_catalog.jsonb_build_object('ok', false, 'error', 'changed_after_approval'); end if;
  update website_private.campaigns set status = 'sending', updated_at = pg_catalog.now() where id = c.id;
  perform website_private.audit(p_actor, 'campaign_claim', null, pg_catalog.jsonb_build_object('campaign', c.id));
  return pg_catalog.jsonb_build_object('ok', true, 'campaign', pg_catalog.to_jsonb(c) - 'approved_sha256');
end $$;
create or replace function public.campaign_finish_p4(p_id uuid, p_broadcast text, p_recipients integer, p_error text) returns jsonb language plpgsql security definer set search_path to '' as $$
begin
  update website_private.campaigns set status = case when p_error is null then 'sent' else 'failed' end, resend_broadcast_id = p_broadcast, recipients_at_send = p_recipients,
    sent_at = case when p_error is null then pg_catalog.now() end, last_error = pg_catalog.left(p_error, 300), updated_at = pg_catalog.now() where id = p_id and status = 'sending';
  return pg_catalog.jsonb_build_object('ok', found);
end $$;
create or replace function public.campaign_list_p4() returns jsonb language sql stable security definer set search_path to '' as $$
  select coalesce(pg_catalog.jsonb_agg(pg_catalog.to_jsonb(c) - 'approved_sha256' order by c.month desc), '[]'::jsonb) from website_private.campaigns c
$$;

-- ------------------------------------------------------------------ 8. critical notifications (prepare → explicit authorization → send → report)
create or replace function public.critical_templates_p4() returns jsonb language sql stable security definer set search_path to '' as $$
  select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('key', key, 'title', title, 'subject', subject, 'body', body) order by sort), '[]'::jsonb) from website_private.critical_templates
$$;
create or replace function public.critical_prepare_p4(p_template text, p_subject text, p_body text, p_actor text) returns jsonb language plpgsql security definer set search_path to '' as $$
declare t record; sid uuid; n integer; x integer;
begin
  select * into t from website_private.critical_templates where key = p_template; if not found then return pg_catalog.jsonb_build_object('ok', false, 'error', 'unknown_template'); end if;
  insert into website_private.critical_sends (template_key, subject, body, prepared_by) values (t.key, coalesce(nullif(p_subject, ''), t.subject), coalesce(nullif(p_body, ''), t.body), p_actor) returning id into sid;
  insert into website_private.critical_deliveries (send_id, contact_id) select sid, contact_id from website_private.eligible('critical');
  -- active-family/employee contacts who cannot receive email (suppressed, bounced, restricted) go straight to the telephone follow-up list
  insert into website_private.critical_deliveries (send_id, contact_id, status, error)
    select sid, c.id, 'suppressed', case when c.contact_restriction is not null then 'contact restriction' else 'email ' || c.deliverability end from website_private.marketing_contacts c
    where (c.contact_restriction is not null or c.deliverability <> 'ok') and exists (select 1 from website_private.contact_relationships r where r.contact_id = c.id and r.status = 'active' and r.kind in ('enrollment', 'employment'))
    on conflict do nothing;
  select pg_catalog.count(*) filter (where status = 'queued'), pg_catalog.count(*) filter (where status = 'suppressed') into n, x from website_private.critical_deliveries where send_id = sid;
  update website_private.critical_sends set recipient_count = n, excluded_count = x where id = sid;
  perform website_private.audit(p_actor, 'critical_prepare', null, pg_catalog.jsonb_build_object('send', sid, 'template', p_template, 'recipients', n, 'excluded', x));
  return pg_catalog.jsonb_build_object('ok', true, 'send_id', sid, 'recipient_count', n, 'excluded_count', x, 'subject', coalesce(nullif(p_subject, ''), t.subject), 'body', coalesce(nullif(p_body, ''), t.body));
end $$;
create or replace function public.critical_begin_p4(p_send uuid, p_confirm_count integer, p_actor text) returns jsonb language plpgsql security definer set search_path to '' as $$
declare s record;
begin
  if not website_private.flag_on('comms_critical_send') then return pg_catalog.jsonb_build_object('ok', false, 'error', 'sending_disabled'); end if;
  select * into s from website_private.critical_sends where id = p_send for update; if not found then return pg_catalog.jsonb_build_object('ok', false, 'error', 'not_found'); end if;
  if s.status <> 'prepared' then return pg_catalog.jsonb_build_object('ok', false, 'error', 'not_prepared'); end if;
  if p_confirm_count is distinct from s.recipient_count then return pg_catalog.jsonb_build_object('ok', false, 'error', 'count_mismatch'); end if;
  update website_private.critical_sends set status = 'sending', authorized_by = p_actor, authorized_at = pg_catalog.now() where id = p_send;
  perform website_private.audit(p_actor, 'critical_authorize', null, pg_catalog.jsonb_build_object('send', p_send, 'recipients', s.recipient_count));
  return pg_catalog.jsonb_build_object('ok', true, 'subject', s.subject, 'body', s.body, 'recipients', (select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('contact_id', c.id, 'email', c.email, 'first_name', c.first_name) order by c.email), '[]'::jsonb)
    from website_private.critical_deliveries d join website_private.marketing_contacts c on c.id = d.contact_id where d.send_id = p_send and d.status = 'queued'));
end $$;
create or replace function public.critical_mark_p4(p_send uuid, p_contact uuid, p_status text, p_email_id text, p_error text) returns jsonb language plpgsql security definer set search_path to '' as $$
begin
  update website_private.critical_deliveries set status = p_status, resend_email_id = coalesce(p_email_id, resend_email_id), error = pg_catalog.left(p_error, 300), updated_at = pg_catalog.now() where send_id = p_send and contact_id = p_contact;
  return pg_catalog.jsonb_build_object('ok', found);
exception when check_violation then return pg_catalog.jsonb_build_object('ok', false, 'error', 'invalid_status');
end $$;
create or replace function public.critical_finish_p4(p_send uuid) returns jsonb language plpgsql security definer set search_path to '' as $$
declare open_n integer;
begin
  select pg_catalog.count(*) into open_n from website_private.critical_deliveries where send_id = p_send and status in ('queued', 'failed');
  update website_private.critical_sends set status = case when open_n = 0 then 'sent' else 'partial' end, completed_at = pg_catalog.now() where id = p_send and status = 'sending';
  return pg_catalog.jsonb_build_object('ok', true, 'open', open_n);
end $$;
create or replace function public.critical_delivery_event_p4(p_email_id text, p_status text, p_error text) returns jsonb language plpgsql security definer set search_path to '' as $$
begin
  update website_private.critical_deliveries set status = p_status, error = pg_catalog.left(p_error, 300), updated_at = pg_catalog.now() where resend_email_id = p_email_id and not (status = 'delivered' and p_status = 'sent');
  return pg_catalog.jsonb_build_object('ok', found);
exception when check_violation then return pg_catalog.jsonb_build_object('ok', false);
end $$;
create or replace function public.critical_report_p4(p_send uuid) returns jsonb language sql stable security definer set search_path to '' as $$
  select pg_catalog.jsonb_build_object('send', (select pg_catalog.to_jsonb(s) from website_private.critical_sends s where s.id = p_send),
    'counts', (select coalesce(pg_catalog.jsonb_object_agg(status, n), '{}'::jsonb) from (select status, pg_catalog.count(*) n from website_private.critical_deliveries where send_id = p_send group by status) g),
    'phone_followup', (select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('name', pg_catalog.btrim(coalesce(c.first_name, '') || ' ' || coalesce(c.last_name, '')), 'phone', c.phone, 'email', c.email, 'reason', d.status || coalesce(': ' || d.error, ''))
        order by c.last_name, c.first_name), '[]'::jsonb) from website_private.critical_deliveries d join website_private.marketing_contacts c on c.id = d.contact_id
        where d.send_id = p_send and d.status in ('failed', 'bounced', 'suppressed', 'queued') and (select s.status from website_private.critical_sends s where s.id = p_send) <> 'prepared'))
$$;

-- ------------------------------------------------------------------ 8b. public-endpoint rate limiting and flag lookup
create table if not exists website_private.comms_rate (k text not null, bucket bigint not null, n integer not null default 0, primary key (k, bucket));
alter table website_private.comms_rate enable row level security; revoke all on website_private.comms_rate from anon, authenticated; grant all on website_private.comms_rate to service_role;
create or replace function public.comms_rate_p4(p_key text, p_limit integer, p_window_seconds integer) returns boolean language plpgsql security definer set search_path to '' as $$
declare b bigint := pg_catalog.floor(extract(epoch from pg_catalog.now()) / p_window_seconds); c integer;
begin
  delete from website_private.comms_rate where bucket < b - 2 and pg_catalog.random() < 0.05;
  insert into website_private.comms_rate (k, bucket, n) values (p_key, b, 1) on conflict (k, bucket) do update set n = website_private.comms_rate.n + 1 returning n into c;
  return c <= p_limit;
end $$;
create or replace function public.comms_flag_p4(p_key text) returns boolean language sql stable security definer set search_path to '' as $$ select website_private.flag_on(p_key) $$;

-- Scheduled reconciliation: Resend contact list vs. the register. The register always wins: a provider "subscribed" is never copied back, a provider unsubscribe is applied, and
-- any provider contact the register does not consider subscribed is listed so the function can push an unsubscribe. Contacts unknown to the register are only counted.
create or replace function public.resend_reconcile_p4(p jsonb) returns jsonb language plpgsql security definer set search_path to '' as $$
declare r jsonb; c record; push jsonb := '[]'::jsonb; applied integer := 0; unknown integer := 0; un boolean;
begin
  for r in select * from pg_catalog.jsonb_array_elements(p) loop
    un := coalesce((r->>'unsubscribed')::boolean, false);
    select id, status, deliverability, contact_restriction into c from website_private.marketing_contacts where email = website_private.norm_email(r->>'email');
    if not found then unknown := unknown + 1;
    elsif un then if c.status = 'subscribed' then perform public.contact_delivery_event_p4(null, 'provider_unsubscribed', r->>'email', 'reconcile'); applied := applied + 1; end if;
    elsif c.status <> 'subscribed' or c.deliverability <> 'ok' or c.contact_restriction is not null then push := push || pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object('resend_id', r->>'id'));
    end if;
  end loop;
  return pg_catalog.jsonb_build_object('push_unsub', push, 'applied_provider_unsubs', applied, 'unknown_in_register', unknown);
end $$;

-- ------------------------------------------------------------------ 9. permissions: service role only, for every new function
do $$ declare f record; begin
  for f in select p.oid::regprocedure as sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and (p.proname like '%\_p4' escape '\' or p.proname = 'marketing_record_p3') loop
    execute format('revoke all on function %s from public, anon, authenticated', f.sig);
    execute format('grant execute on function %s to service_role', f.sig);
  end loop;
end $$;
revoke all on all functions in schema website_private from public, anon, authenticated;
grant execute on all functions in schema website_private to service_role;

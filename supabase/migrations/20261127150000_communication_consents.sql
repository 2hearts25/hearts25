-- COMMS-1.0: communication consent records for telephone/text and operational email, kept SEPARATE from the newsletter status (NL-1.0).
-- Extends the existing private register (website_private.marketing_contacts / contact_roles / contact_relationships); no new register.
-- No row = "not recorded" (unknown): existing contacts are never auto-consented or auto-declined. An unchecked box is recorded as
-- "not_provided" for a first application and NEVER overwrites a granted or withdrawn state. History is append-only.
-- Nothing here sends SMS or email, integrates an SMS provider, or changes a feature flag. Service-role only; RLS on, no policies.

create table if not exists website_private.contact_channel_consents (
  id uuid primary key default gen_random_uuid(),
  contact_id uuid not null references website_private.marketing_contacts(id) on delete cascade,
  channel text not null check (channel in ('telephone_text', 'operational_email')),
  destination text not null check (char_length(destination) between 3 and 254),   -- E.164-style number, or the adult's email address
  destination_type text not null check (destination_type in ('mobile', 'home', 'work', 'unknown', 'email')),
  status text not null check (status in ('granted', 'not_provided', 'withdrawn')),
  authorized_at timestamptz,
  withdrawn_at timestamptz,
  consent_version text not null,
  consent_sha256 text,
  language text,
  source text not null,
  application_ref text,                                                            -- opaque label of the signed application ("app:1a2b3c4d")
  status_changed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (contact_id, channel, destination),
  check ((channel = 'operational_email' and destination_type = 'email') or (channel = 'telephone_text' and destination_type <> 'email'))
);
create index if not exists contact_channel_consents_contact_idx on website_private.contact_channel_consents (contact_id);
create table if not exists website_private.contact_channel_consent_events (
  id bigint generated always as identity primary key,
  consent_id uuid references website_private.contact_channel_consents(id) on delete cascade,
  contact_id uuid not null references website_private.marketing_contacts(id) on delete cascade,
  channel text not null, destination text not null, destination_type text not null,
  event text not null check (event in ('granted', 'not_provided', 'withdrawn', 'grant_ignored_withdrawn', 'admin_granted', 'admin_withdrawn', 'stop_reply')),
  occurred_at timestamptz not null default now(),
  source text not null, language text, consent_version text, consent_sha256 text, application_ref text,
  actor text, evidence text, event_key text
);
create unique index if not exists contact_channel_events_key_uq on website_private.contact_channel_consent_events (event_key) where event_key is not null;
create index if not exists contact_channel_events_contact_idx on website_private.contact_channel_consent_events (contact_id);
alter table website_private.contact_channel_consents enable row level security;
alter table website_private.contact_channel_consent_events enable row level security;
revoke all on website_private.contact_channel_consents, website_private.contact_channel_consent_events from public, anon, authenticated;
grant select, insert, update on website_private.contact_channel_consents to service_role;
grant select, insert on website_private.contact_channel_consent_events to service_role;

-- digits -> "+1XXXXXXXXXX" for US numbers; otherwise "+digits"; null when it cannot be a telephone number
create or replace function website_private.consent_phone(p text) returns text language plpgsql immutable set search_path to '' as $$
declare d text := pg_catalog.regexp_replace(coalesce(p, ''), '[^0-9]', '', 'g');
begin
  if pg_catalog.length(d) = 10 then return '+1' || d; end if;
  if pg_catalog.length(d) = 11 and pg_catalog.left(d, 1) = '1' then return '+' || d; end if;
  if pg_catalog.length(d) between 8 and 15 then return '+' || d; end if;
  return null;
end $$;

-- one channel/destination. choice: 'granted' | 'not_provided'. Returns what happened.
create or replace function website_private.consent_one(cid uuid, ch text, dest text, dtype text, choice text, c jsonb, ekey text) returns text language plpgsql set search_path to '' as $$
declare ex record; ev text; res text;
begin
  if dest is null or choice not in ('granted', 'not_provided') then return 'skipped'; end if;
  if ekey is not null and exists (select 1 from website_private.contact_channel_consent_events where event_key = ekey) then return 'duplicate'; end if;
  select * into ex from website_private.contact_channel_consents where contact_id = cid and channel = ch and destination = dest;
  if not found then
    insert into website_private.contact_channel_consents (contact_id, channel, destination, destination_type, status, authorized_at, consent_version, consent_sha256, language, source, application_ref)
      values (cid, ch, dest, dtype, choice, case when choice = 'granted' then pg_catalog.now() end, c->>'version', c->>'sha', c->>'language', coalesce(c->>'source', 'enrollment-application'), c->>'application_ref') returning * into ex;
    ev := choice; res := 'created_' || choice;
  elsif choice = 'granted' and ex.status = 'not_provided' then
    update website_private.contact_channel_consents set status = 'granted', authorized_at = pg_catalog.now(), destination_type = dtype, consent_version = c->>'version', consent_sha256 = c->>'sha', language = c->>'language',
      source = coalesce(c->>'source', source), application_ref = c->>'application_ref', status_changed_at = pg_catalog.now() where id = ex.id;
    ev := 'granted'; res := 'granted';
  elsif choice = 'granted' and ex.status = 'withdrawn' then
    ev := 'grant_ignored_withdrawn'; res := 'withdrawn_kept';      -- an unverified application cannot silently reinstate a withdrawal; the Director re-authorizes with evidence
  else
    return 'unchanged';                                              -- granted stays granted; an unchecked box never overwrites granted/withdrawn
  end if;
  insert into website_private.contact_channel_consent_events (consent_id, contact_id, channel, destination, destination_type, event, source, language, consent_version, consent_sha256, application_ref, event_key)
    values (ex.id, cid, ch, dest, dtype, ev, coalesce(c->>'source', 'enrollment-application'), c->>'language', c->>'version', c->>'sha', c->>'application_ref', ekey);
  return res;
end $$;

-- Applies the COMMS-1.0 block of one capture payload: { telephone: {choice, number, type}, email: {choice}, version, sha, language, source, application_ref, event_key }
-- A missing block or missing choice records nothing (legacy applications stay "not recorded").
create or replace function website_private.consent_apply(cid uuid, em text, c jsonb) returns jsonb language plpgsql set search_path to '' as $$
declare t jsonb := c->'telephone'; e jsonb := c->'email'; num text; rt text := 'skipped'; re text := 'skipped'; k text := c->>'event_key';
begin
  if t is not null and t->>'choice' in ('granted', 'not_provided') then
    num := website_private.consent_phone(t->>'number');
    rt := website_private.consent_one(cid, 'telephone_text', num, coalesce(nullif(t->>'type', ''), 'unknown'), t->>'choice', c, case when k is not null then k || ':tel' end);
  end if;
  if e is not null and e->>'choice' in ('granted', 'not_provided') then
    re := website_private.consent_one(cid, 'operational_email', em, 'email', e->>'choice', c, case when k is not null then k || ':mail' end);
  end if;
  return pg_catalog.jsonb_build_object('telephone', rt, 'email', re);
end $$;

-- capture_apply now also applies the COMMS-1.0 block (same retry queue as before: a failure is queued and re-applied idempotently)
create or replace function website_private.capture_apply(p jsonb) returns jsonb language plpgsql set search_path to '' as $$
declare u jsonb; cid uuid; rel jsonb := p->'relationship'; nl jsonb := p->'newsletter'; act text := 'none'; cs jsonb := null;
begin
  u := website_private.contact_upsert(p, 'capture'); cid := (u->>'id')::uuid;
  if rel is not null and rel->>'kind' is not null then
    insert into website_private.contact_relationships (contact_id, kind, ref, status) values (cid, rel->>'kind', rel->>'ref', rel->>'status') on conflict (contact_id, kind, ref) do nothing; -- never downgrades an existing status
  end if;
  if nl is not null and nl->>'choice' is not null then
    act := website_private.marketing_apply(cid, nl->>'choice', coalesce(nl->>'trust', 'public'), coalesce(nl->>'source', p->>'source'), coalesce(p->>'language', 'en'), nl->>'version', nl->>'sha', nl->>'event_key');
  end if;
  if p->'consents' is not null then
    cs := website_private.consent_apply(cid, pg_catalog.lower(pg_catalog.btrim(p->>'email')), p->'consents' || pg_catalog.jsonb_build_object('language', coalesce(p->>'language', 'en'), 'source', coalesce(p->>'source', 'enrollment-application')));
  end if;
  perform website_private.audit('capture:' || coalesce(p->>'source', '?'), 'contact_capture', cid, pg_catalog.jsonb_build_object('created', u->'created', 'newsletter', act, 'consents', cs));
  return pg_catalog.jsonb_build_object('ok', true, 'id', cid, 'created', u->'created', 'newsletter', act, 'consents', cs);
end $$;

create or replace function website_private.email_withdrawn(cid uuid) returns boolean language sql stable set search_path to '' as $$
  select exists (select 1 from website_private.contact_channel_consents k where k.contact_id = cid and k.channel = 'operational_email' and k.status = 'withdrawn')
$$;
-- ESSENTIAL service messages (critical, operational) are NOT gated on a recorded "yes": an unknown or "not provided" status and a declined newsletter
-- never exclude a family. Only an explicit WITHDRAWAL of email authorization excludes the address (that family goes to the telephone follow-up list).
-- Newsletter and internal eligibility are unchanged.
create or replace function website_private.eligible(p_category text) returns table (contact_id uuid) language sql stable set search_path to '' as $$
  select c.id from website_private.marketing_contacts c
  where c.contact_restriction is null and c.deliverability = 'ok' and case p_category
    when 'newsletter' then c.status = 'subscribed'
    when 'critical' then exists (select 1 from website_private.contact_relationships r where r.contact_id = c.id and r.status = 'active' and r.kind in ('enrollment', 'employment'))
        and not website_private.email_withdrawn(c.id)
    when 'operational' then exists (select 1 from website_private.contact_relationships r where r.contact_id = c.id
        and ((r.kind = 'enrollment' and r.status in ('pending', 'active')) or (r.kind = 'employment' and r.status = 'active') or (r.kind = 'service' and r.status = 'open')))
        and not website_private.email_withdrawn(c.id)
    when 'internal' then exists (select 1 from website_private.contact_relationships r where r.contact_id = c.id and r.kind = 'employment' and r.status = 'active')
    else false end
$$;

-- critical notices: an explicit email withdrawal sends the family to the telephone follow-up list instead of dropping them silently
create or replace function public.critical_prepare_p4(p_template text, p_subject text, p_body text, p_actor text) returns jsonb language plpgsql security definer set search_path to '' as $$
declare t record; sid uuid; n integer; x integer;
begin
  select * into t from website_private.critical_templates where key = p_template; if not found then return pg_catalog.jsonb_build_object('ok', false, 'error', 'unknown_template'); end if;
  insert into website_private.critical_sends (template_key, subject, body, prepared_by) values (t.key, coalesce(nullif(p_subject, ''), t.subject), coalesce(nullif(p_body, ''), t.body), p_actor) returning id into sid;
  insert into website_private.critical_deliveries (send_id, contact_id) select sid, contact_id from website_private.eligible('critical');
  -- active-family/employee contacts who cannot receive email (suppressed, bounced, restricted) go straight to the telephone follow-up list
  insert into website_private.critical_deliveries (send_id, contact_id, status, error)
    select sid, c.id, 'suppressed', case when c.contact_restriction is not null then 'contact restriction' when website_private.email_withdrawn(c.id) then 'email permission withdrawn' else 'email ' || c.deliverability end from website_private.marketing_contacts c
    where (c.contact_restriction is not null or c.deliverability <> 'ok' or website_private.email_withdrawn(c.id)) and exists (select 1 from website_private.contact_relationships r where r.contact_id = c.id and r.status = 'active' and r.kind in ('enrollment', 'employment'))
    on conflict do nothing;
  select pg_catalog.count(*) filter (where status = 'queued'), pg_catalog.count(*) filter (where status = 'suppressed') into n, x from website_private.critical_deliveries where send_id = sid;
  update website_private.critical_sends set recipient_count = n, excluded_count = x where id = sid;
  perform website_private.audit(p_actor, 'critical_prepare', null, pg_catalog.jsonb_build_object('send', sid, 'template', p_template, 'recipients', n, 'excluded', x));
  return pg_catalog.jsonb_build_object('ok', true, 'send_id', sid, 'recipient_count', n, 'excluded_count', x, 'subject', coalesce(nullif(p_subject, ''), t.subject), 'body', coalesce(nullif(p_body, ''), t.body));
end $$;


-- ------------------------------------------------------------------ administration: view, withdraw, documented re-authorization
create or replace function public.channel_consents_p5(p_contact uuid) returns jsonb language sql stable security definer set search_path to '' as $$
  select pg_catalog.jsonb_build_object(
    'telephone_text', coalesce((select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('destination', destination, 'type', destination_type, 'status', status, 'authorized_at', authorized_at, 'withdrawn_at', withdrawn_at, 'version', consent_version, 'source', source, 'application_ref', application_ref) order by created_at) from website_private.contact_channel_consents where contact_id = p_contact and channel = 'telephone_text'), '[]'::jsonb),
    'operational_email', coalesce((select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('destination', destination, 'type', destination_type, 'status', status, 'authorized_at', authorized_at, 'withdrawn_at', withdrawn_at, 'version', consent_version, 'source', source, 'application_ref', application_ref) order by created_at) from website_private.contact_channel_consents where contact_id = p_contact and channel = 'operational_email'), '[]'::jsonb),
    'history', coalesce((select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('at', occurred_at, 'channel', channel, 'destination', destination, 'event', event, 'source', source, 'version', consent_version, 'actor', actor, 'evidence', evidence) order by id desc) from (select * from website_private.contact_channel_consent_events where contact_id = p_contact order by id desc limit 50) h), '[]'::jsonb),
    'note', 'An empty list means "not recorded" (unknown), which is neither consent nor refusal.')
$$;

-- p_action: 'withdraw' (all destinations of the channel, or one) | 'grant' (requires evidence and, for the telephone channel, a number)
create or replace function public.channel_consent_set_p5(p_contact uuid, p_channel text, p_action text, p_destination text, p_type text, p_actor text, p_evidence text) returns jsonb language plpgsql security definer set search_path to '' as $$
declare dest text; n integer := 0; r record; ex record; em text;
begin
  if p_channel not in ('telephone_text', 'operational_email') or p_action not in ('withdraw', 'grant') then return pg_catalog.jsonb_build_object('ok', false, 'error', 'invalid'); end if;
  select email into em from website_private.marketing_contacts where id = p_contact; if not found then return pg_catalog.jsonb_build_object('ok', false, 'error', 'not_found'); end if;
  if p_action = 'withdraw' then
    for r in select * from website_private.contact_channel_consents where contact_id = p_contact and channel = p_channel and status <> 'withdrawn'
        and (p_destination is null or destination = case when p_channel = 'telephone_text' then website_private.consent_phone(p_destination) else p_destination end) loop
      update website_private.contact_channel_consents set status = 'withdrawn', withdrawn_at = pg_catalog.now(), status_changed_at = pg_catalog.now() where id = r.id;
      insert into website_private.contact_channel_consent_events (consent_id, contact_id, channel, destination, destination_type, event, source, actor, evidence)
        values (r.id, p_contact, p_channel, r.destination, r.destination_type, 'admin_withdrawn', 'administrator', p_actor, pg_catalog.left(p_evidence, 500)); n := n + 1;
    end loop;
    if n = 0 then -- nothing recorded yet: record the withdrawal itself so a later unverified "yes" cannot reinstate it
      dest := case when p_channel = 'operational_email' then em else website_private.consent_phone(coalesce(p_destination, '')) end;
      if dest is null then return pg_catalog.jsonb_build_object('ok', false, 'error', 'destination_required'); end if;
      insert into website_private.contact_channel_consents (contact_id, channel, destination, destination_type, status, withdrawn_at, consent_version, source)
        values (p_contact, p_channel, dest, case when p_channel = 'operational_email' then 'email' else 'unknown' end, 'withdrawn', pg_catalog.now(), 'COMMS-1.0', 'administrator') on conflict (contact_id, channel, destination) do nothing returning * into ex;
      insert into website_private.contact_channel_consent_events (consent_id, contact_id, channel, destination, destination_type, event, source, actor, evidence)
        select id, p_contact, channel, destination, destination_type, 'admin_withdrawn', 'administrator', p_actor, pg_catalog.left(p_evidence, 500) from website_private.contact_channel_consents where contact_id = p_contact and channel = p_channel and destination = dest;
      n := 1;
    end if;
  else
    if pg_catalog.btrim(coalesce(p_evidence, '')) = '' then return pg_catalog.jsonb_build_object('ok', false, 'error', 'evidence_required'); end if;
    dest := case when p_channel = 'operational_email' then em else website_private.consent_phone(coalesce(p_destination, '')) end;
    if dest is null then return pg_catalog.jsonb_build_object('ok', false, 'error', 'destination_required'); end if;
    insert into website_private.contact_channel_consents (contact_id, channel, destination, destination_type, status, authorized_at, consent_version, source)
      values (p_contact, p_channel, dest, case when p_channel = 'operational_email' then 'email' else coalesce(nullif(p_type, ''), 'unknown') end, 'granted', pg_catalog.now(), 'COMMS-1.0', 'administrator')
      on conflict (contact_id, channel, destination) do update set status = 'granted', authorized_at = pg_catalog.now(), withdrawn_at = null, status_changed_at = pg_catalog.now();
    insert into website_private.contact_channel_consent_events (consent_id, contact_id, channel, destination, destination_type, event, source, actor, evidence)
      select id, p_contact, channel, destination, destination_type, 'admin_granted', 'administrator', p_actor, pg_catalog.left(p_evidence, 500) from website_private.contact_channel_consents where contact_id = p_contact and channel = p_channel and destination = dest;
    n := 1;
  end if;
  perform website_private.audit(p_actor, 'channel_consent_' || p_action, p_contact, pg_catalog.jsonb_build_object('channel', p_channel, 'changed', n));
  return pg_catalog.jsonb_build_object('ok', true, 'changed', n);
end $$;

-- ------------------------------------------------------------------ FUTURE SMS (no provider, no caller, nothing is sent)
-- A future SMS provider reads ONLY numbers the adult authorized for text messages, entered as a MOBILE number, not withdrawn, on a contact that is not restricted.
-- Landline, work and unknown-type numbers are never returned. Telephone consent is independent of email and newsletter choices.
create or replace function public.sms_recipients_p5() returns jsonb language sql stable security definer set search_path to '' as $$
  select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('contact_id', c.id, 'phone', k.destination, 'language', c.language, 'authorized_at', k.authorized_at, 'consent_version', k.consent_version) order by k.destination), '[]'::jsonb)
  from website_private.contact_channel_consents k join website_private.marketing_contacts c on c.id = k.contact_id
  where k.channel = 'telephone_text' and k.status = 'granted' and k.destination_type = 'mobile' and c.contact_restriction is null
$$;
-- STOP handling for the future provider: withdraws every text authorization for that number (all contacts) and logs it. Email and newsletter are untouched.
create or replace function public.sms_stop_p5(p_phone text, p_source text) returns jsonb language plpgsql security definer set search_path to '' as $$
declare dest text := website_private.consent_phone(p_phone); r record; n integer := 0;
begin
  if dest is null then return pg_catalog.jsonb_build_object('ok', false, 'error', 'invalid'); end if;
  for r in select * from website_private.contact_channel_consents where channel = 'telephone_text' and destination = dest and status <> 'withdrawn' loop
    update website_private.contact_channel_consents set status = 'withdrawn', withdrawn_at = pg_catalog.now(), status_changed_at = pg_catalog.now() where id = r.id;
    insert into website_private.contact_channel_consent_events (consent_id, contact_id, channel, destination, destination_type, event, source, actor)
      values (r.id, r.contact_id, r.channel, r.destination, r.destination_type, 'stop_reply', coalesce(nullif(p_source, ''), 'sms-stop'), 'sms-provider'); n := n + 1;
  end loop;
  return pg_catalog.jsonb_build_object('ok', true, 'withdrawn', n);
end $$;

-- ------------------------------------------------------------------ privileges: service role only
do $g$ declare f record; begin
  for f in select p.oid::regprocedure::text as sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where (n.nspname = 'public' and p.proname in ('channel_consents_p5', 'channel_consent_set_p5', 'sms_recipients_p5', 'sms_stop_p5'))
              or (n.nspname = 'website_private' and p.proname in ('consent_phone', 'consent_one', 'consent_apply', 'capture_apply', 'eligible', 'email_withdrawn')) loop
    execute format('revoke all on function %s from public, anon, authenticated', f.sig);
    execute format('grant execute on function %s to service_role', f.sig);
  end loop;
  revoke all on function public.critical_prepare_p4(text, text, text, text) from public, anon, authenticated;
  grant execute on function public.critical_prepare_p4(text, text, text, text) to service_role;
end $g$;

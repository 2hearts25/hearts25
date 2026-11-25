-- 1.3.0 part 2 (management 11/25/2026): restricted financial store for OPTIONAL card information, payment-source follow-up tracking,
-- and two reliability repairs (parent-email retry, evidence/document finalization retry).
-- ADDITIVE AND BACKWARD COMPATIBLE. Live card collection stays OFF (feature flag `financial_card_collection` = false, and the Edge Function also
-- needs the separate H2H_FINANCIAL_KEY secret, which is NOT set). No payment processing, card verification, charging or recurring billing exists.
-- This migration does NOT make the store PCI DSS compliant by itself: see docs/PAYMENT_CARD_SECURITY_CHECKLIST.md for what must be verified first.

insert into website_private.feature_flags (key, enabled, note) values
  ('financial_card_collection', false, 'Accept OPTIONAL card information (name, number, expiry, billing address) into the restricted financial store. Keep OFF until the payment-card security checklist is verified.')
on conflict (key) do nothing;

-- ---------------------------------------------------------------- application columns
alter table website_private.enrollment_applications
  add column if not exists finalize_status    text not null default 'not_applicable',   -- evidence + document association (1.3.0-E2 rows start 'pending')
  add column if not exists finalize_attempts  integer not null default 0,
  add column if not exists finalize_error     text,
  add column if not exists family_email_attempts integer not null default 0,
  add column if not exists payment_status     text,   -- 'card_on_file' | 'follow_up_needed' | 'not_received' (1.3.0-E2 only; NEVER 'verified' or 'charged')
  add column if not exists payment_followup_due date; -- requested enrollment date + 30 days (provisional until the Director confirms the enrollment date)
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'enrollment_finalize_chk') then
    alter table website_private.enrollment_applications add constraint enrollment_finalize_chk check (finalize_status in ('not_applicable','pending','done','failed'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'enrollment_payment_status_chk') then
    alter table website_private.enrollment_applications add constraint enrollment_payment_status_chk check (payment_status is null or payment_status in ('card_on_file','follow_up_needed','not_received'));
  end if;
end $$;

-- A new 1.3.0-E2 application is born 'pending finalization' in the same transaction as the insert, so a crash between storing the
-- application and writing its evidence can never leave it looking finished. 1.2.0-E1 rows are unaffected.
create or replace function website_private.enrollment_finalize_default() returns trigger language plpgsql set search_path to '' as $f$
begin if new.form_version <> '1.2.0-E1' then new.finalize_status := 'pending'; end if; return new; end $f$;
drop trigger if exists enrollment_finalize_default_trg on website_private.enrollment_applications;
create trigger enrollment_finalize_default_trg before insert on website_private.enrollment_applications for each row execute function website_private.enrollment_finalize_default();

-- ---------------------------------------------------------------- RESTRICTED FINANCIAL STORE (separate schema)
-- Own schema, no policies, RLS on, EVERY privilege revoked from anon, authenticated AND service_role: the only way in is through the
-- SECURITY DEFINER functions below (service-role-callable only). No function ever returns the card number.
create schema if not exists website_financial;
revoke all on schema website_financial from public, anon, authenticated, service_role;

create table if not exists website_financial.cards (
  id             uuid primary key default gen_random_uuid(),
  application_id uuid not null unique references website_private.enrollment_applications(id),
  status         text not null default 'stored' check (status in ('stored','purged')),
  brand          text,
  last4          text check (last4 is null or last4 ~ '^[0-9]{4}$'),
  pan_enc        text,      -- AES-256-GCM (H2H_FINANCIAL_KEY, AAD bound to the application id): the card number ONLY
  display_enc    text,      -- AES-256-GCM: cardholder name, expiry, billing address (for the Heart to Heart PDF; never the number)
  consent_at     timestamptz not null,
  consent_sha256 text not null,
  retain_until   date,      -- NULL = no automatic purge; management sets the retention period (not decided yet)
  purged_at      timestamptz,
  purge_reason   text,
  created_at     timestamptz not null default now(),
  check ((status = 'stored' and pan_enc is not null and display_enc is not null) or (status = 'purged' and pan_enc is null and display_enc is null))
);
alter table website_financial.cards enable row level security;
revoke all on website_financial.cards from public, anon, authenticated, service_role;

create table if not exists website_financial.card_access_log (
  id             bigserial primary key,
  card_id        uuid,
  application_id uuid,
  action         text not null,          -- 'store' | 'display_read' | 'retention_set' | 'purge'
  actor          text not null,
  detail         text,
  at             timestamptz not null default now()
);
alter table website_financial.card_access_log enable row level security;
revoke all on website_financial.card_access_log from public, anon, authenticated, service_role;
drop trigger if exists card_access_log_append_only on website_financial.card_access_log;
create trigger card_access_log_append_only before update or delete on website_financial.card_access_log for each row execute function website_private.forbid_change();

create or replace function public.enrollment_card_store_p2(p_application uuid, p_brand text, p_last4 text, p_pan_enc text, p_display_enc text, p_consent_at timestamptz, p_consent_sha text) returns jsonb
language plpgsql security definer set search_path to '' as $f$
declare v_id uuid;
begin
  insert into website_financial.cards (application_id, brand, last4, pan_enc, display_enc, consent_at, consent_sha256)
  values (p_application, p_brand, p_last4, p_pan_enc, p_display_enc, p_consent_at, p_consent_sha)
  on conflict (application_id) do nothing returning id into v_id;
  if v_id is null then return pg_catalog.jsonb_build_object('ok', true, 'duplicate', true); end if;   -- written once; a retry never rewrites it
  insert into website_financial.card_access_log (card_id, application_id, action, actor) values (v_id, p_application, 'store', 'system');
  return pg_catalog.jsonb_build_object('ok', true, 'duplicate', false);
end $f$;

-- For the Heart to Heart PDF: masked data only. The card number blob is never returned by any function.
create or replace function public.enrollment_card_display_p2(p_application uuid, p_purpose text default 'pdf') returns jsonb
language plpgsql security definer set search_path to '' as $f$
declare c website_financial.cards;
begin
  select * into c from website_financial.cards where application_id = p_application;
  if not found then return null; end if;
  insert into website_financial.card_access_log (card_id, application_id, action, actor, detail) values (c.id, p_application, 'display_read', 'system', pg_catalog.left(coalesce(p_purpose,'pdf'),40));
  return pg_catalog.jsonb_build_object('status', c.status, 'brand', c.brand, 'last4', c.last4, 'display_enc', c.display_enc, 'consent_at', c.consent_at, 'retain_until', c.retain_until);
end $f$;

create or replace function public.enrollment_card_retention_p2(p_application uuid, p_retain_until date, p_actor text) returns jsonb
language plpgsql security definer set search_path to '' as $f$
declare c website_financial.cards;
begin
  update website_financial.cards set retain_until = p_retain_until where application_id = p_application and status = 'stored' returning * into c;
  if not found then return pg_catalog.jsonb_build_object('ok', false); end if;
  insert into website_financial.card_access_log (card_id, application_id, action, actor, detail) values (c.id, p_application, 'retention_set', pg_catalog.left(coalesce(p_actor,'unknown'),200), p_retain_until::text);
  return pg_catalog.jsonb_build_object('ok', true);
end $f$;

create or replace function public.enrollment_card_purge_p2(p_application uuid, p_reason text, p_actor text) returns jsonb
language plpgsql security definer set search_path to '' as $f$
declare c website_financial.cards;
begin
  update website_financial.cards set status = 'purged', pan_enc = null, display_enc = null, purged_at = now(), purge_reason = pg_catalog.left(coalesce(p_reason,'unspecified'),200)
   where application_id = p_application and status = 'stored' returning * into c;
  if not found then return pg_catalog.jsonb_build_object('ok', false); end if;
  insert into website_financial.card_access_log (card_id, application_id, action, actor, detail) values (c.id, p_application, 'purge', pg_catalog.left(coalesce(p_actor,'system'),200), c.purge_reason);
  return pg_catalog.jsonb_build_object('ok', true);
end $f$;

-- Retention control: purge every stored card whose retention date has passed (called by the scheduled sweep; does nothing while retain_until is NULL).
create or replace function public.enrollment_card_purge_due_p2(p_limit integer) returns integer
language plpgsql security definer set search_path to '' as $f$
declare r record; n integer := 0;
begin
  for r in select application_id from website_financial.cards where status = 'stored' and retain_until is not null and retain_until < (now() at time zone 'America/New_York')::date order by retain_until limit least(greatest(p_limit,1),100) loop
    perform public.enrollment_card_purge_p2(r.application_id, 'retention period ended', 'system');
    n := n + 1;
  end loop;
  return n;
end $f$;

-- ---------------------------------------------------------------- evidence record (adds payment-source status and follow-up deadline)
create or replace function public.enrollment_record_v130_p2(p_application uuid, p_meta jsonb, p_agreements jsonb, p_terms jsonb) returns jsonb
language plpgsql set search_path to '' as $f$
declare a jsonb;
begin
  if exists (select 1 from website_private.enrollment_agreements where application_id = p_application) then
    return pg_catalog.jsonb_build_object('ok', true, 'duplicate', true); -- evidence is written once; a retry never rewrites it
  end if;
  update website_private.enrollment_applications set
    agreement_sha256 = p_meta->>'agreement_sha256', contract_version = p_meta->>'contract_version', contract_status = p_meta->>'contract_status',
    copay_status = p_meta->>'copay_status', wt_ack_status = p_meta->>'wt_ack_status', doc_summary = p_meta->'doc_summary',
    payment_status = p_meta->>'payment_status', payment_followup_due = nullif(p_meta->>'payment_followup_due','')::date,
    access_email_status = case when (p_meta->>'access') = 'true' and access_email_status = 'none' then 'pending' else access_email_status end, updated_at = now()
  where id = p_application;
  for a in select * from pg_catalog.jsonb_array_elements(p_agreements) loop
    insert into website_private.enrollment_agreements (application_id, kind, version, language, status, text_sha256, accepted_at, payload_enc)
    values (p_application, a->>'kind', a->>'version', a->>'language', a->>'status', a->>'text_sha256', (a->>'accepted_at')::timestamptz, a->>'payload_enc');
  end loop;
  if p_terms is not null then
    insert into website_private.enrollment_financial_terms (application_id, revision, payment_type, pfcc_status, copay_cents, copay_source, due_day, status)
    values (p_application, 1, p_terms->>'payment_type', p_terms->>'pfcc_status', (p_terms->>'copay_cents')::integer, p_terms->>'copay_source', p_terms->>'due_day', p_terms->>'status')
    on conflict (application_id, revision) do nothing;
  end if;
  return pg_catalog.jsonb_build_object('ok', true, 'duplicate', false);
end $f$;

-- ---------------------------------------------------------------- progress marking (superset of enrollment_mark_p1)
-- Adds: finalize status/attempts, parent-email attempt counter. A 1.3.0-E2 application is never 'complete' until it is finalized.
create or replace function public.enrollment_mark_p2(p_id uuid, p_patch jsonb) returns jsonb
language plpgsql set search_path to '' as $f$
declare r jsonb; v website_private.enrollment_applications;
begin
  r := public.enrollment_mark_p1(p_id, p_patch);
  if not coalesce((r->>'ok')::boolean, false) then return r; end if;
  update website_private.enrollment_applications set
    finalize_status = coalesce(p_patch->>'finalize_status', finalize_status),
    finalize_attempts = finalize_attempts + coalesce((p_patch->>'finalize_attempts_inc')::integer, 0),
    finalize_error = case when p_patch ? 'finalize_error' then pg_catalog.left(p_patch->>'finalize_error', 500) else finalize_error end,
    family_email_attempts = family_email_attempts + coalesce((p_patch->>'family_email_attempts_inc')::integer, 0)
  where id = p_id returning * into v;
  update website_private.enrollment_applications set status = case
      when finalize_status in ('pending','failed') and finalize_attempts >= 8 then 'needs_attention'
      when finalize_status in ('pending','failed') and status = 'complete' then 'received'
      else status end
   where id = p_id;
  return pg_catalog.jsonb_build_object('ok', true);
end $f$;

-- ---------------------------------------------------------------- sweep selector (superset): also retries finalization and failed parent emails (bounded, with back-off)
create or replace function public.enrollment_unfinished_p1(p_older_than_seconds integer, p_limit integer) returns jsonb
language sql stable set search_path to ''
as $function$
  select coalesce(pg_catalog.jsonb_agg(x.reference order by x.created_at), '[]'::jsonb) from (
    select reference, created_at from website_private.enrollment_applications
    where created_at < now() - pg_catalog.make_interval(secs => p_older_than_seconds)
      and created_at > now() - interval '30 days'
      and (
        ((pdf_status <> 'generated' or h2h_pdf_path is null or staff_email_status <> 'sent') and staff_email_attempts < 12)
        or (finalize_status in ('pending','failed') and finalize_attempts < 8)
        or (staff_email_status = 'sent' and staff_delivery_status in ('unknown','in_transit','delayed') and staff_delivery_checks < 60 and staff_email_sent_at > now() - interval '3 days')
        or (family_email_status = 'sent' and family_delivery_status in ('unknown','in_transit','delayed') and family_delivery_checks < 60 and family_email_sent_at > now() - interval '3 days')
        or (family_email_status = 'pending' and pdf_status = 'generated' and staff_email_status = 'sent')
        -- a failed parent email recovers by itself: at most 6 more tries, each at least 10 minutes x attempts after the last one
        or (family_email_status = 'failed' and family_email_attempts < 6 and pdf_status = 'generated' and staff_email_status = 'sent'
            and updated_at < now() - interval '10 minutes' * greatest(family_email_attempts, 1))
        or (access_email_status = 'pending' and pdf_status = 'generated' and family_email_attempts < 6)
        or (access_email_status = 'sent' and access_delivery_status in ('unknown','in_transit','delayed') and access_delivery_checks < 60 and access_email_sent_at > now() - interval '3 days')
      )
    order by created_at limit least(greatest(p_limit, 1), 25)
  ) x;
$function$;

do $$ declare f text; begin
  foreach f in array array[
    'public.enrollment_card_store_p2(uuid,text,text,text,text,timestamptz,text)',
    'public.enrollment_card_display_p2(uuid,text)',
    'public.enrollment_card_retention_p2(uuid,date,text)',
    'public.enrollment_card_purge_p2(uuid,text,text)',
    'public.enrollment_card_purge_due_p2(integer)',
    'public.enrollment_record_v130_p2(uuid,jsonb,jsonb,jsonb)',
    'public.enrollment_mark_p2(uuid,jsonb)',
    'public.enrollment_unfinished_p1(integer,integer)'] loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
end $$;
revoke all on function website_private.enrollment_finalize_default() from public, anon, authenticated;

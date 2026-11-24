-- 1.1.0-P1 closeout: persisted staff-alert reference + duplicate-submission handling.
-- Additive only. Existing rows are NOT modified (reference stays NULL for records created before this migration).
-- The existing *_p0 functions are left in place (rollback path); the website-inquiry Edge Function switches to *_p1.

alter table website_private.inquiries          add column if not exists reference text;
alter table website_private.child_registrations add column if not exists reference text;

create unique index if not exists inquiries_reference_key
  on website_private.inquiries (reference) where reference is not null;
create unique index if not exists child_registrations_reference_key
  on website_private.child_registrations (reference) where reference is not null;

-- Returns {"ok":true,"reference":"H2H-YYYYMMDD-XXXXXXXX","duplicate":false|true} or {"ok":false} when rate limited.
-- "duplicate" means an identical submission (same contact, same kind, same content) from the same email was stored in the
-- last 10 minutes (double click / retry): the existing reference is returned and nothing new is stored.
-- Different kinds, different children or different content are never treated as duplicates.
create or replace function public.submit_website_inquiry_p1(
  p_kind text, p_preferred_language text, p_adult_name text, p_email text, p_phone text,
  p_age_group text, p_timeframe text, p_source_fingerprint text, p_consent_version text, p_details jsonb
) returns jsonb
language plpgsql
set search_path to ''
as $function$
declare
  v_existing text;
  v_id uuid := gen_random_uuid();
  v_ref text;
begin
  if p_source_fingerprint is not null then
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('h2h-source'), pg_catalog.hashtext(p_source_fingerprint));
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('h2h-email'), pg_catalog.hashtext(lower(p_email)));

  select i.reference into v_existing
  from website_private.inquiries i
  where lower(i.email) = lower(p_email)
    and i.kind = p_kind
    and i.reference is not null
    and i.created_at > now() - interval '10 minutes'
    and lower(i.adult_name) = lower(p_adult_name)
    and i.phone is not distinct from p_phone
    and i.age_group is not distinct from p_age_group
    and i.timeframe is not distinct from p_timeframe
    and i.preferred_language = p_preferred_language
    and i.intake_details is not distinct from p_details
  order by i.created_at desc
  limit 1;
  if v_existing is not null then
    return pg_catalog.jsonb_build_object('ok', true, 'reference', v_existing, 'duplicate', true);
  end if;

  if p_source_fingerprint is not null and (select count(*) from website_private.inquiries
      where source_fingerprint = p_source_fingerprint and created_at > now() - interval '1 hour') >= 15 then
    return pg_catalog.jsonb_build_object('ok', false);
  end if;
  if (select count(*) from website_private.inquiries
      where lower(email) = lower(p_email) and created_at > now() - interval '1 hour') >= 3 then
    return pg_catalog.jsonb_build_object('ok', false);
  end if;

  v_ref := 'H2H-' || pg_catalog.to_char((now() at time zone 'America/New_York')::date, 'YYYYMMDD') || '-'
           || pg_catalog.upper(pg_catalog.substr(pg_catalog.replace(v_id::text, '-', ''), 1, 8));
  insert into website_private.inquiries (
    id, kind, preferred_language, adult_name, email, phone, age_group, timeframe,
    source_fingerprint, consent_version, intake_details, reference
  ) values (
    v_id, p_kind, p_preferred_language, p_adult_name, p_email, p_phone, p_age_group, p_timeframe,
    p_source_fingerprint, p_consent_version, p_details, v_ref
  );
  return pg_catalog.jsonb_build_object('ok', true, 'reference', v_ref, 'duplicate', false);
end;
$function$;

create or replace function public.submit_child_registration_p1(
  p_guardian_name text, p_email text, p_phone text, p_child_name text, p_age_group text,
  p_timeframe text, p_preferred_language text, p_source_fingerprint text, p_consent_version text
) returns jsonb
language plpgsql
set search_path to ''
as $function$
declare
  v_existing text;
  v_id uuid := gen_random_uuid();
  v_ref text;
begin
  if p_source_fingerprint is not null then
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('h2h-registration-source'), pg_catalog.hashtext(p_source_fingerprint));
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('h2h-registration-email'), pg_catalog.hashtext(lower(p_email)));

  select r.reference into v_existing
  from website_private.child_registrations r
  where lower(r.email) = lower(p_email)
    and r.reference is not null
    and r.created_at > now() - interval '10 minutes'
    and lower(r.guardian_name) = lower(p_guardian_name)
    and lower(r.child_name) = lower(p_child_name)
    and r.phone = p_phone
    and r.age_group = p_age_group
    and r.timeframe is not distinct from p_timeframe
    and r.preferred_language = p_preferred_language
  order by r.created_at desc
  limit 1;
  if v_existing is not null then
    return pg_catalog.jsonb_build_object('ok', true, 'reference', v_existing, 'duplicate', true);
  end if;

  if p_source_fingerprint is not null and (select count(*) from website_private.child_registrations
      where source_fingerprint = p_source_fingerprint and created_at > now() - interval '1 hour') >= 15 then
    return pg_catalog.jsonb_build_object('ok', false);
  end if;
  if (select count(*) from website_private.child_registrations
      where lower(email) = lower(p_email) and created_at > now() - interval '1 hour') >= 5 then
    return pg_catalog.jsonb_build_object('ok', false);
  end if;

  v_ref := 'H2H-' || pg_catalog.to_char((now() at time zone 'America/New_York')::date, 'YYYYMMDD') || '-'
           || pg_catalog.upper(pg_catalog.substr(pg_catalog.replace(v_id::text, '-', ''), 1, 8));
  insert into website_private.child_registrations (
    id, guardian_name, email, phone, child_name, age_group, timeframe, preferred_language,
    source_fingerprint, consent_version, reference
  ) values (
    v_id, p_guardian_name, p_email, p_phone, p_child_name, p_age_group, p_timeframe, p_preferred_language,
    p_source_fingerprint, p_consent_version, v_ref
  );
  return pg_catalog.jsonb_build_object('ok', true, 'reference', v_ref, 'duplicate', false);
end;
$function$;

revoke all on function public.submit_website_inquiry_p1(text, text, text, text, text, text, text, text, text, jsonb) from public, anon, authenticated;
revoke all on function public.submit_child_registration_p1(text, text, text, text, text, text, text, text, text) from public, anon, authenticated;
grant execute on function public.submit_website_inquiry_p1(text, text, text, text, text, text, text, text, text, jsonb) to service_role;
grant execute on function public.submit_child_registration_p1(text, text, text, text, text, text, text, text, text) to service_role;

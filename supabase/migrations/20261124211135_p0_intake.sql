alter table website_private.inquiries add column consent_version text, add column intake_details jsonb;
alter table website_private.child_registrations add column consent_version text;
alter table website_private.inquiries drop constraint inquiries_kind_check;
alter table website_private.inquiries add constraint inquiries_kind_check check (kind in ('enrollment','tour','contact','information'));
create function public.submit_website_inquiry_p0(
  p_kind text, p_preferred_language text, p_adult_name text, p_email text,
  p_phone text, p_age_group text, p_timeframe text, p_source_fingerprint text, p_consent_version text, p_details jsonb
) returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if p_source_fingerprint is not null then
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('h2h-source'), pg_catalog.hashtext(p_source_fingerprint));
    if (select count(*) from website_private.inquiries
        where source_fingerprint = p_source_fingerprint and created_at > now() - interval '1 hour') >= 15 then
      return false;
    end if;
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('h2h-email'), pg_catalog.hashtext(lower(p_email)));
  if (select count(*) from website_private.inquiries
      where lower(email) = lower(p_email) and created_at > now() - interval '1 hour') >= 3 then
    return false;
  end if;

  insert into website_private.inquiries (
    kind, preferred_language, adult_name, email, phone, age_group, timeframe, source_fingerprint, consent_version, intake_details
  ) values (
    p_kind, p_preferred_language, p_adult_name, p_email, p_phone, p_age_group, p_timeframe, p_source_fingerprint, p_consent_version, p_details
  );
  return true;
end;
$$;
revoke all on function public.submit_website_inquiry_p0(text,text,text,text,text,text,text,text,text,jsonb) from public, anon, authenticated;
grant execute on function public.submit_website_inquiry_p0(text,text,text,text,text,text,text,text,text,jsonb) to service_role;

create function public.submit_child_registration_p0(
  p_guardian_name text, p_email text, p_phone text, p_child_name text, p_age_group text,
  p_timeframe text, p_preferred_language text, p_source_fingerprint text, p_consent_version text
) returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if p_source_fingerprint is not null then
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('h2h-registration-source'), pg_catalog.hashtext(p_source_fingerprint));
    if (select count(*) from website_private.child_registrations
        where source_fingerprint = p_source_fingerprint and created_at > now() - interval '1 hour') >= 15 then
      return false;
    end if;
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('h2h-registration-email'), pg_catalog.hashtext(lower(p_email)));
  if (select count(*) from website_private.child_registrations
      where lower(email) = lower(p_email) and created_at > now() - interval '1 hour') >= 5 then
    return false;
  end if;

  insert into website_private.child_registrations (
    guardian_name, email, phone, child_name, age_group, timeframe, preferred_language, source_fingerprint, consent_version
  ) values (
    p_guardian_name, p_email, p_phone, p_child_name, p_age_group, p_timeframe, p_preferred_language, p_source_fingerprint, p_consent_version
  );
  return true;
end;
$$;
revoke all on function public.submit_child_registration_p0(text,text,text,text,text,text,text,text,text)
  from public, anon, authenticated;
grant execute on function public.submit_child_registration_p0(text,text,text,text,text,text,text,text,text)
  to service_role;

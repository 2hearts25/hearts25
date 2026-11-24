
create table website_private.child_registrations (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  guardian_name text not null check (char_length(guardian_name) between 2 and 100),
  email text not null check (char_length(email) between 3 and 254),
  phone text not null check (char_length(phone) between 7 and 32),
  child_name text not null check (char_length(child_name) between 2 and 100),
  age_group text not null check (age_group in ('infant-toddler','preschool','school-age','unsure')),
  timeframe text check (timeframe in ('soon','1-3-months','later','unsure')),
  preferred_language text not null check (preferred_language in ('en','es','ar','sw','fr')),
  source_fingerprint text check (source_fingerprint is null or char_length(source_fingerprint) = 64),
  consent_at timestamptz not null default now(),
  status text not null default 'new' check (status in ('new','contacted','closed'))
);
alter table website_private.child_registrations enable row level security;
revoke all on website_private.child_registrations from public, anon, authenticated, service_role;
grant select, insert on website_private.child_registrations to service_role;
create index child_registrations_email_recent_idx
  on website_private.child_registrations (lower(email), created_at desc);
create index child_registrations_source_recent_idx
  on website_private.child_registrations (source_fingerprint, created_at desc);

create function public.submit_child_registration(
  p_guardian_name text, p_email text, p_phone text, p_child_name text, p_age_group text,
  p_timeframe text, p_preferred_language text, p_source_fingerprint text
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
    guardian_name, email, phone, child_name, age_group, timeframe, preferred_language, source_fingerprint
  ) values (
    p_guardian_name, p_email, p_phone, p_child_name, p_age_group, p_timeframe, p_preferred_language, p_source_fingerprint
  );
  return true;
end;
$$;
revoke all on function public.submit_child_registration(text,text,text,text,text,text,text,text)
  from public, anon, authenticated;
grant execute on function public.submit_child_registration(text,text,text,text,text,text,text,text)
  to service_role;


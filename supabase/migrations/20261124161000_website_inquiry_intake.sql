
create schema website_private;
revoke all on schema website_private from public, anon, authenticated;
grant usage on schema website_private to service_role;

create table website_private.inquiries (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  kind text not null check (kind in ('enrollment', 'tour', 'contact')),
  preferred_language text not null check (preferred_language in ('en', 'es', 'ar', 'sw', 'fr')),
  adult_name text not null check (char_length(adult_name) between 2 and 100),
  email text not null check (char_length(email) between 3 and 254),
  phone text check (phone is null or char_length(phone) between 7 and 32),
  age_group text check (age_group in ('infant-toddler', 'preschool', 'school-age', 'unsure')),
  timeframe text check (timeframe in ('soon', '1-3-months', 'later', 'unsure')),
  source_fingerprint text,
  consent_at timestamptz not null default now(),
  status text not null default 'new' check (status in ('new', 'contacted', 'closed'))
);
alter table website_private.inquiries enable row level security;
revoke all on website_private.inquiries from public, anon, authenticated, service_role;
grant select, insert on website_private.inquiries to service_role;
create index inquiries_email_recent_idx on website_private.inquiries (lower(email), created_at desc);
create index inquiries_source_recent_idx on website_private.inquiries (source_fingerprint, created_at desc);

create function public.submit_website_inquiry(
  p_kind text, p_preferred_language text, p_adult_name text, p_email text,
  p_phone text, p_age_group text, p_timeframe text, p_source_fingerprint text
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
    kind, preferred_language, adult_name, email, phone, age_group, timeframe, source_fingerprint
  ) values (
    p_kind, p_preferred_language, p_adult_name, p_email, p_phone, p_age_group, p_timeframe, p_source_fingerprint
  );
  return true;
end;
$$;
revoke all on function public.submit_website_inquiry(text,text,text,text,text,text,text,text) from public, anon, authenticated;
grant execute on function public.submit_website_inquiry(text,text,text,text,text,text,text,text) to service_role;


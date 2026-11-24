-- 1.1.0-P1 first-party, privacy-conscious analytics.
-- Exported from the production schema (applied to production as migration version 20261124213715).
-- Stores only daily aggregate counters: no IP address, user agent, cookie, visitor id, name, email or form text.
-- Written to be re-runnable (idempotent) so it can be replayed on a fresh project; do not re-apply it to production.

create table if not exists website_private.analytics_daily (
  day          date   not null,
  event        text   not null,
  language     text   not null default '',
  path         text   not null default '',
  referrer     text   not null default '',
  utm_source   text   not null default '',
  utm_medium   text   not null default '',
  utm_campaign text   not null default '',
  utm_content  text   not null default '',
  utm_term     text   not null default '',
  total        bigint not null default 0,
  constraint analytics_daily_pkey primary key
    (day, event, language, path, referrer, utm_source, utm_medium, utm_campaign, utm_content, utm_term),
  constraint analytics_event_allowed check (event = any (array[
    'page_view', 'register_click', 'tour_click', 'info_click', 'phone_click',
    'form_start_registration', 'form_start_tour', 'form_start_information', 'form_start_contact', 'form_start_enrollment',
    'registration_success', 'tour_success', 'information_success', 'contact_success', 'enrollment_success'
  ]))
);

alter table website_private.analytics_daily enable row level security;
-- No policies: anon and authenticated have no access. Only the service role (Edge Functions) can write.
revoke all on table website_private.analytics_daily from public, anon, authenticated;
grant insert, select, update on table website_private.analytics_daily to service_role;

create or replace function public.record_site_event(
  p_event text, p_language text, p_path text, p_referrer text,
  p_source text, p_medium text, p_campaign text, p_content text, p_term text
) returns boolean
language plpgsql
set search_path to ''
as $function$
declare
  v_day date := (now() at time zone 'America/New_York')::date;
  v_rows bigint;
begin
  if p_language not in ('en','es','ar','sw','fr') then p_language := ''; end if;
  -- cap the number of distinct rows per day so junk values cannot grow the table without bound
  select count(*) into v_rows from website_private.analytics_daily where day = v_day;
  if v_rows >= 5000 and not exists (
    select 1 from website_private.analytics_daily
    where day = v_day and event = p_event and language = coalesce(p_language,'') and path = coalesce(p_path,'')
      and referrer = coalesce(p_referrer,'') and utm_source = coalesce(p_source,'') and utm_medium = coalesce(p_medium,'')
      and utm_campaign = coalesce(p_campaign,'') and utm_content = coalesce(p_content,'') and utm_term = coalesce(p_term,'')
  ) then
    return false;
  end if;
  insert into website_private.analytics_daily
    (day, event, language, path, referrer, utm_source, utm_medium, utm_campaign, utm_content, utm_term, total)
  values (v_day, p_event, coalesce(p_language,''), coalesce(p_path,''), coalesce(p_referrer,''),
    coalesce(p_source,''), coalesce(p_medium,''), coalesce(p_campaign,''), coalesce(p_content,''), coalesce(p_term,''), 1)
  on conflict (day, event, language, path, referrer, utm_source, utm_medium, utm_campaign, utm_content, utm_term)
  do update set total = website_private.analytics_daily.total + 1;
  return true;
end;
$function$;

revoke all on function public.record_site_event(text, text, text, text, text, text, text, text, text) from public, anon, authenticated;
grant execute on function public.record_site_event(text, text, text, text, text, text, text, text, text) to service_role;

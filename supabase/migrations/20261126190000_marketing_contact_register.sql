-- Private marketing contact register (newsletter). Separate from child, medical and financial records: it holds only an email address,
-- the subscription state, and the consent evidence (choice, date, source, language, wording version). It is deliberately NOT linked to an
-- enrollment application, child or family record. RLS is on with no policies; only the service role (the edge function) can reach it.
create table if not exists website_private.marketing_contacts (
  id uuid primary key default gen_random_uuid(),
  email text not null check (email = lower(btrim(email)) and length(email) <= 254 and email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]{2,}$'),
  status text not null check (status in ('subscribed', 'unsubscribed', 'declined')),
  language text not null check (language in ('en', 'es', 'fr', 'ar', 'sw')),
  source text not null,
  consent_version text not null,
  consent_sha256 text,
  subscribed_at timestamptz,
  unsubscribed_at timestamptz,
  status_changed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists marketing_contacts_email_uq on website_private.marketing_contacts (email);

create table if not exists website_private.marketing_consent_events (
  id bigint generated always as identity primary key,
  contact_id uuid not null references website_private.marketing_contacts(id) on delete cascade,
  event text not null check (event in ('opt_in', 'opt_out', 'declined', 'unsubscribe')),
  occurred_at timestamptz not null default now(),
  source text not null,
  language text not null,
  consent_version text not null,
  consent_sha256 text,
  event_key text
);
create unique index if not exists marketing_consent_events_key_uq on website_private.marketing_consent_events (event_key) where event_key is not null;
create index if not exists marketing_consent_events_contact_idx on website_private.marketing_consent_events (contact_id);

alter table website_private.marketing_contacts enable row level security;
alter table website_private.marketing_consent_events enable row level security;
revoke all on website_private.marketing_contacts, website_private.marketing_consent_events from public, anon, authenticated;
grant select, insert, update on website_private.marketing_contacts to service_role;
grant select, insert on website_private.marketing_consent_events to service_role;

-- Records an explicit newsletter choice made on the enrollment application. p_choice is 'yes' or 'no'; anything else (no selection) is a no-op,
-- because no selection is no consent and must never create or change a contact. The email is normalized and the contact upserted, so there is
-- never a duplicate. A "no" never creates a subscription and unsubscribes an existing one; an unsubscribed or declined contact becomes
-- subscribed ONLY by a fresh explicit "yes". p_event_key makes a retried submission idempotent.
create or replace function public.marketing_record_p3(p_email text, p_choice text, p_language text, p_source text, p_version text, p_sha text, p_event_key text)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare em text := lower(btrim(coalesce(p_email, ''))); cid uuid; cur text; ev text; act text;
begin
  if p_choice not in ('yes', 'no') then return jsonb_build_object('ok', true, 'action', 'none'); end if;
  if em !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]{2,}$' or length(em) > 254 then return jsonb_build_object('ok', true, 'action', 'no_email'); end if;
  if p_event_key is not null and exists (select 1 from website_private.marketing_consent_events where event_key = p_event_key) then
    return jsonb_build_object('ok', true, 'action', 'replay');
  end if;
  insert into website_private.marketing_contacts (email, status, language, source, consent_version, consent_sha256, subscribed_at)
    values (em, case p_choice when 'yes' then 'subscribed' else 'declined' end, p_language, p_source, p_version, p_sha, case p_choice when 'yes' then now() end)
    on conflict (email) do nothing returning id into cid;
  if cid is not null then
    act := case p_choice when 'yes' then 'created_subscribed' else 'created_declined' end; ev := case p_choice when 'yes' then 'opt_in' else 'declined' end;
  else
    select id, status into cid, cur from website_private.marketing_contacts where email = em for update;
    if p_choice = 'yes' then
      update website_private.marketing_contacts set status = 'subscribed', language = p_language, source = p_source, consent_version = p_version, consent_sha256 = p_sha,
        subscribed_at = case when cur = 'subscribed' then subscribed_at else now() end, unsubscribed_at = null,
        status_changed_at = case when cur = 'subscribed' then status_changed_at else now() end, updated_at = now() where id = cid;
      act := case when cur = 'subscribed' then 'already_subscribed' else 'resubscribed' end; ev := 'opt_in';
    elsif cur = 'subscribed' then
      update website_private.marketing_contacts set status = 'unsubscribed', unsubscribed_at = now(), status_changed_at = now(), updated_at = now() where id = cid;
      act := 'unsubscribed'; ev := 'opt_out';
    else
      act := 'kept_' || cur; ev := 'declined'; -- an unsubscribed/declined contact stays exactly as it is
    end if;
  end if;
  insert into website_private.marketing_consent_events (contact_id, event, source, language, consent_version, consent_sha256, event_key)
    values (cid, ev, p_source, p_language, p_version, p_sha, p_event_key);
  return jsonb_build_object('ok', true, 'action', act);
end $$;
revoke all on function public.marketing_record_p3(text, text, text, text, text, text, text) from public, anon, authenticated;
grant execute on function public.marketing_record_p3(text, text, text, text, text, text, text) to service_role;

-- Unsubscribe (newsletter link or a written request): preserves the preference until a fresh explicit "yes".
create or replace function public.marketing_unsubscribe_p3(p_email text, p_source text)
returns jsonb language plpgsql security definer set search_path to '' as $$
declare em text := lower(btrim(coalesce(p_email, ''))); cid uuid; cur text; lang text;
begin
  select id, status, language into cid, cur, lang from website_private.marketing_contacts where email = em for update;
  if cid is null then return jsonb_build_object('ok', true, 'action', 'unknown'); end if;
  if cur = 'subscribed' then
    update website_private.marketing_contacts set status = 'unsubscribed', unsubscribed_at = now(), status_changed_at = now(), updated_at = now() where id = cid;
    insert into website_private.marketing_consent_events (contact_id, event, source, language, consent_version) values (cid, 'unsubscribe', coalesce(p_source, 'unsubscribe'), lang, 'NL-1.0');
  end if;
  return jsonb_build_object('ok', true, 'action', case when cur = 'subscribed' then 'unsubscribed' else 'kept_' || cur end);
end $$;
revoke all on function public.marketing_unsubscribe_p3(text, text) from public, anon, authenticated;
grant execute on function public.marketing_unsubscribe_p3(text, text) to service_role;

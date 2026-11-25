-- 1.2.0: comprehensive child enrollment application. ADDITIVE ONLY — no existing table, column, function or row is changed.
-- website_private.child_registrations (the earlier short pre-registration) is left exactly as it is.
--
-- Privacy model: names, dates of birth, health answers, contacts and signature images live ONLY inside payload_enc,
-- which the Edge function encrypts (AES-256-GCM) before it reaches the database. This table keeps only operational
-- metadata (program, status, delivery state) and keyed hashes (HMAC) used for duplicate / rate-limit checks.

create table if not exists website_private.enrollment_applications (
  id                 uuid primary key default gen_random_uuid(),
  reference          text not null unique,
  idempotency_key    text not null unique,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  form_version       text not null,
  language           text not null check (language in ('en','es','fr','ar','sw')),
  program            text not null check (program in ('infant-toddler','preschool','school-age')),
  payment_type       text,
  start_date         date,
  parent2_status     text not null default 'na' check (parent2_status in ('na','now','later')),
  contact_email_hash text not null,
  child_hash         text not null,
  source_fingerprint text,
  key_version        integer not null default 1,
  payload_enc        text not null,
  payload_bytes      integer,
  status             text not null default 'received' check (status in ('received','complete','needs_attention')),
  pdf_status         text not null default 'pending' check (pdf_status in ('pending','generated','failed')),
  pdf_path           text,
  pdf_sha256         text,
  pdf_bytes          integer,
  pdf_pages          integer,
  pdf_attempts       integer not null default 0,
  pdf_error          text,
  pdf_generated_at   timestamptz,
  staff_email_status   text not null default 'pending' check (staff_email_status in ('pending','sent','failed')),
  staff_email_id       text,
  staff_email_attempts integer not null default 0,
  staff_email_error    text,
  staff_email_sent_at  timestamptz,
  family_email_status  text not null default 'pending' check (family_email_status in ('pending','sent','failed','skipped')),
  family_email_id      text,
  family_email_error   text,
  family_email_sent_at timestamptz
);

create index if not exists enrollment_applications_created_idx on website_private.enrollment_applications (created_at desc);
create index if not exists enrollment_applications_email_idx   on website_private.enrollment_applications (contact_email_hash, created_at desc);
create index if not exists enrollment_applications_source_idx  on website_private.enrollment_applications (source_fingerprint, created_at desc) where source_fingerprint is not null;
create index if not exists enrollment_applications_attention_idx on website_private.enrollment_applications (created_at) where status <> 'complete';

alter table website_private.enrollment_applications enable row level security;   -- no policies: nothing is reachable through the public API
revoke all on website_private.enrollment_applications from public, anon, authenticated;
grant select, insert, update on website_private.enrollment_applications to service_role;

-- Private storage for the encrypted PDF copies. No storage.objects policies are created, so only the service role can touch it.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('enrollment-pdfs', 'enrollment-pdfs', false, 5242880, array['application/octet-stream'])
on conflict (id) do nothing;

-- Store a new application. Returns {"ok":true,"id","reference","duplicate":bool,"status":{...}} or {"ok":false,"reason":"rate"}.
-- duplicate=true means the same idempotency key, or the same parent email + same child, was stored in the last 24 hours:
-- the existing record is returned and nothing new is stored (so a double click or a flaky connection never creates two files).
create or replace function public.enrollment_submit_p1(
  p_idempotency_key text, p_form_version text, p_language text, p_program text, p_payment_type text, p_start_date date,
  p_parent2_status text, p_email_hash text, p_child_hash text, p_source_fingerprint text, p_payload_enc text, p_key_version integer
) returns jsonb
language plpgsql
set search_path to ''
as $function$
declare
  v_row website_private.enrollment_applications;
  v_id uuid := gen_random_uuid();
  v_ref text;
begin
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('h2h-enrollment-email'), pg_catalog.hashtext(p_email_hash));
  if p_source_fingerprint is not null then
    perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('h2h-enrollment-source'), pg_catalog.hashtext(p_source_fingerprint));
  end if;

  select * into v_row from website_private.enrollment_applications where idempotency_key = p_idempotency_key;
  if not found then
    select * into v_row from website_private.enrollment_applications
    where contact_email_hash = p_email_hash and child_hash = p_child_hash and created_at > now() - interval '24 hours'
    order by created_at desc limit 1;
  end if;
  if found then
    return pg_catalog.jsonb_build_object('ok', true, 'duplicate', true, 'id', v_row.id, 'reference', v_row.reference,
      'status', pg_catalog.jsonb_build_object('pdf', v_row.pdf_status, 'staff', v_row.staff_email_status, 'family', v_row.family_email_status));
  end if;

  if p_source_fingerprint is not null and (select count(*) from website_private.enrollment_applications
      where source_fingerprint = p_source_fingerprint and created_at > now() - interval '1 hour') >= 10 then
    return pg_catalog.jsonb_build_object('ok', false, 'reason', 'rate');
  end if;
  if (select count(*) from website_private.enrollment_applications
      where contact_email_hash = p_email_hash and created_at > now() - interval '1 hour') >= 5 then
    return pg_catalog.jsonb_build_object('ok', false, 'reason', 'rate');
  end if;

  v_ref := 'H2H-' || pg_catalog.to_char((now() at time zone 'America/New_York')::date, 'YYYYMMDD') || '-'
           || pg_catalog.upper(pg_catalog.substr(pg_catalog.replace(v_id::text, '-', ''), 1, 8));
  insert into website_private.enrollment_applications (
    id, reference, idempotency_key, form_version, language, program, payment_type, start_date, parent2_status,
    contact_email_hash, child_hash, source_fingerprint, key_version, payload_enc, payload_bytes
  ) values (
    v_id, v_ref, p_idempotency_key, p_form_version, p_language, p_program, p_payment_type, p_start_date, p_parent2_status,
    p_email_hash, p_child_hash, p_source_fingerprint, p_key_version, p_payload_enc, pg_catalog.length(p_payload_enc)
  );
  return pg_catalog.jsonb_build_object('ok', true, 'duplicate', false, 'id', v_id, 'reference', v_ref,
    'status', pg_catalog.jsonb_build_object('pdf', 'pending', 'staff', 'pending', 'family', 'pending'));
end;
$function$;

-- Read one application (including the encrypted payload) for PDF regeneration / authorised retry. Service role only.
create or replace function public.enrollment_get_p1(p_reference text) returns jsonb
language sql stable set search_path to ''
as $function$
  select pg_catalog.to_jsonb(a) from website_private.enrollment_applications a where a.reference = p_reference;
$function$;

-- Record PDF / email progress. Only delivery-state columns can be changed; answers can never be altered through this function.
create or replace function public.enrollment_mark_p1(p_id uuid, p_patch jsonb) returns jsonb
language plpgsql
set search_path to ''
as $function$
declare v website_private.enrollment_applications;
begin
  update website_private.enrollment_applications set
    pdf_status = coalesce(p_patch->>'pdf_status', pdf_status),
    pdf_path = coalesce(p_patch->>'pdf_path', pdf_path),
    pdf_sha256 = coalesce(p_patch->>'pdf_sha256', pdf_sha256),
    pdf_bytes = coalesce((p_patch->>'pdf_bytes')::integer, pdf_bytes),
    pdf_pages = coalesce((p_patch->>'pdf_pages')::integer, pdf_pages),
    pdf_attempts = pdf_attempts + coalesce((p_patch->>'pdf_attempts_inc')::integer, 0),
    pdf_error = case when p_patch ? 'pdf_error' then pg_catalog.left(p_patch->>'pdf_error', 500) else pdf_error end,
    pdf_generated_at = case when p_patch->>'pdf_status' = 'generated' then now() else pdf_generated_at end,
    staff_email_status = coalesce(p_patch->>'staff_email_status', staff_email_status),
    staff_email_id = coalesce(p_patch->>'staff_email_id', staff_email_id),
    staff_email_attempts = staff_email_attempts + coalesce((p_patch->>'staff_email_attempts_inc')::integer, 0),
    staff_email_error = case when p_patch ? 'staff_email_error' then pg_catalog.left(p_patch->>'staff_email_error', 500) else staff_email_error end,
    staff_email_sent_at = case when p_patch->>'staff_email_status' = 'sent' then now() else staff_email_sent_at end,
    family_email_status = coalesce(p_patch->>'family_email_status', family_email_status),
    family_email_id = coalesce(p_patch->>'family_email_id', family_email_id),
    family_email_error = case when p_patch ? 'family_email_error' then pg_catalog.left(p_patch->>'family_email_error', 500) else family_email_error end,
    family_email_sent_at = case when p_patch->>'family_email_status' = 'sent' then now() else family_email_sent_at end,
    updated_at = now()
  where id = p_id
  returning * into v;
  if not found then return pg_catalog.jsonb_build_object('ok', false); end if;
  update website_private.enrollment_applications
     set status = case when pdf_status = 'generated' and staff_email_status = 'sent' then 'complete' when pdf_status = 'failed' or staff_email_status = 'failed' then 'needs_attention' else 'received' end
   where id = p_id;
  return pg_catalog.jsonb_build_object('ok', true);
end;
$function$;

-- Applications whose PDF or staff email is not finished (for the authorised retry sweep).
create or replace function public.enrollment_unfinished_p1(p_older_than_seconds integer, p_limit integer) returns jsonb
language sql stable set search_path to ''
as $function$
  select coalesce(pg_catalog.jsonb_agg(x.reference order by x.created_at), '[]'::jsonb) from (
    select reference, created_at from website_private.enrollment_applications
    where (pdf_status <> 'generated' or staff_email_status <> 'sent')
      and created_at < now() - pg_catalog.make_interval(secs => p_older_than_seconds)
      and created_at > now() - interval '30 days'
      and staff_email_attempts < 12
    order by created_at limit least(greatest(p_limit, 1), 25)
  ) x;
$function$;

revoke all on function public.enrollment_submit_p1(text,text,text,text,text,date,text,text,text,text,text,integer) from public, anon, authenticated;
revoke all on function public.enrollment_get_p1(text) from public, anon, authenticated;
revoke all on function public.enrollment_mark_p1(uuid, jsonb) from public, anon, authenticated;
revoke all on function public.enrollment_unfinished_p1(integer, integer) from public, anon, authenticated;
grant execute on function public.enrollment_submit_p1(text,text,text,text,text,date,text,text,text,text,text,integer) to service_role;
grant execute on function public.enrollment_get_p1(text) to service_role;
grant execute on function public.enrollment_mark_p1(uuid, jsonb) to service_role;
grant execute on function public.enrollment_unfinished_p1(integer, integer) to service_role;

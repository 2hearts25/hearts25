-- 1.3.0 enrollment completion: private supporting-document storage, immutable agreement evidence, PFCC financial-terms records,
-- verified parent document access, staff access allowlist and server-side feature flags.
-- ADDITIVE AND BACKWARD COMPATIBLE: no table, column, row, policy or key is dropped or rewritten. Existing 1.2.0-E1 applications and
-- the live 1.2.0 workflow are untouched. Every new capability is OFF until website_private.feature_flags says otherwise.
-- Access model (same as 1.2.x): RLS enabled with NO policies, all privileges revoked from anon/authenticated; only the service role
-- (used solely inside Edge Functions) can reach these tables, through the service-role-only functions below.

-- ---------------------------------------------------------------- feature flags
create table if not exists website_private.feature_flags (
  key        text primary key,
  enabled    boolean not null default false,
  note       text,
  updated_at timestamptz not null default now()
);
insert into website_private.feature_flags (key, enabled, note) values
  ('enrollment_v130', false, 'Accept form 1.3.0-E2 submissions (contract step, PFCC agreement, insurance, uploads). Turn on only when the 1.3.0 website is published.'),
  ('enrollment_uploads', false, 'Accept supporting-document uploads for form 1.3.0-E2.'),
  ('parent_document_access', false, 'Email parents a verified, expiring link to their two enrollment PDFs (1.3.0-E2 applications only).'),
  ('staff_document_access', false, 'Allow allowlisted, signed-in staff to list and download uploaded documents.')
on conflict (key) do nothing;

-- ---------------------------------------------------------------- application columns (1.3.0 metadata only; answers stay encrypted)
alter table website_private.enrollment_applications
  add column if not exists agreement_sha256        text,
  add column if not exists contract_version        text,
  add column if not exists contract_status         text,          -- 'partial' | 'final' | 'not_presented' (1.2.0-E1)
  add column if not exists copay_status            text,          -- 'not_pfcc' | 'unknown' | 'parent_reported' | 'zero_reported' | 'confirmed'
  add column if not exists wt_ack_status           text,          -- 'acknowledged' | 'not_received' | 'not_presented'
  add column if not exists doc_summary             jsonb,         -- {category: count}; never names or contents
  add column if not exists access_email_status     text not null default 'none',
  add column if not exists access_email_id         text,
  add column if not exists access_email_error      text,
  add column if not exists access_email_sent_at    timestamptz,
  add column if not exists access_delivery_status  text not null default 'unknown',
  add column if not exists access_delivery_event   text,
  add column if not exists access_delivery_checks  integer not null default 0;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'enrollment_access_email_chk') then
    alter table website_private.enrollment_applications add constraint enrollment_access_email_chk check (access_email_status in ('none','pending','sent','failed','skipped'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'enrollment_access_delivery_chk') then
    alter table website_private.enrollment_applications add constraint enrollment_access_delivery_chk check (access_delivery_status in ('unknown','in_transit','delivered','delayed','bounced','complained','failed','suppressed','unverifiable'));
  end if;
end $$;

-- ---------------------------------------------------------------- upload sessions and documents
create table if not exists website_private.enrollment_upload_sessions (
  id                 uuid primary key default gen_random_uuid(),
  token_hash         text not null unique,                 -- HMAC of the random session token; the token itself is never stored
  created_at         timestamptz not null default now(),
  expires_at         timestamptz not null,
  source_fingerprint text,
  status             text not null default 'open' check (status in ('open','attached','abandoned')),
  application_id     uuid references website_private.enrollment_applications(id),
  file_count         integer not null default 0,
  total_bytes        bigint not null default 0
);
create index if not exists enrollment_upload_sessions_source_idx on website_private.enrollment_upload_sessions (source_fingerprint, created_at desc);
create index if not exists enrollment_upload_sessions_open_idx on website_private.enrollment_upload_sessions (expires_at) where status = 'open';

create table if not exists website_private.enrollment_documents (
  id             uuid primary key default gen_random_uuid(),
  session_id     uuid not null references website_private.enrollment_upload_sessions(id),
  application_id uuid references website_private.enrollment_applications(id),
  category       text not null check (category in ('insurance-front','insurance-back','immunization','physical-exam','health-care-plan','medication-authorization','dietary-statement','custody','pfcc','other')),
  status         text not null default 'uploading' check (status in ('uploading','stored','rejected','replaced','removed','abandoned','deleted')),
  scan_status    text not null default 'quarantined' check (scan_status in ('quarantined','structure_checked','released','blocked')),
  review_status  text not null default 'unreviewed' check (review_status in ('unreviewed','accepted','rejected')),
  object_path    text not null unique,                     -- random ids only: never a child's or family's name
  mime           text not null check (mime in ('application/pdf','image/jpeg','image/png')),
  bytes          integer not null check (bytes > 0 and bytes <= 10485760),
  sha256         text not null,
  filename_enc   text,                                     -- original filename, AES-GCM encrypted by the Edge Function
  key_version    integer not null default 1,
  replaces       uuid references website_private.enrollment_documents(id),
  retain_until   date,                                     -- set only once management approves retention periods
  created_at     timestamptz not null default now(),
  stored_at      timestamptz,
  reviewed_at    timestamptz,
  reviewed_by    text,
  deleted_at     timestamptz
);
create index if not exists enrollment_documents_session_idx on website_private.enrollment_documents (session_id);
create index if not exists enrollment_documents_app_idx on website_private.enrollment_documents (application_id) where application_id is not null;
create index if not exists enrollment_documents_cleanup_idx on website_private.enrollment_documents (status) where deleted_at is null and status in ('uploading','replaced','removed','rejected','abandoned');

create table if not exists website_private.enrollment_document_access_log (
  id             bigint generated always as identity primary key,
  at             timestamptz not null default now(),
  document_id    uuid,
  application_id uuid,
  action         text not null check (action in ('upload','store','reject','remove','replace','attach','list','download','review','delete','abandon','parent_pdf_download','parent_access_denied','parent_access_renewed')),
  actor          text not null,                           -- 'family-session', 'parent-link', 'staff:<user id>', 'system'
  detail         text
);
create index if not exists enrollment_document_access_log_doc_idx on website_private.enrollment_document_access_log (document_id, at desc);
create index if not exists enrollment_document_access_log_app_idx on website_private.enrollment_document_access_log (application_id, at desc);

-- ---------------------------------------------------------------- immutable agreement evidence and financial terms
create table if not exists website_private.enrollment_agreements (
  id             uuid primary key default gen_random_uuid(),
  application_id uuid not null references website_private.enrollment_applications(id),
  kind           text not null,             -- 'contract' | 'withdrawal-termination' | 'attendance' | 'acknowledgments'
  version        text not null,
  language       text not null,
  status         text not null,             -- e.g. 'partial', 'acknowledged', 'not_received'
  text_sha256    text not null,             -- SHA-256 of the exact language-specific text presented (stored encrypted in payload_enc)
  accepted_at    timestamptz not null,
  payload_enc    text not null,             -- AES-GCM: { presented text (family language), English source, choices }
  created_at     timestamptz not null default now()
);
create index if not exists enrollment_agreements_app_idx on website_private.enrollment_agreements (application_id);

create table if not exists website_private.enrollment_financial_terms (
  id               uuid primary key default gen_random_uuid(),
  application_id   uuid not null references website_private.enrollment_applications(id),
  revision         integer not null,
  payment_type     text,
  pfcc_status      text,
  copay_cents      integer check (copay_cents is null or copay_cents between 0 and 99999),
  copay_source     text not null check (copay_source in ('none','parent_reported','center_confirmed')),
  due_day          text,
  status           text not null check (status in ('not_applicable','parent_reported','awaiting_confirmation','confirmed_awaiting_parent','accepted')),
  confirmed_by     text,
  confirmed_at     timestamptz,
  parent_ack_at    timestamptz,
  parent_ack_sha256 text,
  supersedes       uuid references website_private.enrollment_financial_terms(id),
  created_at       timestamptz not null default now(),
  unique (application_id, revision)
);

-- Evidence tables are append-only: no UPDATE or DELETE, even for the service role, so signed terms can never be rewritten.
-- A change to individual financial terms is a NEW revision that requires a new parent acknowledgment.
create or replace function website_private.forbid_change() returns trigger language plpgsql set search_path to '' as $f$
begin raise exception '% is append-only', tg_table_name; end $f$;
drop trigger if exists enrollment_agreements_append_only on website_private.enrollment_agreements;
create trigger enrollment_agreements_append_only before update or delete on website_private.enrollment_agreements for each row execute function website_private.forbid_change();
drop trigger if exists enrollment_financial_terms_append_only on website_private.enrollment_financial_terms;
create trigger enrollment_financial_terms_append_only before update or delete on website_private.enrollment_financial_terms for each row execute function website_private.forbid_change();
drop trigger if exists enrollment_document_access_log_append_only on website_private.enrollment_document_access_log;
create trigger enrollment_document_access_log_append_only before update or delete on website_private.enrollment_document_access_log for each row execute function website_private.forbid_change();

-- ---------------------------------------------------------------- verified parent access to the two finalized PDFs
create table if not exists website_private.enrollment_parent_access (
  id             uuid primary key default gen_random_uuid(),
  application_id uuid not null references website_private.enrollment_applications(id),
  token_hash     text not null unique,
  created_at     timestamptz not null default now(),
  expires_at     timestamptz not null,
  revoked_at     timestamptz,
  uses           integer not null default 0,
  max_uses       integer not null default 20,
  failed_checks  integer not null default 0,
  locked_at      timestamptz,
  last_used_at   timestamptz,
  reason         text not null default 'initial' check (reason in ('initial','renewal'))
);
create index if not exists enrollment_parent_access_app_idx on website_private.enrollment_parent_access (application_id, created_at desc);

-- ---------------------------------------------------------------- staff allowlist (EMPTY until management names authorized staff)
create table if not exists website_private.staff_document_access (
  user_id   uuid primary key,          -- Supabase Auth user id
  email     text not null,
  role      text not null check (role in ('director','administrator')),
  active    boolean not null default true,
  added_at  timestamptz not null default now(),
  added_by  text not null
);

-- ---------------------------------------------------------------- lock down every new table
do $$ declare t text; begin
  foreach t in array array['feature_flags','enrollment_upload_sessions','enrollment_documents','enrollment_document_access_log','enrollment_agreements','enrollment_financial_terms','enrollment_parent_access','staff_document_access'] loop
    execute format('alter table website_private.%I enable row level security', t);
    execute format('revoke all on website_private.%I from public, anon, authenticated', t);
  end loop;
end $$;
grant select on website_private.feature_flags to service_role;
grant select, insert, update on website_private.enrollment_upload_sessions, website_private.enrollment_documents, website_private.enrollment_parent_access to service_role;
grant select, insert on website_private.enrollment_agreements, website_private.enrollment_financial_terms, website_private.enrollment_document_access_log to service_role;
grant select on website_private.staff_document_access to service_role;

-- Private bucket for confidential supporting documents (separate from the public "Family docs" bucket). Objects are AES-GCM
-- ciphertext written by the Edge Function, hence application/octet-stream. No storage.objects policies: service role only.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('enrollment-documents', 'enrollment-documents', false, 10500000, array['application/octet-stream'])
on conflict (id) do nothing;

-- ================================================================ service-role-only functions
create or replace function public.enrollment_flags_p2() returns jsonb language sql stable set search_path to '' as $f$
  select coalesce(pg_catalog.jsonb_object_agg(key, enabled), '{}'::jsonb) from website_private.feature_flags;
$f$;

-- Upload session: one per application attempt, short-lived, rate limited per source.
create or replace function public.enrollment_upload_session_p2(p_token_hash text, p_source text, p_ttl_seconds integer) returns jsonb
language plpgsql set search_path to '' as $f$
declare v_id uuid;
begin
  if p_source is not null and (select count(*) from website_private.enrollment_upload_sessions where source_fingerprint = p_source and created_at > now() - interval '1 hour') >= 20 then
    return pg_catalog.jsonb_build_object('ok', false, 'reason', 'rate');
  end if;
  insert into website_private.enrollment_upload_sessions (token_hash, expires_at, source_fingerprint)
  values (p_token_hash, now() + pg_catalog.make_interval(secs => least(greatest(p_ttl_seconds, 600), 10800)), p_source) returning id into v_id;
  return pg_catalog.jsonb_build_object('ok', true, 'id', v_id);
end $f$;

-- Reserve a document slot. Enforces session validity, per-session and per-category limits, duplicates and replacement.
create or replace function public.enrollment_doc_begin_p2(p_token_hash text, p_category text, p_mime text, p_bytes integer, p_sha256 text, p_filename_enc text, p_replaces uuid, p_max_in_category integer) returns jsonb
language plpgsql set search_path to '' as $f$
declare s website_private.enrollment_upload_sessions; v_doc uuid := gen_random_uuid(); v_dup website_private.enrollment_documents; v_old website_private.enrollment_documents; v_live integer;
begin
  select * into s from website_private.enrollment_upload_sessions where token_hash = p_token_hash for update;
  if not found then return pg_catalog.jsonb_build_object('ok', false, 'reason', 'session'); end if;
  if s.status <> 'open' or s.expires_at < now() then return pg_catalog.jsonb_build_object('ok', false, 'reason', 'expired'); end if;
  select * into v_dup from website_private.enrollment_documents where session_id = s.id and sha256 = p_sha256 and category = p_category and status in ('uploading','stored') limit 1;
  if found then return pg_catalog.jsonb_build_object('ok', true, 'duplicate', true, 'id', v_dup.id, 'status', v_dup.status, 'path', v_dup.object_path); end if;
  if p_replaces is not null then
    select * into v_old from website_private.enrollment_documents where id = p_replaces and session_id = s.id and status in ('uploading','stored') for update;
    if not found then return pg_catalog.jsonb_build_object('ok', false, 'reason', 'replaces'); end if;
  end if;
  select count(*) into v_live from website_private.enrollment_documents where session_id = s.id and category = p_category and status in ('uploading','stored') and id is distinct from p_replaces;
  if v_live >= p_max_in_category then return pg_catalog.jsonb_build_object('ok', false, 'reason', 'category_limit'); end if;
  if s.file_count >= 30 or s.total_bytes + p_bytes > 62914560 then return pg_catalog.jsonb_build_object('ok', false, 'reason', 'session_limit'); end if;
  insert into website_private.enrollment_documents (id, session_id, category, mime, bytes, sha256, filename_enc, object_path, replaces)
  values (v_doc, s.id, p_category, p_mime, p_bytes, p_sha256, p_filename_enc, 'sessions/' || s.id::text || '/' || v_doc::text, p_replaces);
  update website_private.enrollment_upload_sessions set file_count = file_count + 1, total_bytes = total_bytes + p_bytes where id = s.id;
  insert into website_private.enrollment_document_access_log (document_id, action, actor) values (v_doc, 'upload', 'family-session');
  return pg_catalog.jsonb_build_object('ok', true, 'duplicate', false, 'id', v_doc, 'path', 'sessions/' || s.id::text || '/' || v_doc::text);
end $f$;

-- Mark the reserved slot stored (after the encrypted object was written) — and retire the document it replaces.
create or replace function public.enrollment_doc_stored_p2(p_token_hash text, p_doc uuid, p_scan text) returns jsonb
language plpgsql set search_path to '' as $f$
declare d website_private.enrollment_documents;
begin
  select doc.* into d from website_private.enrollment_documents doc join website_private.enrollment_upload_sessions s on s.id = doc.session_id
   where doc.id = p_doc and s.token_hash = p_token_hash and s.status = 'open' for update of doc;
  if not found then return pg_catalog.jsonb_build_object('ok', false); end if;
  update website_private.enrollment_documents set status = 'stored', stored_at = now(), scan_status = coalesce(p_scan, scan_status) where id = p_doc;
  insert into website_private.enrollment_document_access_log (document_id, action, actor, detail) values (p_doc, 'store', 'family-session', p_scan);
  if d.replaces is not null then
    update website_private.enrollment_documents set status = 'replaced' where id = d.replaces and status in ('uploading','stored');
    insert into website_private.enrollment_document_access_log (document_id, action, actor) values (d.replaces, 'replace', 'family-session');
  end if;
  return pg_catalog.jsonb_build_object('ok', true);
end $f$;

create or replace function public.enrollment_doc_reject_p2(p_token_hash text, p_doc uuid, p_reason text) returns jsonb
language plpgsql set search_path to '' as $f$
begin
  update website_private.enrollment_documents doc set status = 'rejected', scan_status = 'blocked'
    from website_private.enrollment_upload_sessions s where s.id = doc.session_id and doc.id = p_doc and s.token_hash = p_token_hash;
  insert into website_private.enrollment_document_access_log (document_id, action, actor, detail) values (p_doc, 'reject', 'family-session', pg_catalog.left(p_reason, 60));
  return pg_catalog.jsonb_build_object('ok', true);
end $f$;

create or replace function public.enrollment_doc_remove_p2(p_token_hash text, p_doc uuid) returns jsonb
language plpgsql set search_path to '' as $f$
declare v_path text;
begin
  update website_private.enrollment_documents doc set status = 'removed'
    from website_private.enrollment_upload_sessions s
   where s.id = doc.session_id and doc.id = p_doc and s.token_hash = p_token_hash and s.status = 'open' and doc.status in ('uploading','stored')
  returning doc.object_path into v_path;
  if v_path is null then return pg_catalog.jsonb_build_object('ok', false); end if;
  insert into website_private.enrollment_document_access_log (document_id, action, actor) values (p_doc, 'remove', 'family-session');
  return pg_catalog.jsonb_build_object('ok', true, 'path', v_path);
end $f$;

-- Attach the session's documents to the stored application. Only ids that belong to THIS session, are stored, and match the
-- category of the answer that references them are attached. Idempotent for a retried submission.
create or replace function public.enrollment_docs_attach_p2(p_token_hash text, p_application uuid, p_docs jsonb) returns jsonb
language plpgsql set search_path to '' as $f$
declare s website_private.enrollment_upload_sessions; want jsonb; d website_private.enrollment_documents; out jsonb := '[]'::jsonb; bad integer := 0;
begin
  select * into s from website_private.enrollment_upload_sessions where token_hash = p_token_hash for update;
  if not found or (s.application_id is not null and s.application_id <> p_application) then return pg_catalog.jsonb_build_object('ok', false, 'reason', 'session'); end if;
  for want in select * from pg_catalog.jsonb_array_elements(coalesce(p_docs, '[]'::jsonb)) loop
    select * into d from website_private.enrollment_documents where id = (want->>'id')::uuid and session_id = s.id and category = want->>'category' and status = 'stored';
    if not found then bad := bad + 1; continue; end if;
    update website_private.enrollment_documents set application_id = p_application where id = d.id;
    insert into website_private.enrollment_document_access_log (document_id, application_id, action, actor) values (d.id, p_application, 'attach', 'system');
    out := out || pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object('id', d.id, 'category', d.category, 'mime', d.mime, 'bytes', d.bytes, 'sha256', d.sha256, 'scan', d.scan_status));
  end loop;
  if bad > 0 then return pg_catalog.jsonb_build_object('ok', false, 'reason', 'documents', 'bad', bad); end if;
  update website_private.enrollment_upload_sessions set status = 'attached', application_id = p_application where id = s.id;
  -- documents uploaded in this session but not referenced by the final answers are retired for cleanup
  update website_private.enrollment_documents set status = 'abandoned' where session_id = s.id and application_id is null and status in ('uploading','stored');
  return pg_catalog.jsonb_build_object('ok', true, 'documents', out);
end $f$;

-- Store application-level 1.3.0 metadata (never answers) and the immutable evidence rows, in one call.
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
    access_email_status = case when (p_meta->>'access') = 'true' then 'pending' else access_email_status end, updated_at = now()
  where id = p_application;
  for a in select * from pg_catalog.jsonb_array_elements(p_agreements) loop
    insert into website_private.enrollment_agreements (application_id, kind, version, language, status, text_sha256, accepted_at, payload_enc)
    values (p_application, a->>'kind', a->>'version', a->>'language', a->>'status', a->>'text_sha256', (a->>'accepted_at')::timestamptz, a->>'payload_enc');
  end loop;
  if p_terms is not null then
    insert into website_private.enrollment_financial_terms (application_id, revision, payment_type, pfcc_status, copay_cents, copay_source, due_day, status)
    values (p_application, 1, p_terms->>'payment_type', p_terms->>'pfcc_status', (p_terms->>'copay_cents')::integer, p_terms->>'copay_source', p_terms->>'due_day', p_terms->>'status');
  end if;
  return pg_catalog.jsonb_build_object('ok', true, 'duplicate', false);
end $f$;

-- Staff confirmation of individual financial terms: always a NEW revision, never an edit; the family must acknowledge it again.
create or replace function public.enrollment_terms_confirm_p2(p_reference text, p_copay_cents integer, p_due_day text, p_staff text) returns jsonb
language plpgsql set search_path to '' as $f$
declare app website_private.enrollment_applications; prev website_private.enrollment_financial_terms; v_id uuid;
begin
  select * into app from website_private.enrollment_applications where reference = p_reference;
  if not found then return pg_catalog.jsonb_build_object('ok', false, 'reason', 'not_found'); end if;
  select * into prev from website_private.enrollment_financial_terms where application_id = app.id order by revision desc limit 1;
  insert into website_private.enrollment_financial_terms (application_id, revision, payment_type, pfcc_status, copay_cents, copay_source, due_day, status, confirmed_by, confirmed_at, supersedes)
  values (app.id, coalesce(prev.revision, 0) + 1, coalesce(prev.payment_type, app.payment_type), prev.pfcc_status, p_copay_cents, 'center_confirmed', p_due_day, 'confirmed_awaiting_parent', p_staff, now(), prev.id)
  returning id into v_id;
  update website_private.enrollment_applications set copay_status = 'confirmed', updated_at = now() where id = app.id;
  return pg_catalog.jsonb_build_object('ok', true, 'id', v_id, 'revision', coalesce(prev.revision, 0) + 1);
end $f$;

-- Document metadata for one application (staff listing, PDFs and the management email). Never file contents.
create or replace function public.enrollment_docs_for_app_p2(p_reference text) returns jsonb
language sql stable set search_path to '' as $f$
  select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('id', d.id, 'category', d.category, 'mime', d.mime, 'bytes', d.bytes, 'sha256', d.sha256,
           'status', d.status, 'scan', d.scan_status, 'review', d.review_status, 'stored_at', d.stored_at, 'path', d.object_path, 'filename_enc', d.filename_enc) order by d.category, d.stored_at), '[]'::jsonb)
    from website_private.enrollment_documents d join website_private.enrollment_applications a on a.id = d.application_id
   where a.reference = p_reference and d.status = 'stored';
$f$;

create or replace function public.enrollment_doc_review_p2(p_doc uuid, p_review text, p_staff text) returns jsonb
language plpgsql set search_path to '' as $f$
begin
  if p_review not in ('accepted','rejected') then return pg_catalog.jsonb_build_object('ok', false); end if;
  update website_private.enrollment_documents set review_status = p_review, reviewed_at = now(), reviewed_by = p_staff,
         scan_status = case when p_review = 'accepted' then 'released' else scan_status end
   where id = p_doc and status = 'stored';
  insert into website_private.enrollment_document_access_log (document_id, action, actor, detail) values (p_doc, 'review', p_staff, p_review);
  return pg_catalog.jsonb_build_object('ok', true);
end $f$;

create or replace function public.enrollment_log_p2(p_doc uuid, p_application uuid, p_action text, p_actor text, p_detail text) returns void
language sql set search_path to '' as $f$
  insert into website_private.enrollment_document_access_log (document_id, application_id, action, actor, detail) values (p_doc, p_application, p_action, p_actor, pg_catalog.left(p_detail, 200));
$f$;

-- Cleanup: abandoned sessions (expired and never attached), removed/replaced/rejected/abandoned files. Returns paths to delete.
create or replace function public.enrollment_cleanup_candidates_p2(p_limit integer) returns jsonb
language plpgsql set search_path to '' as $f$
begin
  update website_private.enrollment_upload_sessions set status = 'abandoned' where status = 'open' and expires_at < now() - interval '1 hour';
  update website_private.enrollment_documents d set status = 'abandoned'
    from website_private.enrollment_upload_sessions s where s.id = d.session_id and s.status = 'abandoned' and d.status in ('uploading','stored') and d.application_id is null;
  return (select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('id', id, 'path', object_path)), '[]'::jsonb) from (
    select id, object_path from website_private.enrollment_documents
     where deleted_at is null and application_id is null and status in ('uploading','replaced','removed','rejected','abandoned') and created_at < now() - interval '1 hour'
     union all
    select id, object_path from website_private.enrollment_documents
     where deleted_at is null and application_id is not null and status in ('replaced','removed','rejected')
     order by 1 limit least(greatest(p_limit, 1), 100)) x);
end $f$;

create or replace function public.enrollment_doc_deleted_p2(p_doc uuid) returns void language sql set search_path to '' as $f$
  update website_private.enrollment_documents set status = case when status = 'stored' then 'deleted' else status end, deleted_at = now() where id = p_doc;
  insert into website_private.enrollment_document_access_log (document_id, action, actor) values (p_doc, 'delete', 'system');
$f$;

-- Parent access tokens (HMAC-hashed). One active link per application; a renewal revokes earlier links.
create or replace function public.enrollment_access_create_p2(p_application uuid, p_token_hash text, p_ttl_seconds integer, p_reason text) returns jsonb
language plpgsql set search_path to '' as $f$
begin
  update website_private.enrollment_parent_access set revoked_at = now() where application_id = p_application and revoked_at is null;
  insert into website_private.enrollment_parent_access (application_id, token_hash, expires_at, reason)
  values (p_application, p_token_hash, now() + pg_catalog.make_interval(secs => least(greatest(p_ttl_seconds, 3600), 1209600)), p_reason);
  return pg_catalog.jsonb_build_object('ok', true);
end $f$;

-- Look up a link. p_use = true counts a successful document release; p_fail = true counts a failed verification (lock at 5).
create or replace function public.enrollment_access_check_p2(p_token_hash text, p_use boolean, p_fail boolean) returns jsonb
language plpgsql set search_path to '' as $f$
declare t website_private.enrollment_parent_access; app website_private.enrollment_applications;
begin
  select * into t from website_private.enrollment_parent_access where token_hash = p_token_hash for update;
  if not found then return pg_catalog.jsonb_build_object('ok', false, 'reason', 'unknown'); end if;
  select * into app from website_private.enrollment_applications where id = t.application_id;
  if t.locked_at is not null then return pg_catalog.jsonb_build_object('ok', false, 'reason', 'locked'); end if;
  if t.revoked_at is not null or t.expires_at < now() or t.uses >= t.max_uses then
    return pg_catalog.jsonb_build_object('ok', false, 'reason', 'expired', 'reference', app.reference, 'created_at', app.created_at);
  end if;
  if p_fail then
    update website_private.enrollment_parent_access set failed_checks = failed_checks + 1, locked_at = case when failed_checks + 1 >= 5 then now() end where id = t.id;
    insert into website_private.enrollment_document_access_log (application_id, action, actor) values (t.application_id, 'parent_access_denied', 'parent-link');
    return pg_catalog.jsonb_build_object('ok', false, 'reason', case when t.failed_checks + 1 >= 5 then 'locked' else 'mismatch' end);
  end if;
  if p_use then
    update website_private.enrollment_parent_access set uses = uses + 1, last_used_at = now() where id = t.id;
    insert into website_private.enrollment_document_access_log (application_id, action, actor) values (t.application_id, 'parent_pdf_download', 'parent-link');
  end if;
  return pg_catalog.jsonb_build_object('ok', true, 'reference', app.reference, 'application_id', app.id);
end $f$;

-- Renewal requests: at most 3 links per application per day; only for 1.3.0+ applications less than 120 days old.
create or replace function public.enrollment_access_renew_ok_p2(p_application uuid) returns boolean language sql stable set search_path to '' as $f$
  select (select count(*) from website_private.enrollment_parent_access where application_id = p_application and created_at > now() - interval '1 day') < 3
     and exists (select 1 from website_private.enrollment_applications where id = p_application and form_version <> '1.2.0-E1' and created_at > now() - interval '120 days');
$f$;

create or replace function public.enrollment_staff_ok_p2(p_user uuid) returns jsonb language sql stable set search_path to '' as $f$
  select coalesce((select pg_catalog.jsonb_build_object('ok', true, 'role', role, 'email', email) from website_private.staff_document_access where user_id = p_user and active), '{"ok":false}'::jsonb);
$f$;

-- Superset of the 1.2.1 progress function: same behaviour for every existing key, plus the 1.3.0 parent-access email columns.
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
    h2h_pdf_path = coalesce(p_patch->>'h2h_pdf_path', h2h_pdf_path),
    h2h_pdf_sha256 = coalesce(p_patch->>'h2h_pdf_sha256', h2h_pdf_sha256),
    h2h_pdf_bytes = coalesce((p_patch->>'h2h_pdf_bytes')::integer, h2h_pdf_bytes),
    h2h_pdf_pages = coalesce((p_patch->>'h2h_pdf_pages')::integer, h2h_pdf_pages),
    pdf_attempts = pdf_attempts + coalesce((p_patch->>'pdf_attempts_inc')::integer, 0),
    pdf_error = case when p_patch ? 'pdf_error' then pg_catalog.left(p_patch->>'pdf_error', 500) else pdf_error end,
    pdf_generated_at = case when p_patch->>'pdf_status' = 'generated' then now() else pdf_generated_at end,
    staff_email_status = coalesce(p_patch->>'staff_email_status', staff_email_status),
    staff_email_id = coalesce(p_patch->>'staff_email_id', staff_email_id),
    staff_email_attempts = staff_email_attempts + coalesce((p_patch->>'staff_email_attempts_inc')::integer, 0),
    staff_email_error = case when p_patch ? 'staff_email_error' then pg_catalog.left(p_patch->>'staff_email_error', 500) else staff_email_error end,
    staff_email_sent_at = case when p_patch->>'staff_email_status' = 'sent' then now() else staff_email_sent_at end,
    staff_delivery_status = case when p_patch->>'staff_email_status' = 'sent' then 'in_transit' else coalesce(p_patch->>'staff_delivery_status', staff_delivery_status) end,
    staff_delivery_event = coalesce(p_patch->>'staff_delivery_event', staff_delivery_event),
    staff_delivery_checks = case when p_patch->>'staff_email_status' = 'sent' then 0 else staff_delivery_checks + coalesce((p_patch->>'staff_delivery_checks_inc')::integer, 0) end,
    staff_delivered_at = case when p_patch->>'staff_delivery_status' = 'delivered' then now() else staff_delivered_at end,
    family_email_status = coalesce(p_patch->>'family_email_status', family_email_status),
    family_email_id = coalesce(p_patch->>'family_email_id', family_email_id),
    family_email_error = case when p_patch ? 'family_email_error' then pg_catalog.left(p_patch->>'family_email_error', 500) else family_email_error end,
    family_email_sent_at = case when p_patch->>'family_email_status' = 'sent' then now() else family_email_sent_at end,
    family_delivery_status = case when p_patch->>'family_email_status' = 'sent' then 'in_transit' else coalesce(p_patch->>'family_delivery_status', family_delivery_status) end,
    family_delivery_event = coalesce(p_patch->>'family_delivery_event', family_delivery_event),
    family_delivery_checks = case when p_patch->>'family_email_status' = 'sent' then 0 else family_delivery_checks + coalesce((p_patch->>'family_delivery_checks_inc')::integer, 0) end,
    -- 1.3.0: parent document-access (renewal) emails
    access_email_status = coalesce(p_patch->>'access_email_status', access_email_status),
    access_email_id = coalesce(p_patch->>'access_email_id', access_email_id),
    access_email_error = case when p_patch ? 'access_email_error' then pg_catalog.left(p_patch->>'access_email_error', 500) else access_email_error end,
    access_email_sent_at = case when p_patch->>'access_email_status' = 'sent' then now() else access_email_sent_at end,
    access_delivery_status = case when p_patch->>'access_email_status' = 'sent' then 'in_transit' else coalesce(p_patch->>'access_delivery_status', access_delivery_status) end,
    access_delivery_event = coalesce(p_patch->>'access_delivery_event', access_delivery_event),
    access_delivery_checks = case when p_patch->>'access_email_status' = 'sent' then 0 else access_delivery_checks + coalesce((p_patch->>'access_delivery_checks_inc')::integer, 0) end,
    delivery_checked_at = case when p_patch ? 'staff_delivery_status' or p_patch ? 'family_delivery_status' or p_patch ? 'access_delivery_status' then now() else delivery_checked_at end,
    updated_at = now()
  where id = p_id
  returning * into v;
  if not found then return pg_catalog.jsonb_build_object('ok', false); end if;
  update website_private.enrollment_applications
     set status = case
       when pdf_status = 'generated' and staff_email_status = 'sent' and staff_delivery_status in ('bounced','complained','failed','suppressed') then 'needs_attention'
       when pdf_status = 'generated' and staff_email_status = 'sent' then 'complete'
       when pdf_status = 'failed' or staff_email_status = 'failed' then 'needs_attention'
       else 'received' end
   where id = p_id;
  return pg_catalog.jsonb_build_object('ok', true);
end;
$function$;

-- Superset of the 1.2.1 sweep selector: also finishes 1.3.0 parent-access emails and polls their delivery.
create or replace function public.enrollment_unfinished_p1(p_older_than_seconds integer, p_limit integer) returns jsonb
language sql stable set search_path to ''
as $function$
  select coalesce(pg_catalog.jsonb_agg(x.reference order by x.created_at), '[]'::jsonb) from (
    select reference, created_at from website_private.enrollment_applications
    where created_at < now() - pg_catalog.make_interval(secs => p_older_than_seconds)
      and created_at > now() - interval '30 days'
      and (
        ((pdf_status <> 'generated' or h2h_pdf_path is null or staff_email_status <> 'sent') and staff_email_attempts < 12)
        or (staff_email_status = 'sent' and staff_delivery_status in ('unknown','in_transit','delayed') and staff_delivery_checks < 60 and staff_email_sent_at > now() - interval '3 days')
        or (family_email_status = 'sent' and family_delivery_status in ('unknown','in_transit','delayed') and family_delivery_checks < 60 and family_email_sent_at > now() - interval '3 days')
        or (family_email_status = 'pending' and pdf_status = 'generated' and staff_email_status = 'sent')
        or (access_email_status = 'pending' and pdf_status = 'generated')
        or (access_email_status = 'sent' and access_delivery_status in ('unknown','in_transit','delayed') and access_delivery_checks < 60 and access_email_sent_at > now() - interval '3 days')
      )
    order by created_at limit least(greatest(p_limit, 1), 25)
  ) x;
$function$;

do $$ declare f text; begin
  foreach f in array array[
    'public.enrollment_flags_p2()',
    'public.enrollment_upload_session_p2(text,text,integer)',
    'public.enrollment_doc_begin_p2(text,text,text,integer,text,text,uuid,integer)',
    'public.enrollment_doc_stored_p2(text,uuid,text)',
    'public.enrollment_doc_reject_p2(text,uuid,text)',
    'public.enrollment_doc_remove_p2(text,uuid)',
    'public.enrollment_docs_attach_p2(text,uuid,jsonb)',
    'public.enrollment_record_v130_p2(uuid,jsonb,jsonb,jsonb)',
    'public.enrollment_terms_confirm_p2(text,integer,text,text)',
    'public.enrollment_docs_for_app_p2(text)',
    'public.enrollment_doc_review_p2(uuid,text,text)',
    'public.enrollment_log_p2(uuid,uuid,text,text,text)',
    'public.enrollment_cleanup_candidates_p2(integer)',
    'public.enrollment_doc_deleted_p2(uuid)',
    'public.enrollment_access_create_p2(uuid,text,integer,text)',
    'public.enrollment_access_check_p2(text,boolean,boolean)',
    'public.enrollment_access_renew_ok_p2(uuid)',
    'public.enrollment_staff_ok_p2(uuid)',
    'public.enrollment_mark_p1(uuid,jsonb)',
    'public.enrollment_unfinished_p1(integer,integer)'] loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
end $$;
revoke all on function website_private.forbid_change() from public, anon, authenticated;

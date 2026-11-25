-- 1.2.1: one application → two PDFs (Ohio records + Heart to Heart records) in ONE staff email, plus actual-delivery tracking
-- and a scheduled retry sweep. ADDITIVE: new columns only; the four enrollment RPCs are replaced with backward-compatible versions.
-- Column meaning from 1.2.1:  pdf_path / pdf_sha256 / pdf_bytes / pdf_pages  = the OHIO PDF;  h2h_pdf_*  = the HEART TO HEART PDF.
-- pdf_status = 'generated' only when BOTH PDFs were generated and stored (encrypted, private bucket).

alter table website_private.enrollment_applications
  add column if not exists h2h_pdf_path   text,
  add column if not exists h2h_pdf_sha256 text,
  add column if not exists h2h_pdf_bytes  integer,
  add column if not exists h2h_pdf_pages  integer,
  add column if not exists staff_delivery_status  text not null default 'unknown',
  add column if not exists staff_delivery_event   text,
  add column if not exists staff_delivery_checks  integer not null default 0,
  add column if not exists staff_delivered_at     timestamptz,
  add column if not exists family_delivery_status text not null default 'unknown',
  add column if not exists family_delivery_event  text,
  add column if not exists family_delivery_checks integer not null default 0,
  add column if not exists delivery_checked_at    timestamptz;

-- Three DISTINCT states are tracked: PDF generation (pdf_status), email acceptance by Resend (*_email_status = 'sent'),
-- and actual delivery reported by Resend (*_delivery_status). 'sent' never means 'delivered'.
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'enrollment_staff_delivery_chk') then
    alter table website_private.enrollment_applications
      add constraint enrollment_staff_delivery_chk check (staff_delivery_status in ('unknown','in_transit','delivered','delayed','bounced','complained','failed','suppressed','unverifiable'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'enrollment_family_delivery_chk') then
    alter table website_private.enrollment_applications
      add constraint enrollment_family_delivery_chk check (family_delivery_status in ('unknown','in_transit','delivered','delayed','bounced','complained','failed','suppressed','unverifiable'));
  end if;
end $$;

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
    -- a new send resets delivery tracking for that email
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
    delivery_checked_at = case when p_patch ? 'staff_delivery_status' or p_patch ? 'family_delivery_status' then now() else delivery_checked_at end,
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

-- Unfinished = a PDF missing, the staff email not accepted, OR the staff/family email accepted but delivery not yet confirmed
-- (checked for up to 3 days / 60 checks, then recorded as 'unverifiable' by the function).
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
      )
    order by created_at limit least(greatest(p_limit, 1), 25)
  ) x;
$function$;

revoke all on function public.enrollment_mark_p1(uuid, jsonb) from public, anon, authenticated;
revoke all on function public.enrollment_unfinished_p1(integer, integer) from public, anon, authenticated;
grant execute on function public.enrollment_mark_p1(uuid, jsonb) to service_role;
grant execute on function public.enrollment_unfinished_p1(integer, integer) to service_role;

-- Scheduled retry: every 10 minutes, independent of new submissions. The job calls the function's public /sweep endpoint with the
-- site's PUBLIC anon key, read at run time from Vault secret 'h2h_public_anon_key' (the key is not stored in this file).
-- /sweep only re-runs unfinished steps; it can never create an application or reveal data.
create extension if not exists pg_net with schema extensions;
create extension if not exists pg_cron;
select cron.unschedule(jobid) from cron.job where jobname = 'h2h-enrollment-sweep';
select cron.schedule('h2h-enrollment-sweep', '*/10 * * * *', $job$
  select net.http_post(
    url := 'https://zebeclcvrdmisnxkwode.supabase.co/functions/v1/submit-enrollment/sweep',
    headers := jsonb_build_object('Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'h2h_public_anon_key' limit 1),
      'apikey', (select decrypted_secret from vault.decrypted_secrets where name = 'h2h_public_anon_key' limit 1)),
    body := '{}'::jsonb, timeout_milliseconds := 10000);
$job$);

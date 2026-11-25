-- Rollback for v130 function replacements: restores live 1.2.1 definitions (captured 2026-11-25 before Phase A).
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

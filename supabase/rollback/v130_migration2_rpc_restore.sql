-- Migration 2 rollback: restore the two RPC definitions from production Phase A.
-- Redeploy submit-enrollment v6 first with the enrollment feature flags off.
-- Keep additive columns and tables so signed evidence and audit records are preserved.

BEGIN;

CREATE OR REPLACE FUNCTION public.enrollment_unfinished_p1(p_older_than_seconds integer, p_limit integer)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
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

CREATE OR REPLACE FUNCTION public.enrollment_record_v130_p2(p_application uuid, p_meta jsonb, p_agreements jsonb, p_terms jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare a jsonb;
begin
  if exists (select 1 from website_private.enrollment_agreements where application_id = p_application) then
    return pg_catalog.jsonb_build_object('ok', true, 'duplicate', true);
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
end $function$;

COMMIT;

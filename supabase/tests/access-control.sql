-- Positive and negative access-control tests for the 1.3.0 migration. Synthetic data only. Run by local-db.sh.
\set ON_ERROR_STOP 1
create or replace function pg_temp.expect_denied(sql text, label text) returns void language plpgsql as $$
begin
  begin execute sql; exception when insufficient_privilege then raise notice 'ok  denied: %', label; return; end;
  raise exception 'FAIL: % was allowed', label;
end $$;
create or replace function pg_temp.ok(cond boolean, label text) returns void language plpgsql as $$
begin if cond is not true then raise exception 'FAIL: %', label; end if; raise notice 'ok  %', label; end $$;

-- 1. The public roles reach nothing.
set role anon;
select pg_temp.expect_denied('select * from website_private.' || t, 'anon select ' || t) from unnest(array['enrollment_applications','enrollment_documents','enrollment_upload_sessions','enrollment_agreements','enrollment_financial_terms','enrollment_parent_access','staff_document_access','feature_flags','enrollment_document_access_log']) t;
select pg_temp.expect_denied('select public.enrollment_flags_p2()', 'anon flags');
select pg_temp.expect_denied($q$select public.enrollment_upload_session_p2('x', null, 600)$q$, 'anon upload session');
select pg_temp.expect_denied($q$select public.enrollment_access_check_p2('x', false, false)$q$, 'anon access check');
select pg_temp.expect_denied($q$select public.enrollment_docs_for_app_p2('H2H-1')$q$, 'anon list documents');
reset role;
set role authenticated;
select pg_temp.expect_denied('select * from website_private.enrollment_documents', 'authenticated select documents');
select pg_temp.expect_denied($q$select public.enrollment_staff_ok_p2(gen_random_uuid())$q$, 'authenticated staff check');
reset role;

-- 2. Service role (Edge Function) flow.
set role service_role;
select pg_temp.ok((public.enrollment_flags_p2()->>'enrollment_v130')::boolean = false and (public.enrollment_flags_p2()->>'parent_document_access')::boolean = false, 'every 1.3.0 flag defaults to OFF');
-- two families, one application each (1.3.0 and a legacy 1.2.0-E1)
select public.enrollment_submit_p1('11111111-1111-4111-8111-111111111111','1.3.0-E2','en','preschool','pfcc','2027-01-11','na','emailA','childA',null,'enc',1) ->> 'reference' as ref_a \gset
select public.enrollment_submit_p1('22222222-2222-4222-8222-222222222222','1.2.0-E1','es','preschool','private','2027-01-11','na','emailB','childB',null,'enc',1) ->> 'reference' as ref_b \gset
select id as app_a from website_private.enrollment_applications where reference = :'ref_a' \gset
select id as app_b from website_private.enrollment_applications where reference = :'ref_b' \gset
select pg_temp.ok((public.enrollment_upload_session_p2('tokA', 'srcA', 7200)->>'ok')::boolean, 'session A created');
select pg_temp.ok((public.enrollment_upload_session_p2('tokB', 'srcB', 7200)->>'ok')::boolean, 'session B created');
select public.enrollment_doc_begin_p2('tokA','immunization','application/pdf',1000,'shaA1','fn',null,5)->>'id' as doc_a1 \gset
select pg_temp.ok((public.enrollment_doc_begin_p2('tokA','immunization','application/pdf',1000,'shaA1','fn',null,5)->>'duplicate')::boolean, 'same file in same session is de-duplicated');
select pg_temp.ok(public.enrollment_doc_begin_p2('nope','immunization','application/pdf',1000,'x','fn',null,5)->>'reason' = 'session', 'unknown session token rejected');
select pg_temp.ok(public.enrollment_doc_begin_p2('tokB','immunization','application/pdf',1000,'x','fn',:'doc_a1'::uuid,5)->>'reason' = 'replaces', 'cannot replace another family''s document');
select pg_temp.ok(public.enrollment_doc_begin_p2('tokA','insurance-front','image/png',1000,'p1','fn',null,1)->>'ok' = 'true', 'insurance front slot 1');
select pg_temp.ok(public.enrollment_doc_begin_p2('tokA','insurance-front','image/png',1000,'p2','fn',null,1)->>'reason' = 'category_limit', 'insurance front limited to one');
select (public.enrollment_doc_stored_p2('tokB', :'doc_a1'::uuid, 'structure_checked')->>'ok')::boolean as wrong_store \gset
select pg_temp.ok(not :'wrong_store'::boolean, 'session B cannot mark session A''s document stored');
select pg_temp.ok((public.enrollment_doc_stored_p2('tokA', :'doc_a1'::uuid, 'structure_checked')->>'ok')::boolean, 'session A stores its document');
-- replacement retires the old file
select public.enrollment_doc_begin_p2('tokA','immunization','image/jpeg',2000,'shaA2','fn',:'doc_a1'::uuid,5)->>'id' as doc_a2 \gset
select public.enrollment_doc_stored_p2('tokA', :'doc_a2'::uuid, 'structure_checked');
select pg_temp.ok((select status from website_private.enrollment_documents where id = :'doc_a1') = 'replaced', 'replaced document retired');
select pg_temp.ok((public.enrollment_docs_check_p2('tokA', jsonb_build_array(jsonb_build_object('id', :'doc_a2', 'category', 'immunization')))->>'ok')::boolean, 'pre-check accepts own stored file');
select pg_temp.ok(not (public.enrollment_docs_check_p2('tokB', jsonb_build_array(jsonb_build_object('id', :'doc_a2', 'category', 'immunization')))->>'ok')::boolean, 'pre-check refuses another family''s file');
-- cross-family attach is refused; wrong category refused; correct attach succeeds and is idempotent per application
select pg_temp.ok(public.enrollment_docs_attach_p2('tokB', :'app_b'::uuid, jsonb_build_array(jsonb_build_object('id', :'doc_a2', 'category', 'immunization')))->>'reason' = 'documents', 'family B cannot attach family A''s file');
select pg_temp.ok(public.enrollment_docs_attach_p2('tokA', :'app_a'::uuid, jsonb_build_array(jsonb_build_object('id', :'doc_a2', 'category', 'custody')))->>'reason' = 'documents', 'category must match the answer');
select pg_temp.ok((public.enrollment_docs_attach_p2('tokA', :'app_a'::uuid, jsonb_build_array(jsonb_build_object('id', :'doc_a2', 'category', 'immunization')))->>'ok')::boolean, 'family A attaches its own file');
select pg_temp.ok(public.enrollment_docs_attach_p2('tokA', :'app_b'::uuid, '[]'::jsonb)->>'reason' = 'session', 'an attached session cannot be reused for another application');
select pg_temp.ok(jsonb_array_length(public.enrollment_docs_for_app_p2(:'ref_a')) = 1 and jsonb_array_length(public.enrollment_docs_for_app_p2(:'ref_b')) = 0, 'listing is per application');
select pg_temp.ok((select status from website_private.enrollment_documents where category = 'insurance-front') = 'abandoned', 'unreferenced uploads are retired at submission');
select pg_temp.ok(public.enrollment_doc_begin_p2('tokA','other','application/pdf',10,'z','fn',null,5)->>'reason' = 'expired', 'attached session accepts no new uploads');
-- expired session
update website_private.enrollment_upload_sessions set expires_at = now() - interval '2 hours' where token_hash = 'tokB';
select pg_temp.ok(public.enrollment_doc_begin_p2('tokB','other','application/pdf',10,'z','fn',null,5)->>'reason' = 'expired', 'expired upload authorization refused');
update website_private.enrollment_documents set created_at = now() - interval '2 hours';
select pg_temp.ok(jsonb_array_length(public.enrollment_cleanup_candidates_p2(50)) >= 2, 'cleanup lists retired files');
-- evidence is append-only
select public.enrollment_record_v130_p2(:'app_a'::uuid, '{"agreement_sha256":"h","contract_version":"PPC","contract_status":"partial","copay_status":"unknown","wt_ack_status":"acknowledged","doc_summary":{"immunization":1},"access":"true"}',
  '[{"kind":"contract","version":"PPC","language":"en","status":"partial","text_sha256":"t","accepted_at":"2026-11-25T12:00:00Z","payload_enc":"e"}]', '{"payment_type":"pfcc","pfcc_status":"pending","copay_cents":null,"copay_source":"none","due_day":null,"status":"awaiting_confirmation"}');
select pg_temp.ok((public.enrollment_record_v130_p2(:'app_a'::uuid, '{}', '[]', null)->>'duplicate')::boolean, 'evidence is written once');
do $$ begin begin update website_private.enrollment_agreements set version = 'x'; exception when raise_exception or insufficient_privilege then raise notice 'ok  agreements are append-only (service role)'; return; end; raise exception 'FAIL: agreement updated'; end $$;
do $$ begin begin delete from website_private.enrollment_financial_terms; exception when raise_exception or insufficient_privilege then raise notice 'ok  financial terms are append-only (service role)'; return; end; raise exception 'FAIL: terms deleted'; end $$;
reset role; -- even the database owner cannot rewrite evidence (trigger)
do $$ begin begin update website_private.enrollment_agreements set version = 'x'; exception when raise_exception then raise notice 'ok  agreements are append-only (owner)'; return; end; raise exception 'FAIL: owner updated agreement'; end $$;
set role service_role;
select pg_temp.ok((public.enrollment_terms_confirm_p2(:'ref_a', 1500, 'fri', 'staff:test')->>'revision')::int = 2, 'confirmed terms are a new revision');
select pg_temp.ok((select count(*) from website_private.enrollment_financial_terms where application_id = :'app_a') = 2, 'original parent-reported terms preserved');
-- parent access
select public.enrollment_access_create_p2(:'app_a'::uuid, 'acc1', 604800, 'initial');
select pg_temp.ok((public.enrollment_access_check_p2('acc1', true, false)->>'ok')::boolean, 'valid link releases');
select pg_temp.ok(public.enrollment_access_check_p2('acc-unknown', false, false)->>'reason' = 'unknown', 'unknown link refused');
select public.enrollment_access_check_p2('acc1', false, true) from generate_series(1, 4);
select pg_temp.ok(public.enrollment_access_check_p2('acc1', false, true)->>'reason' = 'locked', 'fifth failed verification locks the link');
select pg_temp.ok(public.enrollment_access_check_p2('acc1', true, false)->>'reason' = 'locked', 'locked link stays locked');
select public.enrollment_access_create_p2(:'app_a'::uuid, 'acc2', 3600, 'renewal');
update website_private.enrollment_parent_access set expires_at = now() - interval '1 minute' where token_hash = 'acc2';
select pg_temp.ok(public.enrollment_access_check_p2('acc2', true, false)->>'reason' = 'expired', 'expired link refused');
select pg_temp.ok(public.enrollment_access_renew_ok_p2(:'app_a'::uuid), 'renewal allowed for 1.3.0 application');
select pg_temp.ok(not public.enrollment_access_renew_ok_p2(:'app_b'::uuid), 'no document links for legacy 1.2.0-E1 applications');
-- legacy progress function still behaves exactly as before, and the sweep sees pending access emails
select public.enrollment_mark_p1(:'app_b'::uuid, '{"pdf_status":"generated","h2h_pdf_path":"p","staff_email_status":"sent"}');
select pg_temp.ok((select status from website_private.enrollment_applications where id = :'app_b') = 'complete', 'legacy status logic unchanged');
select pg_temp.ok((select access_email_status from website_private.enrollment_applications where id = :'app_b') = 'none', 'legacy application gets no access email');
reset role;

-- 3. Restricted financial store (synthetic test data only; no real card number appears anywhere in this repository).
set role anon;
select pg_temp.expect_denied('select * from website_financial.cards', 'anon select cards');
select pg_temp.expect_denied($q$select public.enrollment_card_display_p2(gen_random_uuid(), 'pdf')$q$, 'anon card display');
select pg_temp.expect_denied($q$select public.enrollment_card_store_p2(gen_random_uuid(),'visa','1111','x','y',now(),'z')$q$, 'anon card store');
reset role;
set role authenticated;
select pg_temp.expect_denied('select * from website_financial.cards', 'authenticated select cards');
select pg_temp.expect_denied($q$select public.enrollment_card_purge_p2(gen_random_uuid(),'x','y')$q$, 'authenticated card purge');
reset role;
set role service_role;
select pg_temp.expect_denied('select * from website_financial.cards', 'service role cannot read the card table directly');
select pg_temp.expect_denied('select * from website_financial.card_access_log', 'service role cannot read the card log directly');
select pg_temp.expect_denied('update website_financial.cards set status = ''purged''', 'service role cannot edit cards directly');
select pg_temp.ok((public.enrollment_flags_p2()->>'financial_card_collection')::boolean = false, 'card collection flag defaults to OFF');
select pg_temp.ok((public.enrollment_card_store_p2(:'app_a'::uuid,'visa','1111','SYNTHETIC-PAN-BLOB','SYNTHETIC-DISPLAY-BLOB',now(),'abc')->>'duplicate')::boolean = false, 'card stored once');
select pg_temp.ok((public.enrollment_card_store_p2(:'app_a'::uuid,'visa','9999','OTHER','OTHER',now(),'abc')->>'duplicate')::boolean, 'a retry never rewrites the stored card');
select pg_temp.ok((public.enrollment_card_display_p2(:'app_a'::uuid)->>'last4') = '1111' and not (public.enrollment_card_display_p2(:'app_a'::uuid) ? 'pan_enc'), 'display returns the mask and never the number blob');
select pg_temp.ok((public.enrollment_card_display_p2(gen_random_uuid(), 'pdf')) is null, 'unknown application has no card');
select pg_temp.ok((public.enrollment_card_retention_p2(:'app_a'::uuid, current_date - 1, 'director')->>'ok')::boolean, 'retention date can be set');
select pg_temp.ok(public.enrollment_card_purge_due_p2(10) = 1, 'retention control purges an expired card');
select pg_temp.ok((public.enrollment_card_display_p2(:'app_a'::uuid)->>'status') = 'purged' and (public.enrollment_card_display_p2(:'app_a'::uuid)->>'display_enc') is null, 'purged card keeps no data');
select pg_temp.ok(not (public.enrollment_card_purge_p2(:'app_a'::uuid,'again','director')->>'ok')::boolean, 'purging twice is a no-op');
reset role;
-- the audit log lives behind the same wall: read it as the database owner
select pg_temp.ok((select count(*) from website_financial.card_access_log where application_id = :'app_a'::uuid and action in ('store','display_read','retention_set','purge')) >= 5, 'every store/read/retention/purge is audit-logged');
do $$ begin begin update website_financial.card_access_log set actor = 'x'; raise exception 'FAIL: log editable'; exception when raise_exception then if sqlerrm like 'FAIL%' then raise; end if; raise notice 'ok  card access log is append-only'; end; end $$;
set role service_role;

-- 4. Finalization and parent-email retry (reliability repairs).
select pg_temp.ok((select finalize_status from website_private.enrollment_applications where id = :'app_a') = 'pending', '1.3.0 application starts pending finalization');
select pg_temp.ok((select finalize_status from website_private.enrollment_applications where id = :'app_b') = 'not_applicable', '1.2.0-E1 application is not subject to finalization');
select pg_temp.ok(:'ref_a' in (select jsonb_array_elements_text(public.enrollment_unfinished_p1(0, 25))), 'sweep selects a pending-finalization application');
select public.enrollment_mark_p2(:'app_a'::uuid, '{"pdf_status":"generated","h2h_pdf_path":"p","staff_email_status":"sent"}');
select pg_temp.ok((select status from website_private.enrollment_applications where id = :'app_a') = 'received', 'not complete while finalization is pending');
select public.enrollment_mark_p2(:'app_a'::uuid, '{"finalize_status":"done","finalize_error":""}');
select pg_temp.ok((select status from website_private.enrollment_applications where id = :'app_a') = 'complete', 'complete once finalized');
select public.enrollment_mark_p2(:'app_a'::uuid, '{"family_email_status":"failed","family_email_error":"rate_limited","family_email_attempts_inc":1}');
update website_private.enrollment_applications set updated_at = now() - interval '11 minutes' where id = :'app_a';
select pg_temp.ok(:'ref_a' in (select jsonb_array_elements_text(public.enrollment_unfinished_p1(0, 25))), 'a failed parent email is selected for automatic retry');
select public.enrollment_mark_p2(:'app_a'::uuid, '{"family_email_status":"failed","family_email_attempts_inc":5,"staff_delivery_status":"delivered"}');
update website_private.enrollment_applications set updated_at = now() - interval '2 days' where id = :'app_a';
select pg_temp.ok(:'ref_a' not in (select jsonb_array_elements_text(public.enrollment_unfinished_p1(0, 25))), 'retries are bounded (6 attempts)');
reset role;
select 'ALL ACCESS-CONTROL TESTS PASSED' as result;

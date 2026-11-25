# Consolidated enrollment website release

## Scope and evidence

The release combines the accepted enrollment frontend, Privacy Policy, Accessibility Statement, Nondiscrimination Policy, Parent Portal and existing design with Cleveland SEO/GEO work recovered from source commits 71156c4 and 5048975. English, Spanish, French, Arabic and Swahili are included. The original accepted ZIP remains preserved. Use the consolidated ZIP for the next publication.

- Backend source debcefd583b41b42f013733d6679b3dd226f4c1e. Production submit-enrollment v7 is active with JWT verification enabled. Migration 2 is recorded as 20261125145715 v130_financial_and_finalize.
- The [isolated validation](https://github.com/2hearts25/hearts25/actions/runs/45639481162) exercised migration permissions, finalization, email retry, both PDFs and rejection of disabled card collection. Production reference H2H-20261125-044BA343 completed on retry and generated both private PDFs. Resend confirmed both email deliveries. The live PDF, email and scheduled retry paths operate independently of the frontend cutover and are already active.
- The consolidated build generated 145 pages. Targeted checks passed for localized policy, portal and enrollment routes, SEO metadata, crawler exclusions, noindex and no analytics on private routes, and release assets. Enrollment source, backend function source, design assets and policy content match the accepted source. Contract R2 and the required late-pickup acknowledgment remain included. Private-pay tuition stays deferred.
- Automated email-status polling returns HTTP 401. The application uses its operational sending key for polling. Resend offers sending-only and account-wide full access, with no narrowly scoped read key found. Leave the current sending credential and retry job in place. Verify deliveries through Resend as needed. If management wants automated status, authorize and scope a separate follow-up for signed delivery webhooks or an explicitly approved credential configuration.

## Configuration and activation

Production submit-enrollment v8 (backend source 7947ed7) adds administration email packets. Production migration 20261125153305 v130_staff_packet stores service-only per-part receipts. Supporting documents that pass structural upload validation and storage integrity checks are attached with the two enrollment PDFs for the existing authorized recipients. Quarantined, blocked, rejected and unrelated files are excluded. Structural validation does not provide antivirus or content classification. Families should use only the designated upload categories and exclude payment card images or numbers. The separate card-data store is not read by the packet sender.

The cap is 16 MiB of base64 attachment content per message, leaving room for email overhead. Larger packets are numbered and share the application reference and inventory. The two generated PDFs always appear together in part 1. The database stores accepted message IDs per part. A retry skips acknowledged parts and uses the same provider idempotency key for an uncertain part. Automatic resends stop short of the provider deduplication expiry. Reconcile missing receipts in Resend before manually intervening. Record receipt and preservation before any retention change. Attached uploads remain encrypted and retained in private storage. Resend acceptance does not confirm inbox delivery; verify all part IDs in Resend where delivery confirmation is required.

Staff accounts and portal activation are no longer prerequisites. Publish the updated five-language Privacy Policy at the same cutover as uploads. The [targeted integration run](https://github.com/2hearts25/hearts25/actions/runs/45646144722) verified the real Edge Function, encrypted upload attachment, inventory, rejection of unvalidated uploads, restricted SQL permissions and lost-receipt recovery without duplicate delivery. A local packet check covered size splitting and quarantine exclusion.

The following SQL is for a separately authorized cutover. Keep all flags off until their dependencies are ready. Run through the production SQL editor and verify the returned state. Allow up to 30 seconds for function flag cache refresh.

~~~sql
-- At coordinated publication of the approved ZIP
update website_private.feature_flags
set enabled = true, updated_at = now()
where key in ('enrollment_v130', 'parent_document_access', 'enrollment_uploads');

select public.enrollment_flags_p2();
~~~

Leave financial_card_collection off, with no request to collect full card numbers in production. See PAYMENT_CARD_SECURITY_CHECKLIST.md. The optional financial flow, insurance questions and supporting-document assets are included in the consolidated package.

## Publication and verification

1. Obtain separate explicit management authorization and confirm available deployment credits. Record the current production deploy ID and flags before cutover. Use the prebuilt package and its dist directory on the existing hearts25.com Netlify project.
2. Coordinate website publication with enrollment and parent-document activation. Verify the public form version, required agreement controls and normal legacy compatibility. Use one synthetic enrollment to verify both PDFs, management and parent email, and secure parent retrieval. Include one synthetic supporting document and confirm the administration email inventory and all attachments. Leave the staff portal and full card collection off.
3. Keep backend secrets in Supabase. The prebuilt frontend contains only the public Supabase anon credential. The release documentation and source marker sit outside dist.

## Rollback

- Disable the four frontend-dependent flags below and restore the preceding Netlify production deploy. The last recorded rollback deploy is 6b06684dc0e09d6017e415df. Confirm it is still the intended previous deploy at cutover. Existing 1.2.0-E1 submissions remain compatible.
- For a v8 packet defect, disable enrollment_uploads, preserve packet receipts and stored documents, then redeploy the v7 source at debcefd if needed. Reconcile partial packets before any retry.
- For an earlier v7 backend defect, redeploy the v6 entry from docs/deploy/submit-enrollment-v6-entry.ts with JWT verification. Restore the pre-migration-2 RPC bodies using supabase/rollback/v130_migration2_rpc_restore.sql only if needed. Preserve additive migration objects and signed evidence.
- Phase B publication, previews and credit use were outside this preparation run.

~~~sql
update website_private.feature_flags
set enabled = false, updated_at = now()
where key in ('enrollment_v130', 'parent_document_access',
              'staff_document_access', 'enrollment_uploads');
select public.enrollment_flags_p2();
~~~

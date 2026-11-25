# Consolidated enrollment website release

## Scope and evidence

The release combines the accepted enrollment frontend, Privacy Policy, Accessibility Statement, Nondiscrimination Policy, Parent Portal and existing design with Cleveland SEO/GEO work recovered from source commits 71156c4 and 5048975. English, Spanish, French, Arabic and Swahili are included. The original accepted ZIP remains preserved. Use the consolidated ZIP for the next publication.

- Backend source debcefd583b41b42f013733d6679b3dd226f4c1e. Production submit-enrollment v7 is active with JWT verification enabled. Migration 2 is recorded as 20261125145715 v130_financial_and_finalize.
- The [isolated validation](https://github.com/2hearts25/hearts25/actions/runs/45639481162) exercised migration permissions, finalization, email retry, both PDFs and rejection of disabled card collection. Production reference H2H-20261125-044BA343 completed on retry and generated both private PDFs. Resend confirmed both email deliveries. The live PDF, email and scheduled retry paths operate independently of the frontend cutover and are already active.
- The consolidated build generated 145 pages. Targeted checks passed for localized policy, portal and enrollment routes, SEO metadata, crawler exclusions, noindex and no analytics on private routes, and release assets. Enrollment source, backend function source, design assets and policy content match the accepted source. Contract R2 and the required late-pickup acknowledgment remain included. Private-pay tuition stays deferred.
- Automated email-status polling returns HTTP 401. The application uses its operational sending key for polling. Resend offers sending-only and account-wide full access, with no narrowly scoped read key found. Leave the current sending credential and retry job in place. Verify deliveries through Resend as needed. If management wants automated status, authorize and scope a separate follow-up for signed delivery webhooks or an explicitly approved credential configuration.

## Configuration and activation

Before staff access, management must name each authorized Director or Administrator and supply their work email. Invite that account in production Supabase Auth, verify the staff email-code template with that account, keep self-signup disabled, and record the account UUID, email, director/administrator role, and approving actor in website_private.staff_document_access. Staff should authenticate through the existing staff page. Keep uploads off until an authorized staff member can retrieve a synthetic document. Files receive structural checks and quarantine/review; do not treat this as an antivirus scan.

The following SQL is for a separately authorized cutover. Keep all flags off until their dependencies are ready. Run through the production SQL editor and verify the returned state. Allow up to 30 seconds for function flag cache refresh.

~~~sql
-- At coordinated publication of the approved ZIP
update website_private.feature_flags
set enabled = true, updated_at = now()
where key in ('enrollment_v130', 'parent_document_access');

-- Once the authorized staff account and OTP flow have been verified
update website_private.feature_flags
set enabled = true, updated_at = now()
where key = 'staff_document_access';

-- Once authorized staff retrieval has been verified
update website_private.feature_flags
set enabled = true, updated_at = now()
where key = 'enrollment_uploads';

select public.enrollment_flags_p2();
~~~

Leave financial_card_collection off, with no request to collect full card numbers in production. See PAYMENT_CARD_SECURITY_CHECKLIST.md. The optional financial flow, insurance questions and supporting-document assets are included in the consolidated package.

## Publication and verification

1. Obtain separate explicit management authorization and confirm available deployment credits. Record the current production deploy ID and flags before cutover. Use the prebuilt package and its dist directory on the existing hearts25.com Netlify project.
2. Coordinate website publication with enrollment and parent-document activation. Verify the public form version, required agreement controls and normal legacy compatibility. Use one synthetic enrollment to verify both PDFs, management and parent email, and secure parent retrieval. Use a synthetic upload when the authorized staff retrieval path is available.
3. Keep backend secrets in Supabase. The prebuilt frontend contains only the public Supabase anon credential. The release documentation and source marker sit outside dist.

## Rollback

- Disable the four frontend-dependent flags below and restore the preceding Netlify production deploy. The last recorded rollback deploy is 6b06684dc0e09d6017e415df. Confirm it is still the intended previous deploy at cutover. Existing 1.2.0-E1 submissions remain compatible.
- For a v7 backend defect, redeploy the v6 entry from docs/deploy/submit-enrollment-v6-entry.ts with JWT verification. Restore the pre-migration-2 RPC bodies using supabase/rollback/v130_migration2_rpc_restore.sql only if needed. Preserve additive migration objects and signed evidence.
- Phase B publication, previews and credit use were outside this preparation run.

~~~sql
update website_private.feature_flags
set enabled = false, updated_at = now()
where key in ('enrollment_v130', 'parent_document_access',
              'staff_document_access', 'enrollment_uploads');
select public.enrollment_flags_p2();
~~~

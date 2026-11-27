# Heart to Heart — Communications System (1.4.0-C1)

Builds on source commit 4a2319c (enrollment newsletter NL-1.0). Nothing in this release sends any email, imports any real contact or schedules any campaign. Every new capability is behind a database flag that ships **OFF**.

## 1. Architecture
* **Master contact register** — `website_private.marketing_contacts` (extended, existing rows and consent history preserved) + `contact_roles`, `contact_relationships`, `marketing_consent_events`, `comms_audit_log`, `contact_capture_queue`. Holds adult name, email, optional phone, language, source, roles, deliverability, restriction. **Never** holds child, health, custody or financial data; relationship `ref` values are opaque labels (`app:1a2b3c4d`).
* **Newsletter consent is separate from service eligibility.** Statuses: `none` (unknown, never subscribed), `pending_confirmation`, `subscribed`, `unsubscribed`, `declined`.
* **Four independent categories** (database function `website_private.eligible(category)`):
  | Category | Who | Affected by newsletter opt-out? |
  |---|---|---|
  | Critical | contacts with an **active** enrollment or employment relationship | No |
  | Operational | pending/active enrollment, active employment, open inquiry/tour | No |
  | Newsletter | `subscribed` only | — |
  | Internal | active employees | No |
  Delivery suppression (bounce, complaint, suppressed) and "do not contact" remove a contact from **every** category (critical failures go to the telephone list instead).
* **Enrollment relationships** — a new application creates a *pending* applicant relationship, never active. An administrator confirms *active*. One adult with several children has several relationships but receives one message and stays eligible until the last active enrollment ends. Repeat submissions never downgrade an active relationship.
* **Consent rules** (`website_private.marketing_apply`): a missing choice changes nothing; an unverified public/application "No" can never unsubscribe an existing subscriber and an unverified "Yes" can never resubscribe an opted-out address — it only emails a confirmation link (double opt-in). Admins can unsubscribe, record *documented* consent (evidence required, never for an opted-out person) or request confirmation; they cannot silently resubscribe. Import never changes an opt-out; blank consent stays `none`.
* **Automatic capture** — enrollment applications (function code), and inquiry / tour / contact / registration submissions (database triggers on `inquiries` and `child_registrations`). Flag `comms_capture`. Every capture is exception-safe: a failure is queued (`contact_capture_queue`, 8 retries with back-off) and never blocks the submission or its emails.
* **Edge function `communications`** — admin API (Supabase sign-in + `comms_admins` allowlist, per-person permissions, rate limited, audited), public double-opt-in signup, confirm/unsubscribe link pages (GET shows a button, POST acts, so email scanners change nothing), Svix-verified Resend webhook, Resend synchronization/reconciliation, newsletter runner, critical sender, `tick` maintenance (cron secret).
* **Resend** — own API key for this function only (the enrollment sending key is never read). Segment **Newsletter subscribers** (`e8fb9bf9-f289-41a9-8496-586329d48073`) and topic **Monthly newsletter** (`21dbf670-39c0-4045-a6ad-4a75a0d1abe3`) are created. Only consented, deliverable contacts are uploaded; unsubscribes are pushed; provider unsubscribes/complaints/permanent bounces flow back; a provider "subscribed" is never copied into the register (the register always wins, enforced again by scheduled reconciliation).
* **Monthly newsletter** — one branded template (Director's note, center news, enrollment updates, family resources, community events, contact info, website, address, unsubscribe). Draft for the next month is created automatically for the **first Tuesday 10:00 Cleveland time**; content must be completed and **approved** by an authorized person; approval is bound to a content hash (any edit withdraws it); the runner re-syncs and reconciles immediately before sending, claims the campaign atomically (no duplicate delivery) and refuses unless flag `comms_newsletter_send` is ON.
* **Critical notices** — six templates (closure, delayed opening, early closure, severe weather, transportation, reopening). Flow: fill in → *Preview recipients* (count, exclusions) → type the count to authorize → send → delivery report + **telephone follow-up list** (failed, bounced, suppressed, restricted). Refuses unresolved placeholders, links or promotional wording; refuses to send unless flag `comms_critical_send` is ON. The email supplements, never replaces, your emergency procedures.
* **Website** — optional, unchecked-by-default newsletter checkbox on the tour, information-request and contact forms; footer sign-up on every public page; five languages; Privacy Policy gains one paragraph (contact list, voluntary marketing vs essential service messages). Enrollment newsletter section, PDFs and wording untouched.

## 2. Management operating instructions
1. **Sign in** — open `tools/communications-admin.html` (a single file; keep it private) and use your Heart to Heart administrator login.
2. **Contacts tab** — search/filter, add a person, edit email/phone/roles, change enrollment status (pending → **active** when you confirm a family has started; withdrawn / graduated / terminated when they leave), employees (employment status), community contacts, "do not contact". Statuses drive who gets critical notices — keep them current.
3. **Newsletter** — each month fill in the five sections, *Preview email*, then *Approve*. Nothing sends until management switches the send flag on.
4. **Critical notice** — choose template, fill when/time/details, *Preview recipients*, review, type the recipient count, **SEND NOW**. Then use the telephone list for anyone not reached. Daily provider limit is **100 emails/day on the current Resend plan** — a larger family/staff list needs a paid Resend plan (not purchased; management decision).
5. **Export** — authorized lists to CSV (each export is audit-logged; store securely).

## 3. Import procedure (CSV)
Import tab → *Download template* → fill → paste/choose file → **Preview** (nothing saved; shows create/update/duplicate/invalid per row) → fix errors → **Import** → *Download results*. Columns: `email` (required), `first_name`, `last_name`, `phone`, `language` (en/es/fr/ar/sw), `roles` (semicolon-separated), `enrollment_status` or `employment_status`, `newsletter_consent` (only `yes` when you hold documented consent, which also needs `consent_date` and `consent_source`). Blank consent ⇒ **not subscribed**. Existing opt-outs are preserved; existing data is filled, not overwritten; re-importing creates no duplicates. **Do not import real contacts until management authorizes it.**

## 4. Deployment steps (run once, in order, by an authorized person)
```
supabase db push --project-ref zebeclcvrdmisnxkwode          # applies 20261126210000_communications_system.sql (backward compatible; all new flags OFF)
supabase functions deploy submit-enrollment --project-ref zebeclcvrdmisnxkwode      # also brings in M-1/M-2/M-3 + newsletter + contact capture (production is v11, which lacks them)
supabase functions deploy communications --no-verify-jwt --project-ref zebeclcvrdmisnxkwode
supabase secrets set COMMS_RESEND_KEY=<new Resend key created for this function> COMMS_TOKEN_SECRET=<random 40+ chars> COMMS_CRON_SECRET=<random 40+ chars> \
  COMMS_RESEND_SEGMENT_ID=e8fb9bf9-f289-41a9-8496-586329d48073 COMMS_RESEND_TOPIC_ID=21dbf670-39c0-4045-a6ad-4a75a0d1abe3 \
  COMMS_PUBLIC_URL=https://zebeclcvrdmisnxkwode.supabase.co/functions/v1/communications
```
Then create a Resend webhook → `https://zebeclcvrdmisnxkwode.supabase.co/functions/v1/communications?a=webhook` (events: email.delivered, email.bounced, email.complained, email.failed, email.suppressed, contact.updated, contact.deleted) and store its signing secret: `supabase secrets set COMMS_WEBHOOK_SECRET=whsec_…`. Create Ebony's Supabase Auth user, then:
```sql
insert into website_private.comms_admins (user_id, email, added_by, can_manage, can_send_critical, can_approve_newsletter)
values ('<her auth user id>', '<her email>', 'justin', true, true, true);
```
Enable capture only after the updated Privacy Policy is published: `update website_private.feature_flags set enabled = true where key = 'comms_capture';` (same pattern for `comms_resend_sync`; leave `comms_newsletter_send` and `comms_critical_send` OFF until management authorizes). Optional scheduler (not activated): a pg_cron/pg_net job posting `{"action":"tick"}` with header `x-cron-secret` every hour.

## 5. Not done / decisions for management
* Existing inquiries and registrations are **not** back-filled into the register (only new submissions are captured, and only once `comms_capture` is ON). Existing families enter via CSV import after authorization.
* Resend free plan: 100 emails/day, 1,000 contacts. Check the family + staff count against it before enabling critical sends.
* Newsletter and critical email text is English-only (family-facing signup/confirmation pages are five-language).

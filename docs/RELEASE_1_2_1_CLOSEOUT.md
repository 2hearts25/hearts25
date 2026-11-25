# Version 1.2.1 — release closeout

Status: **released.** Production registration, PDF generation and management-email delivery verified on 2026-11-24 (Eastern). Evidence record, not a new development cycle.

## Release references

- Production: https://hearts25.com — Netlify deploy `6b06318c6239f34b5453d750` (site code; legacy Netlify Forms disabled).
- Source: GitHub `release/1.2.1`; deployed runtime code = commit `5ebfd8dfdfabc9be2bfdb432da7d370124eaaa34` (the later commit only updates this document and a test script).
- Edge Functions: `submit-enrollment` v5 (bundled at deploy time from the pinned commit above), `website-inquiry` v16, `tour-request-mailer` v10, `site-event` v2. `h2h-diag` is a retired stub returning HTTP 410 (cannot be deleted with the deployment tools; delete in the Supabase dashboard).
- Required Netlify build variable: `H2H_PUBLIC_ANON_KEY` (the project's public anon key).
- Secrets were not modified. `H2H_APP_DATA_KEY` is not a 32-byte base64 value, so the key loader derives its 256-bit AES key from the existing value with SHA-256. Rotating to a 32-random-byte key is deferred maintenance (no stored data depends on it yet; rotation before real data arrives is the cheap time).

## Production acceptance test (one synthetic application, reference H2H-20261124-0F59E816)

- Submitted through the live Swahili `/register/` page: HTTP 201, reference shown on the confirmation page, no personal data in the URL or in local storage/cookies (session storage holds only the reference and a confirmation flag).
- Stored encrypted (payload and both PDFs), status complete: Ohio PDF 6 pages, Heart to Heart PDF 8 pages, both unencrypted (no password).
- One management email (TO hearttoheart3095@yahoo.com, BCC tohearts25@gmail.com): Resend status `delivered`; both PDFs attached to the same message; subject, body and filenames contain only the reference. Mailbox receipt in both inboxes is **awaiting management confirmation**.
- Parent welcome (Swahili) to the Resend test inbox: `delivered`.
- Days needed `Mon, Wed, Sat` appears in the Heart to Heart PDF; the contract and Absent Days Policy are in that PDF only.
- The application's own delivery check returns "unverifiable" (HTTP 401) because the production Resend key is send-only; delivery was confirmed through the Resend account instead.
- Tour (Swahili) and Request More Information (French) submitted live: HTTP 201, generic acknowledgment in the matching language, no PDFs. Retry sweep `h2h-enrollment-sweep` runs every 10 minutes and returns 202.

## Weekend days (included in 1.2.1)

`c.days` offers Mon–Sun in all five languages; any combination, including weekend-only, is accepted by the shared schema, browser form and server validation. School transport days (`st.days`) remain Mon–Fri. No database change was needed (the application is stored as one encrypted payload). One sentence on the Child step says weekend care is subject to staffing and availability. Tested: weekday-only, weekend-only, combined and all seven (unit tests and PDF output).

## Synthetic record

The test application is identified by the child name "SYNTHETIC-TEST Production-1.2.1" and the reference above. Supabase blocks deleting stored PDF objects by SQL, so it was left in place rather than half-removed; delete it via the Storage API/dashboard together with its table row.

## Outstanding management approvals (not technical blockers)

Contract wording and fees; handbook and document links; school-transport scope; native-speaker translation review; Ohio form layout review; media-release wording; whether Parent 2 may be added later.

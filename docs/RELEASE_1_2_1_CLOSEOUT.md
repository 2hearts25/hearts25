# Version 1.2.1 — release closeout verification

Status: deployed; final production enrollment/PDF delivery acceptance remains NOT VERIFIED. This is an evidence record, not a new development cycle.

## Verified release references

- Production: https://hearts25.com
- Netlify current ready deployment: `6b062cfc6c675c685f1207f9`, published 2026-11-25 00:34 UTC (Nov 24 Eastern). Legacy Netlify Forms disabled. Deploy metadata does not link a Git commit.
- Reviewed release source: `release/1.2.1` at `b6b491bdadfdb6d5e2f7d75e3be9d6edfc1e998d`; this documentation commit does not alter runtime code.
- Supabase functions active: submit-enrollment v4, website-inquiry v16, tour-request-mailer v10, site-event v2, h2h-diag v2.
- Enrollment table is private with RLS enabled; enrollment-pdfs bucket is nonpublic. Enrollment table contained zero rows at inspection. Source implements application encryption and two PDF generation, encrypted storage and one staff email carrying two PDF attachments; actual output/delivery not verified.
- Scheduled retry `h2h-enrollment-sweep` active every 10 minutes, targets /sweep, job execution succeeded at 00:30 and 00:40 UTC. No queued application was available to prove recovery.
- Source copies of generic acknowledgment are identical in both inquiry and tour mailer functions, covering en/es/fr/ar/sw. Earlier Resend records confirm tour and information delivery and prior Swahili emails; these precede this release and do not establish the current full registration flow.

## Remaining single acceptance test

Run one clearly marked synthetic application through the live Swahili registration page using the existing browser test `enrollment/test/e2e-live.py` or equivalent. Confirm accepted response, reference and confirmation page; inspect encrypted stored application metadata; retrieve the two actual generated PDFs and compare submitted applicable fields and signatures with the field map; verify both open and print without password. Confirm one management email contains both PDFs and no confidential details outside attachments, with required TO/BCC, and verify welcome email regression. Check provider delivery and obtain mailbox-owner receipt confirmation for each management recipient. Retain only redacted evidence and segregate/remove only the exact synthetic record and corresponding artifacts after confirmation. Verify actual retry recovery if evidence is available. Do not rerun unrelated successful suites.

No live form submission was possible from the verification environment (public HTTP access failed; no interactive browser action available). No matching management PDF email was visible in recent Resend history. Full five-language functional test output and the Swahili resolution were not available; existing test source is not a test result. The temporary diagnostic function remains active; remove only with explicit authorization. No production changes, secret changes, key rotation, database cleanup or new infrastructure were performed. Management policy decisions and native-speaker review remain in `docs/MANAGEMENT_DECISIONS.md`; deferred maintenance does not block release. Close only after production registration and PDF delivery evidence succeeds.

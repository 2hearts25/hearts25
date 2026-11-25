# Release 1.3.0 — Enrollment completion (form 1.3.0-E2)

Status: **engineering complete and validated locally; NOT live.** The published website still runs form 1.2.0-E1, and every 1.3.0 backend capability is switched **off** until the activation steps below are run. No Netlify deployment was made.

## 1. What changed for families (form 1.3.0-E2)

| Area | Change |
|---|---|
| Step order | … Photo & media → Agreements and policies → **Parent/Provider Contract (its own step, the last page)** → Review → Sign |
| Parent/Provider Contract | Version `PPC-2026.11-R1`. 12 sections, each marked **In effect** or **Not yet in effect** (`enrollment/agreements.mjs`). Pending sections show only a "not in effect, will be provided for review and signature" notice — no draft terms, amounts or deadlines. |
| PFCC agreement (PFCC families only) | Authorization status; weekly copay = amount / $0 / not yet known (amount recorded as **parent-reported**); preferred due weekday (to be agreed); acknowledgment. Unknown copay never blocks submission. |
| Late pickup | Paper-contract terms loaded in `LATE_PICKUP` but **inactive**: not shown, not agreed, not charged. Activation is a management decision (section 7). |
| Withdrawal and Termination Policy | New required choice, neither option preselected: the exact approved acknowledgment, or "I could not open it — give me a copy" (receipt then NOT recorded). Revision v1.1, effective 12/1/2026, linked from the Parent Portal manifest. |
| Attendance | Contract adds the approved definitions (full time ≥ 25 h/week, part time ≥ 10 h/week; sign in/out through a valid attendance method). Schedule options show the hour minimums. |
| School transportation | Authorization valid for **one academic school year** (form, acknowledgment and Heart to Heart PDF). |
| Health insurance | Optional section in the Health step: coverage type, plan, member ID, group, policyholder, relationship, card front/back images. No SSN. Never blocks submission. |
| Supporting documents | Optional uploads: immunization, physical exam / medical statement, health care plan, medication authorization, dietary statement, custody/court, PFCC notice, other. Camera capture (rear camera) or file choice; filename, size, progress, success, failure, retry, replace, remove. Existing "have / bring later / exemption" answers are unchanged; "I will provide some documents separately" added. |
| Parent Handbook | Still **Coming Soon**; "not yet received" still recorded as pending; no replacement handbook. |
| Confirmation email | Existing welcome email kept and expanded with a secure link to **both** finalized PDFs (no attachments). |

All new text exists in English, Spanish, French, Arabic (RTL) and Swahili. Translations are first drafts that have **not** had native-speaker review; the 11/24/2026 "Translated Agreements Approval" record covers the agreements as they existed then, not this new wording.

## 2. Backward compatibility

* The Edge Function serves **both** versions. `1.2.0-E1` submissions are validated, rendered and emailed by a **frozen copy** of release 1.2.1 (`supabase/functions/submit-enrollment/v120/`). The original 19-check 1.2.1 test suite still passes unchanged.
* A 1.2.0-E1 application is never asked for new fields and is never recorded as having seen or signed the new contract (`contract_version` stays empty, no document link is ever sent).
* `1.3.0-E2` submissions are refused (HTTP 409, the form shows "reload") until the `enrollment_v130` flag is on, and a stale page with an older contract version is refused the same way.

## 3. Storage, security and access

* **Private bucket `enrollment-documents`** (not the public `Family docs` bucket). No storage policies: only the service role inside the Edge Function can read or write.
* **Upload path:** browser → Edge Function (never storage directly). The function issues a short-lived (3 h) upload session token (only its HMAC is stored), validates the real bytes (type sniffing, extension match, ≤ 10 MB, PDF structure, refuses encrypted PDFs and active content — JavaScript, Launch, embedded files, XFA, forms submission — and polyglot images), encrypts each file with AES-256-GCM bound to its document id, and stores it under `sessions/<random>/<random>`. Original filenames are stored encrypted. Limits: 10 MB per file, 30 files / 60 MB per application, per-category caps.
* **Quarantine instead of antivirus:** no malware scanner is available in the Edge runtime. Every file stays `structure_checked / unreviewed` until staff mark it reviewed; staff open files only through the logged staff page, on a protected center computer. Files are never emailed or embedded in PDFs.
* **Submission:** every referenced file must be a stored file of the same family's session and the matching category (checked before anything is saved); otherwise 422 and the family re-uploads. Unreferenced files are retired.
* **Cleanup:** removed, replaced, rejected and abandoned uploads are deleted from storage by the existing 10-minute sweep. Attached documents are never deleted automatically until management sets retention periods (`retain_until` column ready).
* **Agreement evidence:** for each application, four append-only records (contract, withdrawal/termination, attendance, signing acknowledgments) with the exact text shown in the family's language and the English source, encrypted, with SHA-256 hashes. Triggers block UPDATE/DELETE even for the database owner.
* **Financial terms:** append-only revisions. Revision 1 = what the parent reported. A staff confirmation is revision 2 (`confirmed_awaiting_parent`); the signed application is never changed.
* **Parent access to PDFs:** the initial link is derived from the application secret and the reference; renewal links are random. Only HMACs are stored. Links go only to the email in the application, expire after 7 days, require the child's date of birth, lock after 5 failed checks, can be renewed (≤ 3/day, applications < 120 days old, 1.3.0 only), and release the exact stored PDFs (SHA-256 checked against the Director's copy). Token travels in the URL fragment and is removed from the address bar immediately.
* **Staff access:** `/staff/documents/` — Supabase Auth email code (no sign-up) + `website_private.staff_document_access` allowlist (**empty**) + `staff_document_access` flag. Optional MFA enforcement with `H2H_STAFF_REQUIRE_MFA=true`. Every list, download and review is logged in `enrollment_document_access_log` (append-only).
* No service-role key in the browser; anon/authenticated roles have no access to any new table or function (verified by `supabase/tests/access-control.sql`).

## 4. Database migration `20261125120000_v130_enrollment_completion.sql`

Additive only: 8 new tables in `website_private`, 13 new nullable/defaulted columns on `enrollment_applications`, 19 new service-role-only functions, 1 private bucket. `enrollment_mark_p1` and `enrollment_unfinished_p1` are replaced by **supersets** (identical behaviour for every existing key). Re-running the migration is safe (tested). Note: production's migration list records 1.2.1 as version `20261125002042`; the repository file is named `20261124230000`. This pre-existing naming difference is harmless and was left unchanged.

## 5. Validation performed (synthetic data only)

| Suite | Result |
|---|---|
| `node enrollment/core.test.mjs` | 34 passed |
| `node enrollment/check-i18n.mjs` | 5 languages × 438 keys, contract paragraphs match |
| `supabase/tests/local-db.sh` (PostgreSQL 16, every migration, positive & negative access tests) | all passed (anon/authenticated denied; cross-family attach/replace/store denied; expiry; append-only; token lockout) |
| `node enrollment/test/pdf-coverage.mjs` | 40 randomized applications, every answered field printed where classified |
| `node enrollment/test/e2e-function.mjs` (1.2.0-E1 legacy path) | 19 passed — unchanged behaviour |
| `node enrollment/test/e2e-v130.mjs` (real function + real SQL) | 27 passed — see list in the file |
| `python3 enrollment/test/e2e-ui-v130.py` (built site, production CSP, Chrome, EN/FR/SW desktop, ES/AR mobile) | 100 passed |
| `python3 tools/check-v120.py` | 102 ok (same as baseline) |

Not testable here: real Resend delivery to real inboxes, real Supabase Storage/Auth email codes, physical phone cameras (simulated with Playwright mobile emulation), native-speaker review. `tools/check-site.py` and `tools/check-registration.py` fail identically on the untouched baseline (they test pre-1.2.0 form markup).

## 6. Activation (two phases)

### Phase A — backend, safe while the 1.2.0 site is live (no behaviour change)
1. Apply the migration `v130_enrollment_completion` to project `zebeclcvrdmisnxkwode`. All flags are created **off**.
2. Deploy `submit-enrollment` from this branch (`verify_jwt` stays on). With flags off it behaves exactly like 1.2.1 for 1.2.0-E1 submissions.
3. Smoke test: one synthetic 1.2.0-E1 application through the live site → both PDFs + Director email + parent welcome, as today. Remove the synthetic record afterwards.

### Phase B — with the website publication (not before)
1. Build: `H2H_PUBLIC_ANON_KEY=<anon key> tools/make-prebuilt-bundle.sh /tmp/h2h-deploy` (or use the prebuilt bundle in the release package) and publish it (management's Netlify step).
2. Immediately turn on the flags (SQL, service role):
   `update website_private.feature_flags set enabled = true, updated_at = now() where key in ('enrollment_v130','enrollment_uploads','parent_document_access');`
3. When management names staff: create their Supabase Auth users (Authentication → Users → invite; keep sign-ups disabled), enable the email OTP template, insert them into `website_private.staff_document_access`, then turn on `staff_document_access`.
4. Smoke test one synthetic 1.3.0 application with a synthetic upload; open the parent link; confirm the Director email; delete the synthetic record and its stored objects.

## 7. Rollback

* **Website:** republish Netlify deploy `6b06684dc0e09d6017e415df` (current 1.2.x production).
* **Backend features:** `update website_private.feature_flags set enabled = false;` — takes effect within 30 seconds; 1.3.0 submissions are then refused with "reload", uploads and links stop, 1.2.0 continues.
* **Edge Function:** redeploy `submit-enrollment` version 5 source (git `release/november-content`, `supabase/functions/submit-enrollment/`), which ignores every new table and column.
* **Database:** nothing needs to be removed; the migration is additive and the old functions keep working with the superset definitions. Do not drop evidence tables — they hold signed records.

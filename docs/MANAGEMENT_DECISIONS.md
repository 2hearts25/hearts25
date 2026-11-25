# Version 1.2.1 — Management Decisions, Approvals and Open Items

_Release 1.2.1 = one online application, two unencrypted PDFs, one staff email. This file is the running record of what management approved, what the system now does about it, and what is still open._

## A. Approved by management (11/24/2026) and implemented
1. **Absent Days and Attendance Policy** — the approved text is shown in full on the form (Agreements step, above its acknowledgment) and printed in full in the Heart to Heart PDF (section 23, immediately before the contract). It states that, under current Ohio PFCC rules, a child may be eligible for up to 20 reimbursable absent days in each six-month period (January–June, July–December). It is **not** an annual allowance, **not** a guarantee of enrollment, and creates **no automatic penalties**. Any financial obligation is addressed only through the approved Parent/Provider Contract. Source: `docs/ABSENT_DAYS_AND_ATTENDANCE_POLICY.md`.
2. **Diapering and Toilet Training** — the selectable 1–4 hour diaper intervals were **removed**. Replaced by the approved statement (diapers checked regularly, changed immediately when wet or soiled), a required acknowledgment where the child is not yet trained, toilet-training status/method/assistance/signals fields, and an optional free-text field for individual diapering or personal-care instructions. Reference: OAC 5180:2-12-23. Heart to Heart PDF carries the supplement; the individual care instructions also print in the Ohio PDF.
3. **Regulatory citations.** Routine transportation and field-trip safety: **OAC 5180:2-12-14**. Child records: **OAC 5180:2-12-15**. Emergency response and health procedures: **OAC 5180:2-12-16**. Diapering/toileting: **OAC 5180:2-12-23**. OAC 5180:2-12-25 is cited **only** for medication administration.
4. **Emergency transportation** — wording equivalent to the DCY 01234 authorization with permission/refusal options (neither preselected); a refusal requires alternative instructions; both the form and the Ohio PDF state that a refusal does not override the center’s independent legal duty to call emergency services. Authorization and signature are in the Ohio PDF only.
5. **Photography and media** — two separate choices, neither preselected; refusing never blocks submission and marketing consent never affects eligibility. Printed only in the Heart to Heart PDF with the exact wording version and the language the parent viewed it in.
6. **Contact and validation corrections.** A valid cell/home phone is required when phone is the chosen contact method; an email may be given whatever the preferred method, and the parent welcome email is sent whenever any valid email was provided (checked server-side too). At least one emergency contact must be an adult (18+) who can take responsibility and is **not** a parent/guardian on the application (enforced in the browser and on the server). Emergency-contact release permission and the authorized-pickup list are separate questions. Residential pickup options were removed. Medicine **and medical foods** (with care instructions) are captured explicitly. Immunization answers distinguish record status, school-age child, **medical exemption** and **conscience exemption**.
7. **Second parent signature** may be completed later and prints as PENDING; it is never auto-marked signed and never blocks single-parent families.
8. **One generic acknowledgment for tour and information requests**, translated into English, Spanish, French, Arabic and Swahili (`generic-ack.ts` in both `website-inquiry` and `tour-request-mailer`). Routing is unchanged; there is no separate substantive tour/information text any more. The Register welcome email is separate and unchanged in role.
9. **Unencrypted PDFs** (accepted risk, item 13 below), **field trips** (no blanket authorization), **delivery tracking**, and the **two-document structure** are as specified in the 1.2.1 assignment.

## B. Still pending — marked “pending” in the form and PDFs; they do not block the release
1. **Parent/Provider Contract and any fee terms.** The final contract is still to be supplied. The form says it will be provided for review and signature and that submitting commits the family to no fee. No application fee. It remains the last agreement online and the last substantive section of the Heart to Heart PDF (not in the Ohio PDF).
2. **Parent Handbook, community-resources list and the three transition documents.** Families may answer “not yet received”; receipt is never recorded falsely and the PDFs list them as outstanding. When approved files are ready, add their HTTPS links to `enrollment/document-links.json` (keys `ag.handbook`, `ag.resCommunity`, `ag.transIn`, `ag.transWithin`, `ag.transOut`), rebuild and deploy — the form then shows an “Open the document” link. No code change is needed.
3. **Routine school transportation.** The form now treats this as a **request** between the child’s school and the center only (to school / from school / both), subject to the Director’s confirmation of route availability, and the Heart to Heart PDF says so. **Please confirm exactly which services the center offers** (the marketing e-mail promises school pickup within 10 miles) so the wording can be tightened.
4. **Native-speaker / professional review** of all Spanish, French, Arabic and Swahili text (consents, emergency transportation, absent-days policy, diapering text, validation messages and the generic acknowledgment). First-draft translations preserve the English meaning but have not been reviewed by native speakers or counsel.
5. **Licensing-specialist review of the Ohio PDF layout** against the current DCY 01234 (Rev. 7/2026) and the program’s SUTQ expectations. The Ohio PDF is a content-equivalent record, not a claim to satisfy every state or SUTQ request.
6. **Media-consent legal wording** and **“Parent 2 may sign later”** acceptability for licensing.

## C. Operations
- Every application is saved first; PDF generation, the staff email and the parent welcome each have their own status and are retried automatically. A scheduled sweep (pg_cron, every 10 minutes) calls the function’s `/sweep` endpoint with the public anon key (read from Vault at run time) and polls delivery status. An authorized admin endpoint (`x-admin-secret`, never public) can force a retry or download a decrypted PDF.
- States are tracked separately: PDF generated · email accepted by Resend · delivery as reported by Resend (`last_event`). “Delivered” means the receiving server accepted the message; it does not prove a person opened it. If the Resend key cannot read events the state is recorded as **unverifiable**, never as delivered. The TO and BCC recipients share one Resend message and one status; confirming each mailbox needs the mailbox owners.
- The staff email body, subject and attachment filenames contain no names, dates of birth, addresses, phone numbers, health or custody data — only the reference, submission time, status and review instructions. Everything is in the two attached PDFs. Recipients are fixed on the server.
- Required Netlify **build** variable: `H2H_PUBLIC_ANON_KEY` (the project’s public anon key). See `.env.example` for all variables; never commit values.

## D. Staff documents families may still owe (tracked in each PDF)
Immunization record or exemption paperwork · health-care plan (DCY 01236) when an allergy action plan, chronic condition, medicine/medical food at the center or modified meals apply · special-diet medical statement · medicine authorization · any court order or custody paperwork referenced · Parent Handbook receipt · community-resources, transition-into / within / out-of-care acknowledgments · second-parent signature · the Parent/Provider Contract.

## E. Residual risk accepted by management — unencrypted PDFs
Neither PDF has a password, encryption or copy/print restriction, because the State does not accept encrypted PDFs. Data is encrypted in transit (HTTPS), in the database (application-level AES-256-GCM on top of Supabase encryption) and in private storage; the PDFs exist unencrypted only in the Director’s and backup mailboxes and wherever staff save them. Anyone with access to those mailboxes can read them. Keep mailbox access restricted, use multi-factor sign-in, and delete local copies when no longer needed.

## F. Not changed
Field trips: no blanket authorization and no new system; trip-specific permission stays a separate document. Netlify Forms stays off. The three workflows — Register, Tour, Information — stay independent.

---

# Version 1.3.0 — Enrollment completion: decisions and open items (11/25/2026)

## G. Approved by management on 11/25/2026 and implemented
1. **Parent/Provider Contract placement** — the contract is its own step and the last page of the application, immediately before Review and Sign; it is also the last agreement section of the Heart to Heart PDF.
2. **Attendance definitions** (from the paper Absent Days letter, as approved): full-time child ≥ 25 hours/week, part-time child ≥ 10 hours/week; children are signed in and out each day through a valid attendance method. "Swipe card" wording removed.
3. **School transportation authorization** is valid for one academic school year.
4. **Online form supersedes the paper packet** where they differ; physical examination forms are an optional upload.

## H. Source documents reviewed
* Paper Parent/Provider Contract and the 16-page enrollment packet (supplied 11/25/2026; not committed to the public repository because they contain private-pay rates).
* Approved Absent Days and Attendance Policy (11/24/2026); Withdrawal and Termination Policy H2H-07 v1.1 (effective 12/1/2026); Translated Agreements Approval H2H-08 v1.1.
* Ohio rules checked 11/25/2026: OAC 5180:6-1-05 (eff. 8/1/2026), 5180:6-1-09 (eff. 8/1/2026), 5180:6-1-10 (eff. 11/2/2025), 5180:2-12-15 (eff. 7/1/2026).

Paper-contract terms **not** carried online, and why:
| Paper term | Treatment |
|---|---|
| $60 registration fee + half a month's tuition/voucher, non-refundable | Not online. PFCC families pay no registration fee (site FAQ) and may not be asked for the difference between the State's registration payment and the center's fee (OAC 5180:6-1-10(M)(3)). Private-pay pricing is out of scope. |
| Daily/weekly private-pay rates, summer camp fees | Not published (out of scope). |
| Monthly billing, "tuition applies regardless of attendance", due 1st/15th incl. voucher co-pays | Replaced for PFCC by weekly copays with a mutually agreed due date (OAC 5180:6-1-05(J)), no copay for weeks with only absent/PD days (5180:6-1-09(H)(4)). Private-pay schedule pending. |
| Late-payment fees ($20 / $40 / suspension at 6 business days / $10–$20 weekly) | "Late payment fees" section pending. PFCC delinquency follows 5180:6-1-09(H) and the approved W&T policy (no automatic conversion to private pay). |
| Late pickup $10 for up to 10 minutes, then $2/minute | Loaded in `LATE_PICKUP` but inactive (see I.1). |
| $40 returned check; check/money order/cashier's check/cash; "all fees non-refundable" | "Other fees and payment methods" pending. Note the approved W&T policy requires a final statement within 10 business days and refunds of undisputed credits within 14 days. |
| Withdrawal/termination "with or without notice" | Superseded by the approved W&T policy (14-day notice where practicable, review within 5 business days). |
| Parent pays court costs and attorney fees | Not online — legal review recommended. |
| Old Absent Days letter: 10 days per six months; absences beyond that charged as tuition | Superseded by the approved Attendance Policy (20 reimbursable days per six-month period). |

## I. Decisions still needed (the system is built for each; nothing is enforced until decided)
1. **Late pickup** (`enrollment/agreements.mjs` → `LATE_PICKUP`): confirm the amounts for online use; define the **pickup deadline** (closing time 6:00 PM or the child's scheduled pick-up time), **grace period**, **maximum charge (cap)**, **payment deadline**, **exceptions** (emergencies, weather, school delays), and whether the charge **applies to PFCC families** (permitted only with a signed fee agreement, OAC 5180:6-1-10(M)(1)).
2. **Late payment fees** for private pay and whether any applies to past-due PFCC copays.
3. **Private-pay tuition and payment schedule** (rates, billing cycle, deadlines) — out of scope for this release.
4. **Other fees and payment methods** (returned check fee, accepted methods, refunds consistent with the W&T policy) and the **attorney-fee clause** (legal review).
5. **Online wording for "Enrollment arrangements" and "Parent and provider responsibilities"** (the paper "Signature to Agreement" paragraph references the Parent Handbook, which is not yet issued).
6. **Authorized staff for document access**: names, roles, and whether two-step sign-in (MFA) is required (`H2H_STAFF_REQUIRE_MFA`). The allowlist is empty until then.
7. **Document retention periods** by category (immunization, insurance images, custody/court, PFCC notices, other) and for enrollment PDFs; the Website Privacy Policy still refers to a "written retention schedule" — confirm one exists or adjust that sentence before publication.
8. **Parent acknowledgment of confirmed financial terms**: staff can record confirmed copay/due day as a new revision; choose how the family acknowledges it (paper signature now, or an online acknowledgment step in a later release).
9. **Native-speaker review** of all new Spanish, French, Arabic and Swahili text, and extension of the Translated Agreements Approval to the 1.3.0 wording.
10. **When to publish** the 1.3.0 website (then run Phase B of the activation checklist).

// Single source of truth for the agreements presented in form 1.3.0-E2: versions, effective dates and the status of every
// Parent/Provider Contract section. Wording lives in enrollment/i18n/*.mjs (key `ct`); this file decides what is final,
// what is pending and what is switched on. Changing a status or a term here is a management decision: record it in
// docs/MANAGEMENT_DECISIONS.md and bump CONTRACT.version, so the signed evidence of earlier applications never changes meaning.
//
// Section status:
//   'final'   — in effect for families who sign this version. Only used where the content is (a) a management-approved policy,
//               (b) a requirement of current Ohio rules restated without discretion, or (c) the already approved e-signature method.
//   'pending' — NOT in effect. The family sees the section title and a clear "not in effect, will be provided for review and
//               signature" notice; no draft wording, amount or deadline is shown or agreed.

export const FORM_VERSION = '1.3.0-E2';
export const MEDIA_CONSENT_VERSION = 'MEDIA-R1';

export const POLICIES = {
  attendance: { id: 'attendance', title: 'Absent Days and Attendance Policy', revision: 'approved 2026-11-24', effectiveDate: '2026-11-24', approvedBy: 'Management, 11/24/2026' },
  // The approved Withdrawal and Termination Policy is published in the Parent Portal (enrollment/document-links.json, id withdrawal-and-termination).
  withdrawal: { id: 'withdrawal-and-termination', title: 'Withdrawal and Termination Policy', revision: 'v1.1', effectiveDate: '2026-12-01', approvedBy: 'Management (published in the Parent Portal)' },
  handbook: { id: 'parent-handbook', title: 'Parent Handbook', revision: null, effectiveDate: null, status: 'coming-soon' },
};

export const CONTRACT = {
  id: 'parent-provider-contract',
  version: 'PPC-2026.11-R2',   // online contract revision presented with form 1.3.0-E2 (R2: management activation of 11/25/2026)
  basis: 'Heart to Heart paper Parent/Provider Contract (supplied 11/25/2026), approved policies, and current Ohio PFCC rules',
  // Order = order shown to the family and printed in the Heart to Heart PDF. The contract is the LAST step of the application.
  sections: [
    { id: 'parties', status: 'final' },            // enrollment arrangements (paper: "Registration" and "Signature to Agreement"), no PFCC advance payment/fees
    { id: 'responsibilities', status: 'final' },   // parent and provider responsibilities (paper: "Signature to Agreement")
    { id: 'attendance', status: 'final', policy: 'attendance' },
    { id: 'pfcc', status: 'final', law: ['OAC 5180:6-1-05', 'OAC 5180:6-1-09', 'OAC 5180:6-1-10'] },
    { id: 'copayDelinquency', status: 'final', law: ['OAC 5180:6-1-05(K)', 'OAC 5180:6-1-09(H)'] },
    { id: 'payment', status: 'pending' },          // private-pay tuition: DEFERRED by management (no rate, schedule or deadline is published or agreed)
    { id: 'lateFees', status: 'final' },           // no late-payment fee for PFCC care (management 11/25/2026); private-pay late fees wait for private-pay tuition
    { id: 'latePickup', status: 'final', config: 'latePickup' },
    { id: 'otherFees', status: 'final' },          // only the late pickup charge is authorized; accepted forms of payment from the paper contract
    { id: 'withdrawal', status: 'final', policy: 'withdrawal' },
    { id: 'esign', status: 'final' },
    { id: 'admin', status: 'final' },
  ],
};

// Late pickup: ACTIVE (management 11/25/2026). The schedule is the paper Parent/Provider Contract, item 6: "$10.00 for up to 10 minutes,
// and $2.00 per minute thereafter". Management confirmed that the charge starts after center closing. The paper contract does NOT define a grace period, a payment deadline, a cap
// or exceptions; none is invented here (docs/MANAGEMENT_DECISIONS.md lists them for confirmation). It applies to PFCC families too:
// OAC 5180:6-1-10(M)(1) permits a late fee for a PFCC family only under a signed agreement, which the dedicated acknowledgment is.
export const LATE_PICKUP = {
  active: true,
  source: 'Paper Parent/Provider Contract, item 6; management 11/25/2026',
  paperTerms: { firstBlockMinutes: 10, firstBlockCents: 1000, perMinuteAfterCents: 200 },
  pickupDeadline: "center_closing_time", closingTime: "18:00", graceMinutes: null, capCents: null, paymentDeadline: null, exceptions: null, // not defined on paper: none applied
  appliesToPfcc: true,
};
// Fee for a pickup `minutes` whole minutes late (0 = on time). Used by tests to verify the printed schedule and examples.
export const latePickupFeeCents = (minutes, t = LATE_PICKUP.paperTerms) => minutes <= 0 ? 0 : t.firstBlockCents + Math.max(0, minutes - t.firstBlockMinutes) * t.perMinuteAfterCents;

// Financial information (optional step after the contract; management 11/25/2026): the family MAY enter a credit or debit card
// (name, number, expiry, billing address/ZIP, explicit consent to retain). NEVER a CVV, PIN or magnetic-stripe data. This release does
// NOT process payments, authorize or verify cards, charge anything, or bill repeatedly. Live collection is OFF (feature flag
// `financial_card_collection`) until the payment-card security checklist in docs/RELEASE_1_3_0_ENROLLMENT_COMPLETION.md is verified.
export const PAYMENT_FOLLOW_UP_DAYS = 30; // "within 30 days of enrollment"
export const FINANCIAL = { followUpDays: PAYMENT_FOLLOW_UP_DAYS, collectsCvv: false, processesPayments: false, chargesAuthorized: false, flag: 'financial_card_collection' };

// Private-pay pricing is out of scope for this release: no rate is published or agreed online.
export const PRIVATE_PAY = { active: false };

// Server-side switches mirrored into schema.cfg so the same conditions run in the browser and on the server.
export const CFG = { latePickup: LATE_PICKUP.active, privatePay: PRIVATE_PAY.active };

export const contractStatus = () => (CONTRACT.sections.every(s => s.status === 'final') ? 'final' : 'partial');
export const pendingSections = () => CONTRACT.sections.filter(s => s.status !== 'final').map(s => s.id);

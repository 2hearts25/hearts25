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

export const POLICIES = {
  attendance: { id: 'attendance', title: 'Absent Days and Attendance Policy', revision: 'approved 2026-11-24', effectiveDate: '2026-11-24', approvedBy: 'Management, 11/24/2026' },
  // The approved Withdrawal and Termination Policy is published in the Parent Portal (enrollment/document-links.json, id withdrawal-and-termination).
  withdrawal: { id: 'withdrawal-and-termination', title: 'Withdrawal and Termination Policy', revision: 'v1.1', effectiveDate: '2026-12-01', approvedBy: 'Management (published in the Parent Portal)' },
  handbook: { id: 'parent-handbook', title: 'Parent Handbook', revision: null, effectiveDate: null, status: 'coming-soon' },
};

export const CONTRACT = {
  id: 'parent-provider-contract',
  version: 'PPC-2026.11-R1',   // online contract revision presented with form 1.3.0-E2
  basis: 'Heart to Heart paper Parent/Provider Contract (supplied 11/25/2026), approved policies, and current Ohio PFCC rules',
  // Order = order shown to the family and printed in the Heart to Heart PDF. The contract is the LAST step of the application.
  sections: [
    { id: 'parties', status: 'pending' },          // enrollment arrangements, scope (paper: "Signature to Agreement") — online wording awaits approval
    { id: 'responsibilities', status: 'pending' }, // parent and provider responsibilities — online wording awaits approval
    { id: 'attendance', status: 'final', policy: 'attendance' },
    { id: 'pfcc', status: 'final', law: ['OAC 5180:6-1-05', 'OAC 5180:6-1-09', 'OAC 5180:6-1-10'] },
    { id: 'copayDelinquency', status: 'final', law: ['OAC 5180:6-1-05(K)', 'OAC 5180:6-1-09(H)'] },
    { id: 'payment', status: 'pending' },          // private-pay tuition, payment deadlines (rates out of scope for this release)
    { id: 'lateFees', status: 'pending' },         // late-payment fees (paper: $20 / $40 / suspension / weekly balance fee)
    { id: 'latePickup', status: 'pending', config: 'latePickup' },
    { id: 'otherFees', status: 'pending' },        // returned-check fee, payment methods, non-refundability, attorney-fee clause
    { id: 'withdrawal', status: 'final', policy: 'withdrawal' },
    { id: 'esign', status: 'final' },
    { id: 'admin', status: 'final' },
  ],
};

// Late pickup: the amounts below are transcribed from the paper contract (item 6) so the structure is ready, but they are NOT
// active, NOT shown to families and NOT charged. To activate: management approves every null field below for online use AND
// decides whether the charge applies to PFCC families (OAC 5180:6-1-10(M)(1) permits late fees for PFCC families only with a
// signed agreement). Then set active: true, set the contract section status to 'final', bump CONTRACT.version, rebuild.
export const LATE_PICKUP = {
  active: false,
  source: 'Paper Parent/Provider Contract, item 6',
  paperTerms: { firstBlockMinutes: 10, firstBlockCents: 1000, perMinuteAfterCents: 200 },
  pickupDeadline: null,     // e.g. closing time (6:00 PM) or the child's scheduled pick-up time — NOT DEFINED on paper
  graceMinutes: null,       // NOT DEFINED on paper
  capCents: null,           // NOT DEFINED on paper
  paymentDeadline: null,    // NOT DEFINED on paper
  exceptions: null,         // e.g. emergencies, weather — NOT DEFINED on paper
  appliesToPfcc: null,      // management decision required
};

// Private-pay pricing is out of scope for this release: no rate is published or agreed online.
export const PRIVATE_PAY = { active: false };

// Server-side switches mirrored into schema.cfg so the same conditions run in the browser and on the server.
export const CFG = { latePickup: LATE_PICKUP.active, privatePay: PRIVATE_PAY.active };

export const contractStatus = () => (CONTRACT.sections.every(s => s.status === 'final') ? 'final' : 'partial');
export const pendingSections = () => CONTRACT.sections.filter(s => s.status !== 'final').map(s => s.id);

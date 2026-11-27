// Document classification for Version 1.2.1: which printed document each stored answer belongs to.
// One application → two PDFs. A field marked "both" is printed in both documents from the same stored answer.
// Classification follows regulatory purpose, not who authored the question (see docs/MANAGEMENT_DECISIONS.md).
export const OHIO = 'ohio', H2H = 'h2h';
const O = [OHIO], H = [H2H], B = [OHIO, H2H];

const exact = {
  // child — identification and first day are relevant to both documents
  'c.first': B, 'c.last': B, 'c.dob': B, 'c.addr': B, 'c.city': B, 'c.state': B, 'c.zip': B, 'c.phone': B, 'c.start': B,
  // requested program, schedule, payment and routine school transportation are centre-specific
  'c.nick': H, 'c.program': H, 'c.days': H, 'c.from': H, 'c.to': H, 'c.schedule': H, 'c.payment': H,
  'c.schoolTransport': H, 'c.school': H, 'c.grade': H, 'c.commLang': H, 'c.commLangOther': H,
  // parents: identity + best contact appear in both; everything else is the state form's parent block
  'p1.name': B, 'p1.rel': B, 'p1.cell': B, 'p1.email': B, 'p1.contactPath': B, 'p2.has': B,
  // health items that drive daily care are printed in both; the rest of the health record is the state document's
  'h.allergy': B, 'h.allergyTypes': B, 'h.allergyDesc': B, 'h.allergyAction': B,
  'h.chronic': B, 'h.chronicNeeds': B, 'h.chronicDesc': B, 'h.procedureDesc': B,
  'h.meds': B, 'h.medsDesc': B, 'h.medsAtCare': B,
  'h.diet': B, 'h.dietDesc': B, 'h.dietModified': B, 'h.avoid': B, 'h.accom': B,
  'h.devDelay': B, 'h.devDesc': B, 'h.services': B, 'h.serviceProv': B,
  // development / routines: the state form asks for this once; the centre keeps it with the personality questionnaire
  'pe.devInfo': B, 'pe.fears': B, 'pe.fearReaction': B, 'pe.comfort': B,
  'pe.angerTriggers': B, 'pe.frustration': B, 'pe.negBehavior': B, 'pe.more': B, 'pe.routines': B, 'po.care': B, 'fe.noFeed': B,
  // handbook receipt: the state form asks for receipt; the centre also keeps the detailed acknowledgment
  'ag.handbook': B,
  // COMMS-1.0 communication authorizations belong to the Heart to Heart record ONLY; the state-required Ohio form is unchanged.
  'p1.authTel': H, 'p1.authEmail': H,
  // 1.3.0: supporting health documents are state-record items, so their upload status prints in both documents (never the files).
  'up.immun': B, 'up.physical': B, 'up.hcp': B, 'up.med': B, 'up.diet': B, 'd.separate': B,
};
const prefix = [ // first match wins; p2.* is classified like p1.*
  ['p1.', O], ['ec', O], ['h.', O], ['d.', O], ['et.', O], ['tp.', O],
  // 1.3.0: insurance (kept OUT of the Ohio PDF), other uploads, PFCC copayment agreement, late pickup
  ['ins.', H], ['nl.', H], ['up.', H], ['pf.', H], ['lp.', H], ['fin.', H],
  ['pu', H], ['f.', H], ['pe.', H], ['fe.', B], ['sl.', B], ['po.', H], ['st.', H], ['m.', H], ['ag.', H],
];
export const docsOf = id => {
  const k = id.replace(/^p2\./, 'p1.');
  if (exact[k]) return exact[k];
  for (const [p, d] of prefix) if (k === p || k.startsWith(p.endsWith('.') ? p : p + '.') || (p === 'pu' && k.startsWith('pu'))) return d;
  throw new Error('unclassified field: ' + id);
};
export const ackDocs = {
  accuracy: B, esign: B,                       // statements the signer makes about the whole application
  emtrans: O, topical: O, conscience: O,                    // state-form items
  pickup: H, school: H, media: H, receipts: H, pending: H,  // centre agreements (pending names the center contract and documents, so it prints only in the center PDF)
};
export const inDoc = (id, doc) => docsOf(id).includes(doc);

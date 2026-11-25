// PDF 2 — Heart to Heart Enrichment Center internal enrollment records: center-specific questionnaire, authorizations and agreements.
// The Parent/Provider Contract is the final agreement section. Some of these records may also be requested during licensing or
// Step Up To Quality reviews, so they are retained and available to authorized staff.
import { createKit } from './pdf-kit.mjs';
import { visibleAcks } from './core.mjs';
import { ackDocs, H2H } from './doc-map.mjs';

export const H2H_TITLE = 'Heart to Heart Enrichment Center — Internal Enrollment Records';
export const h2hFilename = id => `H2H_${id}_Heart_to_Heart.pdf`;
export const CONTRACT_STATUS = 'DRAFT — pending management approval. No fee, tuition, deposit, late-fee or termination terms are in effect; the final Parent/Provider Contract will be provided for review and signature.';
export const ABSENCE_STATUS = 'APPROVED by management on 11/24/2026 — Absent Days and Attendance Policy as shown below (shown to the parent in full on the form, above the acknowledgment).';

export async function buildH2hPdf({ lib, fonts, schema, en, data, meta }) {
  const k = await createKit({ lib, fonts, schema, en, data, meta, doc: H2H, title: H2H_TITLE, short: 'Heart to Heart — Internal Enrollment Records', subtitle: 'Internal enrollment records' });
  const d = k.data;
  const pend = (id, v) => v === 'pending';
  k.newPage();
  k.bigTitle(H2H_TITLE, 'Center-specific application information, authorizations and agreements, prepared from the parent’s online application. Companion to the Ohio enrollment records with the same application ID.');
  k.banner('CONFIDENTIAL — internal center record. Retained for internal administration and, where applicable, licensing inspections and Step Up To Quality reviews.');
  k.para(`Companion document: H2H_${meta.applicationId}_Ohio_Enrollment.pdf. Items shown as PENDING are documents or approvals still outstanding.`, { size: 8.5, color: [0.36, 0.4, 0.48] });

  k.section(1, 'Child and parent identification');
  k.printFields({ ids: ['c.first', 'c.last', 'c.nick', 'c.dob', 'c.addr', 'c.city', 'c.state', 'c.zip', 'c.phone'] });
  k.sub('Parent / guardian 1'); k.printFields({ ids: ['p1.name', 'p1.rel', 'p1.cell', 'p1.email', 'p1.contactPath'] });
  k.sub('Parent / guardian 2'); if (d['p2.has'] === 'yes') k.printFields({ ids: ['p2.name', 'p2.rel', 'p2.cell', 'p2.email', 'p2.contactPath'] }); else k.kv('Second parent/guardian', 'None listed');
  k.printed.add('p2.has');
  k.section(2, 'Requested program and attendance schedule');
  k.printFields({ ids: ['c.program', 'c.start', 'c.days', 'c.from', 'c.to', 'c.schedule'] });
  k.section(3, 'PFCC or private-pay arrangement');
  k.printFields({ ids: ['c.payment'] });
  k.para('Payment arrangements are confirmed by management. No fee, tuition rate or deposit is stated or agreed in this application.', { size: 8.5, color: [0.36, 0.4, 0.48] });
  k.section(4, 'Family information questionnaire (JFS 01511)');
  k.printFields({ ids: ['f.immediate', 'f.homeLang', 'f.cultural', 'f.pets', 'f.prevCare', 'f.prevCareDesc'] });
  k.section(5, 'Household and family arrangements');
  k.printFields({ ids: ['f.household', 'f.arrangements', 'f.changes'] });
  k.section(6, 'Primary language and communication preferences');
  k.printFields({ ids: ['c.commLang', 'c.commLangOther'] });
  k.section(7, 'Child personality and behavior');
  k.printFields({ ids: ['pe.traits', 'pe.traitsOther', 'pe.more', 'pe.fears', 'pe.comfort', 'pe.frustration', 'pe.negBehavior', 'pe.anxious', 'pe.excited', 'pe.expect', 'pe.helpful'] });
  k.section(8, 'Developmental information');
  k.printFields({ ids: ['pe.devInfo', 'pe.routines', 'h.devDelay', 'h.devDesc'] });
  k.section(9, 'Individual care requirements');
  k.printFields({ ids: ['h.allergy', 'h.allergyTypes', 'h.allergyDesc', 'h.allergyAction', 'h.chronic', 'h.chronicNeeds', 'h.chronicDesc', 'h.procedureDesc', 'h.meds', 'h.medsDesc', 'h.medsAtCare', 'h.diet', 'h.dietDesc', 'h.dietModified', 'h.avoid', 'h.accom', 'h.services', 'h.serviceProv'] });
  k.para('The state-required health record, health care plan status and immunization status are in the Ohio enrollment records.', { size: 8.5, color: [0.36, 0.4, 0.48] });
  k.section(10, 'Feeding preferences');
  k.printFields({ ids: ['fe.drinks', 'fe.amount', 'fe.fav', 'fe.dislike', 'fe.noFeed', 'fe.seat'] });
  k.section(11, 'Sleeping routines');
  k.printFields({ prefix: 'sl.' });
  k.section(12, 'Potty training and diapering');
  k.printFields({ prefix: 'po.' });
  k.para('Heart to Heart provides individualized diapering and toilet training support based on each child’s developmental needs. Diapers are checked regularly and changed immediately when wet or soiled (diapering and toilet training requirements: OAC 5180:2-12-23). No fixed changing interval is selected in this application.', { size: 8.5, color: [0.36, 0.4, 0.48] });
  k.section(13, 'Authorized pickup list');
  k.printFields({ ids: ['pu.has', 'pu', 'pu.idAck', 'pu.restrict', 'pu.restrictText'] });
  k.section(14, 'Routine school transportation authorization');
  k.printFields({ ids: ['c.schoolTransport', 'c.school', 'c.grade'] }); k.printFields({ prefix: 'st.' });
  if (d['c.schoolTransport'] !== 'yes') k.para('Routine school transportation was not requested.', { size: 9 });
  k.para('This is a REQUEST for transportation between the child’s school and the center only. The Director confirms whether it is available for the school and route; the application does not guarantee it. Routine transportation and field trip safety: OAC 5180:2-12-14.', { size: 8.5, color: [0.36, 0.4, 0.48] });
  k.para('Field trips are not covered by this application. Trip-specific permission is completed separately when a trip is scheduled.', { size: 8.5, color: [0.36, 0.4, 0.48] });
  k.section(15, 'Parent handbook acknowledgment');
  k.printFields({ ids: ['ag.handbook'], pendingIf: pend });
  k.section(16, 'Resources and community services acknowledgment');
  k.printFields({ ids: ['ag.resCommunity'], pendingIf: pend });
  k.section(17, 'Transitioning into the center');
  k.printFields({ ids: ['ag.transIn'], pendingIf: pend });
  k.section(18, 'Transitioning within the center');
  k.printFields({ ids: ['ag.transWithin'], pendingIf: pend });
  k.section(19, 'Transitioning out of the center');
  k.printFields({ ids: ['ag.transOut'], pendingIf: pend });
  k.section(20, 'Internal photography consent');
  k.printFields({ ids: ['m.internal'] });
  k.kv('Consent wording', `Exact wording shown above (English). Signed with online form ${meta.formVersion}; the parent viewed it in ${meta.languageName || meta.language}.`);
  k.section(21, 'External marketing and photography consent');
  k.printFields({ ids: ['m.marketing'] });
  k.para('Marketing consent is optional and is never a condition of enrollment.', { size: 8.5, color: [0.36, 0.4, 0.48] });

  k.section(22, 'Outstanding internal documentation');
  const items = [['ag.handbook', 'Parent Handbook'], ['ag.resCommunity', 'Community resources list'], ['ag.transIn', 'Transition into care information'], ['ag.transWithin', 'Transition within the center information'], ['ag.transOut', 'Transition out of care information']];
  let n = 0; for (const [id, name] of items) if (d[id] === 'pending') { k.tick(`${name} — PENDING (parent asked that it be provided)`, false); n++; }
  k.tick('Parent/Provider Contract — PENDING management approval; to be provided for review and signature', false);
  if (!n) k.para('All listed center documents were marked received by the parent.', { size: 9 });

  k.section(23, 'Absent Days and Attendance Policy');
  k.kv('Policy status', ABSENCE_STATUS);
  for (const key of ['absP1', 'absP2']) k.para(en.ui[key], { size: 9.5 });
  k.sub(en.ui.absH1); for (const key of ['absP3', 'absP4', 'absP5']) k.para(en.ui[key], { size: 9.5 });
  k.sub(en.ui.absH2); for (const key of ['absP6', 'absP7']) k.para(en.ui[key], { size: 9.5 });
  k.printFields({ ids: ['ag.absenceAck'] });
  k.para('Parent/guardian signature and date: see the electronic signatures at the end of this document.', { size: 8.5, color: [0.36, 0.4, 0.48] });

  k.section(24, 'Parent/Provider Contract');
  k.printFields({ ids: ['ag.contractAck'] });
  k.kv('Contract status', meta.contractStatus || CONTRACT_STATUS, { pending: true });

  const acked = new Set(meta.acks || []);
  k.section(null, 'Signing acknowledgments, electronic signatures and administrator fields');
  for (const a of visibleAcks(d, schema)) if (ackDocs[a.id].includes(H2H)) k.tick(en.acks[a.id], acked.has(a.id));
  await k.signatures();
  k.signLine('Administrator / designee signature (Heart to Heart)', 'Date');
  k.para('Electronic signature agreement: each signer agreed that a typed name or a drawn signature is their legal electronic signature with the same effect as a handwritten signature. Application data was transmitted over HTTPS and is stored encrypted.', { size: 8.5, color: [0.36, 0.4, 0.48] });
  return k.finish();
}

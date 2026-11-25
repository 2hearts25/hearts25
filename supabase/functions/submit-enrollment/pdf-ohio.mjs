// PDF 1 — Ohio Child Enrollment and Health Records: a content-equivalent of ODCY DCY 01234 (Rev. 7/2026) built from the parent's
// online application. Contains state-required enrollment and health information only (see doc-map.mjs). Not represented as
// satisfying every possible Ohio licensing or SUTQ document request.
import { createKit, fmtDate } from './pdf-kit.mjs';
import { stepShown, fieldShown, visibleAcks } from './core.mjs';
import { ackDocs, OHIO } from './doc-map.mjs';

export const OHIO_TITLE = 'Ohio Child Enrollment and Health Records';
export const ohioFilename = id => `H2H_${id}_Ohio_Enrollment.pdf`;

export async function buildOhioPdf({ lib, fonts, schema, en, data, meta }) {
  const k = await createKit({ lib, fonts, schema, en, data, meta, doc: OHIO, title: OHIO_TITLE, short: OHIO_TITLE,
    subtitle: 'Content-equivalent of Ohio DCY 01234 Child Enrollment Form (Rev. 7/2026)' });
  const d = k.data;
  k.newPage();
  k.bigTitle(OHIO_TITLE, 'Content-equivalent of the Ohio Department of Children and Youth form DCY 01234, “Child Enrollment Form for Early Care and Education Programs” (Rev. 7/2026), prepared from the parent’s online application (OAC 5180:2-12-15).');
  k.banner('CONFIDENTIAL — child records. Available only to authorized program staff and to the Ohio Department of Children and Youth / county agency as required.');
  k.para('How to read this document: answers marked as parent responses were entered and e-signed by the parent/guardian. Items shown as PENDING are documentation or approvals that are still outstanding (health-care-provider documents, immunization record, handbook receipt, administrator review). Recording a status here does not mean a record has been received or a plan completed.', { size: 8.5, color: [0.36, 0.4, 0.48] });

  k.section(1, 'Application record');
  k.kv('Application ID', meta.applicationId); k.kv('Submitted', `${meta.submittedAtEastern}  (${meta.submittedAt})`);
  k.kv('Companion document', `H2H_${meta.applicationId}_Heart_to_Heart.pdf (center records, same application ID)`);
  k.kv('Form language used by parent', meta.languageName || meta.language); k.kv('Online form version', meta.formVersion); k.kv('Document format release', '1.2.1 (two-document set)');

  k.section(2, 'Child information');
  k.printFields({ ids: ['c.first', 'c.last', 'c.dob', 'c.start', 'c.addr', 'c.city', 'c.state', 'c.zip', 'c.phone'] });

  k.section(3, 'Parent / guardian #1');
  k.printFields({ prefix: 'p1.' });
  k.section(4, 'Parent / guardian #2');
  if (d['p2.has'] === 'yes') k.printFields({ prefix: 'p2.', skip: ['p2.has'] }); else k.kv('Second parent/guardian', 'Not applicable (box checked: none)');
  k.printed.add('p2.has');

  k.section(5, 'Emergency contacts');
  k.para('Emergency contact #1 is required and cannot be a parent/guardian. Contact #2 is optional. “Released to this contact” records the parent’s answer to: My child may be released to this emergency contact.', { size: 8.5, color: [0.36, 0.4, 0.48] });
  k.printFields({ ids: ['ec'] });

  k.section(6, 'Health care provider');
  k.printFields({ ids: ['h.provNone', 'h.provName', 'h.provAddr', 'h.provCity', 'h.provState', 'h.provPhone'] });
  k.section(7, 'Allergies, medical and chronic health conditions');
  k.printFields({ ids: ['h.allergy', 'h.allergyTypes', 'h.allergyDesc', 'h.allergyAction', 'h.chronic', 'h.chronicNeeds', 'h.chronicDesc', 'h.procedureDesc', 'h.history'] });
  const hcp = d['h.allergyAction'] === 'yes' || d['h.chronic'] === 'yes' || (d['h.meds'] === 'yes' && d['h.medsAtCare'] === 'yes');
  k.kv('Health care plan required?', hcp ? 'Yes — a DCY 01236 Health Care Plan (or equivalent, or physician/PA/APRN documentation) is required before care of this condition (OAC 5180:2-12-15).' : 'Not indicated by the parent’s answers.', { pending: hcp });
  k.section(8, 'Medication and medical food');
  k.para('Includes prescription and non-prescription medicine and any medical food the child takes or that staff would give. Care instructions are part of the description.', { size: 8.5, color: [0.36, 0.4, 0.48] });
  k.printFields({ ids: ['h.meds', 'h.medsDesc', 'h.medsAtCare'] });
  k.section(9, 'Dietary restrictions and other health information');
  k.printFields({ ids: ['h.diet', 'h.dietDesc', 'h.dietModified', 'h.avoid', 'fe.noFeed', 'h.other'] });
  k.para('For medical foods or removal of an entire food group, retain a physician’s written instructions. For religious or cultural special diets, retain the parent’s signed and dated instructions unless the diet is part of the center’s program.');
  k.section(10, 'Development and individual care information');
  k.printFields({ ids: ['h.devDelay', 'h.devDesc', 'pe.devInfo', 'pe.fears', 'pe.fearReaction', 'pe.comfort', 'pe.angerTriggers', 'pe.frustration', 'pe.negBehavior', 'pe.more', 'pe.routines', 'po.care', 'h.accom', 'h.services', 'h.serviceProv', 'fe.drinks', 'fe.amount', 'fe.fav', 'fe.dislike', 'fe.seat'] });
  k.printFields({ prefix: 'sl.' });

  k.section(11, 'Health documentation and immunization status');
  k.para('These lines record what the parent said about each document. They are not the documents themselves.', { size: 8.5, color: [0.36, 0.4, 0.48] });
  const immunLabel = { available: 'Parent has the record and will bring it', pending: 'Parent will bring it later', school: 'Child attends elementary school in kindergarten or above', provider: 'Health provider will send it', medical: 'Parent reports a medical exemption', conscience: 'Parent is requesting an exemption (conscience)' };
  k.printFields({ ids: ['d.immun', 'd.conscienceScope', 'd.conscienceVaccines', 'd.conscienceText', 'd.hcp', 'd.diet', 'd.med'], pendingIf: (id, v) => v === 'pending' || id === 'd.immun' });
  const up = id => Array.isArray(d[id]) && d[id].length > 0;
  if (meta.v130) {
    k.sub('Supporting health documents uploaded with the online application');
    if (!k.printFields({ ids: ['up.immun', 'up.physical', 'up.hcp', 'up.med', 'up.diet', 'd.separate'] })) k.kv('Uploaded health documents', 'None uploaded');
    k.para('Uploaded files are kept as separate confidential records under this application ID and are not embedded in this document. An upload is not a record received or verified by the program until authorized staff review it.', { size: 8.5, color: [0.36, 0.4, 0.48] });
  }
  const outstanding = [];
  if (d['d.immun'] === 'conscience' && d['d.conscienceScope']) outstanding.push('Signed parental conscience declaration recorded in this PDF; administrator review is pending.');
  else if (d['d.immun'] === 'school' && meta.v130) outstanding.push('Verify attendance at elementary school in kindergarten or above before applying the exemption.');
  else if (d['d.immun'] === 'conscience') outstanding.push('Immunization exemption (reasons of conscience) — requested by the parent; the separate exemption paperwork must be completed and is not yet on file');
  else if (d['d.immun'] === 'medical') outstanding.push('Immunization medical exemption — reported by the parent; a qualifying practitioner’s statement is required and has not been received');
  else outstanding.push('Immunization record — not yet received/verified by the program (parent’s answer: ' + (immunLabel[d['d.immun']] || '—') + ')' + (up('up.immun') ? '; a copy was uploaded online and awaits staff review' : ''));
  if (d['d.hcp'] !== undefined) outstanding.push('Health Care Plan (DCY 01236 or equivalent / provider documentation) — ' + (d['d.hcp'] === 'available' ? 'parent reports having it; not yet received/verified' : 'pending'));
  if (d['d.diet'] !== undefined) outstanding.push('Diet instructions — staff must determine whether parent or physician documentation applies — ' + (d['d.diet'] === 'available' ? 'parent reports having it; not yet received/verified' : 'pending'));
  if (d['d.med'] !== undefined) outstanding.push('Written medication permission (DCY 01236 or equivalent, with separate documentation for each medication as applicable) — ' + (d['d.med'] === 'available' ? 'parent reports having it; not yet received/verified' : 'pending'));
  if (meta.v130) outstanding.push('Physical examination / child medical statement — optional for this program (not required by OAC 5180:2-12-15 as effective 7/1/2026); ' + (up('up.physical') ? 'a copy was uploaded online and awaits staff review' : 'not provided online'));
  else outstanding.push('Child health/physical examination form (DCY 01305) and any other medical records required by the licensing rules — maintained separately by the program');

  k.section(12, 'Emergency transportation authorization');
  k.para('The parent chose to give or refuse permission for emergency medical transportation. If permission is refused, the parent’s alternative instructions are recorded below. A refusal does not override the program’s independent legal duty to call emergency services when a child’s life or health is in immediate danger (emergency response and health procedures: OAC 5180:2-12-16).', { size: 8.5, color: [0.36, 0.4, 0.48] });
  k.printFields({ ids: ['et.choice', 'et.denyAction'] });
  k.para('The parent signature below applies to the selected authorization.');

  k.section(13, 'Parent acknowledgement of accuracy and receipt of policies and procedures');
  const acked = new Set(meta.acks || []);
  const handbook = d['ag.handbook'];
  k.printFields({ ids: ['ag.handbook'], pendingIf: (id, v) => v === 'pending' });
  k.kv('Receipt of policies and procedures (Parent Handbook)', handbook === 'received' && acked.has('receipts') ? 'Parent acknowledged receipt at signing.' : 'PENDING — the Parent Handbook has not been provided yet; receipt will be acknowledged when it is.', { pending: !(handbook === 'received' && acked.has('receipts')) });
  for (const a of visibleAcks(d, schema)) if (ackDocs[a.id].includes(OHIO)) k.tick(en.acks[a.id], acked.has(a.id));
  k.para('The parent attests that the information in this application is accurate. The form is to be reviewed with the parent 12 months after this acknowledgement.', { size: 9 });
  await k.signatures({ heading: 'Parent signature' });

  k.section(14, 'Program acknowledgement of completion');
  k.para('The program administrator or designee attests that this form was reviewed for completeness and signed by the parent/guardian. It must be complete before the child receives care.', { size: 9 });
  k.kv('Administrator review status', 'PENDING — awaiting administrator or designee review', { pending: true });
  k.signLine('Program administrator / designee signature', 'Date');

  k.section(15, 'Annual review');
  k.para('Parent/guardian and administrator/designee initial and date at each annual review or update (OAC 5180:2-12-15).', { size: 9 });
  k.annualTable(3);

  k.section(16, 'Outstanding state-required documentation');
  for (const line of outstanding) k.tick(line, false);
  for (const id of ['d.immun', 'd.conscienceScope', 'd.conscienceVaccines', 'd.conscienceText', 'd.hcp', 'd.diet', 'd.med']) if (d[id] !== undefined) k.printed.add(id);
  return k.finish();
}

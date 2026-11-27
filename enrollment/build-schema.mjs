// Source of truth for the child enrollment application (form 1.3.0-E2; 1.2.0-E1 is frozen in supabase/functions/submit-enrollment/v120/).
// Run `node enrollment/build-schema.mjs` to regenerate enrollment/schema.json.
// Source codes (src): P1..P16 = page of the supplied 16-page packet, NEW1/NEW2 = DCY 01234 (Rev. 7/2026) pages,
// A§n = section n of the 1.2.0 assignment, B§n = section n of the 1.3.0 enrollment-completion assignment, OAC = Ohio Administrative Code rule.
import { writeFile } from 'node:fs/promises';
import { FORM_VERSION, CFG } from './agreements.mjs';

// ---- condition helpers (evaluated by core.mjs) ----
const eq = (id, v) => ['eq', id, v];
const has = (id, v) => ['has', id, v];
const all = (...c) => ['all', ...c];
const any = (...c) => ['any', ...c];
const not = c => ['not', c];
const fn = name => ['fn', name];
const cfg = name => ['cfg', name];
const yes = id => eq(id, 'yes');
const YN = ['yes', 'no'];
const YNN = ['yes', 'no', 'na'];

const F = (id, t, o = {}) => ({ id, t, ...o });
const T = (id, o) => F(id, 'text', { x: 100, ...o });
const TA = (id, o) => F(id, 'textarea', { x: 1000, ...o });
const R = (id, opts, o) => F(id, 'radio', { o: opts, ...o });
const YNR = (id, o) => R(id, YN, o);
// Optional file uploads (B§10–13). Value = array of server-issued document ids; files never travel inside the application body.
const UP = (id, cat, max, o) => F(id, 'upload', { cat, max, ...o });

function parent(p, showIf) {
  const cond = (extra) => extra ? (showIf ? all(showIf, extra) : extra) : showIf;
  const r = (extra) => cond(extra) ?? 1;      // required whenever the parent block is shown (and extra holds)
  const s = (extra) => cond(extra);
  const out = [
    T(p + '.name', { r: r(), s: s(), x: 100, ac: 'name', src: 'NEW1,P2,P1', pdf: 'ohio' }),
    T(p + '.rel', { r: r(), s: s(), x: 40, src: 'NEW1,P2', pdf: 'ohio' }),
    F(p + '.sameAddr', 'check', { s: s(), src: 'NEW1,P2', pdf: 'ohio' }),
    T(p + '.addr', { r: r(not(eq(p + '.sameAddr', true))), s: s(not(eq(p + '.sameAddr', true))), ac: 'street-address', src: 'NEW1,P2', pdf: 'ohio' }),
    T(p + '.city', { x: 60, r: r(not(eq(p + '.sameAddr', true))), s: s(not(eq(p + '.sameAddr', true))), src: 'NEW1,P2', pdf: 'ohio' }),
    F(p + '.state', 'state', { r: r(not(eq(p + '.sameAddr', true))), s: s(not(eq(p + '.sameAddr', true))), src: 'NEW1,P2', pdf: 'ohio' }),
    T(p + '.zip', { x: 10, v: 'zip', r: r(not(eq(p + '.sameAddr', true))), s: s(not(eq(p + '.sameAddr', true))), src: 'NEW1,P2', pdf: 'ohio' }),
    F(p + '.sameHome', 'check', { s: s(), src: 'NEW1,P2', pdf: 'ohio' }),
    F(p + '.home', 'tel', { x: 32, v: 'phone', s: s(not(eq(p + '.sameHome', true))), src: 'NEW1,P2', pdf: 'ohio' }),
    F(p + '.cell', 'tel', { x: 32, v: 'phone', s: s(), src: 'NEW1,P2', pdf: 'ohio' }),
    R(p + '.contactPath', ['email', 'phone'], { r: r(), s: s(), src: 'A§7', pdf: 'ohio' }),
    F(p + '.email', 'email', { x: 254, v: 'email', r: r(eq(p + '.contactPath', 'email')), s: s(), ac: 'email', src: 'NEW1,P2', pdf: 'ohio' }),
    F(p + '.workNA', 'check', { s: s(), src: 'NEW1,P2', pdf: 'ohio' }),
    T(p + '.workName', { s: s(not(eq(p + '.workNA', true))), src: 'NEW1,P2', pdf: 'ohio' }),
    T(p + '.workAddr', { s: s(not(eq(p + '.workNA', true))), src: 'P2', pdf: 'ohio' }),
    T(p + '.workCity', { x: 60, s: s(not(eq(p + '.workNA', true))), src: 'P2', pdf: 'ohio' }),
    F(p + '.workPhone', 'tel', { x: 32, v: 'phone', s: s(not(eq(p + '.workNA', true))), src: 'NEW1,P2', pdf: 'ohio' }),
    T(p + '.reach', { r: r(), s: s(), x: 150, src: 'P2', pdf: 'ohio' }),
    YNR(p + '.share', { r: r(), s: s(), src: 'P2', pdf: 'ohio' }),
    F(p + '.shareWhat', 'checks', { o: ['work', 'cell', 'home', 'email'], r: r(yes(p + '.share')), s: s(yes(p + '.share')), src: 'P2', pdf: 'ohio' }),
  ];
  return out;
}

const heldDiaper = any(eq('po.trained', 'no'), eq('po.trained', 'learning'));
const insHas = any(eq('ins.status', 'private'), eq('ins.status', 'medicaid'), eq('ins.status', 'other'));
const insCard = not(eq('ins.status', 'none'));
const pfcc = eq('c.payment', 'pfcc');
const schoolOn = all(any(eq('c.program', 'preschool'), eq('c.program', 'school-age')), yes('c.schoolTransport'));

export const schema = {
  version: FORM_VERSION,
  cfg: CFG,
  steps: [
    { id: 'intro', fields: [] },
    { id: 'child', fields: [
      T('c.first', { r: 1, x: 60, src: 'NEW1,P2,P6', pdf: 'ohio' }),
      T('c.last', { r: 1, x: 60, src: 'NEW1,P2,P6', pdf: 'ohio' }),
      T('c.nick', { x: 40, src: 'P6', pdf: 'fam' }),
      F('c.dob', 'date', { r: 1, v: 'dob', src: 'NEW1,P2,P16', pdf: 'ohio' }),
      T('c.addr', { r: 1, ac: 'off', src: 'NEW1,P2', pdf: 'ohio' }),
      T('c.city', { r: 1, x: 60, src: 'NEW1,P2', pdf: 'ohio' }),
      F('c.state', 'state', { r: 1, src: 'NEW1,P2', pdf: 'ohio' }),
      T('c.zip', { r: 1, x: 10, v: 'zip', src: 'NEW1,P2', pdf: 'ohio' }),
      F('c.phone', 'tel', { x: 32, v: 'phone', src: 'NEW1,P2', pdf: 'ohio' }),
      F('c.start', 'date', { r: 1, v: 'future', src: 'NEW1,P2,A§6', pdf: 'ohio' }),
      F('c.program', 'select', { r: 1, o: ['infant-toddler', 'preschool', 'school-age'], src: 'A§6', pdf: 'sum' }),
      F('c.days', 'checks', { r: 1, o: ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'], src: 'A§6', pdf: 'sum' }),
      F('c.from', 'time', { r: 1, src: 'A§6', pdf: 'sum' }),
      F('c.to', 'time', { r: 1, v: 'after:c.from', src: 'A§6', pdf: 'sum' }),
      R('c.schedule', ['full', 'part'], { r: 1, src: 'A§6,P9', pdf: 'sum' }),
      R('c.payment', ['pfcc', 'private', 'assist', 'unsure'], { r: 1, src: 'A§6,P1', pdf: 'sum' }),
      YNR('c.schoolTransport', { r: any(eq('c.program', 'preschool'), eq('c.program', 'school-age')), s: any(eq('c.program', 'preschool'), eq('c.program', 'school-age')), src: 'P14,A§14', pdf: 'sum' }),
      T('c.school', { r: any(eq('c.program', 'school-age'), schoolOn), s: any(eq('c.program', 'school-age'), schoolOn), src: 'P14,A§6', pdf: 'sum' }),
      T('c.grade', { x: 20, r: any(eq('c.program', 'school-age'), schoolOn), s: any(eq('c.program', 'school-age'), schoolOn), src: 'P14,A§6', pdf: 'sum' }),
      F('c.commLang', 'select', { r: 1, o: ['en', 'es', 'fr', 'ar', 'sw', 'other'], src: 'A§6', pdf: 'sum' }),
      T('c.commLangOther', { r: eq('c.commLang', 'other'), s: eq('c.commLang', 'other'), x: 40, src: 'A§6', pdf: 'sum' }),
    ] },
    { id: 'parents', fields: [
      ...parent('p1'),
      YNR('p2.has', { r: 1, src: 'NEW1,P2,A§7', pdf: 'ohio' }),
      ...parent('p2', yes('p2.has')),
    ] },
    { id: 'contacts', fields: [
      F('ec', 'rep', { min: 1, max: 6, src: 'NEW1,P2', pdf: 'ohio', f: [
        T('name', { r: 1, x: 80 }), T('rel', { r: 1, x: 40 }), T('city', { r: 1, x: 60 }), F('state', 'state', { r: 1 }),
        F('phone', 'tel', { r: 1, x: 32, v: 'phone' }), T('other', { x: 80 }),
        YNR('adult', { r: 1 }), YNR('canResp', { r: 1 }), YNR('release', { r: 1 }),
      ] }),
    ] },
    { id: 'pickup', fields: [
      YNR('pu.has', { r: 1, src: 'P13,A§8', pdf: 'pick' }),
      F('pu', 'rep', { min: 1, max: 8, s: yes('pu.has'), src: 'P13,A§8', pdf: 'pick', f: [
        T('name', { r: 1, x: 80 }), T('rel', { r: 1, x: 40 }), F('phone', 'tel', { r: 1, x: 32, v: 'phone' }),
      ] }),
      F('pu.idAck', 'check', { r: yes('pu.has'), s: yes('pu.has'), src: 'P13', pdf: 'pick' }),
      R('pu.restrict', ['none', 'yes'], { r: 1, src: 'A§8', pdf: 'pick' }),
      TA('pu.restrictText', { r: eq('pu.restrict', 'yes'), s: eq('pu.restrict', 'yes'), x: 600, src: 'A§8', pdf: 'pick' }),
    ] },
    { id: 'health', fields: [
      F('h.provNone', 'check', { src: 'P2', pdf: 'ohio' }),
      T('h.provName', { r: not(eq('h.provNone', true)), s: not(eq('h.provNone', true)), src: 'P2,A§9', pdf: 'ohio' }),
      T('h.provAddr', { s: not(eq('h.provNone', true)), src: 'P2,A§9', pdf: 'ohio' }),
      T('h.provCity', { x: 60, s: not(eq('h.provNone', true)), src: 'P2', pdf: 'ohio' }),
      F('h.provState', 'state', { s: not(eq('h.provNone', true)), src: 'P2', pdf: 'ohio' }),
      F('h.provPhone', 'tel', { x: 32, v: 'phone', r: not(eq('h.provNone', true)), s: not(eq('h.provNone', true)), src: 'P2,A§9', pdf: 'ohio' }),
      YNR('h.allergy', { r: 1, src: 'P3,A§9', pdf: 'ohio' }),
      F('h.allergyTypes', 'checks', { o: ['food', 'medication', 'environmental'], r: yes('h.allergy'), s: yes('h.allergy'), src: 'P3,A§9', pdf: 'ohio' }),
      TA('h.allergyDesc', { r: yes('h.allergy'), s: yes('h.allergy'), src: 'P3,A§9', pdf: 'ohio' }),
      YNR('h.allergyAction', { r: yes('h.allergy'), s: yes('h.allergy'), src: 'P3,A§9', pdf: 'ohio' }),
      YNR('h.chronic', { r: 1, src: 'NEW1,P3,A§9', pdf: 'ohio' }),
      F('h.chronicNeeds', 'checks', { o: ['monitor', 'medication', 'food', 'procedure', 'avoid', 'selfmed'], r: yes('h.chronic'), s: yes('h.chronic'), src: 'NEW1', pdf: 'ohio' }),
      TA('h.chronicDesc', { r: yes('h.chronic'), s: yes('h.chronic'), src: 'NEW1,P3,A§9', pdf: 'ohio' }),
      TA('h.procedureDesc', { r: has('h.chronicNeeds', 'procedure'), s: has('h.chronicNeeds', 'procedure'), src: 'P3,A§9', pdf: 'ohio' }),
      YNR('h.devDelay', { r: 1, src: 'P3,A§9', pdf: 'ohio' }),
      TA('h.devDesc', { r: yes('h.devDelay'), s: yes('h.devDelay'), src: 'P3,A§9', pdf: 'ohio' }),
      YNR('h.meds', { r: 1, src: 'P3,A§9', pdf: 'ohio' }),
      TA('h.medsDesc', { r: yes('h.meds'), s: yes('h.meds'), src: 'P3,A§9', pdf: 'ohio' }),
      YNR('h.medsAtCare', { r: yes('h.meds'), s: yes('h.meds'), src: 'P3,A§9', pdf: 'ohio' }),
      YNR('h.diet', { r: 1, src: 'P3,A§9', pdf: 'ohio' }),
      TA('h.dietDesc', { r: yes('h.diet'), s: yes('h.diet'), src: 'P3,A§9', pdf: 'ohio' }),
      R('h.dietModified', YNN, { r: yes('h.diet'), s: yes('h.diet'), src: 'P3,A§9', pdf: 'ohio' }),
      F('h.avoid', 'textna', { x: 1000, r: 1, src: 'NEW1,P3,A§9', pdf: 'ohio' }),
      F('h.history', 'textna', { x: 1000, r: 1, src: 'P4,A§9', pdf: 'ohio' }),
      F('h.other', 'textna', { x: 1000, r: 1, src: 'P4,A§9', pdf: 'ohio' }),
      F('h.accom', 'textna', { x: 1000, r: 1, src: 'NEW2,A§9', pdf: 'ohio' }),
      YNR('h.services', { r: 1, src: 'NEW2,A§9', pdf: 'ohio' }),
      F('h.serviceProv', 'textna', { x: 600, r: yes('h.services'), s: yes('h.services'), src: 'NEW2,A§9', pdf: 'ohio' }),
      // M-3 (OAC 5180:2-12-25(A)(1)(e)): written parental permission for topical products and lotions. Neither choice is preselected.
      R('tp.choice', ['authorize', 'deny'], { r: 1, src: 'M-3,OAC 5180:2-12-25', pdf: 'ohio' }),
      TA('tp.instructions', { r: eq('tp.choice', 'authorize'), s: eq('tp.choice', 'authorize'), x: 1000, src: 'M-3,OAC 5180:2-12-25', pdf: 'ohio' }),
      // Health insurance (B§10): every field optional; no Social Security number is ever requested.
      R('ins.status', ['private', 'medicaid', 'other', 'none', 'applied', 'later'], { src: 'B§10', pdf: 'h2h' }),
      T('ins.plan', { x: 100, s: insHas, src: 'B§10', pdf: 'h2h' }),
      T('ins.member', { x: 40, s: insHas, src: 'B§10', pdf: 'h2h' }),
      T('ins.group', { x: 40, s: insHas, src: 'B§10', pdf: 'h2h' }),
      T('ins.holder', { x: 100, s: insHas, src: 'B§10', pdf: 'h2h' }),
      T('ins.holderRel', { x: 40, s: insHas, src: 'B§10', pdf: 'h2h' }),
      UP('up.insFront', 'insurance-front', 1, { s: insCard, src: 'B§10', pdf: 'h2h' }),
      UP('up.insBack', 'insurance-back', 1, { s: insCard, src: 'B§10', pdf: 'h2h' }),
    ] },
    { id: 'docs', fields: [
      F('d.immun', 'select', { r: 1, o: ['available', 'pending', 'school', 'provider', 'medical', 'conscience'], src: 'P16,A§19,OAC 5180:2-12-15', pdf: 'docs' }),
      R('d.conscienceScope', ['all', 'specified'], { r: 1, s: eq('d.immun', 'conscience'), src: 'P16', pdf: 'docs' }),
      TA('d.conscienceVaccines', { x: 600, r: 1, s: all(eq('d.immun', 'conscience'), eq('d.conscienceScope', 'specified')), src: 'P16', pdf: 'docs' }),
      TA('d.conscienceText', { x: 300, s: eq('d.immun', 'conscience'), src: 'P16,A§19', pdf: 'docs' }),
      F('d.hcp', 'select', { r: fn('hcpNeeded'), s: fn('hcpNeeded'), o: ['available', 'pending'], src: 'NEW1,P3,A§9', pdf: 'docs' }),
      F('d.diet', 'select', { r: eq('h.dietModified', 'yes'), s: eq('h.dietModified', 'yes'), o: ['available', 'pending'], src: 'P3', pdf: 'docs' }),
      F('d.med', 'select', { r: all(yes('h.meds'), yes('h.medsAtCare')), s: all(yes('h.meds'), yes('h.medsAtCare')), o: ['available', 'pending'], src: 'P3,OAC 5180:2-12-25', pdf: 'docs' }),
      // Optional uploads (B§11). Never required: a missing file never blocks submission. Insurance cards are uploaded in the Health step only.
      UP('up.immun', 'immunization', 5, { src: 'P16,B§11,OAC 5180:2-12-15', pdf: 'docs' }),
      UP('up.physical', 'physical-exam', 3, { src: 'P16,B§11', pdf: 'docs' }),
      UP('up.hcp', 'health-care-plan', 5, { s: fn('hcpNeeded'), src: 'NEW1,B§11', pdf: 'docs' }),
      UP('up.med', 'medication-authorization', 5, { s: all(yes('h.meds'), yes('h.medsAtCare')), src: 'P3,B§11,OAC 5180:2-12-25', pdf: 'docs' }),
      UP('up.diet', 'dietary-statement', 3, { s: yes('h.diet'), src: 'P3,B§11', pdf: 'docs' }),
      UP('up.custody', 'custody', 5, { src: 'A§8,B§11', pdf: 'h2h' }),
      UP('up.pfcc', 'pfcc', 3, { s: eq('c.payment', 'pfcc'), src: 'B§11', pdf: 'h2h' }),
      UP('up.other', 'other', 5, { src: 'B§11', pdf: 'h2h' }),
      F('d.separate', 'check', { src: 'B§11', pdf: 'docs' }),
    ] },
    { id: 'family', fields: [
      TA('f.immediate', { src: 'P6,A§10', pdf: 'fam' }),
      TA('f.household', { src: 'P6,A§10', pdf: 'fam' }),
      T('f.homeLang', { x: 60, src: 'P6,A§10', pdf: 'fam' }),
      TA('f.arrangements', { src: 'P6,A§10', pdf: 'fam' }),
      TA('f.changes', { src: 'P6,A§10', pdf: 'fam' }),
      TA('f.cultural', { src: 'P6,A§10', pdf: 'fam' }),
      TA('f.pets', { x: 400, src: 'P6,A§10', pdf: 'fam' }),
      R('f.prevCare', YN, { src: 'P6,A§10', pdf: 'fam' }),
      TA('f.prevCareDesc', { s: yes('f.prevCare'), src: 'P6,A§10', pdf: 'fam' }),
    ] },
    { id: 'develop', fields: [
      F('pe.traits', 'checks', { o: ['active','adventurous','affectionate','anxious','bossy','bright','busy','calm','cautious','cheerful','content','creative','curious','easily-angered','emotional','energetic','excitable','friendly','gives-in-easily','happy','hesitant','insecure','jealous','likes-structure','loud','loving','mellow','outgoing','prefers-adult-attention','quiet','sensitive','serious','shares-well','social','spontaneous','stubborn','tentative','other'], src: 'P7,A§11', pdf: 'fam' }),
      T('pe.traitsOther', { r: has('pe.traits', 'other'), s: has('pe.traits', 'other'), x: 200, src: 'P7', pdf: 'fam' }),
      TA('pe.more', { src: 'P7,A§11', pdf: 'fam' }),
      TA('pe.fearReaction', { src: 'P7', pdf: 'fam' }),
      TA('pe.angerTriggers', { src: 'P7', pdf: 'fam' }),
      TA('pe.fears', { src: 'P7,A§11', pdf: 'fam' }),
      TA('pe.comfort', { src: 'P7,A§11', pdf: 'fam' }),
      TA('pe.frustration', { src: 'P7,A§11', pdf: 'fam' }),
      TA('pe.negBehavior', { src: 'P7,A§11', pdf: 'fam' }),
      F('pe.devInfo', 'textna', { x: 1000, r: 1, src: 'NEW2,P4,A§11', pdf: 'fam' }),
      F('pe.routines', 'textna', { x: 1000, r: 1, src: 'P4,A§11', pdf: 'fam' }),
      TA('pe.anxious', { src: 'P8,A§11', pdf: 'fam' }),
      TA('pe.excited', { src: 'P8,A§11', pdf: 'fam' }),
      TA('pe.expect', { src: 'P8,A§11', pdf: 'fam' }),
      TA('pe.helpful', { src: 'P8,A§11', pdf: 'fam' }),
    ] },
    { id: 'daily', fields: [
      // M-2 (OAC 5180:2-12-23(B)): written feeding instructions for an infant (under 18 months on the start date).
      TA('fe.infant', { r: fn('infantAge'), s: fn('infantAge'), x: 1500, src: 'M-2,OAC 5180:2-12-23', pdf: 'fam' }),
      F('fe.drinks', 'checks', { o: ['milk', 'formula', 'juice', 'water'], src: 'P6,A§12', pdf: 'fam' }),
      TA('fe.amount', { x: 400, src: 'P6,A§12', pdf: 'fam' }),
      TA('fe.fav', { x: 400, src: 'P6,A§12', pdf: 'fam' }),
      TA('fe.dislike', { x: 400, src: 'P6,A§12', pdf: 'fam' }),
      TA('fe.noFeed', { x: 600, src: 'P6,A§12', pdf: 'fam' }),
      R('fe.seat', ['highchair', 'booster', 'child', 'adult'], { src: 'P7,A§12', pdf: 'fam' }),
      T('sl.bed', { x: 60, src: 'P7,A§12', pdf: 'fam' }),
      T('sl.wake', { x: 60, src: 'P7,A§12', pdf: 'fam' }),
      T('sl.nap', { x: 120, src: 'P7,A§12', pdf: 'fam' }),
      TA('sl.trouble', { x: 600, src: 'P8,A§12', pdf: 'fam' }),
      T('sl.mood', { x: 120, src: 'P7,A§12', pdf: 'fam' }),
      TA('sl.comfort', { x: 400, src: 'P7,A§12', pdf: 'fam' }),
      R('po.trained', ['yes', 'learning', 'no'], { r: 1, src: 'P5,P7,A§12', pdf: 'fam' }),
      TA('po.method', { x: 600, s: not(eq('po.trained', 'yes')), src: 'P7,A§12', pdf: 'fam' }),
      TA('po.assist', { x: 400, src: 'P7,A§12', pdf: 'fam' }),
      TA('po.signs', { x: 400, src: 'P7,A§12', pdf: 'fam' }),
      F('po.diaperAck', 'check', { r: heldDiaper, s: heldDiaper, src: 'A§6/1.2.1,OAC 5180:2-12-23', pdf: 'fam' }),
      TA('po.care', { x: 600, src: 'A§6/1.2.1,OAC 5180:2-12-23', pdf: 'fam' }),
    ] },
    { id: 'emtrans', fields: [
      R('et.choice', ['give', 'deny'], { r: 1, src: 'NEW2,P5,A§13,OAC 5180:2-12-16', pdf: 'ohio' }),
      TA('et.denyAction', { r: eq('et.choice', 'deny'), s: eq('et.choice', 'deny'), x: 600, src: 'NEW2,P5,A§13', pdf: 'ohio' }),
    ] },
    { id: 'school', s: schoolOn, fields: [
      T('st.school', { r: 1, src: 'P14,A§14', pdf: 'school' }),
      T('st.addr', { r: 1, x: 160, src: 'P14,A§14', pdf: 'school' }),
      T('st.teacher', { src: 'P14,A§14', pdf: 'school' }),
      T('st.room', { x: 20, src: 'P14,A§14', pdf: 'school' }),
      F('st.arrive', 'time', { r: 1, src: 'P14,A§14', pdf: 'school' }),
      F('st.depart', 'time', { r: 1, v: 'after:st.arrive', src: 'P14,A§14', pdf: 'school' }),
      F('st.days', 'checks', { r: 1, o: ['mon', 'tue', 'wed', 'thu', 'fri'], src: 'P14,A§14', pdf: 'school' }),
      R('st.when', ['before', 'after', 'both'], { r: 1, src: 'P14,A§14', pdf: 'school' }),
      T('st.exit', { r: 1, x: 120, src: 'P14,A§14', pdf: 'school' }),
      F('st.phone', 'tel', { r: 1, x: 32, v: 'phone', src: 'P14,A§14', pdf: 'school' }),
      T('st.parentName', { r: 1, ac: 'name', src: 'P14,A§14', pdf: 'school' }),
      F('st.parentPhone', 'tel', { r: 1, x: 32, v: 'phone', src: 'P14,A§14', pdf: 'school' }),
    ] },
    { id: 'media', fields: [
      R('m.internal', YN, { r: 1, src: 'P11,A§18', pdf: 'media' }),
      R('m.marketing', YN, { r: 1, src: 'P11,A§18', pdf: 'media' }),
    ] },
    { id: 'agreements', fields: [
      R('ag.handbook', ['received', 'pending'], { r: 1, src: 'P10,NEW2,A§17', pdf: 'handbook' }),
      R('ag.resCommunity', ['received', 'pending'], { r: 1, src: 'P12,A§17', pdf: 'resources' }),
      R('ag.transIn', ['received', 'pending'], { r: 1, src: 'P12,A§17', pdf: 'resources' }),
      R('ag.transWithin', ['received', 'pending'], { r: 1, src: 'P12,A§17', pdf: 'resources' }),
      R('ag.transOut', ['received', 'pending'], { r: 1, src: 'P12,A§17', pdf: 'resources' }),
      TA('ag.staffReviewed', { x: 600, src: 'P12', pdf: 'resources' }),
      F('ag.absenceAck', 'check', { r: 1, src: 'P9,A§16', pdf: 'absence' }),
      // Withdrawal and Termination Policy v1.1 (B§8): acknowledge receipt, or say it could not be opened (never recorded as received).
      R('ag.wt', ['ack', 'noaccess'], { r: 1, src: 'B§8', pdf: 'h2h' }),
    ] },
    // Communication Preferences and Authorization (COMMS-1.0): its own step immediately BEFORE the Parent/Provider Contract. Nothing here is required,
    // nothing is preselected, and an unchecked box is never consent. The two permissions are independent and are recorded per adult (p1/p2); the optional
    // monthly newsletter (NL-1.0, moved here from the signing page, same meaning) stays a separate two-option choice.
    { id: 'comms', fields: [
      F('p1.authTel', 'check', { src: 'COMMS-1', pdf: 'h2h' }),
      F('p1.authEmail', 'check', { src: 'COMMS-1', pdf: 'h2h' }),
      F('p2.authTel', 'check', { s: yes('p2.has'), src: 'COMMS-1', pdf: 'h2h' }),
      F('p2.authEmail', 'check', { s: yes('p2.has'), src: 'COMMS-1', pdf: 'h2h' }),
      R('nl.choice', ['yes', 'no'], { src: 'NL-1', pdf: 'h2h' }),
    ] },
    // The Parent/Provider Contract is its own step and the LAST page before Review and Sign (B§5, management 11/25/2026).
    { id: 'contract', fields: [
      // PFCC copayment agreement (B§6). The parent reports; Heart to Heart confirms later in a separate, versioned acknowledgment.
      R('pf.auth', ['authorized', 'pending', 'applying', 'unsure'], { r: pfcc, s: pfcc, src: 'B§6,OAC 5180:6-1-09', pdf: 'h2h' }),
      R('pf.copay', ['amount', 'zero', 'unknown'], { r: pfcc, s: pfcc, src: 'B§6,OAC 5180:6-1-05', pdf: 'h2h' }),
      T('pf.copayAmt', { x: 10, v: 'money', r: all(pfcc, eq('pf.copay', 'amount')), s: all(pfcc, eq('pf.copay', 'amount')), src: 'B§6', pdf: 'h2h' }),
      F('pf.dueDay', 'select', { o: ['mon', 'tue', 'wed', 'thu', 'fri', 'discuss'], s: pfcc, src: 'B§6,OAC 5180:6-1-05(J)', pdf: 'h2h' }),
      F('pf.ack', 'check', { r: pfcc, s: pfcc, src: 'B§6', pdf: 'h2h' }),
      // Late pickup (B§7): structure ready, switched off until management approves the terms (agreements.mjs LATE_PICKUP).
      F('lp.ack', 'check', { r: cfg('latePickup'), s: cfg('latePickup'), src: 'P1,B§7', pdf: 'h2h' }),
      F('ag.contractAck', 'check', { r: 1, src: 'P1,A§15,B§5', pdf: 'contract' }),
    ] },
    // Optional financial information (B§financial, management 11/25/2026). The card itself is NOT a schema field: it is validated by
    // financial.mjs and sent in a separate request field into the restricted financial store. Only the non-secret choices live here.
    { id: 'financial', fields: [
      R('fin.choice', ['provide', 'skip'], { r: 1, src: 'B§financial', pdf: 'h2h' }),
      F('fin.consent', 'check', { r: eq('fin.choice', 'provide'), s: eq('fin.choice', 'provide'), src: 'B§financial', pdf: 'h2h' }),
      R('fin.notice', ['continued'], { r: eq('fin.choice', 'skip'), s: eq('fin.choice', 'skip'), src: 'B§financial', pdf: 'h2h' }),
    ] },
    { id: 'review', fields: [] },
    // Signing page (signatures + acknowledgments). The optional newsletter choice now lives in the 'comms' step.
    { id: 'sign', fields: [] },
  ],
  // Acknowledgments the signer ticks one by one (each stored with the signature). `s` = shown condition.
  acks: [
    { id: 'accuracy', src: 'NEW2,P6,A§20' },
    { id: 'esign', src: 'A§20' },
    { id: 'emtrans', src: 'NEW2,P5,A§13' },
    { id: 'topical', s: eq('tp.choice', 'authorize'), src: 'M-3,OAC 5180:2-12-25' },
    { id: 'pickup', s: yes('pu.has'), src: 'P13,A§8' },
    { id: 'school', s: schoolOn, src: 'P14,A§14' },
    { id: 'media', src: 'P11,A§18' },
    { id: 'receipts', s: any(eq('ag.handbook', 'received'), eq('ag.resCommunity', 'received'), eq('ag.transIn', 'received'), eq('ag.transWithin', 'received'), eq('ag.transOut', 'received')), src: 'P10,P12,A§17' },
    { id: 'conscience', s: eq('d.immun', 'conscience'), src: 'P16,A§19' },
    { id: 'pending', src: 'P1,P9,A§15,A§16' },
  ],
  // Computed predicates referenced by ['fn', name]: health-care-plan trigger (OAC 5180:2-12-15(D)).
  fns: { infantAge: ['ageUnder', 'c.dob', 'c.start', 18], hcpNeeded: any(yes('h.allergyAction'), yes('h.chronic'), all(yes('h.meds'), yes('h.medsAtCare'))) },
};

await writeFile(new URL('./schema.json', import.meta.url), JSON.stringify(schema, null, 1) + '\n');
console.log('schema.json written:', schema.steps.reduce((n, s) => n + s.fields.length, 0), 'fields');

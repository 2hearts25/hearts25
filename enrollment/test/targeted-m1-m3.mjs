// Targeted validation of findings M-1 (telephone), M-2 (infant feeding instructions) and M-3 (topical-product authorization) ONLY.
// Not a regression suite. Synthetic data only. Run: node enrollment/test/targeted-m1-m3.mjs
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { lib, schema, en, fonts, baseMeta } from './pdf-common.mjs';
import { buildEnrollmentPdfs } from '../pdf.mjs';
import { validate, settle, visibleAcks } from '../core.mjs';
import { sample130 } from './sample-data.mjs';
let n = 0; const ok = (name) => { n++; console.log('ok', name); };
const V = (o, drop = []) => { const d = { ...structuredClone(sample130), ...o }; for (const k of drop) delete d[k]; return validate(d, schema, { today: '2026-11-26' }).errors; };
const NOPHONE = { 'p1.home': undefined, 'p1.cell': undefined, 'p1.workPhone': undefined, 'p2.home': undefined, 'p2.cell': undefined, 'p2.workPhone': undefined };
const strip = o => { const d = { ...o }; for (const k of Object.keys(d)) if (d[k] === undefined) delete d[k]; return d; };
const E = (o) => validate(strip({ ...structuredClone(sample130), ...o }), schema, { today: '2026-11-26' }).errors;

// ---------------- baseline
assert.deepEqual(E({}), {}, 'baseline synthetic application must validate'); ok('baseline sample validates (no errors)');

// ---------------- M-1
for (const path of ['email', 'phone']) {
  const e = E({ ...NOPHONE, 'p1.contactPath': path }); assert.equal(e['p1.cell'], 'phoneNeeded', 'no phone, contact path ' + path); }
ok('M-1 parent 1 with no phone number is rejected for BOTH preferred contact methods (email and phone)');
assert.deepEqual(E({ ...NOPHONE, 'p1.cell': '(216) 555-0144', 'p1.contactPath': 'email' })['p1.cell'], undefined); ok('M-1 cell only (email preferred) accepted');
assert.equal(E({ ...NOPHONE, 'p1.home': '(216) 555-0143', 'p1.contactPath': 'email' })['p1.cell'], undefined); ok('M-1 home only accepted');
assert.equal(E({ ...NOPHONE, 'p1.workPhone': '(216) 555-0145', 'p1.workNA': false, 'p1.contactPath': 'email' })['p1.cell'], undefined); ok('M-1 work only accepted');
assert.equal(E({ ...NOPHONE, 'p1.workPhone': '(216) 555-0145', 'p1.workNA': true })['p1.cell'], 'phoneNeeded'); ok('M-1 work number does not count when "no work" is ticked (field hidden)');
assert.equal(E({ ...NOPHONE, 'p1.sameHome': true, 'c.phone': '(216) 555-0100' })['p1.cell'], undefined); ok('M-1 "same home phone as child" counts when the child phone is valid');
assert.equal(E({ ...NOPHONE, 'p1.sameHome': true, 'c.phone': undefined })['p1.cell'], 'phoneNeeded'); ok('M-1 "same home phone" without a child phone does not count');
for (const bad of ['12345', 'abc', '(216) 555', '+1 216 555 014499999999']) assert.equal(E({ ...NOPHONE, 'p1.cell': bad })['p1.cell'] === 'phoneNeeded' || E({ ...NOPHONE, 'p1.cell': bad })['p1.cell'] === 'phone', true, 'invalid ' + bad);
ok('M-1 malformed numbers rejected');
assert.equal(E({ ...NOPHONE, 'p1.cell': '(216) 555-0144', 'p2.has': 'yes', 'p2.cell': undefined, 'p2.home': undefined, 'p2.workPhone': undefined })['p2.cell'], 'phoneNeeded'); ok('M-1 listed parent #2 with no phone is rejected');
assert.equal(E({ 'p2.has': 'yes', 'p2.home': undefined, 'p2.cell': undefined, 'p2.workPhone': '(216) 555-0166', 'p2.workNA': false })['p2.cell'], undefined); ok('M-1 parent #2 work number accepted');
assert.equal(E({ 'p2.has': 'no' })['p2.cell'], undefined); ok('M-1 no second parent → no phone required for parent #2');

// ---------------- M-2 (infant = under 18 months on the start date, OAC 5180:2-12-01)
const inf = { 'c.dob': '2026-06-01', 'c.start': '2027-01-11', 'c.program': 'infant-toddler' };
assert.equal(E(inf)['fe.infant'], 'required'); ok('M-2 infant (7 months at start): feeding instructions required');
assert.equal(E({ ...inf, 'fe.infant': 'Similac Advance 4 oz every 3 hours, warmed (synthetic).' })['fe.infant'], undefined); ok('M-2 completed → accepted');
assert.equal(E({ ...inf, 'fe.infant': 'x'.repeat(1501) })['fe.infant'], 'long'); ok('M-2 length limit enforced (1500)');
assert.equal(E({ ...inf, 'fe.infant': '   ' })['fe.infant'], 'required'); ok('M-2 blank/whitespace rejected');
assert.equal(E({ ...inf, 'c.dob': '2025-07-12' })['fe.infant'], 'required'); ok('M-2 17 months 30 days at start → still an infant');
assert.equal(E({ ...inf, 'c.dob': '2025-07-11' })['fe.infant'], undefined); ok('M-2 exactly 18 months at start → not an infant (field hidden, nothing required)');
const stale = settle({ ...structuredClone(sample130), 'fe.infant': 'stale text' }, schema); assert.equal(stale['fe.infant'], undefined); ok('M-2 older child: field not shown and stale text dropped');
assert.equal(E({ ...inf, 'c.start': undefined })['fe.infant'], undefined); ok('M-2 no start date → not evaluated (start date itself is required)');
const fi = schema.steps.flatMap(s => s.fields).filter(f => f.id.startsWith('fe.') && f.src?.includes('M-2')); assert.equal(fi.length, 1); ok('M-2 exactly ONE new feeding field, no standalone form');

// ---------------- M-3
const tp = schema.steps.flatMap(s => s.fields).filter(f => f.id.startsWith('tp.')); assert.deepEqual(tp.map(f => f.id), ['tp.choice', 'tp.instructions']); ok('M-3 exactly two new fields (choice + one text box)');
assert.equal(tp[0].t, 'radio'); assert.deepEqual(tp[0].o, ['authorize', 'deny']); assert.ok(!('def' in tp[0]) && !('d' in tp[0])); ok('M-3 two mutually exclusive choices, no default value in the schema');
assert.equal(E({ 'tp.choice': undefined, 'tp.instructions': undefined })['tp.choice'], 'required'); ok('M-3 neither choice preselected: submitting without choosing is rejected');
assert.equal(E({ 'tp.choice': 'authorize', 'tp.instructions': undefined })['tp.instructions'], 'required'); ok('M-3 authorize requires written instructions');
assert.equal(E({ 'tp.choice': 'authorize', 'tp.instructions': '  ' })['tp.instructions'], 'required'); ok('M-3 whitespace-only instructions rejected');
assert.equal(E({ 'tp.choice': 'authorize', 'tp.instructions': 'x'.repeat(1001) })['tp.instructions'], 'long'); ok('M-3 length limit enforced (1000)');
assert.deepEqual(E({ 'tp.choice': 'deny', 'tp.instructions': undefined }), {}); ok('M-3 deny needs no instructions');
assert.equal(settle({ ...structuredClone(sample130), 'tp.choice': 'deny', 'tp.instructions': 'leftover' }, schema)['tp.instructions'], undefined); ok('M-3 deny discards leftover instruction text (no authorization kept)');
assert.equal(E({ 'tp.choice': 'both' })['tp.choice'], 'choice'); ok('M-3 invalid choice rejected');
const ackIds = d => visibleAcks(settle({ ...sample130, ...d }, schema), schema).map(a => a.id);
assert.ok(ackIds({ 'tp.choice': 'authorize' }).includes('topical')); assert.ok(!ackIds({ 'tp.choice': 'deny' }).includes('topical')); ok('M-3 signed acknowledgment appears only when permission is granted');

// ---------------- five languages
for (const l of ['en', 'es', 'fr', 'ar', 'sw']) {
  const L = (await import(`../i18n/${l}.mjs`)).default;
  for (const k of ['fe.infant', 'tp.choice', 'tp.instructions']) assert.ok(L.f[k], `${l} f.${k}`);
  for (const k of ['fe.infant', 'tp.instructions']) assert.ok(L.fh[k] && L.fh[k].length > 120, `${l} fh.${k}`);
  assert.ok(L.o['tp.choice'].authorize && L.o['tp.choice'].deny && L.acks.topical && L.err.phoneNeeded, l);
  assert.ok(!/cell or home phone number, because you chose/.test(L.err.phoneNeeded), l + ' stale phone message');
}
const E_ = (await import('../i18n/en.mjs')).default;
assert.equal(E_.f['fe.infant'], 'Infant Feeding Instructions'); assert.equal(E_.f['tp.instructions'], 'Topical Products and Application Instructions');
assert.equal(E_.o['tp.choice'].authorize, 'I authorize Heart to Heart to apply the products identified in my instructions.'); assert.equal(E_.o['tp.choice'].deny, 'I do not authorize the application of topical products.');
assert.ok(E_.fh['fe.infant'].startsWith('Please describe your child’s feeding requirements, including the type of food, formula or breast milk, the amount per feeding, feeding times or frequency, and any special preparation or feeding instructions.'));
assert.ok(E_.fh['tp.instructions'].startsWith('Please identify any topical products you authorize Heart to Heart to apply to your child, such as sunscreen, diaper cream, insect repellent or lotion. Include the product name, when it may be applied and any special instructions or restrictions.'));
assert.ok(/updated whenever your child’s feeding requirements change/.test(E_.fh['fe.infant'])); ok('five languages complete; English labels/instructions/choices match the approved wording; update notice present');

// ---------------- PDFs (exactly two, new answers in the existing sections)
const dir = mkdtempSync(tmpdir() + '/m13-');
const txt = (b, name) => { writeFileSync(dir + '/' + name, b); return execFileSync('pdftotext', ['-layout', dir + '/' + name, '-']).toString(); };
for (const lang of ['en', 'es', 'fr', 'ar', 'sw']) {
  const data = settle({ ...structuredClone(sample130), ...inf, 'fe.infant': lang === 'ar' ? 'حليب صناعي ٤ أونصات كل ٣ ساعات (اختبار)' : 'Formula 4 oz every 3 hours, warmed (synthetic).' }, schema);
  const out = await buildEnrollmentPdfs({ lib, fonts, schema, en, data, meta: baseMeta({ language: lang, acks: [...baseMeta().acks, 'topical'] }) });
  assert.deepEqual(Object.keys(out).filter(k => out[k]?.bytes).sort(), ['h2h', 'ohio'], 'exactly two PDFs'); assert.equal(out.ohio.replaced + out.h2h.replaced, 0, 'unrenderable characters');
  if (lang !== 'en') continue;
  const o = txt(out.ohio.bytes, 'o.pdf'), h = txt(out.h2h.bytes, 'h.pdf');
  for (const [nm, t] of [['Ohio', o], ['Center', h]]) assert.match(t, /Infant Feeding/, nm + ' PDF infant label'), assert.match(t, /Formula 4 oz every 3 hours/, nm + ' PDF infant text');
  assert.match(o, /Topical products and lotions authorization/); assert.match(o, /Topical Products and Application/); assert.match(o, /Sunscreen \(Example SPF 50/);
  assert.match(o, /I authorize Heart to Heart to apply the products identified in my/); assert.match(o, /Date signed \(parent signature below\)\s+11\/24\/2026/); assert.match(o, /Authorization expires\s+11\/24\/2027/);
  assert.match(o, /Parent signature/); assert.ok(o.indexOf('Topical products and lotions authorization') < o.indexOf('Parent signature')); assert.match(o, /I authorize Heart to Heart to apply the topical products/);
  assert.ok(!/Topical Products and Application/.test(h), 'topical authorization belongs to the Ohio health record only');
  const dn = settle({ ...structuredClone(sample130), 'tp.choice': 'deny', 'tp.instructions': undefined }, schema);
  const od = txt((await buildEnrollmentPdfs({ lib, fonts, schema, en, data: dn, meta: baseMeta() })).ohio.bytes, 'od.pdf'); assert.match(od, /I do not authorize the application of topical/); assert.ok(!/Authorization expires/.test(od));
  const nf = txt((await buildEnrollmentPdfs({ lib, fonts, schema, en, data: settle(structuredClone(sample130), schema), meta: baseMeta() })).ohio.bytes, 'on.pdf'); assert.ok(!/Infant Feeding/.test(nf), 'no infant field printed for an older child');
}
ok('PDFs: exactly two; infant answer in both documents, topical authorization + expiry + signature date in the Ohio record; deny and non-infant variants; 5 languages render without unrenderable characters');
// leap-day expiry
const ld = await buildEnrollmentPdfs({ lib, fonts, schema, en, data: settle(structuredClone(sample130), schema), meta: baseMeta({ submittedAt: '2027-02-28T15:00:00.000Z' }) }); assert.match(txt(ld.ohio.bytes, 'ld.pdf'), /Authorization expires\s+02\/28\/2028/); 
const ld2 = await buildEnrollmentPdfs({ lib, fonts, schema, en, data: settle(structuredClone(sample130), schema), meta: baseMeta({ submittedAt: '2028-02-29T15:00:00.000Z' }) }); assert.match(txt(ld2.ohio.bytes, 'ld2.pdf'), /Authorization expires\s+02\/28\/2029/); ok('expiry date: 12 months after the signature date (Feb 29 handled)');

// ---------------- backend module parity (the server runs the SAME validator and schema)
const F = '../../supabase/functions/submit-enrollment/'; const sha = p => createHash('sha256').update(readFileSync(new URL(p, import.meta.url))).digest('hex');
for (const f of ['core.mjs', 'pdf-ohio.mjs', 'pdf-h2h.mjs', 'doc-map.mjs']) assert.equal(sha(F + f), sha('../' + f), f + ' differs between source and function');
ok('function copies of core/doc-map/both PDF modules are byte-identical to the shared source');
console.log(`\n${n} targeted checks passed (M-1, M-2, M-3 only)`);


import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { validate, normalise, visibleAcks } from '../core.mjs';
import { buildEnrollmentPdfs } from '../pdf.mjs';
import { sample130 } from './sample-data.mjs';

const schema = JSON.parse(readFileSync(new URL('../schema.json', import.meta.url)));
const en = (await import('../i18n/en.mjs')).default;
const data = {
  ...sample130, 'h.diet': 'yes', 'h.dietDesc': 'Synthetic diet instructions', 'h.dietModified': 'yes',
  'pe.fearReaction': 'Freezes when startled', 'pe.angerTriggers': 'Unexpected transitions',
  'h.services': 'yes', 'h.serviceProv': 'Example provider weekly',
  'ag.staffReviewed': 'Community Resources',
  'd.immun': 'conscience', 'd.conscienceScope': 'specified', 'd.conscienceVaccines': 'Pertussis',
  'et.choice': 'deny', 'et.denyAction': 'Notify the parent immediately.',
  'm.internal': 'yes', 'm.marketing': 'no',
};
const errors = change => validate({ ...data, ...change }, schema, { today: '2026-11-25' }).errors;
assert.equal(errors({ 'd.conscienceScope': undefined })['d.conscienceScope'], 'required');
assert.equal(errors({ 'd.conscienceVaccines': '' })['d.conscienceVaccines'], 'required');
assert.equal(errors({ 'd.conscienceScope': 'all', 'd.conscienceVaccines': '' })['d.conscienceVaccines'], undefined);
assert.equal(normalise({ ...data, 'd.immun': 'school' }, schema)['d.conscienceVaccines'], undefined);
assert.equal(errors({ 'et.denyAction': '' })['et.denyAction'], 'required');
assert.equal(errors({ 'd.diet': undefined })['d.diet'], 'required');
assert.equal(errors({ 'h.meds': 'yes', 'h.medsAtCare': 'yes', 'd.med': undefined })['d.med'], 'required');
const grant = normalise({ ...data, 'et.choice': 'give' }, schema);
assert.equal(grant['et.denyAction'], undefined);
assert.ok(visibleAcks(data, schema).some(a => a.id === 'conscience'));
assert.ok(visibleAcks(grant, schema).some(a => a.id === 'emtrans'));
assert.equal(errors({})['m.marketing'], undefined);
assert.equal(errors({ 'ag.staffReviewed': '' })['ag.staffReviewed'], undefined);
for (const lang of ['en','es','fr','ar','sw']) {
  const l = (await import('../i18n/' + lang + '.mjs')).default;
  for (const id of ['pe.fearReaction','pe.angerTriggers','ag.staffReviewed','d.conscienceScope','d.conscienceVaccines','h.dietDesc','d.med']) {
    assert.ok(Object.values(l).some(group => group && typeof group[id] === 'string'), lang + ' ' + id);
  }
  assert.ok(Object.values(l).some(group => group?.['et.choice']?.give));
}
console.log('Targeted conditional intake and changed translation keys passed.');

if (globalThis.Deno) {
  const lib = await import('npm:@cantoo/pdf-lib@2.11.1');
  const fontkit = await import('npm:fontkit@2.0.4');
  const font = name => readFileSync(new URL('../../public/assets/fonts/' + name + '.subset.ttf', import.meta.url));
  const fonts = { notoRegular: font('NotoSans-Regular'), notoBold: font('NotoSans-Bold'), cairoRegular: font('Cairo-Regular'), cairoBold: font('Cairo-Bold') };
  const meta = {
    applicationId: 'H2H-TEST-COMPLETENESS', submittedAt: '2026-11-25T15:00:00Z',
    language: 'en', formVersion: '1.3.0-E2', parent2Mode: 'later',
    acks: ['accuracy','esign','conscience','emtrans','media','receipts'],
    signatures: [{ role: 'parent1', name: 'Synthetic Parent', method: 'typed', signedAt: '2026-11-25T15:00:00Z' }],
    v130: { documents: [], agreements: [], contractVersion: 'PPC-2026.11-R2' },
  };
  for (const answers of [data, { ...data, 'et.choice': 'give', 'd.conscienceScope': 'all' }]) {
    const result = await buildEnrollmentPdfs({ lib: { ...lib, fontkit }, fonts, schema, en, data: answers, meta });
    assert.deepEqual(Object.keys(result), ['ohio','h2h']);
    for (const pdf of Object.values(result)) {
      assert.ok(pdf.pageCount > 1);
      assert.ok(pdf.bytes.length > 10000);
      assert.equal((await lib.PDFDocument.load(pdf.bytes)).getPageCount(), pdf.pageCount);
    }
    for (const id of ['et.choice','pe.fearReaction','pe.angerTriggers','h.serviceProv','d.conscienceScope','h.dietModified']) {
      assert.ok(result.ohio.printed.has(id), id);
    }
    assert.equal(result.ohio.printed.has('et.denyAction'), answers['et.choice'] === 'deny');
    assert.ok(result.h2h.printed.has('ag.staffReviewed'));
    assert.ok(result.h2h.printed.has('m.internal') && result.h2h.printed.has('m.marketing'));
  }
  console.log('Both PDF renderers passed the targeted grant and refusal cases.');
}


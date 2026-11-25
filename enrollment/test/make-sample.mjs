// Node harness: generates the synthetic PDF with the same code the Edge function runs.
import { readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
const TOOLS = '/home/claude/h2h-tools/node_modules';
const { PDFDocument, rgb } = await import(pathToFileURL(TOOLS + '/@cantoo/pdf-lib/cjs/index.js').href).then(m => m.default ?? m);
const fontkit = (await import(pathToFileURL(TOOLS + '/@pdf-lib/fontkit/dist/fontkit.es.js').href)).default;
const { buildEnrollmentPdfs } = await import('../pdf.mjs');
const { sample } = await import('./sample-data.mjs');
const schema = JSON.parse(readFileSync(new URL('../schema.json', import.meta.url)));
const en = (await import('../i18n/en.mjs')).default;
const fd = '../../public/assets/fonts/'; const rd = f => new Uint8Array(readFileSync(new URL(fd + f, import.meta.url)));
const fonts = { notoRegular: rd('NotoSans-Regular.subset.ttf'), notoBold: rd('NotoSans-Bold.subset.ttf'), cairoRegular: rd('Cairo-Regular.subset.ttf'), cairoBold: rd('Cairo-Bold.subset.ttf') };
const png = new Uint8Array(readFileSync(new URL('./sig-sample.png', import.meta.url)));
const meta = {
  applicationId: 'H2H-20261124-SAMPLE01', submittedAt: '2026-11-24T22:41:07.000Z', language: 'ar', languageName: 'Arabic (العربية)', formVersion: '1.2.0-E1',
  acks: ['accuracy', 'esign', 'emtrans', 'pickup', 'school', 'media', 'receipts', 'pending'],
  signatures: [{ role: 'parent1', name: 'فاطمة الأحمد (اختبار)', relation: 'Mother', method: 'drawn', png, signedAt: '2026-11-24T22:40:31.000Z' }], parent2Mode: 'later',
};
const L = { PDFDocument, rgb, fontkit, PDFName: (await import(pathToFileURL(TOOLS + '/@cantoo/pdf-lib/cjs/index.js').href).then(m => m.default ?? m)).PDFName, PDFHexString: (await import(pathToFileURL(TOOLS + '/@cantoo/pdf-lib/cjs/index.js').href).then(m => m.default ?? m)).PDFHexString, PDFOperator: (await import(pathToFileURL(TOOLS + '/@cantoo/pdf-lib/cjs/index.js').href).then(m => m.default ?? m)).PDFOperator };
const out = await buildEnrollmentPdfs({ lib: L, fonts, schema, en, data: sample, meta });
writeFileSync(new URL('./sample-ar-Ohio.pdf', import.meta.url), out.ohio.bytes); writeFileSync(new URL('./sample-ar-H2H.pdf', import.meta.url), out.h2h.bytes);
// Second sample: English, infant-toddler (no school transport), one parent, typed-name signature, no health items.
const s2 = { ...sample, 'c.first': 'Noah', 'c.last': 'Example-Test', 'c.nick': undefined, 'c.program': 'infant-toddler', 'c.schoolTransport': undefined, 'c.school': undefined, 'c.grade': undefined, 'c.commLang': 'en', 'c.dob': '2025-09-02',
  'p1.name': 'Jordan Example-Test', 'p1.rel': 'Father', 'p2.has': 'no', 'h.allergy': 'no', 'h.chronic': 'no', 'h.meds': 'no', 'h.diet': 'no', 'd.hcp': undefined, 'd.diet': undefined, 'd.med': undefined, 'po.trained': 'no', 'et.choice': 'deny', 'et.denyAction': 'Call the parent first, then call 911 only if the child is in danger.', 'pu.has': 'no', 'pu.restrict': 'none' };
const m2 = { ...meta, applicationId: 'H2H-20261124-SAMPLE02', language: 'en', languageName: 'English', acks: ['accuracy', 'esign', 'emtrans', 'media', 'receipts', 'pending'], parent2Mode: 'na',
  signatures: [{ role: 'parent1', name: 'Jordan Example-Test', relation: 'Father', method: 'typed', typedAck: true, signedAt: '2026-11-24T22:40:31.000Z' }] };
const o2 = await buildEnrollmentPdfs({ lib: L, fonts, schema, en, data: s2, meta: m2 });
writeFileSync(new URL('./sample-en-Ohio.pdf', import.meta.url), o2.ohio.bytes); writeFileSync(new URL('./sample-en-H2H.pdf', import.meta.url), o2.h2h.bytes);
console.log('ar pages', out.ohio.pageCount, out.h2h.pageCount, 'replaced', out.ohio.replaced, out.h2h.replaced, '| en pages', o2.ohio.pageCount, o2.h2h.pageCount);

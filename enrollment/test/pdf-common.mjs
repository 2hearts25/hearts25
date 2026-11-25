// Shared harness for the PDF tests: loads pdf-lib/fontkit/fonts exactly as the Edge function does.
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
const TOOLS = '/home/claude/h2h-tools/node_modules';
const L = await import(pathToFileURL(TOOLS + '/@cantoo/pdf-lib/cjs/index.js').href).then(m => m.default ?? m);
export const fontkit = (await import(pathToFileURL(TOOLS + '/@pdf-lib/fontkit/dist/fontkit.es.js').href)).default;
export const lib = { PDFDocument: L.PDFDocument, rgb: L.rgb, PDFName: L.PDFName, PDFHexString: L.PDFHexString, PDFOperator: L.PDFOperator, fontkit };
export const schema = JSON.parse(readFileSync(new URL('../schema.json', import.meta.url)));
export const en = (await import('../i18n/en.mjs')).default;
const fd = '../../public/assets/fonts/'; const rd = f => new Uint8Array(readFileSync(new URL(fd + f, import.meta.url)));
export const fonts = { notoRegular: rd('NotoSans-Regular.subset.ttf'), notoBold: rd('NotoSans-Bold.subset.ttf'), cairoRegular: rd('Cairo-Regular.subset.ttf'), cairoBold: rd('Cairo-Bold.subset.ttf') };
export const png = new Uint8Array(readFileSync(new URL('./sig-sample.png', import.meta.url)));
export const baseMeta = (over = {}) => ({
  applicationId: 'H2H-20261124-SAMPLE01', submittedAt: '2026-11-24T22:41:07.000Z', language: 'en', languageName: 'English', formVersion: '1.2.0-E1',
  acks: ['accuracy', 'esign', 'emtrans', 'pickup', 'school', 'media', 'receipts', 'conscience', 'pending'],
  signatures: [{ role: 'parent1', name: 'Test Parent', relation: 'Mother', method: 'drawn', png, signedAt: '2026-11-24T22:40:31.000Z' }], parent2Mode: 'na', ...over });

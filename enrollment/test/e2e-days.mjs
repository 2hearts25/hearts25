// Weekday-only, weekend-only and combined day selections through the PDF builder (all five languages for the labels).
import { writeFileSync } from 'node:fs';
import { lib, schema, en, fonts, png, baseMeta } from './pdf-common.mjs';
import { buildEnrollmentPdfs } from '../pdf.mjs';
import { sample } from './sample-data.mjs';
const langs = { en, es: (await import('../i18n/es.mjs')).default, fr: (await import('../i18n/fr.mjs')).default, ar: (await import('../i18n/ar.mjs')).default, sw: (await import('../i18n/sw.mjs')).default };
const cases = { weekday: ['mon','tue','wed','thu','fri'], weekend: ['sat','sun'], combined: ['mon','wed','sat'], all7: ['mon','tue','wed','thu','fri','sat','sun'] };
for (const [name, days] of Object.entries(cases)) {
  const out = await buildEnrollmentPdfs({ lib, fonts, schema, en, data: { ...sample, 'c.days': days }, meta: baseMeta() });
  writeFileSync(`/tmp/days-${name}-H2H.pdf`, out.h2h.bytes);
}
console.log(JSON.stringify(Object.fromEntries(Object.entries(langs).map(([k, v]) => [k, [v.o._.sat, v.o._.sun]]))));

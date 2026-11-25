// Field-coverage test for Version 1.2.1: for many randomised synthetic applications (all five languages' scripts, long text, every
// conditional branch) both PDFs must print EVERY answered field assigned to them, and every answered field must land in at least one PDF.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { lib, schema, en, fonts, baseMeta } from './pdf-common.mjs';
import { buildEnrollmentPdfs } from '../pdf.mjs';
import { settle, stepShown, fieldShown } from '../core.mjs';
import { docsOf } from '../doc-map.mjs';

let seed = 12345; const rnd = () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296;
const pick = a => a[Math.floor(rnd() * a.length)];
const words = { en: 'Peanut allergy with hives', es: 'Alergia al maní con ronchas', fr: 'Allergie à l’arachide avec urticaire', ar: 'حساسية الفول السوداني مع طفح جلدي (اختبار) 12', sw: 'Mzio wa karanga na vipele' };
const LONG = Object.values(words).join('. ') + '. ' + 'Long synthetic note that must never be truncated. '.repeat(30);
const mk = (f, lang, i) => {
  const base = words[lang] + ' ' + f.id;
  switch (f.t) {
    case 'text': return (base + ' ' + i).slice(0, Math.min(f.x || 60, 60)); case 'textarea': return f.x >= 1000 ? LONG.slice(0, 900) : base.slice(0, f.x);
    case 'textna': return rnd() < 0.2 ? 'N/A' : base.slice(0, 80);
    case 'tel': return '(216) 555-0' + (100 + Math.floor(rnd() * 800)); case 'email': return `synthetic${i}@example.com`;
    case 'date': return '2026-12-15'; case 'time': return f.id.endsWith('to') || f.id.includes('depart') ? '17:00' : '08:00';
    case 'state': return 'OH'; case 'radio': case 'select': return pick(f.o);
    case 'checks': return f.o.filter(() => rnd() < 0.6).concat(f.o[0]).filter((v, k, a) => a.indexOf(v) === k);
    case 'check': return rnd() < 0.5; case 'rep': return Array.from({ length: 1 + Math.floor(rnd() * Math.min(f.max, 3)) }, (_, r) => Object.fromEntries(f.f.map(g => [g.id, g.t === 'radio' ? pick(g.o) : g.t === 'tel' ? '(216) 555-01' + (10 + r) : g.t === 'state' ? 'OH' : (words[lang] + ' ' + g.id).slice(0, 40)])));
  }
};
const exercised = { ohio: new Set(), h2h: new Set() };
let variants = 0, missing = 0;
const langs = Object.keys(words);
for (let i = 0; i < 40; i++) {
  const lang = langs[i % 5]; const raw = {};
  for (const st of schema.steps) for (const f of st.fields) raw[f.id] = mk(f, lang, i);
  // push a few branches deliberately
  if (i % 4 === 0) raw['p2.has'] = 'yes'; if (i % 3 === 0) raw['c.program'] = 'school-age'; if (i % 3 === 1) raw['c.program'] = 'infant-toddler'; if (i % 5 === 2) raw['c.schoolTransport'] = 'yes';
  const data = settle(raw, schema);
  const meta = baseMeta({ language: lang, parent2Mode: data['p2.has'] === 'yes' ? 'later' : 'na' });
  const { ohio, h2h } = await buildEnrollmentPdfs({ lib, fonts, schema, en, data, meta });
  const printed = { ohio: ohio.printed, h2h: h2h.printed };
  const all = new Set();
  for (const st of schema.steps) if (stepShown(st, data, schema)) for (const f of st.fields) {
    if (!fieldShown(f, data, schema)) continue; const v = data[f.id];
    const answered = f.t === 'rep' ? (v || []).length > 0 : v !== undefined && v !== '' && v !== null && !(f.t === 'checks' && v.length === 0);
    if (!answered) continue; all.add(f.id);
    for (const d of docsOf(f.id)) { exercised[d].add(f.id); if (!printed[d].has(f.id)) { missing++; console.error(`MISSING variant ${i} (${lang}): ${f.id} not printed in ${d}`); } }
  }
  for (const id of all) assert.ok(printed.ohio.has(id) || printed.h2h.has(id), `field ${id} appears in neither PDF`);
  assert.equal(ohio.replaced, 0, 'unrenderable characters in Ohio PDF'); assert.equal(h2h.replaced, 0, 'unrenderable characters in H2H PDF');
  variants++;
  if (i === 0) { const d = mkdtempSync(tmpdir() + '/pdfc-'); writeFileSync(d + '/o.pdf', ohio.bytes); writeFileSync(d + '/h.pdf', h2h.bytes); console.log('sample dir', d); }
}
assert.equal(missing, 0, missing + ' fields not printed where classified');
const never = []; for (const st of schema.steps) for (const f of st.fields) for (const d of docsOf(f.id)) if (!exercised[d].has(f.id)) never.push(d + ':' + f.id);
console.log(`ok coverage: ${variants} randomised applications; Ohio fields exercised ${exercised.ohio.size}, H2H fields exercised ${exercised.h2h.size}; never-exercised: ${never.length ? never.join(', ') : 'none'}`);
assert.equal(never.length, 0, 'some fields were never exercised by the variants');

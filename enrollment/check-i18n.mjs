// Verifies every language covers every schema field, option, step and acknowledgment, with matching {placeholders}.
import { readFileSync } from 'node:fs';
const schema = JSON.parse(readFileSync(new URL('./schema.json', import.meta.url)));
const langs = {}; for (const l of ['en', 'es', 'fr', 'ar', 'sw']) langs[l] = (await import(`./i18n/${l}.mjs`)).default;
const en = langs.en; const problems = [];
const need = []; // [kind, key]
const optKey = id => id.replace(/^p2\./, 'p2.');
for (const st of schema.steps) {
  need.push(['steps', st.id]);
  if (['child', 'parents', 'contacts', 'pickup', 'health', 'family', 'develop', 'daily', 'school', 'agreements', 'media', 'contract'].includes(st.id)) need.push(['stepHelp', st.id]);
  for (const f of st.fields) {
    const items = f.t === 'rep' ? f.f.map(g => [f.id + '.' + g.id, g]) : [[f.id, f]];
    for (const [id, g] of items) {
      const lk = id === 'p2.has' ? id : id.replace(/^p2\./, 'p1.');
      need.push(['f', lk]);
      if (g.o && !['c.days'].includes(id)) for (const v of g.o) need.push(['opt', lk, v]);
    }
  }
}
for (const a of schema.acks) need.push(['acks', a.id]);
for (const e of ['required', 'email', 'phone', 'zip', 'date', 'dobFuture', 'dobOld', 'startPast', 'startFar', 'time', 'timeOrder', 'long', 'choice', 'type', 'min', 'max', 'nonParent', 'phoneNeeded', 'nlEmail', 'authTelNeeded', 'authEmailNeeded', 'money', 'tooMany', 'upload']) need.push(['err', e]);
const lookupOpt = (L, id, v) => L.o[id]?.[v] ?? L.o._[v] ?? L.o[id.replace(/^p2\./, 'p1.')]?.[v];
const ph = s => (String(s).match(/\{[a-z]+\}/g) || []).sort().join();
for (const [code, L] of Object.entries(langs)) {
  for (const [kind, key, v] of need) {
    let val = kind === 'opt' ? lookupOpt(L, key, v) : L[kind]?.[key];
    if (kind === 'opt' && val === undefined && /^(c\.days|st\.days)$/.test(key)) val = L.o._[v];
    if (val === undefined || String(val).trim() === '') problems.push(`${code}: missing ${kind}.${key}${v ? '.' + v : ''}`);
  }
  for (const k of Object.keys(en.ui)) { if (!L.ui[k]) problems.push(`${code}: missing ui.${k}`); else if (ph(L.ui[k]) !== ph(en.ui[k])) problems.push(`${code}: placeholder mismatch ui.${k}`); }
  for (const k of Object.keys(L.ui)) if (!(k in en.ui)) problems.push(`${code}: extra ui.${k}`);
  // 1.3.0: every contract section has a title, and final sections carry the same number of paragraphs as English
  const { CONTRACT } = await import('./agreements.mjs');
  if (!L.ct?.title) problems.push(`${code}: missing ct.title`);
  for (const sec of CONTRACT.sections) {
    const a = L.ct?.[sec.id], e = en.ct[sec.id];
    if (!a?.title) problems.push(`${code}: missing ct.${sec.id}.title`);
    if (sec.status === 'final' && (!Array.isArray(a?.p) || a.p.length !== e.p.length || a.p.some(x => !String(x).trim()))) problems.push(`${code}: ct.${sec.id}.p must have ${e.p?.length} paragraphs`);
    if (sec.status !== 'final' && a?.p) problems.push(`${code}: pending section ct.${sec.id} must not carry wording`);
  }
  if (code !== 'en' && L.dir !== (code === 'ar' ? 'rtl' : 'ltr')) problems.push(`${code}: bad dir`);
}
console.log(problems.length ? problems.join('\n') : 'i18n OK: ' + Object.keys(langs).join(', ') + ' cover ' + need.length + ' keys');
process.exit(problems.length ? 1 : 0);

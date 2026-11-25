// Portable (browser + Deno + Node) schema engine: conditions, shown/required evaluation, validation, normalisation.
// The SAME file validates in the browser and on the server, so client and server can never disagree.
export const PHONE_RE = /^\+?[0-9 ().\-]{7,32}$/;
export const EMAIL_RE = /^[^\s@<>()[\],;:"\\]+@[^\s@<>()[\],;:"\\]+\.[^\s@<>()[\],;:"\\]{2,}$/;
export const digits = s => String(s ?? '').replace(/\D/g, '');
export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
export const MONEY_RE = /^\$?\s?(\d{1,3})(\.\d{1,2})?$/; // weekly copayment as reported by the parent: 0–999.99

export function evalCond(c, d, schema) {
  if (c === undefined || c === null || c === 0 || c === false) return false;
  if (c === 1 || c === true) return true;
  const [op, a, b] = c;
  switch (op) {
    case 'eq': return d[a] === b;
    case 'has': return Array.isArray(d[a]) && d[a].includes(b);
    case 'all': return c.slice(1).every(x => evalCond(x, d, schema));
    case 'any': return c.slice(1).some(x => evalCond(x, d, schema));
    case 'not': return !evalCond(a, d, schema);
    case 'fn': return evalCond(schema.fns[a], d, schema);
    case 'cfg': return Boolean(schema.cfg && schema.cfg[a]); // server-side switch shipped inside the schema (agreements.mjs)
    default: throw new Error('bad condition ' + op);
  }
}

export const stepShown = (st, d, schema) => st.s === undefined || evalCond(st.s, d, schema);
export const fieldShown = (f, d, schema) => f.s === undefined || evalCond(f.s, d, schema);
export const fieldRequired = (f, d, schema) => f.r !== undefined && evalCond(f.r, d, schema);

const parseDate = v => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v || ''); if (!m) return null; const dt = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])); return dt.getUTCMonth() === +m[2] - 1 && dt.getUTCDate() === +m[3] ? dt : null; };
const todayUTC = t => parseDate(t) || new Date();
const empty = v => v === undefined || v === null || (typeof v === 'string' && v.trim() === '') || (Array.isArray(v) && v.length === 0);

export function checkValue(f, v, d, today) {
  if (empty(v)) return null;
  if (f.t === 'text' || f.t === 'textarea' || f.t === 'textna') { if (typeof v !== 'string') return 'type'; if (f.x && v.length > f.x) return 'long'; }
  if (f.t === 'radio' || f.t === 'select') { if (!f.o.includes(v)) return 'choice'; }
  if (f.t === 'checks') { if (!Array.isArray(v) || v.some(x => !f.o.includes(x))) return 'choice'; }
  if (f.t === 'check') { if (typeof v !== 'boolean') return 'type'; }
  if (f.t === 'upload') { if (!Array.isArray(v) || v.some(x => typeof x !== 'string' || !UUID_RE.test(x))) return 'type'; if (new Set(v).size !== v.length) return 'type'; if (v.length > (f.max || 1)) return 'tooMany'; }
  if (f.v === 'money') { if (typeof v !== 'string' || !MONEY_RE.test(v.trim())) return 'money'; }
  if (f.t === 'state') { if (!/^[A-Z]{2}$/.test(v)) return 'choice'; }
  if (f.t === 'email' || f.v === 'email') { if (typeof v !== 'string' || v.length > 254 || !EMAIL_RE.test(v.trim())) return 'email'; }
  if (f.t === 'tel' || f.v === 'phone') { if (!PHONE_RE.test(v) || digits(v).length < 10 || digits(v).length > 15) return 'phone'; }
  if (f.v === 'zip') { if (!/^\d{5}(-\d{4})?$/.test(v)) return 'zip'; }
  if (f.t === 'date') {
    const dt = parseDate(v); if (!dt) return 'date';
    const t = todayUTC(today);
    if (f.v === 'dob') { const y = new Date(Date.UTC(t.getUTCFullYear() - 19, t.getUTCMonth(), t.getUTCDate())); if (dt > t) return 'dobFuture'; if (dt < y) return 'dobOld'; }
    if (f.v === 'future') { const max = new Date(Date.UTC(t.getUTCFullYear() + 2, t.getUTCMonth(), t.getUTCDate())); if (dt < t) return 'startPast'; if (dt > max) return 'startFar'; }
  }
  if (f.t === 'time') { if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(v)) return 'time'; if (f.v?.startsWith('after:')) { const o = d[f.v.slice(6)]; if (o && /^\d\d:\d\d$/.test(o) && v <= o) return 'timeOrder'; } }
  return null;
}

// returns { errors: {path: code}, shownIds:Set } ; path for repeaters = "ec[0].name"
export function settle(data, schema) {
  // Drop answers to hidden fields until stable, so stale answers can never drive visible logic.
  let cur = data;
  for (let i = 0; i < 6; i++) { const nx = normalise(cur, schema); if (JSON.stringify(nx) === JSON.stringify(cur)) return nx; cur = nx; }
  return cur;
}

export function validate(raw, schema, { today } = {}) {
  const data = settle(raw, schema);
  const errors = {};
  for (const st of schema.steps) {
    if (!stepShown(st, data, schema)) continue;
    for (const f of st.fields) {
      if (!fieldShown(f, data, schema)) continue;
      if (f.t === 'rep') {
        const rows = Array.isArray(data[f.id]) ? data[f.id] : [];
        if (rows.length < (f.min || 0)) errors[f.id] = 'min';
        if (rows.length > f.max) errors[f.id] = 'max';
        rows.slice(0, f.max).forEach((row, i) => {
          for (const g of f.f) {
            const p = f.id + '[' + i + '].' + g.id;
            const v = row?.[g.id];
            if (g.r !== undefined && evalCond(g.r, row || {}, schema) && empty(v)) errors[p] = 'required';
            else { const e = checkValue(g, v, row || {}, today); if (e) errors[p] = e; }
          }
        });
        continue;
      }
      const v = data[f.id];
      if (fieldRequired(f, data, schema) && (f.t === 'check' ? v !== true : empty(v))) { errors[f.id] = 'required'; continue; }
      const e = checkValue(f, v, data, today); if (e) errors[f.id] = e;
    }
  }
  // cross-field rules
  const shown = id => { for (const st of schema.steps) for (const f of st.fields) if (f.id === id) return stepShown(st, data, schema) && fieldShown(f, data, schema); return false; };
  if (shown('ec')) {
    // At least one QUALIFYING emergency contact: an adult (18+), able to take responsibility, who is not a parent/guardian on this application.
    const rows = Array.isArray(data.ec) ? data.ec : [];
    const norm = x => String(x ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
    const parentNames = [data['p1.name'], data['p2.has'] === 'yes' ? data['p2.name'] : ''].map(norm).filter(Boolean);
    const parentRel = /^(mother|father|parent|guardian|mom|dad|stepmother|stepfather|madre|padre|mère|père|mere|pere|أم|أب|الأم|الأب|mama|baba|mzazi|mlezi)$/i;
    const qualifies = r => r && r.adult === 'yes' && r.canResp === 'yes' && !parentRel.test(norm(r.rel)) && !parentNames.includes(norm(r.name));
    if (rows.length && !rows.some(qualifies)) errors.ec = 'nonParent';
  }
  // Phone is the chosen contact method → a valid cell or home number is required (the child's home phone counts when "same as" is ticked).
  for (const p of ['p1', 'p2']) {
    if (p === 'p2' && data['p2.has'] !== 'yes') continue;
    if (data[p + '.contactPath'] !== 'phone') continue;
    const ok = v => typeof v === 'string' && !empty(v) && !checkValue({ t: 'tel', v: 'phone' }, v, data);
    const home = data[p + '.sameHome'] === true ? data['c.phone'] : data[p + '.home'];
    if (!ok(data[p + '.cell']) && !ok(home)) errors[p + '.cell'] = 'phoneNeeded';
  }
  if (shown('p2.has') && data['p2.has'] === 'yes') { /* parent 2 block validated through shown() above */ }
  return { errors };
}

// Drop values for fields that are not shown (stale conditional answers) and anything not in the schema.
export function normalise(data, schema) {
  const out = {};
  for (const st of schema.steps) {
    if (!stepShown(st, data, schema)) continue;
    for (const f of st.fields) {
      if (!fieldShown(f, data, schema)) continue;
      const v = data[f.id];
      if (f.t === 'rep') { out[f.id] = (Array.isArray(v) ? v : []).slice(0, f.max).map(row => Object.fromEntries(f.f.filter(g => row?.[g.id] !== undefined && row[g.id] !== '').map(g => [g.id, typeof row[g.id] === 'string' ? row[g.id].trim() : row[g.id]]))); continue; }
      if (empty(v) && f.t !== 'check') continue;
      out[f.id] = typeof v === 'string' ? v.trim() : v;
    }
  }
  return out;
}

export const visibleAcks = (data, schema) => schema.acks.filter(a => a.s === undefined || evalCond(a.s, data, schema));

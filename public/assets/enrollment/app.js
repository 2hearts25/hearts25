// Child enrollment application (form 1.3.0-E2). Multi-step, five languages, finger or typed signature, optional document uploads.
// Privacy: answers live ONLY in memory (this tab). Nothing is written to localStorage, sessionStorage, cookies or the URL.
import { validate, settle, stepShown, fieldShown, fieldRequired, visibleAcks } from './core.js';
import { CONTRACT, POLICIES } from './agreements.js';
import { contractView } from './evidence.js';
import { sniff, extOf, TYPES, ACCEPT, MAX_FILE_BYTES } from './file-check.js';

const PUBLIC_KEY = '__H2H_PUBLIC_ANON_KEY__';
const root = document.getElementById('enroll-app');
const ENDPOINT = root.dataset.endpoint;
const FORM_VERSION = root.dataset.version;
const LANGS = ['en', 'es', 'fr', 'ar', 'sw'];
const NATIVE = { en: 'English', es: 'Español', fr: 'Français', ar: 'العربية', sw: 'Kiswahili' };
const STATES = 'AL AK AZ AR CA CO CT DE DC FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY'.split(' ');
const IDLE_MS = 15 * 60 * 1000, IDLE_WARN_S = 60;
const SIG_W = 600, SIG_H = 200, MIN_INK = 160;

let schema = null;
let documentLibrary = {};
const trCache = {};
let lang = LANGS.includes(root.dataset.lang) ? root.dataset.lang : 'en';
let tr = null;
const fresh = () => ({ uploads: [], uploadToken: null, uploadsOff: false, data: {}, acks: {}, sig: { parent1: blankSig(), parent2: blankSig() }, parent2Mode: null, stepId: 'intro', errors: {}, summary: null, returnToReview: false, key: crypto.randomUUID(), submitting: false, confirmReset: false, notice: '' });
const blankSig = () => ({ mode: matchMedia('(pointer: coarse)').matches ? 'draw' : 'type', name: '', relation: '', strokes: [], ink: 0, png: '', typedAck: false });
let S = fresh();
let done = false;

// ---------- helpers ----------
function h(tag, attrs = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === null || v === false) continue;
    if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
    else if (k === 'class') el.className = v;
    else if (k === 'text') el.textContent = v;
    else if (v === true) el.setAttribute(k, '');
    else el.setAttribute(k, v);
  }
  for (const kid of kids.flat()) if (kid !== null && kid !== undefined && kid !== false) el.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
  return el;
}
const t = (k, vars = {}) => String(tr.ui[k] ?? k).replace(/\{(\w+)\}/g, (_, n) => vars[n] ?? '');
const lk = id => (id.startsWith('p2.') && id !== 'p2.has' ? 'p1.' + id.slice(3) : id);
const labelOf = (id, sub) => tr.f[sub ? id + '.' + sub : lk(id)] ?? id;
const optLabel = (id, v) => tr.o[lk(id)]?.[v] ?? tr.o._?.[v] ?? v;
const route = slug => '/' + (lang === 'en' ? '' : lang + '/') + slug + '/';
const library = () => documentLibrary[lang];
const easternToday = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(new Date());
const addYears = (iso, n) => { const [y, m, d] = iso.split('-').map(Number); return new Date(Date.UTC(y + n, m - 1, d)).toISOString().slice(0, 10); };
const visibleSteps = () => schema.steps.filter(s => stepShown(s, S.data, schema));
const stepDef = id => schema.steps.find(s => s.id === id);
const isDirty = () => Object.keys(S.data).length > 0 || S.sig.parent1.name || S.sig.parent1.strokes.length;
const msg = k => tr.err[k] ?? tr.err.type;
const fmtDate = v => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v || ''); if (!m) return v; try { return new Intl.DateTimeFormat(lang === 'ar' ? 'ar-u-nu-latn' : lang, { timeZone: 'UTC', dateStyle: 'medium' }).format(new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]))); } catch { return v; } };
const fmtTime = v => { const m = /^(\d\d):(\d\d)$/.exec(v || ''); if (!m) return v; try { return new Intl.DateTimeFormat(lang === 'ar' ? 'ar-u-nu-latn' : lang, { timeZone: 'UTC', timeStyle: 'short' }).format(new Date(Date.UTC(2000, 0, 1, +m[1], +m[2]))); } catch { return v; } };

function showValue(f, v, id = f.id) {
  if (v === undefined || v === null || v === '' || (Array.isArray(v) && !v.length)) return null;
  switch (f.t) {
    case 'check': return v ? t('yes') : t('no');
    case 'radio': case 'select': return optLabel(id, v);
    case 'checks': return v.map(x => optLabel(id, x)).join(', ');
    case 'state': return v;
    case 'date': return fmtDate(v);
    case 'time': return fmtTime(v);
    case 'textna': return v === 'N/A' ? t('na') : v;
    case 'upload': return v.length + ' × ' + t('upDone');
    default: return String(v);
  }
}

// ---------- i18n / loading ----------
async function loadLang(code) {
  if (!trCache[code]) {
    const r = await fetch(`/assets/enrollment/i18n/${code}.json`);
    if (!r.ok) throw new Error('i18n');
    trCache[code] = await r.json();
  }
  tr = trCache[code];
  lang = code;
  root.setAttribute('lang', code);
  root.setAttribute('dir', tr.dir || 'ltr');
}
async function boot() {
  try {
    try {
      const response = await fetch('/assets/enrollment/document-links.json');
      if (response.ok) documentLibrary = (await response.json()) ?? {};
    } catch { /* Document references are optional for the application to load. */ }
    const r = await fetch('/assets/enrollment/schema.json'); if (!r.ok) throw new Error('schema');
    schema = await r.json();
    await loadLang(lang);
    render();
  } catch {
    root.replaceChildren(h('p', { class: 'loading', role: 'alert' }, 'We could not load the application. Please reload this page or call (216) 938-6771 and we will help you register.'));
  }
}

// ---------- state changes ----------
function refresh(focusId) {
  render();
  if (focusId) { const el = document.getElementById(focusId); if (el) el.focus({ preventScroll: true }); }
}
function goto(stepId, { focus = true } = {}) {
  S.stepId = stepId; S.errors = {}; S.summary = null; S.confirmReset = false;
  render({ focusHeading: focus });
}
function clearAll(noticeKey) {
  S = fresh(); done = false;
  if (noticeKey) S.notice = t(noticeKey);
  render({ focusHeading: true });
  S.notice = '';
}

// ---------- field rendering ----------
let uid = 0;
function reqMark(on) { return on ? h('span', { class: 'req', 'aria-hidden': 'true' }, ' *') : null; }
function errNode(key, id) { const code = S.errors[key]; return code ? h('p', { class: 'err', id: 'err-' + id }, msg(code)) : null; }

// get/set operate on the container (top-level data or one repeater row)
function control(f, { get, set, ctx, path, cond }) {
  const id = 'f-' + path.replace(/[^\w]/g, '-');
  const key = path;
  const err = errNode(key, id);
  const invalid = !!err;
  const required = f.r !== undefined && (cond ? cond(f.r) : fieldRequired(f, S.data, schema));
  const label = ctx.label;
  const describedBy = invalid ? 'err-' + id : undefined;
  const text = (type, extra = {}) => h('div', { class: 'field' },
    h('label', { for: id }, label, reqMark(required)),
    (type === 'textarea' ? h('textarea', { id, maxlength: f.x, rows: 4, dir: 'auto' }, get() ?? '') : h('input', { id, type, maxlength: f.x, autocomplete: f.ac && f.ac !== 'off' ? f.ac : (f.ac === 'off' ? 'off' : undefined), dir: ['email', 'tel', 'date', 'time'].includes(type) ? 'ltr' : 'auto', value: get() ?? '', ...extra })),
    err);
  const wire = el => {
    el.addEventListener(el.tagName === 'SELECT' ? 'change' : 'input', e => { set(e.target.value); if (S.errors[key]) { delete S.errors[key]; e.target.removeAttribute('aria-invalid'); document.getElementById('err-' + id)?.remove(); } });
    if (invalid) { el.setAttribute('aria-invalid', 'true'); el.setAttribute('aria-describedby', describedBy); }
    if (required) el.setAttribute('aria-required', 'true');
    return el;
  };
  switch (f.t) {
    case 'text': case 'textarea': case 'email': case 'tel': {
      const type = f.t === 'tel' ? 'tel' : f.t === 'email' ? 'email' : f.t;
      const wrap = text(type === 'text' ? 'text' : type, f.t === 'tel' ? { inputmode: 'tel' } : f.t === 'email' ? { inputmode: 'email', autocapitalize: 'off', spellcheck: 'false' } : {});
      wire(wrap.querySelector('input,textarea')); return wrap;
    }
    case 'date': {
      const today = easternToday();
      const extra = f.v === 'dob' ? { min: addYears(today, -19), max: today } : f.v === 'future' ? { min: today, max: addYears(today, 2) } : {};
      const wrap = text('date', extra); wire(wrap.querySelector('input')); return wrap;
    }
    case 'time': { const wrap = text('time'); wire(wrap.querySelector('input')); return wrap; }
    case 'textna': {
      const isNA = get() === 'N/A';
      const input = h('input', { id, type: 'text', maxlength: f.x, dir: 'auto', value: isNA ? '' : (get() ?? ''), disabled: isNA });
      wire(input);
      const na = h('label', { class: 'opt' }, h('input', { type: 'checkbox', id: id + '-na', checked: isNA, onchange: e => { set(e.target.checked ? 'N/A' : ''); refresh(id + '-na'); } }), h('span', {}, t('na')));
      return h('div', { class: 'field' }, h('label', { for: id }, label, reqMark(required)), input, na, err);
    }
    case 'select': case 'state': {
      const opts = f.t === 'state' ? STATES.map(s => [s, s]) : f.o.map(v => [v, optLabel(ctx.optId, v)]);
      const sel = h('select', { id }, h('option', { value: '' }, t('choose')), opts.map(([v, l]) => h('option', { value: v, selected: get() === v }, l)));
      wire(sel);
      sel.addEventListener('change', () => refresh(id));
      return h('div', { class: 'field' }, h('label', { for: id }, label, reqMark(required)), sel, err);
    }
    case 'radio': {
      const name = 'r-' + (++uid);
      return h('fieldset', { class: 'field', 'aria-describedby': describedBy, 'aria-required': required ? 'true' : undefined },
        h('legend', {}, label, reqMark(required)),
        f.o.map(v => h('label', { class: 'opt' }, h('input', { type: 'radio', name, id: id + '-' + v, value: v, checked: get() === v, onchange: () => { set(v); delete S.errors[key]; refresh(id + '-' + v); } }), h('span', {}, optLabel(ctx.optId, v)))),
        err);
    }
    case 'checks': {
      const cur = Array.isArray(get()) ? get() : [];
      return h('fieldset', { class: 'field', 'aria-describedby': describedBy },
        h('legend', {}, label, reqMark(required), ' ', h('span', { class: 'muted' }, t('bothAbove'))),
        f.o.map(v => h('label', { class: 'opt' }, h('input', { type: 'checkbox', id: id + '-' + v, value: v, checked: cur.includes(v), onchange: e => { const now = new Set(Array.isArray(get()) ? get() : []); e.target.checked ? now.add(v) : now.delete(v); set(f.o.filter(x => now.has(x))); delete S.errors[key]; refresh(id + '-' + v); } }), h('span', {}, optLabel(ctx.optId, v)))),
        err);
    }
    case 'check': {
      return h('div', { class: 'field' }, h('label', { class: 'opt' }, h('input', { type: 'checkbox', id, checked: get() === true, 'aria-invalid': invalid ? 'true' : undefined, 'aria-describedby': describedBy, onchange: e => { set(e.target.checked); delete S.errors[key]; refresh(id); } }), h('span', {}, label, reqMark(required))), err);
    }
    case 'upload': return uploadControl(f, { label, err, required, id });
    default: return h('div');
  }
}

// ---------- optional document uploads (1.3.0) ----------
// Files go straight from this tab to the enrollment function, which validates the real bytes, encrypts them and stores them
// privately. Nothing is kept in browser storage. Only server-issued ids are part of the answers.
const fmtSize = n => n >= 1048576 ? (n / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB';
const upEndpoint = p => ENDPOINT.replace(/\/+$/, '') + '/upload/' + p;
const authHeaders = () => ({ apikey: PUBLIC_KEY, Authorization: 'Bearer ' + PUBLIC_KEY });
async function uploadToken() {
  if (S.uploadToken) return S.uploadToken;
  const r = await fetch(upEndpoint('session'), { method: 'POST', headers: { ...authHeaders(), 'Content-Type': 'application/json' }, body: '{}', signal: AbortSignal.timeout(20000) });
  if (r.status === 503) { S.uploadsOff = true; throw new Error('off'); }
  if (!r.ok) throw new Error('session');
  S.uploadToken = (await r.json()).token; return S.uploadToken;
}
function sendFile(item, token) {
  return new Promise(resolve => {
    const x = new XMLHttpRequest();
    x.open('POST', upEndpoint('file'));
    for (const [k, v] of Object.entries({ ...authHeaders(), 'Content-Type': 'application/octet-stream', 'x-upload-token': token, 'x-upload-category': item.cat, 'x-upload-name': encodeURIComponent(item.name) })) x.setRequestHeader(k, v);
    if (item.replaces) x.setRequestHeader('x-upload-replaces', item.replaces);
    x.upload.onprogress = e => { if (e.lengthComputable) { item.progress = Math.round(e.loaded / e.total * 100); const el = document.getElementById('upp-' + item.key); if (el) { el.value = item.progress; el.nextSibling.textContent = t('upUploading', { p: item.progress }); } } };
    x.onload = () => { let j = {}; try { j = JSON.parse(x.responseText); } catch { /* ignore */ } resolve({ status: x.status, body: j }); };
    x.onerror = x.ontimeout = () => resolve({ status: 0, body: {} });
    x.timeout = 120000; x.send(item.file);
  });
}
const failText = (status, code) => status === 413 || code === 'size' ? 'upTooBig' : code === 'type' || code === 'ext' ? 'upBadType' : status === 422 ? 'upRejected' : status === 409 && /limit/.test(code || '') ? 'upTooMany' : status === 503 ? 'upUnavailable' : 'upFailed';
async function startUpload(item) {
  item.status = 'uploading'; item.progress = 0; item.error = ''; refresh();
  let tries = 0;
  while (tries++ < 2) {
    let token; try { token = await uploadToken(); } catch { item.status = 'failed'; item.error = S.uploadsOff ? 'upUnavailable' : 'upFailed'; refresh(); return; }
    const r = await sendFile(item, token);
    if (r.status === 401 || r.status === 410) { S.uploadToken = null; continue; } // session expired: get a fresh one once
    if ((r.status === 200 || r.status === 201) && r.body.id) {
      item.status = 'done'; item.id = r.body.id; item.file = null;
      const cur = new Set(Array.isArray(S.data[item.field]) ? S.data[item.field] : []); if (item.replaces) cur.delete(item.replaces); cur.add(item.id);
      S.data[item.field] = [...cur]; if (item.replaces) S.uploads = S.uploads.filter(u => u.id !== item.replaces || u === item);
      delete S.errors[item.field]; refresh(); return;
    }
    item.status = 'failed'; item.error = failText(r.status, r.body.error); if (r.status === 503) S.uploadsOff = true; refresh(); return;
  }
  item.status = 'failed'; item.error = 'upFailed'; refresh();
}
async function addFiles(f, files, replaces) {
  for (const file of files) {
    const item = { key: crypto.randomUUID(), field: f.id, cat: f.cat, name: file.name || 'photo.jpg', size: file.size, file, status: 'checking', progress: 0, replaces: replaces || null };
    const live = S.uploads.filter(u => u.field === f.id && u.status !== 'failed' && u.id !== replaces).length;
    if (live >= f.max) { item.status = 'failed'; item.error = 'upTooMany'; item.file = null; S.uploads.push(item); continue; }
    S.uploads.push(item);
    if (file.size > MAX_FILE_BYTES) { item.status = 'failed'; item.error = 'upTooBig'; item.file = null; continue; }
    const head = new Uint8Array(await file.slice(0, 16).arrayBuffer());
    const mime = sniff(head), ext = extOf(item.name);
    if (!mime || (ext && !TYPES[mime].includes(ext))) { item.status = 'failed'; item.error = 'upBadType'; item.file = null; continue; }
    startUpload(item);
  }
  refresh();
}
async function removeUpload(item) {
  S.uploads = S.uploads.filter(u => u !== item);
  if (item.id) { S.data[item.field] = (S.data[item.field] || []).filter(x => x !== item.id); if (!S.data[item.field].length) delete S.data[item.field];
    fetch(upEndpoint('remove'), { method: 'POST', headers: { ...authHeaders(), 'Content-Type': 'application/json' }, body: JSON.stringify({ token: S.uploadToken, id: item.id }) }).catch(() => {}); }
  refresh();
}
function uploadControl(f, { label, err, required, id }) {
  const items = S.uploads.filter(u => u.field === f.id);
  const live = items.filter(u => u.status !== 'failed').length;
  const pickers = [];
  const picker = (capture, replaces) => {
    const input = h('input', { type: 'file', accept: capture ? 'image/jpeg,image/png' : ACCEPT, capture: capture ? 'environment' : undefined, multiple: !capture && !replaces && f.max > 1 ? true : undefined, hidden: true, tabindex: '-1', 'aria-hidden': 'true',
      onchange: e => { const files = [...e.target.files].slice(0, replaces ? 1 : f.max - live); e.target.value = ''; if (files.length) addFiles(f, files, replaces); } });
    pickers.push(input); return input;
  };
  const off = S.uploadsOff;
  const list = h('ul', { class: 'uploads', 'aria-live': 'polite' }, items.map(u => h('li', { class: 'upload ' + u.status },
    h('span', { class: 'upname', dir: 'auto' }, u.name), h('span', { class: 'muted' }, ' · ' + fmtSize(u.size)),
    u.status === 'uploading' ? h('div', { class: 'upprog' }, h('progress', { id: 'upp-' + u.key, max: 100, value: u.progress }), h('span', { class: 'muted' }, t('upUploading', { p: u.progress }))) : null,
    u.status === 'done' ? h('span', { class: 'upok' }, ' ✓ ' + t('upDone')) : null,
    u.status === 'failed' ? h('p', { class: 'err', role: 'alert' }, t(u.error || 'upFailed')) : null,
    h('span', { class: 'upactions' },
      u.status === 'failed' && u.file ? h('button', { type: 'button', class: 'linkish', onclick: () => startUpload(u) }, t('upRetry')) : null,
      u.status === 'done' ? (() => { const r = picker(false, u.id); return h('button', { type: 'button', class: 'linkish', onclick: () => r.click() }, t('upReplace')); })() : null,
      u.status !== 'uploading' ? h('button', { type: 'button', class: 'linkish', onclick: () => removeUpload(u) }, t('upRemove')) : null))));
  const cam = picker(true), choose = picker(false);
  const canAdd = !off && live < f.max;
  return h('div', { class: 'field upload-field', id },
    h('p', { class: 'uplabel' }, label, required ? reqMark(true) : h('span', { class: 'muted' }, ' — ' + t('optional'))),
    list,
    canAdd ? h('div', { class: 'upbuttons' },
      h('button', { type: 'button', class: 'button secondary', onclick: () => cam.click() }, '📷 ' + t('upTake')),
      h('button', { type: 'button', class: 'button secondary', onclick: () => choose.click() }, t('upChoose'))) : null,
    off ? h('p', { class: 'notice' }, t('upUnavailable')) : live >= f.max ? h('p', { class: 'muted' }, t('upTooMany')) : h('p', { class: 'muted' }, t('upHint')),
    pickers, err);
}
const uploadsBusy = () => S.uploads.some(u => u.status === 'uploading' || u.status === 'checking');

// ---------- Parent/Provider Contract (1.3.0): the last step before Review and Sign ----------
function contractBlock() {
  const v = contractView(tr, S.data);
  return h('section', { class: 'contract', 'aria-labelledby': 'ct-h' },
    h('h3', { id: 'ct-h' }, v.title), h('p', { class: 'muted' }, t('ctVersion', { v: v.version })),
    v.sections.map(sec => h('section', { class: 'policy ct-' + sec.status, 'aria-label': sec.title },
      h('h4', {}, sec.title, ' ', h('span', { class: 'badge ' + sec.status }, sec.label)),
      sec.note ? h('p', { class: 'muted' }, sec.note) : null,
      sec.paragraphs.map(p => h('p', {}, p)))));
}
function withdrawalBlock() {
  const doc = library()?.documents.find(d => d.id === POLICIES.withdrawal.id);
  return h('section', { class: 'policy', 'aria-labelledby': 'wt-h' }, h('h3', { id: 'wt-h' }, t('wtHeading')),
    h('p', { class: 'muted' }, t('wtMeta', { r: POLICIES.withdrawal.revision, d: fmtDate(POLICIES.withdrawal.effectiveDate) })),
    doc ? documentReference(doc) : null, h('p', {}, t('wtLead')), h('p', { class: 'muted' }, t('wtHelp')));
}

function repeater(f) {
  const rows = Array.isArray(S.data[f.id]) ? S.data[f.id] : (S.data[f.id] = f.min ? [{}] : []);
  if (!rows.length && f.min) rows.push({});
  const box = h('div', { class: 'repeater' });
  const topErr = S.errors[f.id] ? h('p', { class: 'err', role: 'alert' }, msg(S.errors[f.id])) : null;
  rows.forEach((row, i) => {
    const title = t(f.id === 'ec' ? 'contact' : 'person', { n: i + 1 });
    const card = h('section', { class: 'card', 'aria-label': title },
      h('h3', {}, title, rows.length > f.min ? h('button', { type: 'button', class: 'linkish', onclick: () => { rows.splice(i, 1); refresh(); } }, t('remove')) : null));
    for (const g of f.f) {
      const cond = c => evalRow(c, row);
      if (g.s !== undefined && !evalRow(g.s, row)) continue;
      card.append(control(g, { get: () => row[g.id], set: v => { row[g.id] = v; }, ctx: { label: labelOf(f.id, g.id), optId: f.id + '.' + g.id }, path: `${f.id}[${i}].${g.id}`, cond }));
    }
    box.append(card);
  });
  const addBtn = rows.length < f.max ? h('button', { type: 'button', class: 'button secondary', onclick: () => { rows.push({}); refresh(); } }, t(f.id === 'ec' ? 'addContact' : 'addPickup')) : null;
  return h('div', {}, topErr, box, addBtn);
}
// repeater rows only use eq/all/any/not on their own row fields
function evalRow(c, row) {
  if (c === 1 || c === true) return true; if (!c) return false;
  const [op, a, b] = c;
  if (op === 'eq') return row[a] === b;
  if (op === 'all') return c.slice(1).every(x => evalRow(x, row));
  if (op === 'any') return c.slice(1).some(x => evalRow(x, row));
  if (op === 'not') return !evalRow(a, row);
  return false;
}

// Management-approved Absent Days and Attendance Policy (1.2.1). Shown in full above its acknowledgment.
function absencePolicy() {
  return h('section', { class: 'policy', 'aria-labelledby': 'abs-h' }, h('h3', { id: 'abs-h' }, t('absenceTitle')), h('p', {}, t('absP1')), h('p', {}, t('absP2')),
    h('h4', {}, t('absH1')), h('p', {}, t('absP3')), h('p', {}, t('absP4')), h('p', {}, t('absP5')), h('h4', {}, t('absH2')), h('p', {}, t('absP6')), h('p', {}, t('absP7')));
}
function diaperingText() {
  return h('section', { class: 'policy', 'aria-labelledby': 'dp-h' }, h('h3', { id: 'dp-h' }, t('dpH')), h('p', {}, t('dpP1')), h('p', {}, t('dpP2')), h('p', {}, t('dpP3')), h('p', {}, t('dpP4')));
}
function portalLink() {
  const ui = library()?.ui;
  return ui ? h('a', { href: route('parent-portal'), target: '_blank', rel: 'noopener noreferrer',
    'aria-label': `${ui.title} (${ui.newTab})` }, ui.title) : null;
}
function documentReference(document, showTitle = false) {
  const { ui } = library();
  const actions = ['view', 'download'].map(action => h('a', { href: document[action], target: '_blank', rel: 'noopener noreferrer',
    'aria-label': `${ui[action]} — ${document.title}${action === 'view' ? ' (' + ui.newTab + ')' : ''}` }, ui[action]));
  return h('div', { class: 'enrollment-document', 'data-document': document.id }, showTitle ? h('strong', {}, document.title) : null,
    document.view ? [h('p', { class: 'portal-metadata' }, document.metadata), h('div', { class: 'portal-actions' }, actions)]
      : h('p', { class: 'portal-pending' }, ui.pending));
}
function fieldsFor(step) {
  const out = [];
  for (const f of step.fields) {
    if (!fieldShown(f, S.data, schema)) continue;
    if (step.id === 'contract' && f.id === 'pf.auth') out.push(h('h3', {}, t('pfHeading')), h('p', { class: 'help' }, t('pfLead')));
    if (step.id === 'agreements' && f.id === 'ag.wt') out.push(withdrawalBlock());
    if (step.id === 'health' && f.id === 'ins.status') out.push(h('h3', {}, t('insHeading')), h('p', { class: 'help' }, t('insLead')));
    if (step.id === 'docs' && f.id === 'up.immun') out.push(h('p', { class: 'notice' }, t('upPrivacy')), h('p', { class: 'muted' }, t('upInsNote')));
    if (step.id === 'agreements' && f.id === 'ag.absenceAck') out.push(absencePolicy());
    if (step.id === 'daily' && f.id === 'po.trained') out.push(diaperingText());
    if (f.t === 'rep') { out.push(h('div', { class: 'field' }, repeater(f))); continue; }
    out.push(control(f, { get: () => S.data[f.id], set: v => { S.data[f.id] = v; }, ctx: { label: labelOf(f.id), optId: f.id }, path: f.id }));
    if (step.id === 'agreements') {
      const document = library()?.documents.find(item => item.registrationField === f.id);
      if (document) out.push(documentReference(document));
    }
  }
  return out;
}

// ---------- validation ----------
function allErrors() { return validate(S.data, schema, { today: easternToday() }).errors; }
function errorsForStep(step, all = allErrors()) {
  const ids = new Set(step.fields.map(f => f.id)), out = {};
  for (const [k, v] of Object.entries(all)) if (ids.has(k.split('[')[0])) out[k] = v;
  return out;
}
function summaryOf(errs, step) {
  const items = [];
  for (const k of Object.keys(errs)) {
    const base = k.split('[')[0]; const f = step.fields.find(x => x.id === base); if (!f) continue;
    let lbl = f.t === 'rep' ? t(f.id === 'ec' ? 'contact' : 'person', { n: (Number((/\[(\d+)\]/.exec(k) || [0, 0])[1]) + 1) }) : labelOf(f.id);
    if (/\.([^.]+)$/.test(k) && f.t === 'rep') lbl += ' — ' + labelOf(f.id, k.split('.').pop());
    items.push({ key: k, id: 'f-' + k.replace(/[^\w]/g, '-'), text: lbl + ': ' + msg(errs[k]) });
  }
  return items;
}

// ---------- steps ----------
function renderIntro() {
  const langSel = h('label', {}, t('language') + ' ', h('select', { id: 'lang-sel', onchange: async e => { await loadLang(e.target.value); render(); document.getElementById('lang-sel')?.focus({ preventScroll: true }); } }, LANGS.map(c => h('option', { value: c, selected: c === lang, lang: c }, NATIVE[c]))));
  return [
    h('h2', { tabindex: '-1', id: 'step-h' }, t('title')),
    h('p', { class: 'help' }, t('lead')),
    [t('intro1'), t('intro2'), t('intro3')].map(x => h('p', {}, x)),
    h('div', { class: 'notice' }, t('intro4'), h('div', { class: 'links' }, h('a', { class: 'button secondary', href: route('tour') }, t('tourLink')), h('a', { class: 'button secondary', href: route('request-information') }, t('infoLink')))),
    h('p', {}, portalLink()),
    h('div', { class: 'field' }, langSel),
    h('div', { class: 'nav' }, h('span', { class: 'spacer' }), h('button', { type: 'button', class: 'button', onclick: () => goto(nextStepId('intro')) }, t('start'))),
  ];
}

function nextStepId(id) { const v = visibleSteps().map(s => s.id); return v[Math.min(v.indexOf(id) + 1, v.length - 1)]; }
function prevStepId(id) { const v = visibleSteps().map(s => s.id); return v[Math.max(v.indexOf(id) - 1, 0)]; }

function renderStep(step) {
  const nodes = [h('h2', { tabindex: '-1', id: 'step-h' }, tr.steps[step.id])];
  if (tr.stepHelp[step.id]) nodes.push(h('p', { class: 'help' }, tr.stepHelp[step.id]));
  if (step.id === 'docs') nodes.push(h('p', { class: 'help' }, t('docsLead')));
  if (step.id === 'emtrans') nodes.push(h('p', { class: 'help' }, t('emLead')), h('p', { class: 'notice' }, t('emNote')));
  if (step.id === 'agreements') {
    nodes.push(h('p', { class: 'notice' }, t('pendingBanner')));
    const documents = library()?.documents.filter(document => document.registrationReview && document.view) ?? [];
    if (documents.length) nodes.push(h('section', { class: 'policy', 'aria-labelledby': 'reference-documents' },
      h('h3', { id: 'reference-documents' }, library().ui.review), documents.map(document => documentReference(document, true)), h('p', {}, portalLink())));
  }
  if (step.id === 'contract') nodes.push(contractBlock());
  if (S.summary) nodes.push(summaryNode(S.summary));
  nodes.push(...fieldsFor(step));
  nodes.push(navRow(step, () => {
    if (uploadsBusy()) { S.summary = [{ id: 'step-h', text: t('upWait') }]; render({ focusSummary: true }); return; }
    const errs = errorsForStep(step);
    if (Object.keys(errs).length) { S.errors = errs; S.summary = summaryOf(errs, step); render({ focusSummary: true }); return; }
    const target = S.returnToReview ? 'review' : nextStepId(step.id); S.returnToReview = false; goto(target);
  }));
  return nodes;
}
function summaryNode(items) {
  return h('div', { class: 'errsum', role: 'alert', tabindex: '-1', id: 'errsum' }, h('strong', {}, t('errorSummary', { n: items.length })), h('ul', {}, items.map(i => h('li', {}, h('a', { href: '#' + i.id, onclick: e => { e.preventDefault(); const el = document.getElementById(i.id) || document.querySelector('[aria-invalid=true]'); el?.focus(); el?.scrollIntoView({ block: 'center' }); } }, i.text)))));
}
function navRow(step, onNext, nextLabel = t('next')) {
  return h('div', { class: 'nav' },
    step.id !== 'child' ? h('button', { type: 'button', class: 'button secondary', onclick: () => { S.returnToReview = false; goto(prevStepId(step.id)); } }, t('back')) : h('button', { type: 'button', class: 'button secondary', onclick: () => goto('intro') }, t('back')),
    h('span', { class: 'spacer' }),
    h('button', { type: 'button', class: 'button', onclick: onNext }, nextLabel));
}

function renderReview(step) {
  const out = [h('h2', { tabindex: '-1', id: 'step-h' }, tr.steps.review), h('p', { class: 'help' }, t('reviewLead')), S.summary ? summaryNode(S.summary) : null];
  const sec = h('div', { class: 'review' });
  for (const st of visibleSteps()) {
    if (!st.fields.length) continue;
    const dl = h('dl');
    for (const f of st.fields) {
      if (!fieldShown(f, S.data, schema)) continue;
      if (f.t === 'rep') {
        (S.data[f.id] || []).forEach((row, i) => {
          dl.append(h('dt', {}, t(f.id === 'ec' ? 'contact' : 'person', { n: i + 1 })));
          const parts = f.f.map(g => { const v = showValue(g, row[g.id], f.id + '.' + g.id); return v === null ? null : labelOf(f.id, g.id) + ': ' + v; }).filter(Boolean);
          dl.append(h('dd', {}, parts.join('\n') || t('notAnswered')));
        });
        continue;
      }
      const v = showValue(f, S.data[f.id]);
      if (v === null && f.r === undefined) continue;
      dl.append(h('dt', {}, labelOf(f.id)), h('dd', { class: v === null ? 'muted' : '' }, v ?? t('notAnswered')));
    }
    sec.append(h('div', { class: 'head' }, h('h3', {}, tr.steps[st.id]), h('button', { type: 'button', class: 'linkish', onclick: () => { S.returnToReview = true; goto(st.id); } }, t('edit'))), dl);
  }
  out.push(sec, navRow(step, () => { const bad = firstInvalidStep(); if (bad) { S.errors = bad.errs; S.summary = summaryOf(bad.errs, bad.step); S.returnToReview = true; render({ focusSummary: true, stepId: bad.step.id }); return; } goto('sign'); }));
  return out;
}
function firstInvalidStep() {
  const all = allErrors();
  for (const st of visibleSteps()) { const errs = errorsForStep(st, all); if (Object.keys(errs).length) return { step: st, errs }; }
  return null;
}

// ---------- signatures ----------
function sigPad(sig, role) {
  const canvas = h('canvas', { class: 'pad', width: SIG_W, height: SIG_H, role: 'img', 'aria-label': t('drawHere') });
  const ctx = canvas.getContext('2d');
  const hint = h('div', { class: 'padhint' }, t('drawHere'));
  const stroke = pts => { ctx.beginPath(); pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); if (pts.length === 1) ctx.lineTo(pts[0][0] + .1, pts[0][1] + .1); ctx.stroke(); };
  const prep = () => { ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, SIG_W, SIG_H); ctx.strokeStyle = '#12204f'; ctx.lineWidth = 3.2; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; };
  prep(); sig.strokes.forEach(stroke); hint.hidden = sig.ink > 0;
  let cur = null;
  const pos = e => { const r = canvas.getBoundingClientRect(); return [Math.round((e.clientX - r.left) * SIG_W / r.width), Math.round((e.clientY - r.top) * SIG_H / r.height)]; };
  canvas.addEventListener('pointerdown', e => { e.preventDefault(); canvas.setPointerCapture(e.pointerId); cur = [pos(e)]; sig.strokes.push(cur); hint.hidden = true; });
  canvas.addEventListener('pointermove', e => { if (!cur) return; const p = pos(e), last = cur[cur.length - 1]; if (p[0] === last[0] && p[1] === last[1]) return; sig.ink += Math.hypot(p[0] - last[0], p[1] - last[1]); cur.push(p); ctx.beginPath(); ctx.moveTo(last[0], last[1]); ctx.lineTo(p[0], p[1]); ctx.stroke(); });
  const end = () => { if (!cur) return; cur = null; sig.png = sig.ink >= MIN_INK ? canvas.toDataURL('image/png') : ''; delete S.errors['sig.' + role]; document.getElementById('err-sig-' + role)?.remove(); };
  canvas.addEventListener('pointerup', end); canvas.addEventListener('pointercancel', end);
  const clear = h('button', { type: 'button', class: 'button secondary', onclick: () => { sig.strokes = []; sig.ink = 0; sig.png = ''; prep(); hint.hidden = false; } }, t('clearSig'));
  return h('div', {}, h('div', { class: 'padwrap' }, canvas, h('div', { class: 'padline' }), hint), h('p', {}, clear));
}
function signerBlock(role, heading) {
  const sig = S.sig[role];
  const p = role === 'parent1' ? 'p1' : 'p2';
  if (!sig.name) sig.name = S.data[p + '.name'] || '';
  if (!sig.relation) sig.relation = S.data[p + '.rel'] || '';
  const modeName = 'mode-' + role;
  const err = S.errors['sig.' + role] ? h('p', { class: 'err', id: 'err-sig-' + role, role: 'alert' }, S.errors['sig.' + role]) : null;
  const typed = sig.mode === 'type';
  return h('section', { class: 'card' },
    h('h3', {}, heading),
    h('div', { class: 'field' }, h('label', { for: 'sn-' + role }, typed ? t('typedName') : t('signerName'), reqMark(true)), h('input', { id: 'sn-' + role, type: 'text', maxlength: 100, dir: 'auto', autocomplete: 'name', value: sig.name, oninput: e => { sig.name = e.target.value; } })),
    h('div', { class: 'field' }, h('label', { for: 'sr-' + role }, t('signerRole'), reqMark(true)), h('input', { id: 'sr-' + role, type: 'text', maxlength: 60, dir: 'auto', value: sig.relation, oninput: e => { sig.relation = e.target.value; } })),
    h('div', { class: 'modes', role: 'radiogroup' },
      ['draw', 'type'].map(m => h('label', { class: 'opt' }, h('input', { type: 'radio', name: modeName, value: m, checked: sig.mode === m, onchange: () => { sig.mode = m; refresh(); } }), h('span', {}, t(m === 'draw' ? 'signModeDraw' : 'signModeType'))))),
    typed
      ? h('div', {}, h('p', { class: 'typedsig', dir: 'auto', 'aria-live': 'polite' }, sig.name || ' '), h('label', { class: 'opt' }, h('input', { type: 'checkbox', id: 'ta-' + role, checked: sig.typedAck, onchange: e => { sig.typedAck = e.target.checked; delete S.errors['sig.' + role]; refresh('ta-' + role); } }), h('span', {}, t('typedAck'), reqMark(true))))
      : sigPad(sig, role),
    h('p', { class: 'muted' }, t('signDate') + ': ' + fmtDate(easternToday())),
    err);
}
function signatureProblem(role) {
  const s = S.sig[role];
  if (!s.name.trim() || s.name.trim().length < 2) return t('sigRequired');
  if (s.mode === 'type') return s.typedAck ? '' : t('sigRequired');
  if (!s.strokes.length) return t('sigRequired');
  return s.png ? '' : t('sigTooSmall');
}

function renderSign(step) {
  const hasP2 = S.data['p2.has'] === 'yes';
  const nodes = [h('h2', { tabindex: '-1', id: 'step-h' }, t('signHeading')), h('p', { class: 'help' }, t('signLead')), S.summary ? summaryNode(S.summary) : null];
  const acks = visibleAcks(S.data, schema);
  for (const a of acks) {
    const id = 'ack-' + a.id;
    nodes.push(h('div', { class: 'field' }, h('label', { class: 'opt' }, h('input', { type: 'checkbox', id, checked: !!S.acks[a.id], 'aria-invalid': S.errors['ack.' + a.id] ? 'true' : undefined, onchange: e => { S.acks[a.id] = e.target.checked; delete S.errors['ack.' + a.id]; refresh(id); } }), h('span', {}, tr.acks[a.id], reqMark(true))), S.errors['ack.' + a.id] ? h('p', { class: 'err' }, msg('required')) : null));
  }
  nodes.push(signerBlock('parent1', hasP2 ? tr.f['p1.name'] ?? 'Parent 1' : t('signHeading')));
  if (hasP2) {
    nodes.push(h('h3', {}, t('parent2Heading')), h('p', { class: 'help' }, t('parent2Lead')));
    nodes.push(h('fieldset', { class: 'field' }, h('legend', {}, t('parent2Heading'), reqMark(true)),
      [['now', 'parent2Now'], ['later', 'parent2Later']].map(([v, k]) => h('label', { class: 'opt' }, h('input', { type: 'radio', name: 'p2mode', id: 'p2m-' + v, value: v, checked: S.parent2Mode === v, onchange: () => { S.parent2Mode = v; delete S.errors.parent2Mode; refresh('p2m-' + v); } }), h('span', {}, t(k)))),
      S.errors.parent2Mode ? h('p', { class: 'err' }, msg('required')) : null));
    if (S.parent2Mode === 'now') nodes.push(signerBlock('parent2', t('parent2Heading')));
  }
  if (S.submitMessage) nodes.push(h('p', { class: 'errsum', role: 'alert' }, S.submitMessage));
  nodes.push(h('div', { class: 'hp', 'aria-hidden': 'true' }, h('label', {}, 'Website', h('input', { type: 'text', name: 'hp', id: 'hp', tabindex: '-1', autocomplete: 'off' }))));
  nodes.push(h('div', { class: 'nav' }, h('button', { type: 'button', class: 'button secondary', onclick: () => goto('review') }, t('back')), h('span', { class: 'spacer' }),
    h('button', { type: 'button', class: 'button', id: 'submit-btn', disabled: S.submitting, onclick: submit }, S.submitting ? t('submitting') : t('submit'))));
  return nodes;
}

// ---------- submit ----------
async function submit() {
  if (S.submitting) return;
  S.submitMessage = '';
  if (uploadsBusy()) { S.submitMessage = t('upWait'); render({ focusSummary: true }); return; }
  const bad = firstInvalidStep();
  if (bad) { S.errors = bad.errs; S.summary = summaryOf(bad.errs, bad.step); S.returnToReview = true; render({ focusSummary: true, stepId: bad.step.id }); return; }
  const errors = {}, items = [];
  const acks = visibleAcks(S.data, schema);
  for (const a of acks) if (!S.acks[a.id]) { errors['ack.' + a.id] = 'required'; items.push({ id: 'ack-' + a.id, text: tr.acks[a.id].slice(0, 60) + '…' }); }
  const hasP2 = S.data['p2.has'] === 'yes';
  const p1 = signatureProblem('parent1'); if (p1) { errors['sig.parent1'] = p1; items.push({ id: 'sn-parent1', text: t('signHeading') + ': ' + p1 }); }
  if (hasP2 && !S.parent2Mode) { errors.parent2Mode = 'required'; items.push({ id: 'p2m-now', text: t('parent2Heading') }); }
  if (hasP2 && S.parent2Mode === 'now') { const p2 = signatureProblem('parent2'); if (p2) { errors['sig.parent2'] = p2; items.push({ id: 'sn-parent2', text: t('parent2Heading') + ': ' + p2 }); } }
  if (Object.keys(errors).length) { S.errors = errors; S.summary = items; render({ focusSummary: true }); return; }

  const body = {
    v: FORM_VERSION, key: S.key, lang, data: settle(S.data, schema), acks: acks.map(a => a.id).filter(id => S.acks[id]), parent2Mode: hasP2 ? S.parent2Mode : 'na',
    signatures: ['parent1', ...(hasP2 && S.parent2Mode === 'now' ? ['parent2'] : [])].map(role => { const s = S.sig[role]; return s.mode === 'draw' ? { role, name: s.name.trim(), relation: s.relation.trim(), method: 'drawn', png: s.png } : { role, name: s.name.trim(), relation: s.relation.trim(), method: 'typed', typedAck: true }; }),
    hp: document.getElementById('hp')?.value || '',
    contractVersion: CONTRACT.version, uploadToken: S.uploadToken || undefined,
  };
  S.submitting = true; render();
  try {
    const r = await fetch(ENDPOINT, { method: 'POST', headers: { 'Content-Type': 'application/json', apikey: PUBLIC_KEY, Authorization: 'Bearer ' + PUBLIC_KEY }, body: JSON.stringify(body), signal: AbortSignal.timeout(30000) });
    if (r.status === 201) {
      const j = await r.json();
      const target = route('registration-received');
      done = true;
      try { sessionStorage.setItem('h2h-confirmation', target); sessionStorage.setItem('h2h-enroll-ref', j.reference || ''); } catch { /* reference is also emailed */ }
      S = fresh(); // drop every answer from memory before leaving
      location.assign(target);
      return;
    }
    S.submitting = false;
    if (r.status === 422) {
      const j = await r.json().catch(() => ({})); const errs = j.errors || {};
      const stepErr = {}; let target = null;
      for (const st of visibleSteps()) { const e = errorsForStep(st, errs); if (Object.keys(e).length) { target = target || { step: st, errs: e }; } }
      if (target) { S.errors = target.errs; S.summary = summaryOf(target.errs, target.step); S.returnToReview = true; render({ focusSummary: true, stepId: target.step.id }); return; }
      S.submitMessage = t('submitFail'); render({ focusSummary: true }); return;
    }
    S.submitMessage = r.status === 429 ? t('submitWait') : r.status === 409 ? t('submitFail') + ' (reload)' : t('submitFail');
    render({ focusSummary: true });
  } catch {
    S.submitting = false; S.submitMessage = t('submitFail'); render({ focusSummary: true });
  }
}

// ---------- chrome: language bar, progress, reset, idle ----------
function chrome(step) {
  const steps = visibleSteps().filter(s => s.id !== 'intro');
  const idx = steps.findIndex(s => s.id === step.id);
  const bar = h('div', { class: 'bar' },
    h('div', { style: undefined }, step.id !== 'intro' ? [h('div', { class: 'meter-label', id: 'meter-l' }, t('progress', { n: idx + 1, m: steps.length })), h('progress', { class: 'meter', max: steps.length, value: idx + 1, 'aria-labelledby': 'meter-l' })] : null),
    step.id !== 'intro' ? h('label', {}, t('language') + ' ', h('select', { id: 'lang-top', onchange: async e => { await loadLang(e.target.value); render(); document.getElementById('lang-top')?.focus({ preventScroll: true }); } }, LANGS.map(c => h('option', { value: c, selected: c === lang, lang: c }, NATIVE[c])))) : null);
  return bar;
}
function resetRow() {
  if (!isDirty()) return null;
  if (S.confirmReset) return h('div', { class: 'notice', role: 'alertdialog', 'aria-label': t('reset') }, t('resetConfirm'), ' ', h('button', { type: 'button', class: 'button', onclick: () => clearAll() }, t('yes')), ' ', h('button', { type: 'button', class: 'button secondary', onclick: () => { S.confirmReset = false; render(); } }, t('cancel')));
  return h('p', {}, h('button', { type: 'button', class: 'linkish', onclick: () => { S.confirmReset = true; render(); } }, t('reset')));
}

function render(opts = {}) {
  if (!schema || !tr || done) return;
  if (opts.stepId) S.stepId = opts.stepId;
  const vis = visibleSteps().map(s => s.id);
  if (!vis.includes(S.stepId)) S.stepId = 'child';
  const step = stepDef(S.stepId);
  const body = step.id === 'intro' ? renderIntro() : step.id === 'review' ? renderReview(step) : step.id === 'sign' ? renderSign(step) : renderStep(step);
  const scrollY = window.scrollY;
  root.replaceChildren(...[S.notice ? h('p', { class: 'notice', role: 'status' }, S.notice) : null, chrome(step), ...body.flat(), step.id !== 'intro' ? resetRow() : null].filter(Boolean));
  if (opts.focusHeading) { document.getElementById('step-h')?.focus(); window.scrollTo({ top: Math.max(0, root.getBoundingClientRect().top + window.scrollY - 16) }); }
  else if (opts.focusSummary) { document.getElementById('errsum')?.focus(); window.scrollTo({ top: Math.max(0, root.getBoundingClientRect().top + window.scrollY - 16) }); }
  else window.scrollTo({ top: scrollY });
  armIdle();
}

// Idle: clear the form after 15 minutes of inactivity (warn for the last 60 seconds).
let idleTimer = null, warnTimer = null, warnEl = null;
function armIdle() {
  clearTimeout(idleTimer); clearInterval(warnTimer); warnEl?.remove(); warnEl = null;
  if (!isDirty() || S.submitting) return;
  idleTimer = setTimeout(() => {
    let left = IDLE_WARN_S;
    warnEl = h('p', { class: 'idle', role: 'alert' }, t('idle', { s: left })); root.prepend(warnEl);
    warnTimer = setInterval(() => { left -= 1; if (left <= 0) { clearInterval(warnTimer); clearAll('idleCleared'); } else if (warnEl) warnEl.textContent = t('idle', { s: left }); }, 1000);
  }, IDLE_MS - IDLE_WARN_S * 1000);
}
for (const ev of ['pointerdown', 'keydown', 'touchstart']) document.addEventListener(ev, () => { if (warnEl || idleTimer) armIdle(); }, { passive: true });
window.addEventListener('pageshow', e => { if (e.persisted) clearAll(); }); // back/forward cache must never resurrect answers
window.addEventListener('beforeunload', e => { if (!done && isDirty() && !S.submitting) { e.preventDefault(); e.returnValue = ''; } });

boot();

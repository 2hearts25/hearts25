// Parent access to the two finalized enrollment PDFs (form 1.3.0-E2). The one-time link arrives by email at the address given
// in the application; the token is in the URL fragment (never sent to any server log), removed from the address bar at once and
// kept only in memory. The child's date of birth is checked by the server before anything is released. No web storage is used.
const PUBLIC_KEY = '__H2H_PUBLIC_ANON_KEY__';
const root = document.getElementById('docs-app');
const ENDPOINT = root.dataset.endpoint.replace(/\/+$/, '');
const lang = root.dataset.lang || 'en';
let token = new URLSearchParams(location.hash.slice(1)).get('t') || '';
if (location.hash) history.replaceState(null, '', location.pathname);
let tr = null;
const h = (tag, attrs = {}, ...kids) => { const el = document.createElement(tag); for (const [k, v] of Object.entries(attrs)) { if (v == null || v === false) continue; if (k.startsWith('on')) el.addEventListener(k.slice(2), v); else if (k === 'text') el.textContent = v; else el.setAttribute(k, v === true ? '' : v); } for (const c of kids.flat()) if (c != null && c !== false) el.append(c.nodeType ? c : document.createTextNode(String(c))); return el; };
const t = k => tr?.ui?.[k] ?? k;
const call = (p, body) => fetch(ENDPOINT + '/access/' + p, { method: 'POST', headers: { 'Content-Type': 'application/json', apikey: PUBLIC_KEY, Authorization: 'Bearer ' + PUBLIC_KEY }, body: JSON.stringify(body), signal: AbortSignal.timeout(30000) });
let dob = '', state = 'ask', message = '', busy = false;

function show() {
  const msg = message ? h('p', { class: state === 'ready' ? 'notice' : 'errsum', role: 'alert' }, message) : null;
  const kids = [h('h1', { tabindex: '-1', id: 'docs-h' }, t('accessTitle'))];
  if (!token) { kids.push(h('p', { class: 'errsum', role: 'alert' }, t('accessNoToken')), h('p', {}, h('a', { href: 'tel:+12169386771' }, '(216) 938-6771'))); root.replaceChildren(...kids); return; }
  if (state === 'ask' || state === 'retry') {
    kids.push(h('p', { class: 'intro' }, t('accessLead')), msg,
      h('div', { class: 'field' }, h('label', { for: 'dob' }, t('accessDob')), h('input', { id: 'dob', type: 'date', dir: 'ltr', value: dob, autocomplete: 'off', oninput: e => { dob = e.target.value; } })),
      h('div', { class: 'nav' }, h('button', { type: 'button', class: 'button', disabled: busy, onclick: open }, t('accessOpen'))));
  } else if (state === 'ready') {
    kids.push(msg, h('div', { class: 'actions' }, ['ohio', 'h2h'].map(d => h('button', { type: 'button', class: 'button', disabled: busy, onclick: () => download(d) }, t(d === 'ohio' ? 'accessOhio' : 'accessH2H')))), h('p', { class: 'muted' }, t('accessKeep')));
  } else if (state === 'expired') {
    kids.push(msg, h('div', { class: 'nav' }, h('button', { type: 'button', class: 'button', disabled: busy, onclick: renew }, t('accessRenew'))));
  } else kids.push(msg);
  root.replaceChildren(...kids);
}
const fail = (code, status) => {
  if (code === 'mismatch') { state = 'retry'; message = t('accessBad'); }
  else if (code === 'locked') { state = 'locked'; message = t('accessLocked'); }
  else if (code === 'expired' || status === 404) { state = 'expired'; message = t('accessExpired'); }
  else if (code === 'not_ready') { state = 'retry'; message = t('accessNotReady'); }
  else { state = 'retry'; message = t('accessError'); }
};
async function open() {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dob)) { message = t('accessBad'); state = 'retry'; show(); return; }
  busy = true; show();
  try { const r = await call('open', { token, dob }); const j = await r.json().catch(() => ({})); if (r.ok && j.ok) { state = 'ready'; message = t('accessReady'); } else fail(j.error, r.status); }
  catch { fail('', 0); }
  busy = false; show(); document.getElementById('docs-h')?.focus();
}
async function download(d) {
  busy = true; show();
  try {
    const r = await call('download', { token, dob, document: d });
    if (!r.ok) { const j = await r.json().catch(() => ({})); fail(j.error, r.status); }
    else {
      const blob = await r.blob(); const name = (/filename="([^"]+)"/.exec(r.headers.get('content-disposition') || '') || [])[1] || d + '.pdf';
      const url = URL.createObjectURL(blob); const a = h('a', { href: url, download: name }); document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 60000);
    }
  } catch { fail('', 0); }
  busy = false; show();
}
async function renew() {
  busy = true; show();
  try { await call('renew', { token }); } catch { /* same answer either way */ }
  token = token || ''; state = 'sent'; message = t('accessRenewSent'); busy = false; show();
}
(async () => {
  try { const r = await fetch(`/assets/enrollment/i18n/${lang}.json`); tr = await r.json(); } catch { tr = null; }
  show();
})();
window.addEventListener('pageshow', e => { if (e.persisted) { dob = ''; state = 'ask'; message = ''; show(); } });

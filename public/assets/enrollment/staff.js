// Staff access to uploaded enrollment documents (form 1.3.0-E2). Authorized staff sign in with a one-time email code
// (Supabase Auth; accounts are created by the administrator, never by sign-up) and must also be on the server's allowlist.
// The session token lives only in this tab's memory. Every list and download is logged by the server.
const PUBLIC_KEY = '__H2H_PUBLIC_ANON_KEY__';
const root = document.getElementById('staff-app');
const ENDPOINT = root.dataset.endpoint.replace(/\/+$/, '');
const AUTH = root.dataset.auth.replace(/\/+$/, '');
const h = (tag, attrs = {}, ...kids) => { const el = document.createElement(tag); for (const [k, v] of Object.entries(attrs)) { if (v == null || v === false) continue; if (k.startsWith('on')) el.addEventListener(k.slice(2), v); else if (k === 'text') el.textContent = v; else el.setAttribute(k, v === true ? '' : v); } for (const c of kids.flat()) if (c != null && c !== false) el.append(c.nodeType ? c : document.createTextNode(String(c))); return el; };
let session = null, email = '', code = '', step = 'email', message = '', reference = '', docs = [], busy = false;
const auth = (p, body) => fetch(AUTH + p, { method: 'POST', headers: { 'Content-Type': 'application/json', apikey: PUBLIC_KEY }, body: JSON.stringify(body), signal: AbortSignal.timeout(20000) });
const api = body => fetch(ENDPOINT + '/staff', { method: 'POST', headers: { 'Content-Type': 'application/json', apikey: PUBLIC_KEY, Authorization: 'Bearer ' + session.access_token }, body: JSON.stringify(body), signal: AbortSignal.timeout(60000) });
const size = n => n >= 1048576 ? (n / 1048576).toFixed(1) + ' MB' : Math.round(n / 1024) + ' KB';
function show() {
  const kids = [h('h1', {}, 'Enrollment documents — staff'), h('p', { class: 'muted' }, 'Authorized Heart to Heart staff only. Every view and download is recorded. Uploaded files are unreviewed until you review them; open them on a protected center computer.')];
  if (message) kids.push(h('p', { class: 'notice', role: 'status' }, message));
  if (!session && step === 'email') kids.push(h('div', { class: 'field' }, h('label', { for: 'em' }, 'Staff email'), h('input', { id: 'em', type: 'email', autocomplete: 'username', value: email, oninput: e => { email = e.target.value; } })), h('button', { class: 'button', disabled: busy, onclick: sendCode }, 'Email me a sign-in code'));
  else if (!session) kids.push(h('div', { class: 'field' }, h('label', { for: 'cd' }, 'Code from your email'), h('input', { id: 'cd', inputmode: 'numeric', autocomplete: 'one-time-code', value: code, oninput: e => { code = e.target.value.trim(); } })), h('button', { class: 'button', disabled: busy, onclick: verify }, 'Sign in'));
  else {
    kids.push(h('div', { class: 'field' }, h('label', { for: 'ref' }, 'Application reference (H2H-YYYYMMDD-XXXXXXXX)'), h('input', { id: 'ref', dir: 'ltr', value: reference, oninput: e => { reference = e.target.value.trim().toUpperCase(); } })), h('button', { class: 'button', disabled: busy, onclick: list }, 'Show documents'), ' ', h('button', { class: 'button secondary', onclick: () => { session = null; step = 'email'; docs = []; message = 'Signed out.'; show(); } }, 'Sign out'));
    if (docs.length) kids.push(h('table', { class: 'staff-docs' }, h('tr', {}, ['Category', 'File', 'Size', 'Status', 'Actions'].map(x => h('th', {}, x))), docs.map(d => h('tr', {},
      h('td', {}, d.label), h('td', { dir: 'auto' }, d.filename), h('td', {}, size(d.bytes)), h('td', {}, `${d.review} · ${d.scan}`),
      h('td', {}, h('button', { class: 'linkish', onclick: () => download(d) }, 'Download'), ' ', h('button', { class: 'linkish', onclick: () => review(d, 'accepted') }, 'Mark reviewed'), ' ', h('button', { class: 'linkish', onclick: () => review(d, 'rejected') }, 'Reject'))))));
    kids.push(h('h2', {}, 'Confirm PFCC copayment terms'), h('p', { class: 'muted' }, 'Creates a NEW revision; the original application is never changed. The family must acknowledge the confirmed terms.'),
      h('div', { class: 'field' }, h('label', { for: 'amt' }, 'Weekly copayment from the county notice (dollars)'), h('input', { id: 'amt', inputmode: 'decimal' })),
      h('div', { class: 'field' }, h('label', { for: 'due' }, 'Agreed due day'), h('select', { id: 'due' }, ['mon', 'tue', 'wed', 'thu', 'fri'].map(v => h('option', { value: v }, v)))),
      h('button', { class: 'button secondary', disabled: busy, onclick: confirmTerms }, 'Record confirmed terms'));
  }
  root.replaceChildren(...kids);
}
const run = async f => { busy = true; show(); try { await f(); } catch { message = 'Something went wrong. Try again.'; } busy = false; show(); };
const sendCode = () => run(async () => { const r = await auth('/otp', { email, create_user: false }); message = r.ok ? 'If this is an authorized staff address, a code was emailed.' : 'Could not send a code.'; if (r.ok) step = 'code'; });
const verify = () => run(async () => { const r = await auth('/verify', { type: 'email', email, token: code }); const j = await r.json().catch(() => ({})); if (r.ok && j.access_token) { session = j; message = 'Signed in.'; } else message = 'That code did not work.'; });
const list = () => run(async () => { const r = await api({ action: 'list', reference }); const j = await r.json().catch(() => ({})); if (r.status === 401) { message = 'Your account is not authorized for enrollment documents.'; docs = []; return; } docs = j.documents || []; message = docs.length ? `${docs.length} document(s).` : 'No uploaded documents for this application.'; });
const download = d => run(async () => { const r = await api({ action: 'download', reference, id: d.id }); if (!r.ok) { message = 'Download failed.'; return; } const b = await r.blob(); const u = URL.createObjectURL(b); const a = h('a', { href: u, download: (/filename="([^"]+)"/.exec(r.headers.get('content-disposition') || '') || [])[1] || 'document' }); document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(u), 60000); });
const review = (d, v) => run(async () => { const r = await api({ action: 'review', id: d.id, review: v }); message = r.ok ? 'Saved.' : 'Not saved.'; if (r.ok) d.review = v; });
const confirmTerms = () => run(async () => { const cents = Math.round(Number(document.getElementById('amt').value) * 100); const r = await api({ action: 'confirmTerms', reference, copayCents: cents, dueDay: document.getElementById('due').value }); const j = await r.json().catch(() => ({})); message = j.ok ? `Recorded as revision ${j.revision}. Ask the family to acknowledge it.` : 'Not recorded.'; });
show();

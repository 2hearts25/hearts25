// Test harness for the five-language UI test: the REAL submit-enrollment Edge function (Deno) + in-memory Supabase/Resend mocks,
// plus a tiny read-only state server so the Python browser test can inspect emails, attachments and rows. Synthetic data only.
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { randomBytes } from 'node:crypto';
import { startMock } from './mock-server.mjs';
const DENO = '/home/claude/h2h-tools/node_modules/.bin/deno';
const MP = 9392, FP = 8792, SP = 9393;
const mock = await startMock(MP);
const env = { ...process.env, SUPABASE_URL: `http://127.0.0.1:${MP}`, SUPABASE_SERVICE_ROLE_KEY: 'test-service', H2H_APP_DATA_KEY: randomBytes(32).toString('base64'), H2H_RESEND_API_KEY: 'test-resend', H2H_RESEND_URL: `http://127.0.0.1:${MP}/resend/emails`, H2H_FONT_BASE: `http://127.0.0.1:${MP}/fonts/`, H2H_ADMIN_SECRET: 'admin-test-secret', H2H_ALLOWED_ORIGIN: 'http://127.0.0.1:8899', DENO_SERVE_ADDRESS: `tcp:127.0.0.1:${FP}` };
const fn = spawn(DENO, ['run', '-A', '--no-lock', '../../supabase/functions/submit-enrollment/index.ts'], { cwd: new URL('.', import.meta.url).pathname, env, stdio: 'inherit' });
createServer((req, res) => {
  const u = new URL(req.url, 'http://x'); res.setHeader('Access-Control-Allow-Origin', '*');
  if (u.pathname === '/state') {
    const emails = mock.emails.map((e, i) => ({ i, to: e.body.to, bcc: e.body.bcc, subject: e.body.subject, text: e.body.text, html: e.body.html, attachments: (e.body.attachments || []).map(a => a.filename) }));
    const rows = [...mock.db.rows.values()].map(r => ({ reference: r.reference, language: r.language, status: r.status, pdf_status: r.pdf_status, staff_email_status: r.staff_email_status, family_email_status: r.family_email_status, staff_delivery_status: r.staff_delivery_status, family_delivery_status: r.family_delivery_status }));
    res.writeHead(200, { 'Content-Type': 'application/json' }); return res.end(JSON.stringify({ emails, rows }));
  }
  if (u.pathname === '/att') { const e = mock.emails[+u.searchParams.get('i')]; const a = e?.body.attachments?.[+u.searchParams.get('n')]; if (!a) { res.writeHead(404); return res.end(); } res.writeHead(200, { 'Content-Type': 'application/pdf' }); return res.end(Buffer.from(a.content, 'base64')); }
  if (u.pathname === '/reset') { mock.emails.length = 0; mock.db.rows.clear(); mock.db.idem.clear(); res.writeHead(200); return res.end('ok'); }
  res.writeHead(404); res.end();
}).listen(SP, '127.0.0.1', () => console.log('lang backend ready', FP, SP));
for (const s of ['SIGINT', 'SIGTERM']) process.on(s, () => { fn.kill(); process.exit(0); });

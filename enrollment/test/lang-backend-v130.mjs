// Harness for the 1.3.0 five-language browser test: REAL submit-enrollment (Deno) + REAL SQL (local PostgreSQL 16) + mocked
// Storage/Resend, flags ON (test database only), plus a read-only state server for the Python test. Synthetic data only.
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { randomBytes } from 'node:crypto';
import { startPg } from './pg-local.mjs';
import { startMockV130 } from './mock-v130.mjs';
const MP = 9592, FP = 8992, SP = 9593;
const pg = await startPg(55434);
await pg.db.query('update website_private.feature_flags set enabled = true');
const mock = await startMockV130(MP, pg);
const env = { ...process.env, SUPABASE_URL: `http://127.0.0.1:${MP}`, SUPABASE_SERVICE_ROLE_KEY: 'test-service', H2H_APP_DATA_KEY: randomBytes(32).toString('base64'), H2H_RESEND_API_KEY: 'test-resend', H2H_RESEND_URL: `http://127.0.0.1:${MP}/resend/emails`, H2H_FONT_BASE: `http://127.0.0.1:${MP}/fonts/`, H2H_ADMIN_SECRET: 'admin-test-secret', H2H_ALLOWED_ORIGIN: 'http://127.0.0.1:8899', H2H_SITE_URL: 'http://127.0.0.1:8899', DENO_SERVE_ADDRESS: `tcp:127.0.0.1:${FP}` };
const fn = spawn(process.env.DENO || 'deno', ['run', '-A', '--no-lock', '../../supabase/functions/submit-enrollment/index.ts'], { cwd: new URL('.', import.meta.url).pathname, env, stdio: 'inherit' });
createServer(async (req, res) => {
  const u = new URL(req.url, 'http://x');
  if (u.pathname === '/state') {
    const emails = mock.emails.map((e, i) => ({ i, to: e.body.to, bcc: e.body.bcc, subject: e.body.subject, text: e.body.text, html: e.body.html, attachments: (e.body.attachments || []).map(a => a.filename) }));
    const rows = (await pg.db.query('select reference, language, form_version, status, pdf_status, staff_email_status, family_email_status, access_email_status, contract_version, copay_status, wt_ack_status, doc_summary, (select count(*)::int from website_private.enrollment_agreements a where a.application_id = p.id) agreements, (select count(*)::int from website_private.enrollment_documents d where d.application_id = p.id) documents from website_private.enrollment_applications p')).rows;
    res.writeHead(200, { 'Content-Type': 'application/json' }); return res.end(JSON.stringify({ emails, rows }));
  }
  if (u.pathname === '/att') { const e = mock.emails[+u.searchParams.get('i')]; const a = e?.body.attachments?.[+u.searchParams.get('n')]; if (!a) { res.writeHead(404); return res.end(); } res.writeHead(200, { 'Content-Type': 'application/pdf' }); return res.end(Buffer.from(a.content, 'base64')); }
  res.writeHead(404); res.end();
}).listen(SP, '127.0.0.1', () => console.log('v130 backend ready', FP, SP));
const stop = async () => { fn.kill(); mock.close(); await pg.stop(); process.exit(0); };
for (const s of ['SIGINT', 'SIGTERM']) process.on(s, stop);

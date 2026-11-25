// Static server for dist/ that applies the SAME Content-Security-Policy as production (public/_headers), so tests catch CSP violations.
import { createServer } from 'node:http';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { extname, join } from 'node:path';
const dist = new URL('../../dist/', import.meta.url).pathname;
const csp = /Content-Security-Policy:\s*(.+)/.exec(readFileSync(new URL('../../public/_headers', import.meta.url), 'utf8'))[1].trim();
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.webp': 'image/webp', '.png': 'image/png', '.ttf': 'font/ttf', '.xml': 'application/xml', '.txt': 'text/plain' };
const port = Number(process.argv[2] || 8899);
// Test mode: point the built pages at a local function instead of the production endpoint, and allow exactly that origin in the
// otherwise unchanged production CSP (so blob uploads are not lost through a request interceptor).
const TEST_EP = process.env.H2H_TEST_ENDPOINT; const PROD_EP = 'https://zebeclcvrdmisnxkwode.supabase.co/functions/v1/submit-enrollment';
const cspFor = () => TEST_EP ? csp.replace('connect-src ', 'connect-src ' + new URL(TEST_EP).origin + ' ') : csp;
createServer((req, res) => {
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname); let f = join(dist, p);
  if (existsSync(f) && statSync(f).isDirectory()) f = join(f, 'index.html');
  if (!existsSync(f)) { res.writeHead(404, { 'Content-Security-Policy': cspFor() }); return res.end('not found'); }
  res.writeHead(200, { 'Content-Type': types[extname(f)] || 'application/octet-stream', 'Content-Security-Policy': cspFor(), 'X-Content-Type-Options': 'nosniff' });
  let out = readFileSync(f); if (TEST_EP && f.endsWith('.html')) out = Buffer.from(out.toString('utf8').replaceAll(PROD_EP, TEST_EP));
  res.end(out);
}).listen(port, '127.0.0.1', () => console.log('serving', port));

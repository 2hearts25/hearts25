// Static server for dist/ that applies the SAME Content-Security-Policy as production (public/_headers), so tests catch CSP violations.
import { createServer } from 'node:http';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { extname, join } from 'node:path';
const dist = new URL('../../dist/', import.meta.url).pathname;
const csp = /Content-Security-Policy:\s*(.+)/.exec(readFileSync(new URL('../../public/_headers', import.meta.url), 'utf8'))[1].trim();
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.webp': 'image/webp', '.png': 'image/png', '.ttf': 'font/ttf', '.xml': 'application/xml', '.txt': 'text/plain' };
const port = Number(process.argv[2] || 8899);
createServer((req, res) => {
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname); let f = join(dist, p);
  if (existsSync(f) && statSync(f).isDirectory()) f = join(f, 'index.html');
  if (!existsSync(f)) { res.writeHead(404, { 'Content-Security-Policy': csp }); return res.end('not found'); }
  res.writeHead(200, { 'Content-Type': types[extname(f)] || 'application/octet-stream', 'Content-Security-Policy': csp, 'X-Content-Type-Options': 'nosniff' });
  res.end(readFileSync(f));
}).listen(port, '127.0.0.1', () => console.log('serving', port));

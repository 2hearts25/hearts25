// Stand-ins for the Supabase gateway (RPC → REAL local Postgres functions), Storage (in memory, per bucket), Auth (/auth/v1/user)
// and Resend, so the real submit-enrollment function can be exercised end to end offline. Synthetic data only.
import { createServer } from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
export function startMockV130(port, pg) {
  const storage = new Map(), emails = [], resendKeys = new Map(), rpcLog = [];
  const ctl = { failResendTo: null, events: {}, defaultEvent: 'delivered', users: {} };
  const read = req => new Promise(r => { const c = []; req.on('data', d => c.push(d)); req.on('end', () => r(Buffer.concat(c))); });
  const send = (res, code, body, type = 'application/json') => { res.writeHead(code, { 'Content-Type': type }); res.end(typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body)); };
  const srv = createServer(async (req, res) => {
    const u = new URL(req.url, 'http://x'); const body = await read(req);
    try {
      if (u.pathname.startsWith('/rest/v1/rpc/')) {
        if (req.headers.apikey !== 'test-service') return send(res, 401, {});
        const fn = u.pathname.split('/').pop(); rpcLog.push(fn);
        const r = await pg.rpc(fn, body.length ? JSON.parse(body) : {});
        return send(res, 200, JSON.stringify(r ?? null));
      }
      const m = /^\/storage\/v1\/object\/([^/]+)(?:\/(.*))?$/.exec(u.pathname);
      if (m) {
        const [, bucket, key] = m;
        if (req.method === 'POST') { storage.set(bucket + '/' + key, body); return send(res, 200, { Key: key }); }
        if (req.method === 'GET') return storage.has(bucket + '/' + key) ? send(res, 200, storage.get(bucket + '/' + key), 'application/octet-stream') : send(res, 404, {});
        if (req.method === 'DELETE') { for (const p of JSON.parse(body).prefixes) storage.delete(bucket + '/' + p); return send(res, 200, []); }
      }
      if (u.pathname === '/auth/v1/user') { const tok = (req.headers.authorization || '').slice(7); const user = ctl.users[tok]; return user ? send(res, 200, user) : send(res, 401, {}); }
      if (u.pathname.startsWith('/resend/emails/') && req.method === 'GET') { const id = u.pathname.split('/').pop(); return send(res, 200, { id, last_event: ctl.events[id] ?? ctl.defaultEvent }); }
      if (u.pathname === '/resend/emails') {
        const b = JSON.parse(body);
        if (ctl.failResendTo && b.to?.[0] === ctl.failResendTo) return send(res, 503, { message: 'down' });
        const key = req.headers['idempotency-key']; if (resendKeys.has(key)) return send(res, 200, { id: resendKeys.get(key) });
        const id = 'em_' + crypto.randomUUID(); resendKeys.set(key, id); emails.push({ id, key, body: b }); return send(res, 200, { id });
      }
      if (u.pathname.startsWith('/fonts/')) { const f = new URL('../../public/assets/fonts/' + u.pathname.slice(7), import.meta.url); return existsSync(f) ? send(res, 200, readFileSync(f), 'font/ttf') : send(res, 404, ''); }
      send(res, 404, { error: 'no route ' + u.pathname });
    } catch (e) { send(res, 500, { error: String(e.message || e) }); }
  });
  return new Promise(r => srv.listen(port, '127.0.0.1', () => r({ srv, storage, emails, ctl, rpcLog, close: () => srv.close() })));
}

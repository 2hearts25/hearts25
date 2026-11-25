// Throwaway local PostgreSQL 16 with Supabase stand-ins and EVERY migration applied (same stubs as supabase/tests/local-db.sh).
// Used by e2e-v130.mjs so the Edge Function runs against the real SQL functions, grants and triggers. Synthetic data only.
import { execFileSync, execSync } from 'node:child_process';
import { mkdtempSync, readdirSync, readFileSync, writeFileSync, chmodSync } from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire('/home/claude/h2h-tools/');
const { Client, Pool } = require('pg');
const BIN = '/usr/lib/postgresql/16/bin';
const ROOT = new URL('../../', import.meta.url).pathname;
export async function startPg(port = 55433) {
  const dir = mkdtempSync('/tmp/h2h-e2e-pg-'); chmodSync(dir, 0o777);
  const asPg = cmd => execSync(`su postgres -c "${cmd}"`, { stdio: 'pipe' });
  asPg(`${BIN}/initdb -D ${dir}/data -A trust -U postgres`);
  asPg(`${BIN}/pg_ctl -D ${dir}/data -o '-p ${port} -k ${dir}' -l ${dir}/log start -w`);
  const admin = new Client({ host: dir, port, user: 'postgres', database: 'postgres' }); await admin.connect(); await admin.query('create database h2h'); await admin.end();
  const db = new Client({ host: dir, port, user: 'postgres', database: 'h2h' }); await db.connect();
  await db.query("set client_min_messages = warning");
  await db.query(readFileSync(ROOT + 'supabase/tests/stubs.sql', 'utf8'));
  for (const f of readdirSync(ROOT + 'supabase/migrations').sort()) await db.query(readFileSync(ROOT + 'supabase/migrations/' + f, 'utf8').replace(/create extension if not exists pg_(net|cron)[^;]*;/g, ''));
  // argument names/types of every public function, so RPC calls can be made by name exactly like PostgREST does
  const sig = new Map((await db.query(`select p.proname, array_agg(a.name order by a.ord) filter (where a.name is not null) names, array_agg(format_type(t.oid, null) order by a.ord) filter (where a.name is not null) types
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    left join lateral unnest(p.proargnames, p.proargtypes::oid[]) with ordinality as a(name, typ, ord) on true left join pg_type t on t.oid = a.typ
    where n.nspname = 'public' group by p.proname`)).rows.map(r => [r.proname, r]));
  const pool = new Pool({ host: dir, port, user: 'postgres', database: 'h2h', max: 8 });
  async function rpc(fn, args) {
    const s = sig.get(fn); if (!s) throw new Error('no function ' + fn);
    const names = (s.names || []).filter(n => n in args), vals = names.map(n => { const v = args[n]; return v === null || v === undefined ? null : typeof v === 'object' ? JSON.stringify(v) : v; });
    const list = names.map((n, i) => `${n} => $${i + 1}::${s.types[s.names.indexOf(n)]}`).join(', ');
    const c = await pool.connect();
    try { await c.query('begin'); await c.query('set local role service_role'); const r = await c.query(`select public.${fn}(${list}) as r`, vals); await c.query('commit'); return r.rows[0].r; }
    catch (e) { await c.query('rollback').catch(() => {}); throw e; } finally { c.release(); }
  }
  const stop = async () => { await pool.end().catch(() => {}); await db.end().catch(() => {}); try { asPg(`${BIN}/pg_ctl -D ${dir}/data stop -m fast`); } catch { /* already down */ } execSync(`rm -rf ${dir}`); };
  return { db, rpc, stop };
}

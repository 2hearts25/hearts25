#!/usr/bin/env bash
set -eu
sudo npm install --prefix /home/claude/h2h-tools deno @cantoo/pdf-lib@2.11.1 pg
command -v pdftotext >/dev/null || { sudo apt-get update && sudo apt-get install -y poppler-utils; }
test -x /usr/lib/postgresql/16/bin/pg_ctl || { sudo apt-get update && sudo apt-get install -y postgresql-16; }
cd "$GITHUB_WORKSPACE"
printf '%s' 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aS5sAAAAASUVORK5CYII=' | base64 -d > enrollment/test/sig-sample.png
sed '/^\/\/ fixtures (synthetic)/,$d' enrollment/test/e2e-v130.mjs > enrollment/test/targeted-ci.mjs
sed -i "s/method: 'drawn', png/method: 'typed', typedAck: true/" enrollment/test/targeted-ci.mjs
cat >> enrollment/test/targeted-ci.mjs <<'JS'
try {
  await pg.db.query("update website_private.feature_flags set enabled=true where key='enrollment_v130'");
  const data = structuredClone(sample130);
  for (const key of Object.keys(data)) if (key.startsWith('up.')) delete data[key];
  data['p1.email'] = 'retry@example.com';
  const blocked = await post('', body130({...data,'fin.choice':'provide','fin.consent':true},{card:{}}));
  assert.equal(blocked.status,422);
  assert.equal((await blocked.json()).errors['fin.choice'],'choice');
  assert.equal((await q('select count(*)::int n from website_financial.cards'))[0].n,0);
  assert.equal((await q('select count(*)::int n from website_private.enrollment_applications'))[0].n,0);
  const actualRpc = pg.rpc;
  let held = true;
  pg.rpc = async (name, args) => {
    if (held && name === 'enrollment_record_v130_p2') throw Error('synthetic finalization outage');
    return actualRpc(name,args);
  };
  mock.ctl.failResendTo = data['p1.email'];
  const res = await post('',body130(data));
  const j = await res.json();
  assert.equal(res.status,201,JSON.stringify(j)+log.slice(-3000));
  assert.ok(await until(async () => (await appRow(j.reference))?.finalize_status === 'failed'),log.slice(-3000));
  assert.equal((await appRow(j.reference)).pdf_status,'pending');
  assert.equal(mock.emails.length,0);
  held = false;
  const sweep = () => fetch(url+'admin',{method:'POST',headers:{'Content-Type':'application/json','x-admin-secret':'admin-test-secret'},body:JSON.stringify({action:'sweep',minAge:0})});
  await sweep();
  assert.ok(await until(async () => (await appRow(j.reference))?.family_email_status === 'failed'),log.slice(-3000));
  const row = await appRow(j.reference);
  assert.equal(row.finalize_status,'done');
  assert.equal(row.status,'complete');
  assert.ok(row.family_email_attempts >= 1);
  assert.equal(row.payment_status,'follow_up_needed');
  const staff = mock.emails.find(e => e.body.attachments?.length === 2);
  assert.ok(staff);
  const [ohio,h2h] = staff.body.attachments.map(a => text(Buffer.from(a.content,'base64')));
  assert.ok(ohio.includes('SYNTHETIC') || ohio.includes('Child'));
  assert.match(h2h,/6:00 PM/);
  assert.match(h2h,/PPC-2026.11-R2/);
  assert.match(h2h,/Late pickup schedule and acknowledgment/);
  assert.doesNotMatch(ohio,/Late pickup schedule and acknowledgment/);
  mock.ctl.failResendTo = null;
  await pg.db.query("update website_private.enrollment_applications set updated_at=now()-interval '2 hours' where reference=$1",[j.reference]);
  await sweep();
  assert.ok(await until(async () => (await appRow(j.reference))?.family_email_status === 'sent'),log.slice(-3000));
  assert.equal(mailsTo(data['p1.email']).length,1);
  console.log('PASS disabled card guard, migration-backed finalization retry, both actual PDFs, and automatic parent email retry');
} finally { fn.kill(); mock.close(); await pg.stop(); }
JS
sudo env DENO=/home/claude/h2h-tools/node_modules/.bin/deno PATH="$PATH" "$(command -v node)" enrollment/test/targeted-ci.mjs

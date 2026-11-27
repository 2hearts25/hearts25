# Targeted UI smoke test of tools/communications-admin.html with a mocked function/auth (synthetic data). Verifies sign-in, contact list (XSS-safe), import preview->commit, critical review->typed-count confirm.
import json, re, sys
from playwright.sync_api import sync_playwright
PAGE = 'file:///home/claude/work/rel/tools/communications-admin.html'
calls = []
def fn(route, req):
    b = json.loads(req.post_data or '{}'); a = b.get('action'); calls.append(b)
    out = {'ok': True}
    if a == 'whoami': out = {'ok': True, 'email': 'ebony@example.com', 'can_manage': True}
    elif a == 'counts': out = {'critical': 3, 'operational': 4, 'newsletter': 2, 'internal': 1, 'contacts': 9, 'capture_queue_pending': 0}
    elif a == 'contact_list': out = {'total': 1, 'rows': [{'id': 'x', 'email': 'a@example.com', 'first_name': '<img src=x onerror=window.__xss=1>', 'last_name': 'Kid', 'roles': ['parent_guardian'], 'relationships': [{'id': 'r', 'kind': 'enrollment', 'ref': 'app:1', 'status': 'active'}], 'newsletter': 'none', 'deliverability': 'ok', 'restriction': None, 'language': 'en'}]}
    elif a == 'import': out = {'ok': True, 'dry': b['dry'], 'summary': {'rows': 2, 'create': 1, 'update': 0, 'duplicate_in_file': 0, 'invalid': 1}, 'rows': [{'row': 1, 'email': 'new@example.com', 'action': 'create', 'errors': [], 'warnings': []}, {'row': 2, 'email': None, 'action': 'invalid', 'errors': ['invalid_email'], 'warnings': []}]}
    elif a == 'critical_templates': out = {'ok': True, 'templates': [{'key': 'closure', 'title': 'Center closure', 'subject': 'Closed {{when}}', 'body': 'Closed {{when}}. {{details}}'}]}
    elif a == 'critical_prepare': out = {'ok': True, 'send_id': 's1', 'recipient_count': 3, 'excluded_count': 1, 'subject': b['subject'], 'body': b['body']}
    elif a == 'critical_send': out = {'ok': True, 'report': {'send': {'status': 'partial'}, 'counts': {'sent': 2, 'failed': 1}, 'phone_followup': [{'name': 'Pat', 'phone': '216-555-0100', 'email': 'p@example.com', 'reason': 'failed'}]}}
    route.fulfill(status=200, content_type='application/json', headers={'access-control-allow-origin': '*'}, body=json.dumps(out))
with sync_playwright() as p:
    br = p.chromium.launch(); pg = br.new_page(); errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.route(re.compile(r'.*/auth/v1/token.*'), lambda r: r.fulfill(status=200, content_type='application/json', headers={'access-control-allow-origin': '*'}, body='{"access_token":"t"}'))
    pg.route(re.compile(r'.*/functions/v1/communications.*'), fn)
    pg.goto(PAGE); pg.fill('#em', 'ebony@example.com'); pg.fill('#pw', 'x'); pg.click('#go'); pg.wait_for_selector('#app:not(.hide)')
    assert 'Critical recipients: 3' in pg.inner_text('#counts')
    pg.wait_for_selector('#list table'); assert pg.evaluate('window.__xss') is None, 'XSS'; assert '<img' in pg.inner_text('#list')
    pg.click('nav button[data-k=import]'); pg.fill('#csvtext', 'email,first_name\nnew@example.com,Neo\nbad,Bad'); pg.click('#preview'); pg.wait_for_selector('#importout table'); assert 'PREVIEW' in pg.inner_text('#importout') and pg.is_enabled('#commit')
    pg.once('dialog', lambda d: d.accept()); pg.click('#commit'); pg.wait_for_function("document.querySelector('#importout').innerText.includes('IMPORTED')")
    assert [c['dry'] for c in calls if c['action'] == 'import'] == [True, False], 'preview before commit'
    pg.click('nav button[data-k=crit]'); pg.wait_for_selector('#ctpl option', state='attached'); pg.click('#cprep'); pg.wait_for_selector('#cprev .warn')
    assert any(c['action'] == 'critical_prepare' for c in calls)
    pg.fill('#cwhen', 'Tuesday'); pg.fill('#cdet', 'Snow.'); pg.click('#cprep'); pg.wait_for_selector('#cprev .danger'); assert '3 active' in pg.inner_text('#cprev')
    pg.fill('#cprev input', '2'); pg.click('#cprev .danger'); assert not any(c['action'] == 'critical_send' for c in calls), 'wrong count must not send'
    pg.fill('#cprev input', '3'); pg.click('#cprev .danger'); pg.wait_for_function("document.querySelector('#cprev').innerText.includes('follow-up')"); assert '216-555-0100' in pg.inner_text('#cprev')
    assert not errs, errs; print('admin UI checks passed'); br.close()

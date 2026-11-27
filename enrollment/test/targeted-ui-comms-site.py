# Targeted UI test of the website newsletter additions (footer sign-up, optional checkbox on tour / information / contact forms) in all five languages, with mocked backends.
import json, re, subprocess, time, sys
from playwright.sync_api import sync_playwright, expect
srv = subprocess.Popen(['node', 'enrollment/test/serve.mjs', '8898'], cwd='/home/claude/work/rel'); time.sleep(1.5)
B = 'http://127.0.0.1:8898'; comms = []; inq = []; mode = {'comms': 'ok'}
def on_comms(route, req):
    if req.method == 'OPTIONS': return route.fulfill(status=204, headers={'access-control-allow-origin': '*', 'access-control-allow-headers': '*'})
    b = json.loads(req.post_data or '{}'); comms.append(b); m = mode['comms']
    st, out = (200, {'ok': True, 'disabled': True}) if m == 'disabled' else (429, {'ok': False}) if m == 'limited' else (200, {'ok': True})
    route.fulfill(status=st, content_type='application/json', headers={'access-control-allow-origin': '*'}, body=json.dumps(out))
def on_inq(route, req):
    if req.method == 'OPTIONS': return route.fulfill(status=204, headers={'access-control-allow-origin': '*', 'access-control-allow-headers': '*'})
    inq.append(json.loads(req.post_data or '{}')); route.fulfill(status=201, content_type='application/json', headers={'access-control-allow-origin': '*'}, body='{"ok":true}')
try:
    with sync_playwright() as p:
        br = p.chromium.launch(); ctx = br.new_context(); pg = ctx.new_page(); errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
        csp = []; pg.on('console', lambda m: csp.append(m.text) if 'Content Security Policy' in m.text else None)
        pg.route(re.compile(r'.*/functions/v1/communications.*'), on_comms); pg.route(re.compile(r'.*/functions/v1/website-inquiry.*'), on_inq); pg.route(re.compile(r'.*/functions/v1/site-event.*'), lambda r: r.fulfill(status=204))
        for lang in ['', 'es/', 'fr/', 'ar/', 'sw/']:
            for slug in ['', 'tour/', 'request-information/', 'contact/']:
                pg.goto(f'{B}/{lang}{slug}'); assert pg.locator('footer form[data-newsletter]').count() == 1, (lang, slug, 'footer form')
                if slug: 
                    cb = pg.locator('input[name=newsletter]'); assert cb.count() == 1 and not cb.is_checked(), (lang, slug, 'optional checkbox, not preselected')
                    assert pg.locator('input[name=consent]').count() == 1
            pg.goto(f'{B}/{lang}register/'); assert pg.locator('input[name=newsletter]').count() == 0, 'no newsletter checkbox on the registration form'
        pg.goto(f'{B}/es/'); f = pg.locator('footer form[data-newsletter]'); assert 'Boletín' in f.inner_text()
        f.locator('input[name=email]').fill('bad'); f.locator('button').click(); expect(pg.locator('footer .form-status')).to_be_visible(); assert not comms, 'invalid email must not call the backend'
        f.locator('input[name=email]').fill('Maria@Example.com'); f.locator('input[name=name]').fill('Maria'); f.locator('button').click(); expect(pg.locator('footer .form-status')).to_contain_text('confirmar')
        assert comms[-1] == {'action': 'subscribe', 'email': 'Maria@Example.com', 'name': 'Maria', 'website': '', 'language': 'es', 'source': 'footer'}, comms[-1]
        mode['comms'] = 'disabled'; f.locator('input[name=email]').fill('x@example.com'); f.locator('button').click(); expect(pg.locator('footer .form-status')).to_contain_text('aún no está abierta')
        mode['comms'] = 'limited'; f.locator('input[name=email]').fill('x@example.com'); f.locator('button').click(); expect(pg.locator('footer .form-status')).to_contain_text('Demasiados'); mode['comms'] = 'ok'
        # information form: opt-in subscribes after the inquiry succeeds; inquiry payload never carries the newsletter field
        comms.clear(); pg.goto(f'{B}/request-information/'); pg.fill('input[name=name]', 'Pat Parent'); pg.fill('main input[name=email]', 'pat@example.com'); pg.check('input[name=consent]')
        pg.once('framenavigated', lambda fr: None); pg.check('input[name=newsletter]'); pg.click('main form button[type=submit]'); pg.wait_for_url(re.compile(r'.*information-received.*'))
        time.sleep(0.5); assert len(inq) == 1 and 'newsletter' not in inq[0], inq; assert comms and comms[-1]['source'] == 'website-information' and comms[-1]['email'] == 'pat@example.com' and comms[-1]['action'] == 'subscribe', comms
        # not ticked → no newsletter request, inquiry unchanged
        comms.clear(); inq.clear(); pg.goto(f'{B}/request-information/'); pg.fill('input[name=name]', 'Pat Parent'); pg.fill('main input[name=email]', 'pat@example.com'); pg.check('input[name=consent]'); pg.click('main form button[type=submit]'); pg.wait_for_url(re.compile(r'.*information-received.*')); time.sleep(0.5)
        assert len(inq) == 1 and not comms, (inq, comms)
        # ticked but no email on the tour form (email optional there) → blocked with a message, nothing sent
        comms.clear(); inq.clear(); pg.goto(f'{B}/tour/'); pg.fill('input[name=name]', 'Tia Tour'); pg.fill('input[name=phone]', '2165550100'); pg.check('input[name=consent]'); pg.check('input[name=newsletter]')
        pg.locator('main form input[name=email]').fill(''); pg.click('main form button[type=submit]'); time.sleep(0.5); assert not inq and not comms, 'newsletter without email is blocked client-side'
        assert not errs, errs; assert not csp, csp; print('site newsletter UI checks passed'); br.close()
finally: srv.terminate()

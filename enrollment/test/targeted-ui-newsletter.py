# Targeted browser check of the newsletter block (NL-1.0) in all five languages (desktop) + mobile English, against the BUILT site under the production CSP.
# The POST is intercepted and answered 201 so only the form and its request body are under test. Synthetic data only.
# Needs: H2H_TEST_ENDPOINT=http://127.0.0.1:8992 node serve.mjs 8899 (dist built).
import json, re, subprocess, os, sys
from playwright.sync_api import sync_playwright
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
SCHEMA = json.load(open(f'{ROOT}/enrollment/schema.json'))
SAMPLE = json.loads(subprocess.check_output(['node', '-e', "import('./sample-data.mjs').then(m=>console.log(JSON.stringify(m.sample130)))"], cwd=f'{ROOT}/enrollment/test'))
for k in list(SAMPLE):
    if k.startswith('up.'): del SAMPLE[k]
BASE = 'http://127.0.0.1:8899'; FN = 'http://127.0.0.1:8992'
fid = lambda path: 'f-' + re.sub(r'[^\w]', '-', path)
problems = []
def check(name, cond, extra=''):
    print(('ok   ' if cond else 'FAIL ') + name + (' — ' + str(extra) if (extra and not cond) else ''))
    if not cond: problems.append(name)
def fill_field(page, f, v, path):
    i = fid(path); t = f['t']
    if v is None or v == '' or v == [] or t == 'upload': return
    if page.locator('#' + i).count() == 0 and page.locator(f'[id^="{i}-"]').count() == 0: return
    if t in ('text', 'textarea', 'email', 'tel', 'date', 'time'): page.fill('#' + i, v)
    elif t == 'textna':
        if v == 'N/A': page.check(f'#{i}-na')
        else: page.fill('#' + i, v)
    elif t in ('select', 'state'): page.select_option('#' + i, v)
    elif t == 'radio': page.check(f'#{i}-{v}')
    elif t == 'checks':
        for x in v: page.check(f'#{i}-{x}')
    elif t == 'check': page.set_checked('#' + i, bool(v))
def fill_step(page, step, data):
    for f in step['fields']:
        if f['t'] == 'rep':
            rows = data.get(f['id']) or []
            if f['id'] == 'pu' and data.get('pu.has') != 'yes': continue
            for n, row in enumerate(rows):
                if n > 0 and page.locator('#' + fid(f"{f['id']}[{n}].{f['f'][0]['id']}")).count() == 0: page.click('.repeater + button')
                for g in f['f']: fill_field(page, g, row.get(g['id']), f"{f['id']}[{n}].{g['id']}")
            continue
        fill_field(page, f, data.get(f['id']), f['id'])
next_btn = lambda page: page.locator('.enroll .nav .button:not(.secondary)').last

def run(browser, lang, mobile=False):
    name = f'{lang}-{"mobile" if mobile else "desktop"}'; print(f'\n=== {name} ===')
    tr = json.load(open(f'{ROOT}/dist/assets/enrollment/i18n/{lang}.json'))
    data = json.loads(json.dumps(SAMPLE)); data['p1.email'] = f'nl.{lang}@example.com'
    ctx = browser.new_context(viewport={'width': 390, 'height': 844} if mobile else {'width': 1280, 'height': 900}, is_mobile=mobile, has_touch=mobile)
    page = ctx.new_page(); logs = []; posted = {}
    page.on('console', lambda m: logs.append(m.text) if m.type in ('error', 'warning') else None); page.on('pageerror', lambda e: logs.append(str(e))); page.on('requestfailed', lambda r: print('   reqfailed', r.method, r.url))
    def handle(route):
        r = route.request
        if r.method == 'POST' and r.url.rstrip('/') == FN:
            posted['body'] = json.loads(r.post_data); route.fulfill(status=201, content_type='application/json', headers={'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*'}, body='{"ok":true,"reference":"H2H-TEST"}')
        elif r.url.startswith(FN): route.fulfill(status=200, content_type='application/json', headers={'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*'}, body='{"ok":true,"enabled":false}')
        else: route.continue_()
    page.route(re.compile(r'^http://127\.0\.0\.1:8992'), handle); page.route('**/functions/v1/site-event**', lambda r: r.fulfill(status=204))  # keep the test off the production analytics endpoint
    prefix = '' if lang == 'en' else f'/{lang}'
    page.goto(f'{BASE}{prefix}/register/'); page.wait_for_selector('#enroll-app h2'); page.click('.enroll .nav .button'); page.wait_for_selector('#step-h')
    for step in SCHEMA['steps']:
        if step['id'] in ('intro', 'review', 'sign'): continue
        if page.locator('#step-h').inner_text() != tr['steps'][step['id']]: continue
        fill_step(page, step, data); next_btn(page).click(); page.wait_for_timeout(150)
        if page.locator('#fin-continue').count(): page.click('#fin-continue'); page.wait_for_timeout(150)
        if page.locator('#errsum').count(): print('   errors on step', step['id'], page.inner_text('#errsum')[:300]); break
    next_btn(page).click(); page.wait_for_selector('#sn-parent1')
    n = tr['nl']; o = tr['o']['nl.choice']
    blk = page.locator('#f-nl-choice'); check(f'{name}: newsletter block shown on the signing page', blk.count() == 1)
    txt = blk.inner_text()
    check(f'{name}: exact heading, description, both choices and unsubscribe/enrollment note in {lang}', all(x in txt for x in (n['heading'], n['lead'], o['yes'], o['no'], n['note'])))
    check(f'{name}: two radios, mutually exclusive, NEITHER preselected', blk.locator('input[type=radio]').count() == 2 and blk.locator('input[type=radio]:checked').count() == 0)
    order = page.evaluate("""() => { const q = s => document.querySelector(s); const pos = (a, b) => !!(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
      return { afterSig: pos(q('#sn-parent1'), q('#f-nl-choice')), beforeSubmit: pos(q('#f-nl-choice'), q('#submit-btn')) }; }""")
    check(f'{name}: placed after the signature section and before Submit', order['afterSig'] and order['beforeSubmit'], order)
    page.check('#nl-yes'); check(f'{name}: choosing Yes unchecks No', page.is_checked('#nl-yes') and not page.is_checked('#nl-no'))
    page.check('#nl-no'); check(f'{name}: choosing No unchecks Yes', page.is_checked('#nl-no') and not page.is_checked('#nl-yes'))
    if lang == 'en' and not mobile:
        for a in page.locator('[id^=ack-]').all(): a.check()
        page.fill('#sn-parent1', 'Test Parent'); page.fill('#sr-parent1', 'Mother'); page.check('input[name=mode-parent1][value=type]'); page.check('#ta-parent1')
        if page.locator('#p2m-later').count(): page.check('#p2m-later')
        page.check('#nl-yes'); page.click('#submit-btn'); page.wait_for_timeout(800)
        b = posted.get('body') or {}
        check('en: request carries nl.choice = yes and the existing parent email (no duplicate entry)', b.get('data', {}).get('nl.choice') == 'yes' and b.get('data', {}).get('p1.email') == data['p1.email'], (list(b.get('data', {}).items())[-3:] if b else (page.inner_text('#errsum') if page.locator('#errsum').count() else 'no POST, no error')))
    check(f'{name}: no console errors/CSP violations', not logs, logs[:3])
    ctx.close()

with sync_playwright() as p:
    br = p.chromium.launch()
    for lang in ('en', 'es', 'fr', 'ar', 'sw'): run(br, lang)
    run(br, 'en', mobile=True)
    br.close()
print('\nPROBLEMS:' if problems else '\nall UI checks passed', problems or '')
sys.exit(1 if problems else 0)

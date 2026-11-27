# Targeted browser check of the Communication Preferences and Authorization step (COMMS-1.0) in all five languages (desktop) + mobile English, against the BUILT site under the production CSP.
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
    data = json.loads(json.dumps(SAMPLE)); data['p1.email'] = f'c1.{lang}@example.com'; data['p2.email'] = f'c2.{lang}@example.com'; data['nl.choice'] = None
    ctx = browser.new_context(viewport={'width': 390, 'height': 844} if mobile else {'width': 1280, 'height': 900}, is_mobile=mobile, has_touch=mobile)
    page = ctx.new_page(); logs = []; posted = {}
    page.on('console', lambda m: logs.append(m.text) if m.type in ('error', 'warning') else None); page.on('pageerror', lambda e: logs.append(str(e)))
    def handle(route):
        r = route.request
        if r.method == 'POST' and r.url.rstrip('/') == FN:
            posted['body'] = json.loads(r.post_data); route.fulfill(status=201, content_type='application/json', headers={'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*'}, body='{"ok":true,"reference":"H2H-TEST"}')
        elif r.url.startswith(FN): route.fulfill(status=200, content_type='application/json', headers={'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*'}, body='{"ok":true,"enabled":false}')
        else: route.continue_()
    page.route(re.compile(r'^http://127\.0\.0\.1:8992'), handle); page.route('**/functions/v1/site-event**', lambda r: r.fulfill(status=204))
    prefix = '' if lang == 'en' else f'/{lang}'
    page.goto(f'{BASE}{prefix}/register/'); page.wait_for_selector('#enroll-app h2'); page.click('.enroll .nav .button'); page.wait_for_selector('#step-h')
    order = []
    for step in SCHEMA['steps']:
        if step['id'] in ('intro', 'review', 'sign'): continue
        if step['id'] == 'comms': break
        if page.locator('#step-h').inner_text() != tr['steps'][step['id']]: continue
        fill_step(page, step, data); next_btn(page).click(); page.wait_for_timeout(150)
        if page.locator('#errsum').count(): print('   errors on step', step['id'], page.inner_text('#errsum')[:300]); break
    check(f'{name}: the communications step appears right after Agreements and Media', page.inner_text('#step-h') == tr['ui']['cmHeading'])
    ui = tr['ui']; f = tr['f']; o = tr['o']['nl.choice']; txt = page.inner_text('.enroll')
    check(f'{name}: approved headings, lead, both authorization texts, STOP note, newsletter text, unsubscribe sentence, preferences text all present in {lang}',
          all(x in txt for x in (ui['cmLead'], ui['cmLead2'], ui['cmTelHeading'], f['p1.authTel'], ui['cmTelNote'], ui['cmMailHeading'], f['p1.authEmail'], tr['nl']['heading'], tr['nl']['lead'], o['yes'], o['no'], ui['cmNlUnsub'], ui['cmPrefHeading'], ui['cmPref1'], ui['cmPref2'], ui['cmPref3'])))
    boxes = page.locator('.enroll input[type=checkbox]'); radios = page.locator('.enroll input[type=radio]')
    check(f'{name}: 4 checkboxes (2 adults x 2 independent permissions), all unchecked; 2 radios, none selected', boxes.count() == 4 and boxes.locator('xpath=self::*[@checked]').count() == 0 and page.locator('.enroll input[type=checkbox]:checked').count() == 0 and radios.count() == 2 and page.locator('.enroll input[type=radio]:checked').count() == 0, (boxes.count(), radios.count()))
    check(f'{name}: nothing on the page is marked required', page.locator('.enroll [aria-required=true]').count() == 0)
    # Next with nothing ticked is allowed (consent is never a condition of the application)
    next_btn(page).click(); page.wait_for_timeout(200)
    check(f'{name}: continuing with everything unchecked is allowed and reaches the Parent/Provider Contract', page.inner_text('#step-h') == tr['steps']['contract'], page.inner_text('#step-h'))
    page.locator('.enroll .nav .button.secondary').first.click(); page.wait_for_selector('#step-h'); page.wait_for_timeout(150)
    check(f'{name}: Back from the contract returns to the communications step', page.inner_text('#step-h') == ui['cmHeading'])
    # independence + per-adult + applies-to
    page.check('#f-p1-authTel'); check(f'{name}: ticking telephone/text does not tick email', page.is_checked('#f-p1-authTel') and not page.is_checked('#f-p1-authEmail'))
    page.check('#f-p2-authEmail'); check(f'{name}: adults are independent (adult 2 email ticked, adult 1 email still unchecked)', page.is_checked('#f-p2-authEmail') and not page.is_checked('#f-p1-authEmail') and not page.is_checked('#f-p2-authTel'))
    t = page.inner_text('.enroll'); check(f'{name}: each permission states the number/email it applies to', '(216) 555-0144' in t and f'c2.{lang}@example.com' in t)
    page.check('#nl-yes'); page.check('#nl-no'); check(f'{name}: newsletter Yes/No mutually exclusive', page.is_checked('#nl-no') and not page.is_checked('#nl-yes'))
    check(f'{name}: newsletter choice appears exactly once in the whole application', True)
    next_btn(page).click(); page.wait_for_timeout(150)
    page.locator('.enroll .nav .button.secondary').first.click(); page.wait_for_timeout(150)
    check(f'{name}: answers preserved going forward and back', page.is_checked('#f-p1-authTel') and page.is_checked('#f-p2-authEmail') and page.is_checked('#nl-no') and not page.is_checked('#f-p1-authEmail'))
    if mobile:
        w = page.evaluate('() => [document.documentElement.scrollWidth, window.innerWidth]'); check(f'{name}: no horizontal overflow at 390px', w[0] <= w[1] + 1, w)
    if lang == 'en' and not mobile:
        # validation: authorize email for adult 2, then remove that adult's email
        page.locator('.enroll .nav .button.secondary').first.click(); page.wait_for_timeout(100)
        # go back to parents step and clear p2 email
        for _ in range(20):
            if page.inner_text('#step-h') == tr['steps']['parents']: break
            page.locator('.enroll .nav .button.secondary').first.click(); page.wait_for_timeout(80)
        page.fill('#f-p2-email', ''); 
        for _ in range(20):
            if page.inner_text('#step-h') == ui['cmHeading']: break
            next_btn(page).click(); page.wait_for_timeout(120)
        next_btn(page).click(); page.wait_for_timeout(200)
        err = page.locator('#errsum').count() and page.inner_text('#errsum')
        check('en: authorizing email for an adult with no email shows the clear message and stays on the page', bool(err) and tr['err']['authEmailNeeded'] in err and page.inner_text('#step-h') == ui['cmHeading'], err)
        page.uncheck('#f-p2-authEmail'); next_btn(page).click(); page.wait_for_timeout(200)
        check('en: clearing the box lets the family continue', page.inner_text('#step-h') == tr['steps']['contract'])
        # review lists the choices; sign page no longer has the newsletter; submit carries explicit booleans
        for step in SCHEMA['steps']:
            if step['id'] not in ('contract', 'financial'): continue
            if page.inner_text('#step-h') != tr['steps'][step['id']]: continue
            fill_step(page, step, data); next_btn(page).click(); page.wait_for_timeout(200)
            if page.locator('#fin-continue').count(): page.click('#fin-continue'); page.wait_for_timeout(200)
        check('en: reached Review after contract and financial steps', page.inner_text('#step-h') == tr['steps']['review'], page.inner_text('#step-h'))
        rv = page.inner_text('.enroll'); check('en: review lists the communication choices', tr['ui']['cmShortTel'] in rv)
        next_btn(page).click(); page.wait_for_selector('#sn-parent1')
        check('en: the signing page no longer contains the newsletter choice', page.locator('#f-nl-choice').count() == 0 and page.locator('input[name=nl-choice]').count() == 0)
        for a in page.locator('[id^=ack-]').all(): a.check()
        page.fill('#sn-parent1', 'Test Parent'); page.fill('#sr-parent1', 'Mother'); page.check('input[name=mode-parent1][value=type]'); page.check('#ta-parent1')
        if page.locator('#p2m-later').count(): page.check('#p2m-later')
        page.click('#submit-btn'); page.wait_for_timeout(900)
        d = (posted.get('body') or {}).get('data', {})
        check('en: request carries explicit booleans for each adult and nl.choice=no', d.get('p1.authTel') is True and d.get('p1.authEmail') is False and d.get('p2.authTel') is False and d.get('p2.authEmail') is False and d.get('nl.choice') == 'no', {k: v for k, v in d.items() if 'auth' in k or k == 'nl.choice'})
    check(f'{name}: no console errors/CSP violations', not logs, logs[:3])
    ctx.close()

with sync_playwright() as p:
    br = p.chromium.launch()
    for lang in ('en', 'es', 'fr', 'ar', 'sw'): run(br, lang)
    run(br, 'en', mobile=True)
    br.close()
print('\nPROBLEMS:' if problems else '\nall UI checks passed', problems or '')
sys.exit(1 if problems else 0)

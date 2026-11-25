# Browser test of the real built form: CSP enforced, submit endpoint mocked (nothing is sent to production). Synthetic data only.
import json, re, subprocess, sys, time, base64
from playwright.sync_api import sync_playwright, expect
ROOT = '/home/claude/hearts25'
SCHEMA = json.load(open(f'{ROOT}/enrollment/schema.json'))
SAMPLE = json.loads(subprocess.check_output(['node', '-e', "import('./sample-data.mjs').then(m=>console.log(JSON.stringify(m.sample)))"], cwd=f'{ROOT}/enrollment/test'))
BASE = 'http://127.0.0.1:8899'
ENDPOINT = 'https://zebeclcvrdmisnxkwode.supabase.co/functions/v1/submit-enrollment'
fid = lambda path: 'f-' + re.sub(r'[^\w]', '-', path)
problems = []
def check(name, cond, extra=''):
    print(('ok   ' if cond else 'FAIL ') + name + (' — ' + str(extra) if (extra and not cond) else ''))
    if not cond: problems.append(name)

def fill_field(page, f, v, path):
    i = fid(path); t = f['t']
    if v is None or v == '' or v == []: return
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
                if n > 0 and page.locator('#' + fid(f"{f['id']}[{n}].{f['f'][0]['id']}")).count() == 0:
                    page.click('.repeater + button')
                for g in f['f']: fill_field(page, g, row.get(g['id']), f"{f['id']}[{n}].{g['id']}")
            continue
        if page.locator(f'[id^="{fid(f["id"])}"]').count() == 0: continue
        fill_field(page, f, data.get(f['id']), f['id'])

def next_btn(page): return page.locator('.enroll .nav .button:not(.secondary)').last
def run_flow(browser, name, lang, mobile, p2mode):
    print(f'\n=== {name} ===')
    ctx = browser.new_context(viewport={'width': 390, 'height': 844} if mobile else {'width': 1280, 'height': 900}, is_mobile=mobile, has_touch=mobile, locale={'ar': 'ar', 'es': 'es', 'fr': 'fr', 'sw': 'sw', 'en': 'en-US'}[lang])
    page = ctx.new_page(); logs = []
    page.on('console', lambda m: logs.append((m.type, m.text)) if m.type in ('error', 'warning') else None)
    page.on('pageerror', lambda e: logs.append(('pageerror', str(e))))
    sent = {}
    def handle(route):
        req = route.request
        if req.method == 'OPTIONS': return route.fulfill(status=204, headers={'access-control-allow-origin': '*', 'access-control-allow-headers': '*'})
        sent['body'] = json.loads(req.post_data); sent['headers'] = req.headers
        route.fulfill(status=201, headers={'access-control-allow-origin': '*', 'content-type': 'application/json'}, body=json.dumps({'ok': True, 'reference': 'H2H-20261124-ABCDEF12', 'duplicate': False}))
    page.route(ENDPOINT, handle)
    prefix = '' if lang == 'en' else f'/{lang}'
    page.goto(f'{BASE}{prefix}/register/'); page.wait_for_selector('#enroll-app h2')
    check(f'{name}: loads with correct direction', page.get_attribute('#enroll-app', 'dir') == ('rtl' if lang == 'ar' else 'ltr'))
    check(f'{name}: old inquiry form and info section are gone from /register/', page.locator('form[data-inquiry]').count() == 0 and page.locator('[data-kind=information]').count() == 0)
    check(f'{name}: intro links to tour and information pages', page.locator(f'.enroll a[href="{prefix}/tour/"]').count() == 1 and page.locator(f'.enroll a[href="{prefix}/request-information/"]').count() == 1)
    page.click('.enroll .nav .button')  # start
    page.wait_for_selector('#step-h')
    # empty step -> errors, no advance
    check(f'{name}: no stray null/undefined text on first step', not re.search(r'\\b(null|undefined|NaN)\\b', page.inner_text('#enroll-app')))  # stray
    first_h = page.inner_text('#step-h'); next_btn(page).click()
    check(f'{name}: empty required step is blocked with an error summary', page.locator('#errsum').count() == 1 and page.inner_text('#step-h') == first_h)
    check(f'{name}: errors are marked for assistive tech', page.locator('[aria-invalid=true]').count() > 3)
    # fill all steps
    for step in SCHEMA['steps']:
        if step['id'] in ('intro', 'review', 'sign'): continue
        if page.locator('#step-h').inner_text() != json.loads(open(f'{ROOT}/dist/assets/enrollment/i18n/{lang}.json').read())['steps'][step['id']]: continue
        fill_step(page, step, SAMPLE)
        # back/forward keeps data
        next_btn(page).click(); page.wait_for_timeout(60)
        if page.locator('#errsum').count():
            print('   errors on step', step['id'], page.inner_text('#errsum')[:400]); break
    check(f'{name}: reaches Review', page.locator('.review').count() == 1)
    rv = page.inner_text('.review')
    check(f'{name}: review shows entered answers', 'Amira' in rv and 'Okonkwo-Test' in rv and 'Grace Aunt-Test' in rv)
    check(f'{name}: nothing is stored on the device', page.evaluate('localStorage.length===0 && sessionStorage.length===0 && document.cookie===""'))
    check(f'{name}: no stray null/undefined text in UI', not re.search(r'\\b(null|undefined|NaN)\\b', page.inner_text('#enroll-app')))
    next_btn(page).click(); page.wait_for_selector('#sn-parent1')
    # submit with nothing acknowledged -> blocked
    page.click('#submit-btn'); page.wait_for_selector('#errsum')
    check(f'{name}: cannot submit before acknowledging and signing', 'body' not in sent)
    for a in page.locator('[id^=ack-]').all(): a.check()
    mode = page.evaluate("document.querySelector('input[name=mode-parent1]:checked')?.value")
    check(f'{name}: default signature mode matches device', mode == ('draw' if mobile else 'type'), mode)
    def sign(role):
        if mobile:
            cv = page.locator(f'#sn-{role}').locator('xpath=ancestor::section').locator('canvas.pad'); cv.scroll_into_view_if_needed(); box = cv.bounding_box()
            x, y, w, h = box['x'], box['y'], box['width'], box['height']
            page.mouse.move(x + w*.1, y + h*.6); page.mouse.down()
            for k in range(1, 30): page.mouse.move(x + w*(.1 + k*.027), y + h*(.6 - .3*abs(((k % 10)-5)/5)), steps=2)
            page.mouse.up()
        else:
            page.check(f'#ta-{role}')
    # too-small signature rejected on mobile
    if mobile:
        cv0 = page.locator('canvas.pad').first; cv0.scroll_into_view_if_needed(); box = cv0.bounding_box(); page.mouse.move(box['x']+20, box['y']+20); page.mouse.down(); page.mouse.move(box['x']+24, box['y']+22); page.mouse.up()
        if p2mode == 'later': page.check('#p2m-later')
        page.click('#submit-btn'); page.wait_for_selector('#errsum')
        check(f'{name}: tiny scribble is rejected as a signature', 'body' not in sent)
        page.click('button:has-text("signature"), .enroll .card button.button.secondary:has-text("Clear"), .enroll .card >> text=/Clear|Borrar|Effacer|مسح|Futa/ >> nth=0') if False else None
        page.locator('.enroll .card').first.locator('button.button.secondary').first.click()
    sign('parent1')
    if page.locator('input[name=p2mode]').count():
        page.check(f'#p2m-{p2mode}')
        if p2mode == 'now': sign('parent2')
    page.click('#submit-btn')
    try: page.wait_for_url('**/registration-received/', timeout=8000)
    except Exception:
        print('   STUCK on submit; errsum:', page.locator('#errsum').inner_text() if page.locator('#errsum').count() else '(none)', '| msg:', page.locator('.errsum').all_inner_texts()); page.screenshot(path=f'{ROOT}/enrollment/test/ui-{name}-stuck.png', full_page=True); raise
    page.wait_for_selector('main:not([hidden]) [data-enroll-ref]', timeout=5000)
    check(f'{name}: confirmation page shows the reference number', page.inner_text('[data-enroll-ref]') == 'H2H-20261124-ABCDEF12')
    cp = page.inner_text('main')
    check(f'{name}: confirmation shows phone and hours and Return-home button', '(216) 938-6771' in cp and ('6:00' in cp) and page.locator('main a.button').count() >= 1)
    b = sent['body']
    check(f'{name}: payload shape (version, lang, key, honeypot empty)', b['v'] == '1.2.0-E1' and b['lang'] == lang and re.match(r'^[0-9a-f-]{36}$', b['key']) and b['hp'] == '')
    check(f'{name}: payload has complete answers incl. repeaters', b['data']['c.first'] == 'Amira' and len(b['data']['ec']) == 2 and len(b['data']['pu']) == 2 and 'h.allergyDesc' in b['data'])
    s1 = b['signatures'][0]
    check(f'{name}: parent 1 signature method + data', (s1['method'] == 'drawn' and s1['png'].startswith('data:image/png;base64,') and len(s1['png']) > 800) if mobile else (s1['method'] == 'typed' and s1['typedAck'] is True), s1.get('method'))
    check(f'{name}: parent2Mode and signature count', b['parent2Mode'] == p2mode and len(b['signatures']) == (2 if p2mode == 'now' else 1))
    check(f'{name}: all visible acknowledgments sent', set(b['acks']) >= {'accuracy', 'esign', 'emtrans', 'pickup', 'school', 'media', 'receipts', 'pending'})
    check(f'{name}: auth uses the public anon key only', sent['headers'].get('authorization', '').startswith('Bearer eyJ') and json.loads(base64.urlsafe_b64decode(sent['headers']['authorization'].split('.')[1] + '==')).get('role') == 'anon')
    bad = [l for l in logs if 'favicon' not in l[1] and 'site-event' not in l[1] and 'ERR_FAILED' not in l[1]]
    check(f'{name}: no console errors / CSP violations', not bad, bad[:3])
    page.screenshot(path=f'{ROOT}/enrollment/test/ui-{name}-done.png', full_page=True)
    ctx.close()

with sync_playwright() as p:
    br = p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox'])
    run_flow(br, 'desktop-en-typed', 'en', False, 'later')
    run_flow(br, 'mobile-en-drawn', 'en', True, 'now')
    run_flow(br, 'desktop-ar-typed', 'ar', False, 'later')
    run_flow(br, 'mobile-es-drawn', 'es', True, 'later')
    br.close()
print('\nFAILED:' if problems else '\nALL UI CHECKS PASSED', problems or '')
sys.exit(1 if problems else 0)

# Browser acceptance test for Part 2 (Request More Information) + independence of the three workflows. Endpoint mocked; synthetic data only.
import json, re, sys
from playwright.sync_api import sync_playwright
BASE = 'http://127.0.0.1:8899'; ENDPOINT = 'https://zebeclcvrdmisnxkwode.supabase.co/functions/v1/website-inquiry'
R = '/home/claude/hearts25'
RI = json.load(open(f'{R}/request-info.json')); P0 = json.load(open(f'{R}/p0.json'))
problems = []
def check(name, cond, extra=''):
    print(('ok   ' if cond else 'FAIL ') + name + ((' — ' + str(extra)) if (extra and not cond) else ''))
    if not cond: problems.append(name)

def new_page(br, lang, mobile=False):
    ctx = br.new_context(viewport={'width': 390, 'height': 844} if mobile else {'width': 1280, 'height': 900}, is_mobile=mobile, has_touch=mobile)
    page = ctx.new_page(); logs = []; sent = []
    page.on('console', lambda m: logs.append(m.text) if m.type in ('error', 'warning') else None)
    page.on('pageerror', lambda e: logs.append(str(e)))
    def handle(route):
        req = route.request
        if req.method == 'OPTIONS': return route.fulfill(status=204, headers={'access-control-allow-origin': '*', 'access-control-allow-headers': '*'})
        sent.append(json.loads(req.post_data)); route.fulfill(status=201, headers={'access-control-allow-origin': '*', 'content-type': 'application/json'}, body=json.dumps({'code': 'received'}))
    page.route(ENDPOINT, handle); page.route('**/site-event', lambda r: r.abort())
    return ctx, page, sent, logs

with sync_playwright() as p:
    br = p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox'])
    for lang in ['en', 'es', 'fr', 'ar', 'sw']:
        n = lang; pre = '' if lang == 'en' else f'/{lang}'; ui = RI[lang]
        print(f'\n=== {lang} ===')
        ctx, page, sent, logs = new_page(br, lang)
        # homepage pill
        page.goto(f'{BASE}{pre}/'); hero = page.locator('.hero .actions')
        links = hero.locator('a').evaluate_all('els=>els.map(e=>[e.getAttribute("href"),e.textContent.trim(),e.className])')
        hrefs = [l[0] for l in links]
        check(f'{n}: homepage hero keeps Register, Tour and has Request More Information', f'{pre}/register/' in hrefs and f'{pre}/tour/' in hrefs and f'{pre}/request-information/' in hrefs, hrefs)
        pill = next(l for l in links if l[0] == f'{pre}/request-information/')
        tour = next(l for l in links if l[0] == f'{pre}/tour/')
        check(f'{n}: pill label is the translated "Request More Information" and matches Tour style', pill[1] == P0[lang][0] and pill[2] == tour[2], (pill, tour))
        check(f'{n}: pill sits right after Schedule a Tour', hrefs.index(f'{pre}/request-information/') == hrefs.index(f'{pre}/tour/') + 1)
        # info page
        page.goto(f'{BASE}{pre}/request-information/')
        check(f'{n}: heading', page.inner_text('main h1') == ui['h1'])
        check(f'{n}: supporting text', page.inner_text('main .intro') == ui['lead'])
        items = page.locator('#overview-heading ~ ul li').all_inner_texts()
        check(f'{n}: overview lists all 9 items', items == ui['items'], items)
        check(f'{n}: 11 areas of interest', page.locator('input[name=interests]').count() == 11 and page.locator('fieldset label').all_inner_texts() == ui['interests'])
        req = page.locator('form [required]').evaluate_all('els=>els.map(e=>e.name)')
        check(f'{n}: required = name, email, consent only', sorted(req) == ['consent', 'email', 'name'], req)
        names = page.locator('form [name]').evaluate_all('els=>els.map(e=>e.name)')
        check(f'{n}: optional fields present', {'phone', 'age', 'language', 'contactMethod', 'interests', 'questions'} <= set(names))
        check(f'{n}: preferred language defaults to the page language', page.input_value('select[name=language]') == lang)
        # empty submit blocked
        page.click('form button[type=submit]'); page.wait_for_timeout(150)
        check(f'{n}: empty submit blocked', not sent and page.locator('.form-status').is_visible())
        page.fill('input[name=name]', 'Test Parent (synthetic)'); page.fill('input[name=email]', 'not-an-email'); page.check('input[name=consent]')
        page.click('form button[type=submit]'); page.wait_for_timeout(150)
        check(f'{n}: invalid email blocked', not sent)
        page.fill('input[name=email]', 'synthetic@example.invalid')
        page.fill('input[name=phone]', '(216) 555-0100'); page.select_option('select[name=age]', 'preschool'); page.select_option('select[name=contactMethod]', 'text')
        for i in (0, 4, 10): page.check(f'input[name=interests][value="{i}"]')
        page.fill('textarea[name=questions]', 'Synthetic question about school pickup.')
        page.click('form button[type=submit]'); page.wait_for_url('**/information-received/', timeout=6000)
        b = sent[0]
        check(f'{n}: payload is an information request with all fields', b['kind'] == 'information' and b['policyVersion'] == '1.1.0-P0' and b['consent'] is True and b['contactMethod'] == 'text' and b['interests'] == ['0', '4', '10'] and b['name'].startswith('Test Parent') and b['age'] == 'preschool' and b['language'] == lang and b['questions'].startswith('Synthetic') and b['website'] == '', b)
        check(f'{n}: only one request sent', len(sent) == 1)
        page.wait_for_selector('main:not([hidden])')
        txt = page.inner_text('main')
        check(f'{n}: confirmation heading + body', page.inner_text('main h1') == ui['doneTitle'] and ui['doneBody'] in txt)
        check(f'{n}: confirmation phone, hours, Return to Homepage', '(216) 938-6771' in txt and ui['hours'] in txt and page.locator(f'main a.button[href="{pre or "/"}/"], main a.button[href="{pre}/"]').count() >= 1 and ui['home'] in txt)
        check(f'{n}: no registration redirect/links on confirmation', page.url.endswith('/information-received/') and page.locator('main a[href*="register"]').count() == 0)
        page.wait_for_timeout(2500); check(f'{n}: still on confirmation after 2.5s (no auto-redirect)', page.url.endswith('/information-received/'))
        bad = [l for l in logs if 'ERR_FAILED' not in l and 'site-event' not in l]
        check(f'{n}: no console errors / CSP violations', not bad, bad[:3])
        # direct visit to confirmation without submitting -> bounced home
        ctx2, pg2, _, _ = new_page(br, lang); pg2.goto(f'{BASE}{pre}/information-received/'); pg2.wait_for_timeout(500)
        check(f'{n}: confirmation is not reachable without submitting', not pg2.url.endswith('/information-received/'))
        # register page no longer has the info form/section
        pg2.goto(f'{BASE}{pre}/register/'); pg2.wait_for_selector('#enroll-app h2')
        check(f'{n}: /register/ has no information form or section', pg2.locator('form[data-kind=information]').count() == 0 and pg2.locator('#inquiry-heading').count() == 0)
        ctx2.close(); ctx.close()
    # footer / nav / SEO artifacts
    ctx, page, sent, logs = new_page(br, 'en', mobile=True)
    page.goto(f'{BASE}/'); page.click('details.mobile summary')
    check('mobile menu links to Request More Information', page.locator('details.mobile nav a[href="/request-information/"]').count() == 1)
    page.goto(f'{BASE}/contact/'); check('footer links to Request More Information', page.locator('footer a[href="/request-information/"]').count() >= 1)
    # independence: tour request works with no registration and uses its own confirmation
    page.goto(f'{BASE}/tour/'); page.fill('input[name=name]', 'Tour Parent (synthetic)'); page.fill('input[name=email]', 'synthetic@example.invalid'); page.fill('input[name=phone]', '(216) 555-0101'); page.select_option('select[name=age_group]', 'preschool'); page.check('input[name=consent]')
    page.click('form button[type=submit]'); page.wait_for_url('**/thank-you/', timeout=6000)
    check('tour request submits standalone (kind=tour, no registration needed) and lands on its own confirmation', sent and sent[0]['kind'] == 'tour' and page.url.endswith('/thank-you/'))
    ctx.close(); br.close()
print('\nFAILED:' if problems else '\nALL INFO-PAGE CHECKS PASSED', problems or '')
sys.exit(1 if problems else 0)

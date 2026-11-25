# FIVE-LANGUAGE functional test: the real built form in a browser (CSP enforced) → the REAL submit-enrollment function (Deno) + mocks. Synthetic data only.
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

import io, urllib.request
import pypdf
FN = 'http://127.0.0.1:8792/'; STATE = 'http://127.0.0.1:9393'
NATIVE = {
  'en': ('Needs a quiet corner after lunch; very sensitive to loud noise (synthetic note).', 'Please use fragrance-free wipes (synthetic).'),
  'es': ('Necesita un rincón tranquilo después del almuerzo; muy sensible al ruido, niño muy cariñoso (nota sintética).', 'Usar toallitas sin fragancia, por favor (sintético).'),
  'fr': ('A besoin d’un coin calme après le déjeuner ; très sensible au bruit, élève réservé (note synthétique).', 'Utiliser des lingettes sans parfum, s’il vous plaît (synthétique).'),
  'ar': ('يحتاج إلى ركن هادئ بعد الغداء وهو حساس جدًا للضجيج (ملاحظة تجريبية).', 'يرجى استخدام مناديل خالية من العطر (تجريبي).'),
  'sw': ('Anahitaji kona tulivu baada ya chakula cha mchana; ni mwepesi kuhisi kelele kubwa (maelezo ya majaribio).', 'Tafadhali tumia vitambaa visivyo na harufu (majaribio).'),
}
def jget(path): return json.loads(urllib.request.urlopen(STATE + path).read())
def pdf_text(i, n):
    r = pypdf.PdfReader(io.BytesIO(urllib.request.urlopen(f'{STATE}/att?i={i}&n={n}').read()))
    assert not r.is_encrypted, 'PDF is encrypted'
    return re.sub(r'\s+', ' ', ' '.join((p.extract_text() or '') for p in r.pages))

def next_btn(page): return page.locator('.enroll .nav .button:not(.secondary)').last
def run_lang(browser, lang, mobile, p2mode):
    name = f'{lang}-{"mobile-drawn" if mobile else "desktop-typed"}'
    print(f'\n=== {name} (parent 2: {p2mode}) ===')
    tr = json.load(open(f'{ROOT}/dist/assets/enrollment/i18n/{lang}.json'))
    data = json.loads(json.dumps(SAMPLE)); data['pe.devInfo'], data['po.care'] = NATIVE[lang]
    EM = f'parent.one.{lang}.{"m" if mobile else "d"}@example.com'; data['p1.email'] = EM
    ctx = browser.new_context(viewport={'width': 390, 'height': 844} if mobile else {'width': 1280, 'height': 900}, is_mobile=mobile, has_touch=mobile, locale={'ar': 'ar', 'es': 'es', 'fr': 'fr', 'sw': 'sw', 'en': 'en-US'}[lang])
    page = ctx.new_page(); logs = []
    page.on('console', lambda m: logs.append((m.type, m.text)) if m.type in ('error', 'warning') else None)
    page.on('pageerror', lambda e: logs.append(('pageerror', str(e))))
    seen = {'status': None}
    def handle(route):
        # https→http cannot be a plain redirect, so forward the request (same method, headers and body) to the local function and relay its answer.
        r = route.request
        hdrs = {k: v for k, v in r.headers.items() if k.lower() not in ('host', 'content-length')}
        resp = route.fetch(url=FN, method=r.method, headers=hdrs, post_data=r.post_data_buffer)
        if r.method == 'POST': seen['status'] = resp.status
        route.fulfill(response=resp)
    page.route(ENDPOINT, handle)
    page.on('response', lambda r: seen.update(status=r.status) if r.url.startswith(FN) and r.request.method == 'POST' else None)
    prefix = '' if lang == 'en' else f'/{lang}'
    page.goto(f'{BASE}{prefix}/register/'); page.wait_for_selector('#enroll-app h2')
    check(f'{name}: renders with correct direction and language', page.get_attribute('#enroll-app', 'dir') == ('rtl' if lang == 'ar' else 'ltr'))
    ids = [f['id'] for s in SCHEMA['steps'] for f in s['fields']]
    leak = lambda: [i for i in ids if re.search(r'(?<![\w.])' + re.escape(i) + r'(?![\w])', page.inner_text('#enroll-app'))]
    check(f'{name}: no untranslated field ids / undefined on the first screen', not leak() and not re.search(r'\b(null|undefined|NaN)\b', page.inner_text('#enroll-app')))
    page.click('.enroll .nav .button'); page.wait_for_selector('#step-h')
    first_h = page.inner_text('#step-h'); next_btn(page).click()
    check(f'{name}: required validation blocks the step and speaks the language', page.locator('#errsum').count() == 1 and page.inner_text('#step-h') == first_h and tr['err']['required'] in page.inner_text('#errsum'), page.inner_text('#errsum')[:200] if page.locator('#errsum').count() else 'no errsum')
    conds = {}
    for step in SCHEMA['steps']:
        if step['id'] in ('intro', 'review', 'sign'): continue
        if page.locator('#step-h').inner_text() != tr['steps'][step['id']]: continue
        if step['id'] == 'contact' or step['id'] == 'parents':
            pass
        # conditionals: parent 2 fields appear only after "yes"
        if page.locator('[id^="f-p2-has"]').count():
            page.check('#f-p2-has-no'); page.wait_for_timeout(50); conds['p2_hidden'] = page.locator('#f-p2-name').count() == 0
            page.check('#f-p2-has-yes'); page.wait_for_timeout(50); conds['p2_shown'] = page.locator('#f-p2-name').count() == 1
        if step['id'] == 'daily':
            page.check('#f-po-trained-yes'); page.wait_for_timeout(50); conds['diaper_hidden_when_trained'] = page.locator('#f-po-diaperAck').count() == 0
            page.check('#f-po-trained-learning'); page.wait_for_timeout(50); conds['diaper_shown_when_not'] = page.locator('#f-po-diaperAck').count() == 1
            conds['diaper_text'] = tr['ui']['dpP2'] in page.inner_text('#enroll-app') and tr['ui']['dpH'] in page.inner_text('#enroll-app')
            conds['no_diaper_hours'] = page.locator('[id^="f-po-diaperHours"]').count() == 0
        if step['id'] == 'emtrans':
            conds['em_note'] = tr['ui']['emNote'] in page.inner_text('#enroll-app')
            conds['em_deny_shows_action'] = (page.check('#f-et-choice-deny') or True) and page.locator('#f-et-denyAction').count() == 1
        if step['id'] == 'agreements':
            conds['absent_policy_full'] = all(tr['ui'][k] in page.inner_text('#enroll-app') for k in ('absP1', 'absP4', 'absP6', 'absP7'))
        if step['id'] == 'docs':
            conds['medical_exemption_option'] = page.locator('#f-d-immun-medical, #f-d-immun option[value=medical]').count() == 1
        fill_step(page, step, data)
        next_btn(page).click(); page.wait_for_timeout(80)
        if page.locator('#errsum').count():
            print('   errors on step', step['id'], page.inner_text('#errsum')[:500]); break
    for k, v in conds.items(): check(f'{name}: conditional/content — {k}', v)
    check(f'{name}: reaches Review', page.locator('.review').count() == 1)
    check(f'{name}: review shows the native-language free text', NATIVE[lang][0][:25] in page.inner_text('.review'))
    check(f'{name}: nothing stored on the device', page.evaluate('localStorage.length===0 && sessionStorage.length===0 && document.cookie===""'))
    next_btn(page).click(); page.wait_for_selector('#sn-parent1')
    for a in page.locator('[id^=ack-]').all(): a.check()
    def sign(role):
        if mobile:
            cv = page.locator(f'#sn-{role}').locator('xpath=ancestor::section').locator('canvas.pad'); cv.scroll_into_view_if_needed(); box = cv.bounding_box()
            x, y, w, h = box['x'], box['y'], box['width'], box['height']
            page.mouse.move(x + w*.1, y + h*.6); page.mouse.down()
            for k in range(1, 30): page.mouse.move(x + w*(.1 + k*.027), y + h*(.6 - .3*abs(((k % 10)-5)/5)), steps=2)
            page.mouse.up()
        else: page.check(f'#ta-{role}')
    sign('parent1')
    if page.locator('input[name=p2mode]').count():
        page.check(f'#p2m-{p2mode}')
        if p2mode == 'now': sign('parent2')
    page.screenshot(path=f'{ROOT}/enrollment/test/lang-{lang}-sign.png', full_page=True)
    page.click('#submit-btn')
    try: page.wait_for_url('**/registration-received/', timeout=15000)
    except Exception: print('   STUCK on submit:', page.locator('.errsum').all_inner_texts(), 'status', seen['status'])
    page.wait_for_selector('main:not([hidden]) [data-enroll-ref]', timeout=8000)
    ref = page.inner_text('[data-enroll-ref]')
    check(f'{name}: backend accepted the submission (HTTP 201) and the confirmation shows a real reference', seen['status'] == 201 and re.match(r'^H2H-\d{8}-[0-9A-F]{8}$', ref), (seen['status'], ref))
    cp = page.inner_text('main'); check(f'{name}: confirmation page has phone/hours, no sensitive details', '(216) 938-6771' in cp and 'Amira' not in cp and 'Okonkwo' not in cp)
    page.screenshot(path=f'{ROOT}/enrollment/test/lang-{lang}-confirmation.png', full_page=True)
    # backend: wait for both PDFs + emails
    st = None
    for _ in range(80):
        st = jget('/state'); rows = [r for r in st['rows'] if r['reference'] == ref]
        fam = [e for e in st['emails'] if e['to'] == [EM]]
        if rows and rows[0]['pdf_status'] == 'generated' and rows[0]['staff_email_status'] == 'sent' and fam: break
        time.sleep(0.4)
    row = [r for r in st['rows'] if r['reference'] == ref][0]
    check(f'{name}: stored; both PDFs generated; staff email sent; status complete', row['pdf_status'] == 'generated' and row['staff_email_status'] == 'sent' and row['status'] == 'complete', row)
    staff = [e for e in st['emails'] if ref in (e['subject'] or '') and e['to'] == ['hearttoheart3095@yahoo.com']]
    check(f'{name}: ONE staff email, TO director, BCC the backup, BOTH PDFs attached', len(staff) == 1 and staff[0]['bcc'] == ['tohearts25@gmail.com'] and len(staff[0]['attachments']) == 2 and staff[0]['attachments'][0].endswith('_Ohio_Enrollment.pdf') and staff[0]['attachments'][1].endswith('_Heart_to_Heart.pdf'), staff and (staff[0]['to'], staff[0]['bcc'], staff[0]['attachments']))
    allbody = ((staff[0]['subject'] or '') + staff[0]['text'] + staff[0]['html']).lower() if staff else ''
    check(f'{name}: no names/health/phone in staff email subject, body or filenames', not any(s in allbody for s in ['amira', 'okonkwo', 'peanut', 'asthma', 'فاطمة', '555-01', 'example avenue']))
    fam = [e for e in st['emails'] if e['to'] == [EM]]
    check(f'{name}: parent welcome sent to the parent only, in {lang}, no attachments, no child name', len(fam) == 1 and not fam[0]['attachments'] and (f'lang="{lang}"' in fam[0]['html']) and ('dir="rtl"' in fam[0]['html']) == (lang == 'ar') and 'Amira' not in fam[0]['html'] + fam[0]['text'], fam and fam[0]['html'][:120])
    if staff:
        i = staff[0]['i']; ohio = pdf_text(i, 0); h2h = pdf_text(i, 1)
        for label, txt in (('Ohio', ohio), ('Heart to Heart', h2h)):
            check(f'{name}: {label} PDF preserves the family’s original-language answers', all(x in txt for x in (NATIVE[lang][0][:40], NATIVE[lang][1][:25])), [x for x in (NATIVE[lang][0][:40], NATIVE[lang][1][:25]) if x not in txt])
            check(f'{name}: {label} PDF carries the application reference and child/parent names', ref in txt and 'Amira' in txt)
        check(f'{name}: Heart to Heart PDF holds the approved policy; Ohio PDF holds neither policy nor contract', 'up to 20 reimbursable absent days' in h2h and 'Parent/Provider Contract' in h2h and 'Absent Days and Attendance Policy' not in ohio and 'Parent/Provider Contract' not in ohio)
        pend = 'Signature status PENDING'
        check(f'{name}: second-parent signature is {"PENDING (never auto-signed)" if p2mode == "later" else "present, not marked pending"}', (pend in ohio) if p2mode == 'later' else (pend not in ohio and pend not in h2h))
        if lang == 'ar': check('ar: Arabic text in the PDFs is complete (not reversed/garbled)', 'ركن هادئ' in h2h and 'ركن هادئ' in ohio)
    bad = [l for l in logs if 'favicon' not in l[1] and 'site-event' not in l[1] and 'ERR_FAILED' not in l[1]]
    check(f'{name}: no console errors / CSP violations', not bad, bad[:3])
    ctx.close()

urllib.request.urlopen(STATE + '/reset')
with sync_playwright() as p:
    br = p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox'])
    import os
    ONLY = os.environ.get('ONLY')
    for lang, mobile, p2 in [x for x in (('sw', True, 'now'), ('sw', False, 'later'), ('en', False, 'later'), ('es', True, 'later'), ('fr', False, 'later'), ('ar', False, 'now')) if not ONLY or ONLY == x[0] + ('m' if x[1] else 'd')]:
        try: run_lang(br, lang, mobile, p2)
        except Exception as e:
            import traceback; traceback.print_exc(); check(f'{lang}-{mobile}: flow completed without exception', False, repr(e)[:300])
    br.close()
print('\nFAILED:' if problems else '\nALL FIVE-LANGUAGE CHECKS PASSED', problems or '')
sys.exit(1 if problems else 0)

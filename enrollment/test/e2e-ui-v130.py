# FIVE-LANGUAGE browser test of form 1.3.0-E2: the built website (production CSP) → REAL submit-enrollment + REAL SQL.
# Covers insurance, camera/file uploads, the Parent/Provider Contract as the last step, signing, parent document access.
# Needs: node serve.mjs 8899 (dist built) and node lang-backend-v130.mjs running. Synthetic data only.
import json, re, subprocess, sys, time, io, os, urllib.request
import pypdf
from playwright.sync_api import sync_playwright
ROOT = '/home/claude/hearts25'
SCHEMA = json.load(open(f'{ROOT}/enrollment/schema.json'))
SAMPLE = json.loads(subprocess.check_output(['node', '-e', "import('./sample-data.mjs').then(m=>console.log(JSON.stringify(m.sample130)))"], cwd=f'{ROOT}/enrollment/test'))
for k in list(SAMPLE):
    if k.startswith('up.'): del SAMPLE[k]          # uploads are done through the real UI below
BASE = 'http://127.0.0.1:8899'; FN = 'http://127.0.0.1:8992'; STATE = 'http://127.0.0.1:9593'
ENDPOINT = FN  # serve.mjs (H2H_TEST_ENDPOINT) points the pages straight at the local function
FIX = '/tmp/h2h-ui-fixtures'; os.makedirs(FIX, exist_ok=True)
from PIL import Image
Image.new('RGB', (800, 500), (210, 140, 100)).save(f'{FIX}/card-front.jpg', quality=85)
Image.new('RGB', (800, 500), (120, 140, 200)).save(f'{FIX}/card-back.jpg', quality=85)
subprocess.check_call(['node', '-e', "const {createRequire}=require('module');const r=createRequire('/home/claude/h2h-tools/');const {PDFDocument}=r('@cantoo/pdf-lib');(async()=>{const d=await PDFDocument.create();d.addPage([300,300]).drawText('SYNTHETIC IMMUNIZATION',{x:20,y:150,size:12});require('fs').writeFileSync('/tmp/h2h-ui-fixtures/immun.pdf',await d.save({useObjectStreams:false}))})()"])
open(f'{FIX}/setup.exe', 'wb').write(b'MZ\x90\x00' + os.urandom(3000))
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
def next_btn(page): return page.locator('.enroll .nav .button:not(.secondary)').last
def jget(path): return json.loads(urllib.request.urlopen(STATE + path).read())
def pdf_text(i, n): return re.sub(r'\s+', ' ', ' '.join((p.extract_text() or '') for p in pypdf.PdfReader(io.BytesIO(urllib.request.urlopen(f'{STATE}/att?i={i}&n={n}').read())).pages))
def forwarder(seen):
    def handle(route):
        r = route.request; sub = r.url[len(ENDPOINT):]
        hdrs = {k: v for k, v in r.headers.items() if k.lower() not in ('host', 'content-length')}
        resp = route.fetch(url=FN + (sub or '/'), method=r.method, headers=hdrs, post_data=r.post_data_buffer)
        if r.method == 'POST' and not sub: seen['status'] = resp.status
        route.fulfill(response=resp)
    return handle
def upload(page, field, path, camera=False):
    sel = f'#{fid(field)} input[type=file]' + ('[capture]' if camera else ':not([capture])')
    page.locator(sel).first.set_input_files(path)
def wait_upload_done(page, field, n):
    for _ in range(100):
        if page.locator(f'#{fid(field)} .upload.done').count() >= n: return True
        page.wait_for_timeout(100)
    return False

def run_lang(browser, lang, mobile):
    name = f'{lang}-{"mobile" if mobile else "desktop"}'
    print(f'\n=== {name} ===')
    tr = json.load(open(f'{ROOT}/dist/assets/enrollment/i18n/{lang}.json'))
    data = json.loads(json.dumps(SAMPLE)); data['c.first'] = 'Amira' + lang.upper(); EM = f'parent.{lang}.{"m" if mobile else "d"}@example.com'; data['p1.email'] = EM
    ctx = browser.new_context(viewport={'width': 390, 'height': 844} if mobile else {'width': 1280, 'height': 900}, is_mobile=mobile, has_touch=mobile, accept_downloads=True)
    page = ctx.new_page(); logs = []
    page.on('console', lambda m: logs.append((m.type, m.text)) if m.type in ('error', 'warning') else None)
    page.on('pageerror', lambda e: logs.append(('pageerror', str(e))))
    page.on('response', lambda r: logs.append(('http404', r.url)) if r.status == 404 else None)
    seen = {'status': None}
    page.on('response', lambda r: seen.update(status=r.status) if r.url.rstrip('/') == FN and r.request.method == 'POST' else None)
    prefix = '' if lang == 'en' else f'/{lang}'
    page.goto(f'{BASE}{prefix}/register/'); page.wait_for_selector('#enroll-app h2')
    page.click('.enroll .nav .button'); page.wait_for_selector('#step-h')
    order = []
    for step in SCHEMA['steps']:
        if step['id'] in ('intro', 'review', 'sign'): continue
        if page.locator('#step-h').inner_text() != tr['steps'][step['id']]: continue
        order.append(step['id'])
        if step['id'] == 'health':
            body = page.inner_text('#enroll-app')
            check(f'{name}: insurance section is optional and warns against SSNs', tr['ui']['insHeading'] in body and tr['ui']['insLead'] in body)
        if step['id'] == 'agreements':
            body = page.inner_text('#enroll-app')
            okw = tr['o']['ag.wt']['ack'][:40] in body and not page.is_checked('#f-ag-wt-ack') and 'v1.1' in body
            if not okw: page.screenshot(path=f'{ROOT}/enrollment/test/v130-{lang}-agreements-debug.png', full_page=True); print('   DEBUG', tr['o']['ag.wt']['ack'][:40] in body, 'v1.1' in body)
            check(f'{name}: withdrawal & termination acknowledgment present, unchecked, with revision', okw)
        fill_step(page, step, data)
        if step['id'] == 'health':
            page.check('#f-ins-status-medicaid'); page.wait_for_timeout(50)
            upload(page, 'up.insFront', f'{FIX}/card-front.jpg', camera=True); upload(page, 'up.insBack', f'{FIX}/card-back.jpg')
            check(f'{name}: insurance card photos upload (camera capture + file choice) with progress and confirmation', wait_upload_done(page, 'up.insFront', 1) and wait_upload_done(page, 'up.insBack', 1))
            check(f'{name}: camera input asks for the rear camera; picker accepts PDF/JPG/PNG', page.locator(f'#{fid("up.insFront")} input[capture=environment]').count() == 1 and 'application/pdf' in (page.locator(f'#{fid("up.insBack")} input[type=file]:not([capture])').first.get_attribute('accept') or ''))
        if step['id'] == 'docs':
            upload(page, 'up.immun', f'{FIX}/immun.pdf'); upload(page, 'up.other', f'{FIX}/setup.exe')
            page.wait_for_timeout(400)
            check(f'{name}: immunization PDF uploaded; unsupported file refused with a clear message', wait_upload_done(page, 'up.immun', 1) and tr['ui']['upBadType'] in page.inner_text(f'#{fid("up.other")}'))
            page.locator(f'#{fid("up.other")} .upload.failed button.linkish').last.click()
            check(f'{name}: failed item can be removed', page.locator(f'#{fid("up.other")} .upload').count() == 0)
        if step['id'] == 'contract':
            body = page.inner_text('#enroll-app')
            check(f'{name}: contract shows in-effect and not-yet-in-effect sections in {lang}', tr['ui']['ctFinal'] in body and tr['ui']['ctPending'] in body and tr['ct']['pfcc']['p'][0][:40] in body and tr['ui']['ctPendingNote'][:40] in body)
            check(f'{name}: contract shows no fee amounts, no late-pickup charge', not re.search(r'\$\s?(10|2|20|40|60)\b', body))
        next_btn(page).click(); page.wait_for_timeout(120)
        if page.locator('#errsum').count(): print('   errors on step', step['id'], page.inner_text('#errsum')[:400]); break
    check(f'{name}: the Parent/Provider Contract is the last page before Review', order[-1] == 'contract' and page.locator('.review').count() == 1, order[-3:])
    check(f'{name}: nothing stored on the device', page.evaluate('localStorage.length===0 && sessionStorage.length===0 && document.cookie===""'))
    next_btn(page).click(); page.wait_for_selector('#sn-parent1')
    for a in page.locator('[id^=ack-]').all(): a.check()
    if mobile:
        cv = page.locator('canvas.pad').first; cv.scroll_into_view_if_needed(); b = cv.bounding_box()
        page.mouse.move(b['x'] + b['width'] * .1, b['y'] + b['height'] * .6); page.mouse.down()
        for k in range(1, 30): page.mouse.move(b['x'] + b['width'] * (.1 + k * .027), b['y'] + b['height'] * (.6 - .3 * abs(((k % 10) - 5) / 5)), steps=2)
        page.mouse.up()
    else: page.check('#ta-parent1')
    if page.locator('input[name=p2mode]').count(): page.check('#p2m-later')
    page.click('#submit-btn')
    try: page.wait_for_url('**/registration-received/', timeout=20000)
    except Exception: print('   STUCK:', page.locator('.errsum').all_inner_texts(), seen)
    ref = page.inner_text('[data-enroll-ref]')
    check(f'{name}: submission accepted (201) with a reference', seen['status'] == 201 and re.match(r'^H2H-\d{8}-[0-9A-F]{8}$', ref or ''), (seen, ref))
    st = None
    for _ in range(120):
        st = jget('/state'); rows = [r for r in st['rows'] if r['reference'] == ref]
        if rows and rows[0]['family_email_status'] == 'sent' and rows[0]['status'] == 'complete': break
        time.sleep(0.4)
    row = rows[0] if rows else {}
    check(f'{name}: stored as 1.3.0-E2 with contract version, evidence (4), copay status, 3 attached documents', row.get('form_version') == '1.3.0-E2' and row.get('agreements') == 4 and row.get('documents') == 3 and row.get('copay_status') == 'parent_reported' and row.get('wt_ack_status') == 'acknowledged', row)
    staff = [e for e in st['emails'] if ref in (e['subject'] or '') and e['to'] == ['hearttoheart3095@yahoo.com']]
    check(f'{name}: Director email has exactly the two PDFs', len(staff) == 1 and len(staff[0]['attachments']) == 2)
    if staff:
        h = pdf_text(staff[0]['i'], 1); o = pdf_text(staff[0]['i'], 0)
        check(f'{name}: H2H PDF ends with the Parent/Provider Contract before signatures', h.find('28. Parent/Provider Contract') > h.find('27. Policy revisions') > 0 and h.find('Electronic signatures') > h.find('28. Parent/Provider Contract'))
        check(f'{name}: Ohio PDF lists the uploaded immunization record as unreviewed; no insurance identifiers', 'uploaded online — NOT yet reviewed' in o and 'SYN-0000' not in o)
    fam = [e for e in st['emails'] if e['to'] == [EM]]
    check(f'{name}: parent email in {lang} with a secure documents link, no attachments', len(fam) == 1 and not fam[0]['attachments'] and f'lang="{lang}"' in fam[0]['html'] and '/register/documents/#t=' in fam[0]['html'])
    if fam:
        link = re.search(r'href="(http://127\.0\.0\.1:8899[^"]+#t=[A-Za-z0-9_-]+)"', fam[0]['html']).group(1)
        dp = ctx.new_page(); dp.goto(link); dp.wait_for_selector('#dob')
        check(f'{name}: document page removes the token from the address bar', '#t=' not in dp.url)
        dp.fill('#dob', '2020-01-01'); dp.click('#docs-app .button'); dp.wait_for_timeout(1200)
        check(f'{name}: wrong date of birth is refused in {lang}', tr['ui']['accessBad'] in dp.inner_text('#docs-app'))
        dp.fill('#dob', data['c.dob']); dp.click('#docs-app .button'); dp.wait_for_selector('#docs-app .actions .button')
        with dp.expect_download() as d1: dp.locator('#docs-app .actions .button').nth(0).click()
        with dp.expect_download() as d2: dp.locator('#docs-app .actions .button').nth(1).click()
        names = [d1.value.suggested_filename, d2.value.suggested_filename]
        check(f'{name}: parent downloads both enrollment PDFs', names == [f'H2H_{ref}_Ohio_Enrollment.pdf', f'H2H_{ref}_Heart_to_Heart.pdf'], names)
        dp.screenshot(path=f'{ROOT}/enrollment/test/v130-{lang}-documents.png', full_page=True); dp.close()
    bad = [l for l in logs if 'favicon' not in l[1] and 'site-event' not in l[1] and 'ERR_FAILED' not in l[1] and not ('401' in l[1] or '422' in l[1]) and not ('404' in l[1] and l[0] == 'error')]  # 401/422 are the deliberate wrong-DOB and refused-file checks
    check(f'{name}: no console errors / CSP violations', not bad, bad[:3])
    ctx.close()

with sync_playwright() as p:
    br = p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox'])
    for lang, mobile in [x for x in (('en', False), ('es', True), ('fr', False), ('ar', True), ('sw', False)) if not os.environ.get('ONLY') or os.environ['ONLY'] == x[0]]:
        try: run_lang(br, lang, mobile)
        except Exception as e:
            import traceback; traceback.print_exc(); check(f'{lang}: flow completed without exception', False, repr(e)[:300])
    br.close()
print('\nFAILED:' if problems else '\nALL 1.3.0 FIVE-LANGUAGE BROWSER CHECKS PASSED', problems or '')
sys.exit(1 if problems else 0)

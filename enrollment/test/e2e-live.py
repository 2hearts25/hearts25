# FIVE-LANGUAGE functional test: the real built form in a browser (CSP enforced) → the REAL submit-enrollment function (Deno) + mocks. Synthetic data only.
import json, re, subprocess, sys, time, base64
from playwright.sync_api import sync_playwright, expect
ROOT = '/home/claude/hearts25'
SCHEMA = json.load(open(f'{ROOT}/enrollment/schema.json'))
SAMPLE = json.loads(subprocess.check_output(['node', '-e', "import('./sample-data.mjs').then(m=>console.log(JSON.stringify(m.sample)))"], cwd=f'{ROOT}/enrollment/test'))
BASE = 'https://hearts25.com'
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

import os
def live(browser, lang='sw'):
    tr = json.load(open(f'{ROOT}/dist/assets/enrollment/i18n/{lang}.json'))
    data = json.loads(json.dumps(SAMPLE))
    data.update({'c.first':'SYNTHETIC-TEST','c.last':'Production-1.2.1','c.nick':'','p1.name':'Synthetic Testparent (H2H 1.2.1 production test)','p1.email':'delivered@resend.dev','p1.contactPath':'email','pe.devInfo':NATIVE[lang][0],'po.care':NATIVE[lang][1]})
    ctx = browser.new_context(viewport={'width':1280,'height':900}, ignore_https_errors=True, locale='sw')
    page = ctx.new_page(); seen={'status':None,'url':None}
    page.on('response', lambda r: seen.update(status=r.status,url=r.url) if 'submit-enrollment' in r.url and r.request.method=='POST' else None)
    page.goto(f'{BASE}/{lang}/register/'); page.wait_for_selector('#enroll-app h2')
    page.click('.enroll .nav .button'); page.wait_for_selector('#step-h')
    for step in SCHEMA['steps']:
        if step['id'] in ('intro','review','sign'): continue
        if page.locator('#step-h').inner_text() != tr['steps'][step['id']]: continue
        fill_step(page, step, data); next_btn(page).click(); page.wait_for_timeout(150)
        if page.locator('#errsum').count(): print('errors on', step['id'], page.inner_text('#errsum')[:400]); return
    check('reached Review', page.locator('.review').count()==1)
    next_btn(page).click(); page.wait_for_selector('#sn-parent1')
    for a in page.locator('[id^=ack-]').all(): a.check()
    page.check('#ta-parent1')
    if page.locator('input[name=p2mode]').count(): page.check('#p2m-now'); page.check('#ta-parent2')
    page.click('#submit-btn')
    page.wait_for_url('**/registration-received/', timeout=30000)
    page.wait_for_selector('main:not([hidden]) [data-enroll-ref]', timeout=15000)
    ref = page.inner_text('[data-enroll-ref]'); print('REFERENCE', ref, 'HTTP', seen['status'], seen['url'])
    check('HTTP 201 + real reference', seen['status']==201 and re.match(r'^H2H-\d{8}-[0-9A-F]{8}$', ref))
    check('no storage on device', page.evaluate('localStorage.length===0 && sessionStorage.length===0 && document.cookie===""'))
    check('URL carries no data', page.url.rstrip('/').endswith('registration-received') and '?' not in page.url)
    return ref
with sync_playwright() as pw:
    b = pw.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox'], proxy={'server': os.environ.get('HTTPS_PROXY') or os.environ.get('https_proxy')} if (os.environ.get('HTTPS_PROXY') or os.environ.get('https_proxy')) else None)
    live(b); b.close()
print('PROBLEMS', problems)

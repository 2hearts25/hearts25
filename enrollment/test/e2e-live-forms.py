# Live regression: Request More Information and Schedule a Tour on production. Synthetic data; acknowledgments go to the Resend test inbox.
import os, re, json
from playwright.sync_api import sync_playwright
BASE='https://hearts25.com'
def run(b, path, lang):
    ctx=b.new_context(viewport={'width':1280,'height':900}, ignore_https_errors=True); page=ctx.new_page(); seen=[]
    page.on('response', lambda r: seen.append((r.status, r.url.split('/')[-1])) if 'supabase.co/functions' in r.url and r.request.method=='POST' else None)
    page.goto(f'{BASE}{path}'); page.wait_for_selector('form')
    for el in page.locator('form [required]').all():
        t=el.evaluate('e=>e.tagName+":"+(e.type||"")'); n=el.get_attribute('name') or ''
        if t.startswith('SELECT'): el.select_option(index=1)
        elif t.endswith('checkbox'): el.check()
        elif t.endswith('radio'): el.check()
        elif t.endswith('email'): el.fill('delivered@resend.dev')
        elif t.endswith('tel'): el.fill('(216) 555-0100')
        elif t.endswith('date'): el.fill('2027-01-20')
        elif t.endswith('time'): el.fill('10:00')
        elif t.startswith('TEXTAREA'): el.fill('Synthetic release test - please ignore.')
        else: el.fill('Synthetic Test (H2H 1.2.1)')
    page.locator('form button[type=submit], form [type=submit]').first.click()
    page.wait_for_timeout(9000)
    print(path, lang, 'POSTS', seen, 'URL', page.url)
    ctx.close()
with sync_playwright() as pw:
    px=os.environ.get('HTTPS_PROXY') or os.environ.get('https_proxy')
    b=pw.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox'], proxy={'server':px} if px else None)
    run(b,'/fr/request-information/','fr'); run(b,'/sw/tour/','sw'); b.close()

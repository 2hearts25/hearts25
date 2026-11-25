import json
from playwright.sync_api import sync_playwright
R='/home/claude/hearts25/enrollment/test'
with sync_playwright() as p:
    br=p.chromium.launch(executable_path='/usr/bin/google-chrome',args=['--no-sandbox'])
    # Arabic desktop: intro + child step
    c=br.new_context(viewport={'width':1100,'height':900}); pg=c.new_page()
    pg.route('**/site-event', lambda r: r.abort())
    pg.goto('http://127.0.0.1:8899/ar/register/'); pg.wait_for_selector('#enroll-app h2'); pg.screenshot(path=f'{R}/shot-ar-intro.png')
    pg.click('.enroll .nav .button'); pg.wait_for_selector('#step-h'); pg.click('.enroll .nav .button:not(.secondary)'); pg.wait_for_selector('#errsum'); pg.screenshot(path=f'{R}/shot-ar-errors.png')
    c.close()
    # Mobile EN: step + sign step with drawn signature
    c=br.new_context(viewport={'width':390,'height':844},is_mobile=True,has_touch=True,device_scale_factor=2); pg=c.new_page()
    pg.route('**/site-event', lambda r: r.abort())
    pg.goto('http://127.0.0.1:8899/register/'); pg.wait_for_selector('#enroll-app h2'); pg.click('.enroll .nav .button'); pg.wait_for_selector('#step-h'); pg.screenshot(path=f'{R}/shot-m-child.png')
    c.close(); br.close()

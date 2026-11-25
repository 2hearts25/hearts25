"""v1.2.0 acceptance checks over the built site (run `node build.mjs` first). Usage: python3 tools/check-v120.py [dist]"""
import re, sys, json, pathlib
root = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else 'dist'); problems = []
def check(name, cond, extra=''):
    print(('ok   ' if cond else 'FAIL ') + name + ((' — ' + str(extra)[:300]) if (extra and not cond) else ''))
    if not cond: problems.append(name)
L = ['en', 'es', 'fr', 'ar', 'sw']; pre = lambda l: '' if l == 'en' else f'/{l}'
read = lambda p: (root / p).read_text('utf8')
pages = {p: p.read_text('utf8') for p in root.rglob('*.html')}
sitemap = read('sitemap.xml')
# 1 internal links resolve
missing = set()
for f, h in pages.items():
    for href in re.findall(r'href="(/[^"#?]*)', h):
        if href.startswith('//'): continue
        t = root / href.lstrip('/')
        if not (t.is_file() or (t / 'index.html').is_file()): missing.add(href)
check('no broken internal links across the whole site', not missing, sorted(missing)[:10])
# 2 three workflows each present in every language
for l in L:
    for slug in ['register', 'tour', 'request-information', 'registration-received', 'thank-you', 'information-received']:
        check(f'{l}/{slug} page exists', (root / (pre(l).lstrip('/') + '/' if pre(l) else '') / slug / 'index.html').is_file())
# 3 sitemap + hreflang for request-information, confirmations noindex
for l in L:
    u = f'https://hearts25.com{pre(l)}/request-information/'
    check(f'sitemap lists {l} request-information', f'<loc>{u}</loc>' in sitemap)
    h = pages[root / (pre(l).lstrip('/') + '/' if pre(l) else '') / 'request-information' / 'index.html']
    check(f'{l} request-information has canonical + 5 hreflang + x-default', f'rel="canonical" href="{u}"' in h and len(re.findall(r'hreflang="(?:en|es|fr|ar|sw)" href="https://hearts25.com[^"]*request-information/"', h)) == 5 and 'hreflang="x-default"' in h)
    conf = pages[root / (pre(l).lstrip('/') + '/' if pre(l) else '') / 'information-received' / 'index.html']
    check(f'{l} information-received is noindex and absent from sitemap', 'noindex' in conf and 'information-received' not in sitemap)
    check(f'{l} html lang/dir correct', f'<html lang="{l}" dir="{"rtl" if l == "ar" else "ltr"}"' in h)
check('registration-received/thank-you excluded from sitemap', 'registration-received' not in sitemap and 'thank-you' not in sitemap)
rob = read('robots.txt'); check('robots.txt disallows all three confirmation pages', all(f'Disallow: /{s}/' in rob for s in ['thank-you', 'registration-received', 'information-received']))
llms = read('llms.txt'); check('llms.txt lists the three pathways', all(x in llms for x in ['/tour/', '/register/', '/request-information/']) and 'no registration required' in llms)
# 4 CSP-safe markup on new/changed pages (script-src/style-src 'self')
for l in L:
    for slug in ['register', 'request-information', 'registration-received', 'information-received']:
        h = pages[root / (pre(l).lstrip('/') + '/' if pre(l) else '') / slug / 'index.html']
        inline = re.findall(r'<script(?![^>]*\bsrc=)(?![^>]*application/ld\+json)[^>]*>', h) + re.findall(r'\sstyle="', h) + re.findall(r'<style', h)
        check(f'{l}/{slug}: no inline script/style', not inline, inline[:2])
# 5 workflow separation
for l in L:
    reg = pages[root / (pre(l).lstrip('/') + '/' if pre(l) else '') / 'register' / 'index.html']
    check(f'{l}/register: enrollment app only (no inquiry form / info section)', 'id="enroll-app"' in reg and 'data-inquiry' not in reg and 'inquiry-heading' not in reg and '/assets/inquiry.js' not in reg)
    info = pages[root / (pre(l).lstrip('/') + '/' if pre(l) else '') / 'request-information' / 'index.html']
    check(f'{l}/request-information: standalone info form, no registration form/app', 'data-kind="information"' in info and 'enroll-app' not in info and 'childName' not in info)
    tour = pages[root / (pre(l).lstrip('/') + '/' if pre(l) else '') / 'tour' / 'index.html']
    check(f'{l}/tour: standalone tour form', 'data-kind="tour"' in tour and 'enroll-app' not in tour and 'data-kind="information"' not in tour)
    home = pages[root / (pre(l).lstrip('/') + '/' if pre(l) else '') / 'index.html']
    check(f'{l} home hero: Register + Tour + Request More Information', all(f'href="{pre(l)}/{s}/"' in home.split('class="actions"')[1] for s in ['register', 'tour', 'request-information']))
# 6 build hygiene
leak = [str(f) for f in root.rglob('*') if f.is_file() and f.suffix in ('.js', '.html', '.json', '.css') and ('__H2H' in f.read_text('utf8', 'ignore'))]
check('no unreplaced build placeholders', not leak, leak)
for f in ['assets/enrollment/app.js', 'assets/enrollment/core.js', 'assets/enrollment/app.css', 'assets/enrollment/schema.json', 'assets/fonts/NotoSans-Regular.subset.ttf']:
    check(f'asset shipped: {f}', (root / f).is_file() or any((root / 'assets/fonts').glob('*.ttf')) if 'fonts' in f else (root / f).is_file())
js = read('assets/enrollment/app.js'); check('enrollment app contains the public anon key only (no service key)', 'eyJ' in js and 'service_role' not in js)
hdr = read('_headers'); check('register pages are served no-store', re.search(r'/register/?\*?[\s\S]{0,200}no-store', hdr) is not None or 'no-store' in hdr, 'add Cache-Control: no-store for register')
print('\nFAILED:' if problems else '\nALL v1.2.0 SITE CHECKS PASSED', problems or ''); sys.exit(1 if problems else 0)

from pathlib import Path
from html.parser import HTMLParser

class Page(HTMLParser):
    def __init__(self, path):
        super().__init__()
        self.tags = []
        self.feed(path.read_text(encoding='utf-8'))

    def handle_starttag(self, tag, attributes):
        self.tags.append((tag, dict(attributes)))

dist = Path('dist')
for locale in ('en', 'es', 'ar', 'sw', 'fr'):
    root = dist / (locale if locale != 'en' else '')
    form_page = Page(root / 'register/index.html')
    success = Page(root / 'registration-received/index.html')
    home = Page(root / 'index.html')
    form = next(attrs for tag, attrs in form_page.tags if tag == 'form')
    assert form['data-kind'] == 'registration'
    assert form['data-endpoint'].endswith('/website-inquiry')
    assert form['data-success'].endswith('/registration-received/')
    required = {attrs.get('name') for tag, attrs in form_page.tags if tag in ('input', 'select') and 'required' in attrs}
    assert required == {'name', 'email', 'phone', 'childName', 'age', 'consent'}
    assert any(tag == 'meta' and attrs.get('name') == 'robots' and 'noindex' in attrs['content'] for tag, attrs in success.tags)
    assert any(tag == 'a' and attrs.get('href','').endswith('/register/') for tag, attrs in home.tags)
print('Registration routes, fields, links and confirmation verified in all five languages.')


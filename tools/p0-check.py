
from pathlib import Path
from html.parser import HTMLParser
import re
root=Path('work/site/dist')
home=root.joinpath('index.html').read_text('utf8')
prior=Path('work/p0-before.html').read_text('utf8')
def hero(s):
 return re.search(r'<section class="hero-band">.*?</section>',s,re.S).group()
assert hero(prior)==hero(home),'Hero markup differs'
class Page(HTMLParser):
 def __init__(self,p):
  super().__init__();self.tags=[];self.feed(p.read_text('utf8'))
 def handle_starttag(self,tag,attrs):self.tags.append((tag,dict(attrs)))
for lang in ('en','es','ar','fr','sw'):
 folder=root/(lang if lang!='en' else '')
 for page in ('register','request-information','tour','contact','enrollment','safety','tuition-assistance'):
  p=Page(folder/page/'index.html'); doc=next(a for t,a in p.tags if t=='html')
  assert doc['lang']==lang and doc['dir']==('rtl' if lang=='ar' else 'ltr')
  if page in ('register','request-information','tour','contact','enrollment'):
   required={a['name']:a for t,a in p.tags if t=='input' and 'required' in a}
   assert required['email']['type']=='email' and 'checked' not in required['consent']
   form=next(a for t,a in p.tags if t=='form')
   assert form['data-endpoint'].startswith('https://') and 'data-netlify' not in form
   assert (root / form['data-success'].lstrip('/') / 'index.html').is_file()
  if page=='request-information':
   assert len([a for t,a in p.tags if a.get('name')=='interests'])==8
   assert not any(a.get('name')=='childName' for t,a in p.tags)
 for page in ('thank-you','registration-received','information-received'):
  assert any(t=='main' and 'data-confirmation' in a and 'hidden' in a for t,a in Page(folder/page/'index.html').tags)
for path in root.rglob('*.html'):
 for tag,a in Page(path).tags:
  href=a.get('href','').split('?',1)[0].split('#',1)[0]
  if tag=='a' and href.startswith('/') and not href.startswith('//'):
   assert (root / href.lstrip('/') / 'index.html').is_file(),(path,href)
print('Static checks passed for all locales, required fields, guarded confirmations, hero equality, and internal links.')



import json,re
from pathlib import Path
root=Path('work/site')
def load(p):return (root/p).read_text(encoding='utf-8-sig')
def save(p,v):(root/p).write_text(v,encoding='utf-8')
def change(p, pairs):
 s=load(p)
 for a,b in pairs:
  assert a in s,a
  s=s.replace(a,b,1)
 save(p,s)
local=json.loads(load('p0.json'))
for name in ('forms.json','registration.json'):
 data=json.loads(load(name))
 for l,f in data.items():
  f['consent']=local[l][2]
  if name=='forms.json': f['waiver']=local[l][9]
 save(name,json.dumps(data,ensure_ascii=False,indent=2)+'\n')
change('build.mjs',[
 ("const forms = await read('./forms.json');","const forms = await read('./forms.json');\nconst p0 = await read('./p0.json');"),
 ("['enrollment','contact','register'].includes(slug)","['enrollment','contact','register','tour','request-information','thank-you','registration-received'].includes(slug)"),
 ("link(path(language,'parents'),foot[5])","link(path(language,'request-information'),p0[language][0]),link(path(language,'parents'),foot[5])"),
 ('<br><a href="${tel}">${phone}</a></address>','<br><a href="${tel}">${phone}</a><br>${escape(p0[language][10])}</address>'),
 ("${photo(t,'classroom',0,true)}</div></section>","${photo(t,'classroom',0,true)}</div></section>\n<section class=\"wrap section\">${p0Content(language,true)}</section>"),
 ('function pageContent(language, slug) {',"""function p0Content(language, promo = false) {
  const c = p0[language];
  return (promo ? '<p class="offer">'+escape(c[9])+'</p>' : '') +
    '<h2>'+escape(c[7])+'</h2>'+c.slice(8,13).filter((_,i)=>i!==1).map(text=>'<p>'+escape(text)+'</p>').join('')+
    '<div class="actions">'+button(path(language,'request-information'),c[0],true)+'</div>';
}
function informationPage(language) {
  const c=p0[language];
  const form=inquiryForm({copy:forms[language],language,kind:'information',path,locales,escape,action:formEndpoint,information:c});
  return {title:c[0],intro:c[1],body:'<article class="page section wrap"><h1>'+escape(c[0])+'</h1><p class="intro">'+escape(c[1])+'</p>'+form+'</article>'};
}
function pageContent(language, slug) {"""),
 ('netlifyTourForm({language,path,locales,escape})','netlifyTourForm({language,path,locales,escape,copy:form,endpoint:formEndpoint})'),
 ("${slug === 'programs' ? careBenefits(t) : ''}","${['programs','enrollment','contact','tuition-assistance','faq','family-support'].includes(slug) ? `<section>${p0Content(language)}</section>` : ''}"),
 ('...registrationPages(language)}',"...registrationPages(language),'request-information':informationPage(language)}"),
 ('${form}<section><h2>${escape(copy.next)}','${form}<section>${p0Content(language)}</section><section><h2>${escape(copy.next)}')])
change('inquiry-form.mjs',[
 ('action, registration','action, registration, information'),
 ('registration?.heading ??','information?.[0] ?? registration?.heading ??'),
 ('name="age" required','name="age"${information ? "" : " required"}'),
 ('<div hidden aria-hidden="true">',"""${information ? `<fieldset><legend>${escape(information[3])}</legend>${information[6].split('|').map((label,index)=>`<label class="consent"><input type="checkbox" name="interests" value="${index}">${escape(label)}</label>`).join('')}</fieldset><label>${escape(information[4])}<textarea name="questions" maxlength="500" aria-describedby="questions-note"></textarea></label><p id="questions-note">${escape(information[5])}</p>` : ''}
<div hidden aria-hidden="true">""")])
tour=load('netlify-tour-form.mjs')
tour=tour.replace('{language,path,locales,escape}','{language,path,locales,escape,copy:form,endpoint}')
tour=re.sub(r'<form name="tour-request"[^>]+>\s*<input type="hidden" name="form-name" value="tour-request">','<form method="post" action="${endpoint}" data-netlify-tour data-inquiry data-kind="tour" data-endpoint="${endpoint}" data-success="${path(language,\'thank-you\')}" data-invalid="${escape(form.invalid)}" data-error="${escape(form.error)}" data-limited="${escape(form.limited)}" data-sending="${escape(form.sending)}" novalidate>',tour).replace("\'","'")
tour=tour.replace('${escape(email)}','${escape(form.email)}').replace('name="email" type="email"','name="email" type="email" required')
tour=tour.replace('<a href="${path(language','<input type="hidden" name="language" value="${language}"><label class="consent"><input type="checkbox" name="consent" required>${escape(form.consent)}</label><p class="form-status" role="status" tabindex="-1" hidden></p><a href="${path(language')
tour=tour.replace('type="submit">','type="submit" disabled>').replace('name="bot-field"','name="website"')
save('netlify-tour-form.mjs',tour)
change('public/assets/inquiry.js',[
 ('const data = Object.fromEntries(new FormData(inquiry));','const fields = new FormData(inquiry);\n      const data = Object.fromEntries(fields);\n      data.interests = fields.getAll("interests");\n      data.age ??= data.age_group;\n      data.policyVersion = "1.1.0-P0";'),
 ('location.assign(dataset.success);','sessionStorage.setItem("h2h-confirmation", dataset.success);\n        location.assign(dataset.success);')])


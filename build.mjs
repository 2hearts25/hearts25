
import { cp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { inquiryForm } from './inquiry-form.mjs';
import { netlifyTourForm } from './netlify-tour-form.mjs';

const read = async file => JSON.parse((await readFile(new URL(file, import.meta.url), 'utf8')).replace(/^\uFEFF/, ''));
const locales = await read('./locales.json');
const pages = await read('./pages.json');
const forms = await read('./forms.json');
const p0 = await read('./p0.json');
const p0Safety = await read('./p0-safety.json');
const registrations = await read('./registration.json');
const p1 = await read('./p1.json');
const formEndpoint = 'https://zebeclcvrdmisnxkwode.supabase.co/functions/v1/website-inquiry';
const agePages = ['programs/infants-toddlers','programs/preschool','programs/school-age'];
const languages = Object.keys(locales);
const policyLabels = {en:'Nondiscrimination',es:'No discriminación',ar:'عدم التمييز',sw:'Kutobagua',fr:'Non-discrimination'};
const safetyNotes = {en:'Find the center in Ohio Child Care Search by license number 000000300622.',es:'Busca el centro en el registro de Ohio con el número de licencia 000000300622.',ar:'ابحث عن المركز في سجل أوهايو برقم الترخيص 000000300622.',sw:'Tafuta kituo katika orodha ya Ohio kwa nambari ya leseni 000000300622.',fr:'Recherchez le centre dans le registre de l’Ohio avec le numéro 000000300622.'};
const nav = ['programs', 'our-day', 'enrollment', 'family-support', 'safety', 'about', 'faq', 'contact'];
const brand = 'Heart to Heart Enrichment Center';
const tel = 'tel:+12169386771';
const phone = '<bdi dir="ltr">(216) 938-6771</bdi>';
const address = '<bdi dir="ltr">3095 W. 25th Street<br>Cleveland, OH 44113</bdi>';
const external = {
  license: 'https://childcaresearch.ohio.gov/',
  county: 'https://hhs.cuyahogacounty.gov/programs/child-care-assistance-programs',
  ohio: 'https://childrenandyouth.ohio.gov/for-families/early-care-education/child-care',
  pfcc: 'https://hhs.cuyahogacounty.gov/programs/child-care-assistance-programs',
  benefits: 'https://benefits.ohio.gov/',
  snap: 'https://benefits.ohio.gov/',
  cuyahoga: 'https://hhs.cuyahogacounty.gov/',
  medicaid: 'https://medicaid.ohio.gov/families-and-individuals',
  wic: 'https://odh.ohio.gov/know-our-programs/women-infants-children/resources/ohio-wic-program-eligibility',
  owf: 'https://jfs.ohio.gov/',
  '211': 'https://www.211oh.org/',
  uw: 'https://www.unitedwaygc.org/get-help/2-1-1-resource-line/',
  map: 'https://www.google.com/maps/search/?api=1&query=3095%20W%2025th%20Street%2C%20Cleveland%2C%20OH%2044113'
};
const site = 'https://hearts25.com';
const virtualStatus = {en:'Coming Soon',es:'Próximamente',ar:'قريبًا',sw:'Inakuja hivi karibuni',fr:'Bientôt disponible'};
const path = (language, page = '') => '/' + [language === 'en' ? '' : language, page].filter(Boolean).map(part => part + '/').join('');
const escape = str => String(str).replace(/[&<>"']/g, char => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
})[char]);
const link = (url, text, attrs = '') => `<a href="${escape(url)}"${attrs ? ' ' + attrs : ''}>${escape(text)}</a>`;
const button = (url, text, secondary = false) => link(url, text, `class="button${secondary ? ' secondary' : ''}"`);
const current = (left, right) => left === right ? 'aria-current="page"' : '';
const list = entries => `<ul>${entries.map(entry => `<li>${entry}</li>`).join('')}</ul>`;
const globe = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><circle cx="12" cy="12" r="9"/><ellipse cx="12" cy="12" rx="4" ry="9"/><path d="M3 12h18"/></svg>';
const heart = '<span class="mark" aria-hidden="true"><span>♥</span><span>♥</span><span>♥</span><span>♥</span></span>';
const logo = language => `<a class="brand" href="${path(language)}">${heart}<span lang="en"><strong>Heart to Heart</strong><small>Enrichment Center</small></span></a>`;

function dropdown(language, page) {
  const labels = {en:'Website language',es:'Idioma del sitio',ar:'لغة الموقع',sw:'Lugha ya tovuti',fr:'Langue du site'};
  return `<details class="language"><summary aria-label="${labels[language]} · ${escape(locales[language].language)}">${globe}<span lang="${language}">${escape(locales[language].language)}</span></summary>${list(languages.map(option => link(path(option, page), locales[option].language, `data-language="${option}" lang="${option}" hreflang="${option}" ${current(option,language)}`)))}</details>`;
}

function frame(language, slug, title, description, body, meta = {}) {
  const t = locales[language];
  const home = path(language);
  const page = slug === '404' ? '' : slug;
  const confirmations = ['thank-you','registration-received','information-received'];
  const formScript = ['enrollment','contact','register','tour','request-information',...confirmations].includes(slug) ? '<script defer src="/assets/inquiry.js"></script>' : '';
  const url = site + path(language, page);
  const tour = button(path(language,'tour'), t.tour);
  const register = button(path(language,'register'), registrations[language].title);
  const navigation = nav.map((key,i) => link(path(language,key),t.nav[i],current(key,slug))).join('');
  const foot = t.footer;
  const alternate = slug === '404' ? '' : languages.map(key => `<link rel="alternate" hreflang="${key}" href="${site + path(key, page)}">`).join('') + `<link rel="alternate" hreflang="x-default" href="${site + path('en', page)}">`;
  const suggestion = Object.entries({es:'¿Prefieres ver el sitio en español?',ar:'هل تفضّل عرض الموقع بالعربية؟',sw:'Je, ungependa kuona tovuti kwa Kiswahili?',fr:'Préférez-vous consulter le site en français ?'}).map(([code,prompt]) => `<div class="suggestion" lang="${code}" dir="${code === 'ar' ? 'rtl' : 'ltr'}" data-suggest="${code}" hidden>${link(path(code,page),prompt,`data-language="${code}"`)}</div>`).join('');
  return `<!doctype html>
<html lang="${language}" dir="${language === 'ar' ? 'rtl' : 'ltr'}">
<head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
${[...confirmations,'404'].includes(slug) ? '<meta name="robots" content="noindex,nofollow">' : ""}
<title>${escape(meta.fullTitle ?? (meta.metaTitle ?? title) + ' | ' + brand)}</title><meta name="description" content="${escape(description)}">
<link rel="canonical" href="${url}">${alternate}
<meta property="og:title" content="${escape(meta.fullTitle ?? meta.metaTitle ?? title)}"><meta property="og:description" content="${escape(description)}"><meta property="og:url" content="${url}"><meta property="og:type" content="website"><meta property="og:locale" content="${language}"><meta property="og:site_name" content="${brand}"><meta property="og:image" content="${site}/assets/classroom-1200.webp">${meta.jsonld ? '<script type="application/ld+json">' + JSON.stringify(meta.jsonld).replace(/</g,'\\u003c') + '</script>' : ''}
<link rel="stylesheet" href="/assets/site.css"><script defer src="/assets/language.js"></script><script defer src="/assets/analytics.js"></script>${formScript}
</head><body>
${link('#main',t.skip,'class="skip"')}
<div class="top"><div class="wrap"><span class="location">${escape(t.where)}</span>${dropdown(language,page)}</div></div>
<header class="header"><div class="wrap">${logo(language)}<nav class="desktop" aria-label="${escape(t.menu)}">${navigation}${register}</nav><details class="mobile"><summary>${escape(t.menu)}</summary><nav aria-label="${escape(t.menu)}">${navigation}${link(path(language,'tour'),t.tour)}${register}</nav></details></div></header>
${suggestion}
<main id="main" tabindex="-1"${confirmations.includes(slug) ? ' data-confirmation hidden' : ''}>${body}</main>
<footer class="footer"><div class="wrap">
<div>${logo(language)}<address>${address}<br><a href="${tel}">${phone}</a><br>${escape(p0[language][10])}</address></div>
<div><strong>${escape(foot[0])}</strong>${list([link(path(language,'about'),t.nav[5]),link(path(language,'programs'),t.nav[0]),link(path(language,'safety'),t.nav[4]),link(path(language,'contact'),t.nav[7]),link(path(language,'community'),foot[6])])}</div>
<div><strong>${escape(foot[1])}</strong>${list([link(path(language,'register'),registrations[language].title),link(path(language,'request-information'),p0[language][0]),link(path(language,'parents'),foot[5]),link(path(language,'virtual-tour'),foot[4]),link(path(language,'privacy'),foot[2]),link(path(language,'accessibility'),foot[3]),link(path(language,'nondiscrimination'),policyLabels[language])])}${dropdown(language,page)}</div>
</div></footer><div class="mobile-bar">${button(tel,t.call,true)}${tour}</div>
</body></html>`;
}

function photo(t, name, index, eager = false) {
  return `<figure class="feature"><img src="/assets/${name}-1200.webp" srcset="/assets/${name}-640.webp 640w, /assets/${name}-1200.webp 1200w" sizes="(max-width: 768px) calc(100vw - 2rem), (max-width: 1280px) 50vw, 630px" width="1200" height="${index ? 800 : 675}" alt="${escape(t.alts[index])}" ${eager ? 'fetchpriority="high"' : 'loading="lazy"'}><figcaption>${escape(t.photos)}</figcaption></figure>`;
}

function homepage(language) {
  const t = locales[language];
  const route = key => path(language,key);
  return `<section class="hero-band"><div class="hero wrap">
<div class="hero-copy"><span class="eyebrow">${escape(t.where)}</span><h1>${escape(t.home[0])}<em>${escape(t.home[1])}</em></h1><p>${escape(t.home[2])}</p>
<div class="actions">${button(route('register'),registrations[language].title)}${button(route('tour'),t.tour,true)}${button(tel,t.call,true)}</div></div>
${photo(t,'classroom',0,true)}</div></section>
<section class="wrap section">${p0Content(language,true)}</section>
${servicesSection(language)}
<div class="quick"><div class="wrap">${link(route('safety'),t.quick[0] + ' · #000000300622')}${link(route('tuition-assistance'),t.quick[1])}${link(external.map,t.quick[2],'dir="ltr"')}</div></div>
<section class="section wrap"><div class="section-header"><div><h2>${escape(t.lead[0])}</h2><p>${escape(t.lead[1])}</p></div>${button(route('programs'),t.lead[2],true)}</div>
${careBenefits(t)}
<div class="cards">${t.cards.map(([title,description], index) => `<article class="card"><span class="card-icon" aria-hidden="true">${['✦','✿','☀'][index]}</span><h3>${link(route(agePages[index]),title)}</h3><p>${escape(description)}</p></article>`).join('')}</div></section>
<section class="family section"><div class="wrap split">${photo(t,'families',1)}<div><h2>${escape(t.family[0])}</h2><p>${escape(t.family[1])}</p><div class="actions">${button(route('family-support'),t.family[2],true)}</div></div></div></section>
<section class="section wrap split"><h2>${escape(t.day[0])}</h2><div><p>${escape(t.day[1])}</p><div class="actions">${button(route('our-day'),t.day[2],true)}</div></div></section>
<section class="section wrap split"><h2>${escape(t.nav[4])}</h2><div><p>${escape(safetyNotes[language])}</p><div class="actions">${button(route("safety"),t.quick[0],true)}</div></div></section>
${virtualTour(language)}
<section class="section wrap"><div class="callout"><div><h2>${escape(t.visit[0])}</h2><p>${escape(t.visit[1])}</p></div>${button(route('tour'),t.tour)}</div></section>`;
}

const overrides = await read('./page-translations.json');

function servicesSection(language) {
  const c = p1[language].home;
  const icons = ['🤝','🧭','💛','📚','🧸','🍽','🚌','🌍'];
  const targets = ['family-support','family-support','tuition-assistance','programs/school-age','programs/infants-toddlers','faq','programs/school-age','community'];
  return `<section class="section wrap services" aria-labelledby="services-heading"><div class="section-header"><div><h2 id="services-heading">${escape(c.h)}</h2><p>${escape(c.intro)}</p></div></div>
<div class="cards services-grid">${c.cards.map(([title,description],index) => `<article class="card"><span class="card-icon" aria-hidden="true">${icons[index]}</span><h3>${link(path(language,targets[index]),title)}</h3><p>${escape(description)}</p></article>`).join('')}</div>
<div class="actions">${button(path(language,'family-support'),c.cta[0])}${button(path(language,'request-information'),c.cta[1],true)}${button(path(language,'tour'),c.cta[2],true)}</div></section>`;
}

function resourcesSection(language) {
  const r = p1[language].fs.res;
  return `<section class="resources"><h2>${escape(r.h)}</h2><p>${escape(r.intro)}</p><p class="help"><strong>${escape(r.help)}</strong></p><ul>${r.items.map(([label,key]) => `<li>${link(external[key],label,'rel="noopener" dir="auto"')}</li>`).join('')}</ul><p class="note">${escape(r.disclaimer)}</p><p class="note">${escape(r.notice)}</p></section>`;
}

function faqTarget(language, key) {
  const routes = {register:'register',tour:'tour',info:'request-information',safety:'safety',support:'family-support',programs:'programs',tuition:'tuition-assistance',contact:'contact',privacy:'privacy'};
  return key === 'license' ? external.license : path(language, routes[key]);
}

function p1Override(language, slug) {
  const c = p1[language];
  const programs = ['programs/infants-toddlers','programs/preschool','programs/school-age'];
  if (programs.includes(slug)) {
    const texts = c.prog[slug.split('/')[1]];
    const extra = slug === 'programs/school-age' ? [[c.hw.h, c.hw.p, c.hw.b]] : slug === 'programs/infants-toddlers' ? [[c.potty.h, c.potty.p, c.potty.b]] : [];
    return { intro: texts[0], sections: [...texts.slice(1).map((text,index) => [c.prog.heads[index + 1], text]), ...extra] };
  }
  if (slug === 'family-support') return { sections: [...c.fs.sections, c.fs.direct], links: [] };
  if (slug === 'faq') return { questions: c.faq };
  if (slug === 'privacy') return { privacyExtra: c.privacy };
  if (slug === 'enrollment') return { enrollExtra: [c.prog.heads[4], c.prog['school-age'][4]] };
  return {};
}

function careBenefits(t) {
  return `<ul class="care-benefits" role="list">${t.careBenefits.map((label, index) => `<li><span aria-hidden="true">${['🚌','🍽'][index]}</span>${escape(label)}</li>`).join('')}</ul>`;
}

function virtualTour(language) {
  const t = locales[language];
  const intro = overrides[language]?.['virtual-tour'].intro ?? pages['virtual-tour'].intro;
  return `<section class="section family"><div class="wrap split"><div><p class="eyebrow">${escape(virtualStatus[language])}</p><h2>${escape(t.footer[4])}</h2></div><div><p>${escape(intro)}</p><div class="actions">${button(path(language,'virtual-tour'),t.footer[4],true)}${button(path(language,'tour'),t.tour)}</div></div></div></section>`;
}
function registrationPages(language) {
  const copy = registrations[language];
  const t = locales[language];
  const form = inquiryForm({ copy:forms[language], language, kind:'registration', path, locales, escape, action:formEndpoint, registration:copy });
  return {
    register: {
      title:copy.title,
      intro:copy.intro,
      body:`<article class="page section wrap"><h1>${escape(copy.title)}</h1><p class="intro">${escape(copy.intro)}</p><p class="offer">${escape(forms[language].waiver)}</p>${form}<section>${p0Content(language)}</section><section><h2>${escape(copy.next)}</h2><p>${escape(copy.notice)}</p></section></article>`
    },
    'registration-received': {
      title:copy.received,
      intro:copy.confirmation,
      body:`<article class="page section wrap"><h1>${escape(copy.received)}</h1><p class="intro">${escape(copy.confirmation)}</p>${button(tel,t.call,true)}</article>`
    }
  };
}
function p0Content(language, promo = false) {
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
function pageContent(language, slug) {
  const t = locales[language];
  const english = pages[slug];
  const form = forms[language];
  const isForm = ['enrollment','tour','contact'].includes(slug);
  const offer = slug === 'enrollment' ? form.waiver : slug === 'tuition-assistance' ? form.free : '';
  const draft = ['privacy','accessibility','nondiscrimination'].includes(slug) ? form.draft : '';
  const formContent = slug === 'tour' ? netlifyTourForm({language,path,locales,escape,copy:form,endpoint:formEndpoint})
    : isForm ? inquiryForm({ copy:form, language, kind:slug, path, locales, escape, action:formEndpoint }) : '';
  const common = {
    tour: {title: language === 'en' ? english.title : t.visit[0], intro:t.tourBody},
    contact: {title: language === 'en' ? english.title : t.nav[7], intro:t.contactBody},
    enrollment: {title: language === 'en' ? english.title : t.nav[2], intro:t.enrollBody}
  };
  const p1o = p1Override(language, slug);
  const translation = { ...((language === 'en' ? {} : overrides[language]?.[slug]) ?? {}), ...p1o };
  const page = { ...english, ...common[slug], ...translation };
  if (!page.intro) throw new Error('Missing introduction for ' + language + '/' + slug);
  const detailKeys = ['sections','questions','links'];
  const hasEnglish = language !== 'en' && detailKeys.some(key => english[key] && !translation?.[key]);
  const detailAttrs = key => language !== 'en' && !translation?.[key] ? ' lang="en" dir="ltr"' : '';
  const tourPath = path(language,'tour') + (english.age ? '?age=' + english.age : '');
  const threeCta = ['programs/infants-toddlers','programs/preschool','programs/school-age','family-support','faq'].includes(slug);
  const actions = slug === '404' ? '' : threeCta ? `<div class="actions">${button(path(language,'register'),registrations[language].title)}${button(path(language,'request-information'),p0[language][0],true)}${button(tourPath,t.tour,true)}</div>` : slug === 'enrollment' ? `<div class="actions">${button(path(language,'register'),registrations[language].title)}${button(tourPath,t.tour,true)}</div>` : slug === 'tuition-assistance' ? `<div class="actions">${button(tel,form.tuition)}</div>` : ['tour','contact'].includes(slug)
    ? `<div class="actions">${button(tel,t.call)}${button(external.map,t.directions,true)}</div>`
    : `<div class="actions">${button(tourPath,t.tour)}</div>`;
  const localAddress = ['tour','contact'].includes(slug) ? `<section class="note"><address>${address}</address><a href="${tel}">${phone}</a></section>` : '';
  const safety = slug === 'safety' ? `<section class="note"><strong>${brand} · 000000300622</strong><p>${link(external.license,t.quick[0])}</p></section>${p0Safety[language].map(item=>{const [heading,paragraph]=item.split('|');return `<section><h2>${escape(heading)}</h2><p>${escape(paragraph)}</p></section>`}).join('')}<div class="actions">${['09','10','14','18','19'].map(rule=>link('https://codes.ohio.gov/ohio-administrative-code/rule-5180:2-12-'+rule,'OAC 5180:2-12-'+rule)).join(' ')} ${link('https://codes.ohio.gov/ohio-revised-code/section-5104.034','ORC 5104.034')}</div><div class="actions">${button(path(language,'request-information'),p0[language][0],true)}</div>` : '';
  const links = page.links?.map(([label,target]) => link(external[target] ?? path(language,target),label));
  const seo = p1[language].seo.meta[slug];
  return {
    title: page.title, intro:page.intro, metaTitle: seo?.[0], description: seo?.[1],
    body: `<article class="page section wrap">${hasEnglish ? `<p class="note">${escape(t.fallback)}</p>` : ''}
${slug === 'virtual-tour' ? `<p class="eyebrow">${escape(virtualStatus[language])}</p>` : ''}${draft ? `<p class="eyebrow">${escape(draft)}</p>` : ''}<h1>${escape(page.title)}</h1><p class="intro">${escape(page.intro)}</p>${offer ? `<p class="offer">${escape(offer)}</p>` : ''}
${['programs','enrollment','contact','tuition-assistance','faq','family-support'].includes(slug) ? `<section>${p0Content(language)}</section>` : ''}
${slug === 'privacy' ? `<p>${escape(registrations[language].privacy)}</p>` : ''}
${safety}
<div${detailAttrs("sections")}>${slug !== 'safety' ? (page.sections?.map(([heading,text,bullets]) => `<section><h2>${escape(heading)}</h2><p>${escape(text)}</p>${bullets ? list(bullets.map(escape)) : ''}</section>`).join('') ?? '') : ''}${page.enrollExtra ? `<section><h2>${escape(page.enrollExtra[0])}</h2><p>${escape(page.enrollExtra[1])}</p></section>` : ''}${page.privacyExtra ? `<section><h2>${escape(page.privacyExtra[0])}</h2><p>${escape(page.privacyExtra[1])}</p></section>` : ''}</div>${slug === 'family-support' ? resourcesSection(language) : ''}
<div${detailAttrs("questions")}>${page.questions?.map(([question,answer,key]) => `<details><summary>${escape(question)}</summary><p>${escape(answer)}</p>${key ? `<p>${link(faqTarget(language,key),p1[language].faqLinks[key],key === 'license' ? 'rel="noopener"' : '')}</p>` : ''}</details>`).join('') ?? ''}</div>
<div${detailAttrs("links")}>${links ? list(links) : ''}</div>${localAddress}${actions}${formContent}</article>`
  };
}

const dist = new URL('./dist/', import.meta.url);
const anonKey = process.env.H2H_PUBLIC_ANON_KEY;
if (!anonKey || !/^[A-Za-z0-9_.-]+$/.test(anonKey)) throw new Error('Set H2H_PUBLIC_ANON_KEY to the project’s public anon JWT before building.');
await mkdir(dist,{recursive:true});
await cp(new URL('./public/',import.meta.url),dist,{recursive:true});
for (const name of ['inquiry.js','analytics.js']) {
  const clientScript = new URL('assets/' + name,dist);
  await writeFile(clientScript,(await readFile(clientScript,'utf8')).replace('__H2H_PUBLIC_ANON_KEY__',anonKey),'utf8');
}
let count = 0;
const indexable = [];
for (const language of languages) {
  const t = locales[language];
  const seoHome = p1[language].seo;
  const jsonld = {'@context':'https://schema.org','@type':['ChildCare','LocalBusiness'],name:brand,url:site + path(language),description:seoHome.home_desc,telephone:'+1-216-938-6771',image:site + '/assets/classroom-1200.webp',address:{'@type':'PostalAddress',streetAddress:'3095 W. 25th Street',addressLocality:'Cleveland',addressRegion:'OH',postalCode:'44113',addressCountry:'US'},identifier:{'@type':'PropertyValue',name:'Ohio child care center license number',value:'000000300622'},areaServed:{'@type':'City',name:'Cleveland, Ohio'},inLanguage:language};
  const pagesForLocale = {'':{title:t.home.slice(0,2).join(''),intro:seoHome.home_desc,fullTitle:seoHome.home_title,jsonld,body:homepage(language)},...registrationPages(language),'request-information':informationPage(language)};
  const infoConfirmation = forms[language].received;
  pagesForLocale['information-received'] = {title:infoConfirmation,intro:p0[language][1],body:`<article class="page section wrap"><h1>${escape(infoConfirmation)}</h1><p class="intro">${escape(p0[language][1])}</p></article>`};
  for (const slug of Object.keys(pages)) pagesForLocale[slug] = pageContent(language,slug);
  for (const [slug,page] of Object.entries(pagesForLocale)) {
    const route = path(language,slug === '404' ? '' : slug).slice(1);
    const destination = join(route,slug === '404' ? '404.html' : 'index.html');
    const output = new URL(destination.replaceAll('\\','/'),dist);
    const folder = dirname(destination).replaceAll('\\','/');
    await mkdir(new URL(folder + '/',dist),{recursive:true});
    await writeFile(output,frame(language,slug,page.title,page.description ?? page.intro,page.body,{metaTitle:page.metaTitle,fullTitle:page.fullTitle,jsonld:page.jsonld}),'utf8');
    if (!['404','thank-you','registration-received','information-received'].includes(slug)) indexable.push([language,slug]);
    count += 1;
  }
}
const urlFor = (language, slug) => site + path(language, slug);
const sitemap = '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n' +
  indexable.map(([language,slug]) => '<url><loc>' + urlFor(language,slug) + '</loc>' +
    languages.filter(other => indexable.some(([l,s]) => l === other && s === slug)).map(other => '<xhtml:link rel="alternate" hreflang="' + other + '" href="' + urlFor(other,slug) + '"/>').join('') +
    '<xhtml:link rel="alternate" hreflang="x-default" href="' + urlFor('en',slug) + '"/></url>').join('\n') + '\n</urlset>\n';
await writeFile(new URL('sitemap.xml',dist),sitemap,'utf8');
console.log('Built ' + count + ' pages across ' + languages.length + ' languages.');


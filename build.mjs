
import { cp, mkdir, readFile, writeFile, copyFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { inquiryForm } from './inquiry-form.mjs';
import { requestInfoForm } from './request-info-form.mjs';
import { netlifyTourForm } from './netlify-tour-form.mjs';

const read = async file => JSON.parse((await readFile(new URL(file, import.meta.url), 'utf8')).replace(/^\uFEFF/, ''));
const locales = await read('./locales.json');
const pages = await read('./pages.json');
const forms = await read('./forms.json');
const p0 = await read('./p0.json');
const p0Safety = await read('./p0-safety.json');
const registrations = await read('./registration.json');
const p1 = await read('./p1.json');
const trust = await read('./trust-content.json');
const enrollI18n = Object.fromEntries(await Promise.all(['en','es','fr','ar','sw'].map(async code => [code, (await import('./enrollment/i18n/' + code + '.mjs')).default])));
const requestInfo = await read('./request-info.json');
const documentManifest = await read('./enrollment/document-links.json');
const virtualTour = await read('./virtual-tour-content.json');
const enrollEndpoint = 'https://zebeclcvrdmisnxkwode.supabase.co/functions/v1/submit-enrollment';
const enrollVersion = '1.2.0-E1';
const formEndpoint = 'https://zebeclcvrdmisnxkwode.supabase.co/functions/v1/website-inquiry';
const agePages = ['programs/infants-toddlers','programs/preschool','programs/school-age'];
const languages = Object.keys(locales);
const policyLabels = {en:'Nondiscrimination',es:'No discriminación',ar:'عدم التمييز',sw:'Kutobagua',fr:'Non-discrimination'};
const nav = ['programs', 'our-day', 'enrollment', 'family-support', 'safety', 'about', 'faq', 'contact'];
const portalSlug = 'parent-portal';
const brand = 'Heart to Heart Enrichment Center';
const licenseNumber = '000000300622';
const awardAsset = '/assets/ohio-sutq-bronze.png';
const tel = 'tel:+12169386771';
const phone = '<bdi dir="ltr">(216) 938-6771</bdi>';
const address = '<bdi dir="ltr">3095 W. 25th Street<br>Cleveland, OH 44113</bdi>';
const external = {
  license: 'https://childcaresearch.ohio.gov/',
  provider: 'https://childcaresearch.ohio.gov/provider/300622/',
  sutq: 'https://childrenandyouth.ohio.gov/for-providers/step-up-to-quality',
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

const documentBase = 'https://zebeclcvrdmisnxkwode.supabase.co/storage/v1/object/public/' + encodeURIComponent(documentManifest.bucket) + '/';
const portalByLocale = Object.fromEntries(languages.map(language => {
  const ui = documentManifest.locales[language];
  const languageNames = new Intl.DisplayNames([language], {type:'language'});
  const dates = new Intl.DateTimeFormat(language, {dateStyle:'long',timeZone:'UTC'});
  const documents = documentManifest.documents.map(({copy,object,language:pdfLanguage,effectiveDate,...document}) => {
    const url = document.status === 'available' && object ? documentBase + object.split('/').map(encodeURIComponent).join('/') : null;
    const metadata = [
      pdfLanguage && `${ui.pdfLanguage}: ${languageNames.of(pdfLanguage)}`,
      document.revision,
      effectiveDate && `${ui.effective} ${dates.format(new Date(effectiveDate))}`
    ].filter(Boolean).join(' · ');
    return { ...document, ...copy[language], language:pdfLanguage, effectiveDate, metadata,
      view:url, download:url && url + '?download=' + encodeURIComponent(object.split('/').at(-1)) };
  });
  return [language, { ui, documents }];
}));

function dropdown(language, page) {
  const labels = {en:'Website language',es:'Idioma del sitio',ar:'لغة الموقع',sw:'Lugha ya tovuti',fr:'Langue du site'};
  return `<details class="language"><summary aria-label="${labels[language]} · ${escape(locales[language].language)}">${globe}<span lang="${language}">${escape(locales[language].language)}</span></summary>${list(languages.map(option => link(path(option, page), locales[option].language, `data-language="${option}" lang="${option}" hreflang="${option}" ${current(option,language)}`)))}</details>`;
}

function frame(language, slug, title, description, body, meta = {}) {
  const t = locales[language];
  const home = path(language);
  const page = slug === '404' ? '' : slug;
  const confirmations = ['thank-you','registration-received','information-received'];
  const formScript = slug === 'register' ? '<link rel="stylesheet" href="/assets/enrollment/app.css"><script type="module" src="/assets/enrollment/app.js"></script>' : ['enrollment','contact','tour','request-information',...confirmations].includes(slug) ? '<script defer src="/assets/inquiry.js"></script>' : '';
  const url = site + path(language, page);
  const q = trust[language];
  const tour = link(path(language,'tour'), t.tour, `class="button" ${current('tour',slug)}`);
  const register = button(path(language,'register'), registrations[language].title, true);
  const navigation = nav.map((key,i) => link(path(language,key),key === 'safety' ? q.safety : t.nav[i],current(key,slug))).join('');
  const portal = link(path(language,portalSlug),portalByLocale[language].ui.title,current(portalSlug,slug));
  const virtualNav = link(path(language,'virtual-tour'),virtualTour[language].title,current('virtual-tour',slug));
  const showMobileBar = !['register','enrollment','tour','contact','request-information',...confirmations].includes(slug);
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
</head><body${showMobileBar ? ' class="has-mobile-bar"' : ''}>
${link('#main',t.skip,'class="skip"')}
<div class="top"><div class="wrap"><span class="location">${escape(t.where)}</span>${dropdown(language,page)}</div></div>
<header class="header"><div class="wrap">${logo(language)}<nav class="desktop" aria-label="${escape(t.menu)}">${navigation}${portal}${virtualNav}<div class="nav-conversion">${tour}${register}</div></nav><details class="mobile"><summary>${escape(t.menu)}</summary><nav aria-label="${escape(t.menu)}">${tour}${register}${portal}${link(path(language,'request-information'),p0[language][0],current('request-information',slug))}${virtualNav}${navigation}</nav></details></div></header>
${suggestion}
<main id="main" tabindex="-1"${confirmations.includes(slug) ? ' data-confirmation hidden' : ''}>${body}</main>
<footer class="footer"><div class="wrap">
<div>${logo(language)}<address>${address}<br><a href="${tel}">${phone}</a><br>${escape(p0[language][10])}</address><p class="footer-rating">${link(path(language,'safety'),q.rating)}</p></div>
<div><strong>${escape(foot[0])}</strong>${list([link(path(language,'about'),t.nav[5]),link(path(language,'programs'),t.nav[0]),link(path(language,'safety'),q.safety),link(path(language,'contact'),t.nav[7]),link(path(language,'community'),foot[6])])}</div>
<div><strong>${escape(foot[1])}</strong>${list([portal,link(path(language,'register'),registrations[language].title),link(path(language,'tour'),t.tour),virtualNav,link(path(language,'request-information'),p0[language][0]),link(path(language,'parents'),foot[5]),link(path(language,'privacy'),foot[2]),link(path(language,'accessibility'),foot[3]),link(path(language,'nondiscrimination'),policyLabels[language])])}${dropdown(language,page)}</div>
</div></footer>${showMobileBar ? `<div class="mobile-bar">${button(tel,t.call,true)}${tour}</div>` : ''}
</body></html>`;
}

function photo(t, name, index, eager = false) {
  return `<figure class="feature"><img src="/assets/${name}-1200.webp" srcset="/assets/${name}-640.webp 640w, /assets/${name}-1200.webp 1200w" sizes="(max-width: 768px) calc(100vw - 2rem), (max-width: 1280px) 50vw, 630px" width="1200" height="${index ? 800 : 675}" alt="${escape(t.alts[index])}" ${eager ? 'fetchpriority="high"' : 'loading="lazy"'}><figcaption>${escape(t.photos)}</figcaption></figure>`;
}

function portalPage(language) {
  const {ui, documents} = portalByLocale[language];
  const categories = Object.entries(ui.categories).map(([category,title]) => {
    const cards = documents.filter(document => document.category === category).map(document => {
      const attrs = action => `aria-label="${escape(ui[action] + ' — ' + document.title + (action === 'view' ? ' (' + ui.newTab + ')' : ''))}"`;
      return `<article class="portal-document" aria-labelledby="${document.id}"><div class="portal-document-copy">
<span class="portal-document-icon" aria-hidden="true"></span>
<div><h3 id="${document.id}">${escape(document.title)}</h3><p>${escape(document.description)}</p></div></div>
${document.view ? `<p class="portal-metadata">${escape(document.metadata)}</p>
<div class="portal-actions">${link(document.view,ui.view,`class="button" target="_blank" rel="noopener noreferrer" ${attrs('view')}`)}${link(document.download,ui.download,`class="button secondary" ${attrs('download')}`)}</div>`
    : `<p class="portal-pending">${escape(ui.pending)}</p>`}</article>`;
    }).join('');
    return cards ? `<section class="portal-category" aria-labelledby="portal-${category}"><h2 id="portal-${category}">${escape(title)}</h2><div class="portal-grid">${cards}</div></section>` : '';
  }).join('');
  return {title:ui.title,intro:ui.intro,body:`<article class="page portal section wrap">
<h1>${escape(ui.title)}</h1><p class="portal-headline">${escape(ui.headline)}</p><p class="intro">${escape(ui.intro)}</p>
${categories}
<section class="note portal-help" aria-labelledby="portal-help"><h2 id="portal-help">${escape(ui.help)}</h2>
<address>${address}<br><a href="${tel}">${phone}</a></address>
<div class="actions">${button(path(language,'request-information'),p0[language][0],true)}</div></section>
</article>`};
}

function virtualTourPreview(language, standalone = false) {
  const copy = virtualTour[language];
  const heading = standalone ? 'h1' : 'h2';
  const subheading = standalone ? 'h2' : 'h3';
  return `<section class="virtual-preview" aria-labelledby="virtual-title"><div class="wrap virtual-layout">
<div class="virtual-title-card"><${heading} id="virtual-title">${escape(copy.title)}</${heading}><p class="virtual-status">${escape(virtualStatus[language])}</p></div>
<div class="virtual-copy"><${subheading}>${escape(copy.heading)}</${subheading}><p>${escape(copy.intro)}</p><p>${escape(copy.preview)}</p>
<p>${escape(copy.visit)}</p><div class="actions">${button(path(language,'tour'),copy.action)}${standalone ? '' : button(path(language,'virtual-tour'),copy.title,true)}</div></div>
</div></section>`;
}

function homepage(language) {
  const t = locales[language];
  const q = trust[language];
  const offer = p0[language];
  const route = key => path(language,key);
  return `<section class="hero-band"><div class="hero wrap">
<div class="hero-copy"><span class="eyebrow">${escape(t.where)}</span><h1>${escape(t.home[0])}<em>${escape(t.home[1])}</em></h1><p>${escape(t.home[2])}</p>
<div class="actions">${button(route('register'),registrations[language].title)}<div class="tour-choices">${button(route('tour'),t.tour,true)}${link(route('virtual-tour'),virtualTour[language].title,'class="virtual-pill"')}</div>${button(route('request-information'),p0[language][0],true)}${button(tel,t.call,true)}</div></div>
${photo(t,'classroom',0,true)}</div></section>
${qualitySection(language,true)}
<section class="wrap section affordability"><h2>${escape(offer[7])}</h2><p class="offer">${escape(offer[9])}</p>
${list([...q.offer.slice(0,2),offer[12],offer[11]].map(escape))}
<p>${escape(q.offer[2])}</p><div class="actions">${button(route('tuition-assistance'),q.assistance)}${button(route('request-information'),offer[0],true)}</div></section>
${servicesSection(language)}
<div class="quick"><div class="wrap">${link(route('safety'),q.safety)}${link(route('tuition-assistance'),t.quick[1])}${link(external.map,t.quick[2],'dir="ltr"')}</div></div>
<section class="section wrap"><div class="section-header"><div><h2>${escape(t.lead[0])}</h2><p>${escape(q.programLead)}</p></div>${button(route('programs'),t.lead[2],true)}</div>
${careBenefits(t)}
<div class="cards">${t.cards.map(([title], index) => `<article class="card"><span class="card-icon" aria-hidden="true">${['✦','✿','☀'][index]}</span><h3>${link(route(agePages[index]),title)}</h3><p>${escape(q.programs[index])}</p></article>`).join('')}</div></section>
<section class="family section"><div class="wrap split">${photo(t,'families',1)}<div><h2>${escape(t.family[0])}</h2><p>${escape(t.family[1])}</p><div class="actions">${button(route('family-support'),t.family[2],true)}</div></div></div></section>
<section class="section wrap split"><h2>${escape(t.day[0])}</h2><div><p>${escape(q.day)}</p>${list(q.rhythm.map(escape))}<div class="actions">${button(route('our-day'),t.day[2],true)}</div></div></section>
${virtualTourPreview(language)}
<section class="section wrap"><div class="callout"><div><h2>${escape(t.visit[0])}</h2><p>${escape(q.visit)}</p></div>${button(route('tour'),t.tour)}</div></section>`;
}

const overrides = await read('./page-translations.json');

function qualitySection(language, onHome = false) {
  const q = trust[language];
  const t = locales[language];
  const ratingHeading = onHome ? 'h3' : 'h2';
  return `<section class="quality" aria-labelledby="quality-heading"><div class="${onHome ? 'wrap ' : ''}quality-inner">
<img class="quality-award" src="${awardAsset}" width="256" height="364" alt="${escape(q.alt)}">
<div class="quality-copy">
${onHome ? `<h2 id="quality-heading">${escape(q.heading)}</h2>` : ''}
<${ratingHeading}${onHome ? '' : ' id="quality-heading"'}>${escape(q.rating)}</${ratingHeading}>
<p>${escape(onHome ? q.recognition : q.system)}</p>
<p class="quality-facts"><strong>${escape(q.licensed)}</strong><span>${escape(q.number)} <bdi dir="ltr">${licenseNumber}</bdi></span><span>${escape(q.since)}</span>${onHome ? `<span>${escape(p0[language][10])}</span>` : ''}</p>
${onHome ? list(q.policies.map(escape)) : `<p>${escape(q.licenseDetails)}</p>`}
<div class="quality-links">${link(external.provider,q.verify)}${onHome ? '' : link(external.sutq,q.programLink)}</div>
${onHome ? `<div class="actions">${button(path(language,'safety'),q.safety,true)}${button(path(language,'tour'),t.tour)}</div>` : ''}
</div></div></section>`;
}

function servicesSection(language) {
  const c = p1[language].home;
  const q = trust[language];
  const icons = ['🤝','🧭','💛','📚','🧸','🍽','🚌','🌍'];
  const targets = ['family-support','family-support','tuition-assistance','programs/school-age','programs/infants-toddlers','faq','programs/school-age','community'];
  const headings = [q.services[0],q.services[1],c.cards[2][0],...q.services.slice(2),c.cards[7][0]];
  return `<section class="section wrap services" aria-labelledby="services-heading"><div class="section-header"><div><h2 id="services-heading">${escape(c.h)}</h2><p>${escape(c.intro)}</p></div></div>
<div class="cards services-grid">${c.cards.map(([,description],index) => `<article class="card"><span class="card-icon" aria-hidden="true">${icons[index]}</span><h3>${link(path(language,targets[index]),headings[index])}</h3><p>${escape(index === 6 ? p0[language][11] : description)}</p></article>`).join('')}</div>
<div class="actions">${button(path(language,'family-support'),c.cta[0])}${button(path(language,'request-information'),c.cta[1],true)}${button(path(language,'tour'),c.cta[2],true)}</div></section>`;
}

function resourcesSection(language) {
  const r = p1[language].fs.res;
  return `<section class="resources"><h2>${escape(r.h)}</h2><p>${escape(r.intro)}</p><p class="help"><strong>${escape(r.help)}</strong></p><ul>${r.items.map(([label,key]) => `<li>${link(external[key],label,'rel="noopener" dir="auto"')}</li>`).join('')}</ul><p class="note">${escape(r.disclaimer)}</p><p class="note">${escape(r.notice)}</p></section>`;
}

function faqTarget(language, key) {
  const routes = {register:'register',tour:'tour',info:'request-information',safety:'safety',support:'family-support',programs:'programs',tuition:'tuition-assistance',contact:'contact',privacy:'privacy'};
  return key === 'provider' ? external.provider : key === 'license' ? external.license : path(language, routes[key]);
}

function p1Override(language, slug) {
  const c = p1[language];
  const q = trust[language];
  if (agePages.includes(slug)) {
    const texts = c.prog[slug.split('/')[1]];
    const extra = slug === 'programs/school-age' ? [[c.hw.h, c.hw.p, c.hw.b]] : slug === 'programs/infants-toddlers' ? [[c.potty.h, c.potty.p, c.potty.b]] : [];
    return { intro: q.programs[agePages.indexOf(slug)], sections: [...texts.slice(1).map((text,index) => [c.prog.heads[index + 1], text]), ...extra] };
  }
  if (slug === 'programs') return { intro:q.programLead, sections:[], links:locales[language].cards.map(([title],index) => [title,agePages[index]]) };
  if (slug === 'our-day') return { intro:q.day, sections:[] };
  if (slug === 'safety') return { title:q.safety, intro:q.recognition, sections:[], links:[] };
  if (slug === 'family-support') return { sections: [...c.fs.sections, c.fs.direct], links: [] };
  if (slug === 'faq') return { questions: [[q.question,q.answer,'provider'],...c.faq] };
  if (slug === 'privacy') return { privacyExtra: c.privacy };
  if (slug === 'enrollment') return { enrollExtra: [c.prog.heads[4], c.prog['school-age'][4]] };
  return {};
}

function careBenefits(t) {
  return `<ul class="care-benefits" role="list">${t.careBenefits.map((label, index) => `<li><span aria-hidden="true">${['🚌','🍽'][index]}</span>${escape(label)}</li>`).join('')}</ul>`;
}

function registrationPages(language) {
  const copy = registrations[language];
  const ui = enrollI18n[language].ui;
  const t = locales[language];
  const page = path(language,'register');
  return {
    register: {
      title:ui.title,
      intro:ui.lead,
      body:`<article class="page section wrap"><h1>${escape(ui.title)}</h1><p class="intro">${escape(ui.lead)}</p>
<noscript><p class="note">${escape(ui.jsRequired)}</p><div class="actions">${button(tel,t.call,true)}${button(path(language,'tour'),t.tour,true)}${button(path(language,'request-information'),p0[language][0],true)}</div></noscript>
<div id="enroll-app" class="enroll" lang="${language}" dir="${enrollI18n[language].dir}" data-lang="${language}" data-endpoint="${enrollEndpoint}" data-version="${enrollVersion}"><p class="loading" role="status">${escape(ui.saving)}</p></div></article>`
    },
    'registration-received': {
      title:ui.doneTitle,
      intro:ui.doneBody,
      body:`<article class="page section wrap"><div class="enroll done"><h1>${escape(ui.doneTitle)}</h1><p class="intro">${escape(ui.doneBody)}</p><p><strong>${escape(ui.doneRef)}</strong><br><span class="ref" data-enroll-ref dir="ltr"></span></p><p>${escape(ui.doneKeep)}</p><p>${escape(ui.doneEmail)}</p><p>${escape(ui.pdfNote)}</p><p><a href="${tel}">${phone}</a><br>${escape(ui.doneHours)}<br>${escape(ui.address)}</p><div class="actions">${button(path(language),ui.home)}</div></div></article>`
    }
  };
}
function p0Content(language) {
  const c = p0[language];
  return '<h2>'+escape(c[7])+'</h2>'+c.slice(8,13).filter((_,i)=>i!==1).map(text=>'<p>'+escape(text)+'</p>').join('')+
    '<div class="actions">'+button(path(language,'request-information'),c[0],true)+'</div>';
}
function informationPage(language) {
  const ui = requestInfo[language];
  const form = requestInfoForm({ copy: { ...forms[language], type: p0[language][0], consent: p0[language][2] }, ui, language, path, locales, escape, action: formEndpoint });
  return { title: ui.h1, intro: ui.lead, body: '<article class="page section wrap"><h1>' + escape(ui.h1) + '</h1><p class="intro">' + escape(ui.lead) + '</p><section class="note" aria-labelledby="overview-heading"><h2 id="overview-heading">' + escape(ui.overview) + '</h2><ul>' + ui.items.map(item => '<li>' + escape(item) + '</li>').join('') + '</ul></section>' + form + '</article>' };
}
function pageContent(language, slug) {
  if (slug === 'virtual-tour') return {title:virtualTour[language].title,intro:virtualTour[language].preview,body:virtualTourPreview(language,true)};
  const t = locales[language];
  const q = trust[language];
  const english = pages[slug];
  const form = forms[language];
  const isForm = ['enrollment','tour','contact'].includes(slug);
  const offer = slug === 'enrollment' ? form.waiver : slug === 'tuition-assistance' ? form.free : '';
  const draft = ['privacy','accessibility','nondiscrimination'].includes(slug) ? form.draft : '';
  const formContent = slug === 'tour' ? netlifyTourForm({language,path,locales,escape,copy:form,endpoint:formEndpoint})
    : isForm ? inquiryForm({ copy:form, language, kind:slug, path, locales, escape, action:formEndpoint }) : '';
  const common = {
    tour: {title: language === 'en' ? english.title : t.visit[0], intro:q.visit},
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
  const safety = slug === 'safety' ? `${qualitySection(language)}${p0Safety[language].map(item=>{const [heading,paragraph]=item.split('|');return `<section><h2>${escape(heading)}</h2><p>${escape(paragraph)}</p></section>`}).join('')}<div class="actions">${['09','10','14','18','19'].map(rule=>link('https://codes.ohio.gov/ohio-administrative-code/rule-5180:2-12-'+rule,'OAC 5180:2-12-'+rule)).join(' ')} ${link('https://codes.ohio.gov/ohio-revised-code/section-5104.034','ORC 5104.034')}</div><div class="actions">${button(path(language,'request-information'),p0[language][0],true)}</div>` : '';
  const links = page.links?.map(([label,target]) => link(external[target] ?? path(language,target),label));
  const showRating = ['about','enrollment','faq'].includes(slug);
  const seo = p1[language].seo.meta[slug];
  return {
    title: page.title, intro:page.intro, metaTitle: seo?.[0], description: showRating ? `${q.rating}. ${seo?.[1] ?? page.intro}` : seo?.[1],
    body: `<article class="page section wrap">${hasEnglish ? `<p class="note">${escape(t.fallback)}</p>` : ''}
${draft ? `<p class="eyebrow">${escape(draft)}</p>` : ''}<h1>${escape(page.title)}</h1><p class="intro">${escape(page.intro)}</p>${offer ? `<p class="offer">${escape(offer)}</p>` : ''}
${slug === 'about' ? `<section><h2>${escape(q.about[0])}</h2><p>${escape(q.about[1])}</p><p>${escape(q.about[2])}</p><p>${link(path(language,'community'),t.footer[6])}</p></section>` : ''}
${showRating && slug !== 'faq' ? `<p class="note">${link(path(language,'safety'),q.rating)}</p>` : ''}
${['enrollment','parents'].includes(slug) ? `<p class="actions">${button(path(language,portalSlug),portalByLocale[language].ui.title,true)}</p>` : ''}
${slug === 'tour' ? `<p>${link(path(language,'virtual-tour'),virtualTour[language].title)} · ${escape(virtualStatus[language])}</p>` : ''}
${slug === 'our-day' ? list(q.rhythm.map(escape)) : ''}
${slug === 'programs' ? page.links.map(([title,target],index) => `<section><h2>${link(path(language,target),title)}</h2><p>${escape(q.programs[index])}</p></section>`).join('') : ''}
${['programs','enrollment','contact','tuition-assistance','faq','family-support'].includes(slug) ? `<section>${p0Content(language)}</section>` : ''}
${slug === 'privacy' ? `<p>${escape(registrations[language].privacy)}</p>` : ''}
${safety}
<div${detailAttrs("sections")}>${slug !== 'safety' ? (page.sections?.map(([heading,text,bullets]) => `<section><h2>${escape(heading)}</h2><p>${escape(text)}</p>${bullets ? list(bullets.map(escape)) : ''}</section>`).join('') ?? '') : ''}${page.enrollExtra ? `<section><h2>${escape(page.enrollExtra[0])}</h2><p>${escape(page.enrollExtra[1])}</p></section>` : ''}${page.privacyExtra ? `<section><h2>${escape(page.privacyExtra[0])}</h2><p>${escape(page.privacyExtra[1])}</p></section>` : ''}</div>${slug === 'family-support' ? resourcesSection(language) : ''}
<div${detailAttrs("questions")}>${page.questions?.map(([question,answer,key]) => `<details><summary>${escape(question)}</summary><p>${escape(answer)}</p>${key ? `<p>${link(faqTarget(language,key),key === 'provider' ? q.verify : p1[language].faqLinks[key],key === 'license' ? 'rel="noopener"' : '')}</p>` : ''}</details>`).join('') ?? ''}</div>
<div${detailAttrs("links")}>${links?.length && slug !== 'programs' ? list(links) : ''}</div>${localAddress}${actions}${formContent}</article>`
  };
}

const dist = new URL('./dist/', import.meta.url);
const anonKey = process.env.H2H_PUBLIC_ANON_KEY;
if (!anonKey || !/^[A-Za-z0-9_.-]+$/.test(anonKey)) throw new Error('Set H2H_PUBLIC_ANON_KEY to the project’s public anon JWT before building.');
{ // Safety guard: the key is shipped to every visitor, so it must be the public anon key, never service_role.
  let role;
  try { role = JSON.parse(Buffer.from(anonKey.split('.')[1] ?? '', 'base64url').toString('utf8')).role; } catch { role = undefined; }
  if (role !== 'anon') throw new Error('H2H_PUBLIC_ANON_KEY must be the public anon key (JWT role "anon"). Refusing to build.');
}
await mkdir(dist,{recursive:true});
await cp(new URL('./public/',import.meta.url),dist,{recursive:true});
for (const name of ['inquiry.js','analytics.js']) {
  const clientScript = new URL('assets/' + name,dist);
  await writeFile(clientScript,(await readFile(clientScript,'utf8')).replace('__H2H_PUBLIC_ANON_KEY__',anonKey),'utf8');
}
await mkdir(new URL('assets/enrollment/i18n/',dist),{recursive:true});
await copyFile(new URL('./enrollment/core.mjs',import.meta.url),new URL('assets/enrollment/core.js',dist));
await copyFile(new URL('./enrollment/schema.json',import.meta.url),new URL('assets/enrollment/schema.json',dist));
await writeFile(new URL('assets/enrollment/document-links.json',dist),JSON.stringify(portalByLocale),'utf8');
for (const [code,data] of Object.entries(enrollI18n)) await writeFile(new URL('assets/enrollment/i18n/' + code + '.json',dist),JSON.stringify(data),'utf8');
{ const appFile = new URL('assets/enrollment/app.js',dist); await writeFile(appFile,(await readFile(appFile,'utf8')).replace('__H2H_PUBLIC_ANON_KEY__',anonKey),'utf8'); }
let count = 0;
const indexable = [];
for (const language of languages) {
  const t = locales[language];
  const seoHome = p1[language].seo;
  const q = trust[language];
  const description = `${q.rating}. ${seoHome.home_desc}`;
  const jsonld = {'@context':'https://schema.org','@type':['ChildCare','LocalBusiness'],name:brand,url:site + path(language),description,telephone:'+1-216-938-6771',image:site + '/assets/classroom-1200.webp',address:{'@type':'PostalAddress',streetAddress:'3095 W. 25th Street',addressLocality:'Cleveland',addressRegion:'OH',postalCode:'44113',addressCountry:'US'},identifier:{'@type':'PropertyValue',name:'Ohio child care center license number',value:licenseNumber},award:q.rating,sameAs:external.provider,areaServed:{'@type':'City',name:'Cleveland, Ohio'},inLanguage:language};
  const pagesForLocale = {'':{title:t.home.slice(0,2).join(''),intro:description,fullTitle:seoHome.home_title,jsonld,body:homepage(language)},...registrationPages(language),'request-information':informationPage(language),[portalSlug]:portalPage(language)};
  const infoConfirmation = forms[language].received;
  const ri = requestInfo[language];
  pagesForLocale['information-received'] = {title:ri.doneTitle,intro:ri.doneBody,body:`<article class="page section wrap"><div class="done"><h1>${escape(ri.doneTitle)}</h1><p class="intro">${escape(ri.doneBody)}</p><p>${escape(ri.doneCall)} <a href="${tel}">${phone}</a><br>${escape(ri.hours)}</p><div class="actions">${button(path(language),ri.home)}</div></div></article>`};
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


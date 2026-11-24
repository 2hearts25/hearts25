
import { cp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { inquiryForm } from './inquiry-form.mjs';
import { netlifyTourForm } from './netlify-tour-form.mjs';

const read = async file => JSON.parse((await readFile(new URL(file, import.meta.url), 'utf8')).replace(/^\uFEFF/, ''));
const locales = await read('./locales.json');
const pages = await read('./pages.json');
const forms = await read('./forms.json');
const registrations = await read('./registration.json');
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

function frame(language, slug, title, description, body) {
  const t = locales[language];
  const home = path(language);
  const page = slug === '404' ? '' : slug;
  const formScript = ['enrollment','contact','register'].includes(slug) ? '<script defer src="/assets/inquiry.js"></script>' : '';
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
${['thank-you','registration-received','404'].includes(slug) ? '<meta name="robots" content="noindex,nofollow">' : ""}
<title>${escape(title)} | ${brand}</title><meta name="description" content="${escape(description)}">
<link rel="canonical" href="${url}">${alternate}
<meta property="og:title" content="${escape(title)}"><meta property="og:description" content="${escape(description)}"><meta property="og:url" content="${url}"><meta property="og:image" content="${site}/assets/classroom-1200.webp">
<link rel="stylesheet" href="/assets/site.css"><script defer src="/assets/language.js"></script>${formScript}
</head><body>
${link('#main',t.skip,'class="skip"')}
<div class="top"><div class="wrap"><span class="location">${escape(t.where)}</span>${dropdown(language,page)}</div></div>
<header class="header"><div class="wrap">${logo(language)}<nav class="desktop" aria-label="${escape(t.menu)}">${navigation}${register}</nav><details class="mobile"><summary>${escape(t.menu)}</summary><nav aria-label="${escape(t.menu)}">${navigation}${link(path(language,'tour'),t.tour)}${register}</nav></details></div></header>
${suggestion}
<main id="main" tabindex="-1">${body}</main>
<footer class="footer"><div class="wrap">
<div>${logo(language)}<address>${address}<br><a href="${tel}">${phone}</a></address></div>
<div><strong>${escape(foot[0])}</strong>${list([link(path(language,'about'),t.nav[5]),link(path(language,'programs'),t.nav[0]),link(path(language,'safety'),t.nav[4]),link(path(language,'contact'),t.nav[7]),link(path(language,'community'),foot[6])])}</div>
<div><strong>${escape(foot[1])}</strong>${list([link(path(language,'register'),registrations[language].title),link(path(language,'parents'),foot[5]),link(path(language,'virtual-tour'),foot[4]),link(path(language,'privacy'),foot[2]),link(path(language,'accessibility'),foot[3]),link(path(language,'nondiscrimination'),policyLabels[language])])}${dropdown(language,page)}</div>
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
      body:`<article class="page section wrap"><h1>${escape(copy.title)}</h1><p class="intro">${escape(copy.intro)}</p><p class="offer">${escape(forms[language].waiver)}</p>${form}<section><h2>${escape(copy.next)}</h2><p>${escape(copy.notice)}</p></section></article>`
    },
    'registration-received': {
      title:copy.received,
      intro:copy.confirmation,
      body:`<article class="page section wrap"><h1>${escape(copy.received)}</h1><p class="intro">${escape(copy.confirmation)}</p>${button(tel,t.call,true)}</article>`
    }
  };
}
function pageContent(language, slug) {
  const t = locales[language];
  const english = pages[slug];
  const form = forms[language];
  const isForm = ['enrollment','tour','contact'].includes(slug);
  const offer = slug === 'enrollment' ? form.waiver : slug === 'tuition-assistance' ? form.free : '';
  const draft = ['privacy','accessibility','nondiscrimination'].includes(slug) ? form.draft : '';
  const formContent = slug === 'tour' ? netlifyTourForm({language,path,locales,escape})
    : isForm ? inquiryForm({ copy:form, language, kind:slug, path, locales, escape, action:formEndpoint }) : '';
  const common = {
    tour: {title: language === 'en' ? english.title : t.visit[0], intro:t.tourBody},
    contact: {title: language === 'en' ? english.title : t.nav[7], intro:t.contactBody},
    enrollment: {title: language === 'en' ? english.title : t.nav[2], intro:t.enrollBody}
  };
  const translation = language === 'en' ? {} : overrides[language]?.[slug];
  const page = { ...english, ...common[slug], ...translation };
  if (!page.intro) throw new Error('Missing introduction for ' + language + '/' + slug);
  const detailKeys = ['sections','questions','links'];
  const hasEnglish = language !== 'en' && detailKeys.some(key => english[key] && !translation?.[key]);
  const detailAttrs = key => language !== 'en' && !translation?.[key] ? ' lang="en" dir="ltr"' : '';
  const tourPath = path(language,'tour') + (english.age ? '?age=' + english.age : '');
  const actions = slug === '404' ? '' : slug === 'enrollment' ? `<div class="actions">${button(path(language,'register'),registrations[language].title)}${button(tourPath,t.tour,true)}</div>` : slug === 'tuition-assistance' ? `<div class="actions">${button(tel,form.tuition)}</div>` : ['tour','contact'].includes(slug)
    ? `<div class="actions">${button(tel,t.call)}${button(external.map,t.directions,true)}</div>`
    : `<div class="actions">${button(tourPath,t.tour)}</div>`;
  const localAddress = ['tour','contact'].includes(slug) ? `<section class="note"><address>${address}</address><a href="${tel}">${phone}</a></section>` : '';
  const links = page.links?.map(([label,target]) => link(external[target] ?? path(language,target),label));
  return {
    title: page.title, intro:page.intro,
    body: `<article class="page section wrap">${hasEnglish ? `<p class="note">${escape(t.fallback)}</p>` : ''}
${slug === 'virtual-tour' ? `<p class="eyebrow">${escape(virtualStatus[language])}</p>` : ''}${draft ? `<p class="eyebrow">${escape(draft)}</p>` : ''}<h1>${escape(page.title)}</h1><p class="intro">${escape(page.intro)}</p>${offer ? `<p class="offer">${escape(offer)}</p>` : ''}
${slug === 'programs' ? careBenefits(t) : ''}
${slug === 'privacy' ? `<p>${escape(registrations[language].privacy)}</p>` : ''}
<div${detailAttrs("sections")}>${page.sections?.map(([heading,text]) => `<section><h2>${escape(heading)}</h2><p>${escape(text)}</p></section>`).join('') ?? ''}</div>
<div${detailAttrs("questions")}>${page.questions?.map(([question,answer]) => `<details><summary>${escape(question)}</summary><p>${escape(answer)}</p></details>`).join('') ?? ''}</div>
<div${detailAttrs("links")}>${links ? list(links) : ''}</div>${localAddress}${actions}${formContent}</article>`
  };
}

const dist = new URL('./dist/', import.meta.url);
await mkdir(dist,{recursive:true});
await cp(new URL('./public/',import.meta.url),dist,{recursive:true});
let count = 0;
for (const language of languages) {
  const t = locales[language];
  const pagesForLocale = {'':{title:t.home.slice(0,2).join(''),intro:t.home[2],body:homepage(language)},...registrationPages(language)};
  for (const slug of Object.keys(pages)) pagesForLocale[slug] = pageContent(language,slug);
  for (const [slug,page] of Object.entries(pagesForLocale)) {
    const route = path(language,slug === '404' ? '' : slug).slice(1);
    const destination = join(route,slug === '404' ? '404.html' : 'index.html');
    const output = new URL(destination.replaceAll('\\','/'),dist);
    const folder = dirname(destination).replaceAll('\\','/');
    await mkdir(new URL(folder + '/',dist),{recursive:true});
    await writeFile(output,frame(language,slug,page.title,page.intro,page.body),'utf8');
    count += 1;
  }
}
console.log('Built ' + count + ' pages across ' + languages.length + ' languages.');


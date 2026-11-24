
import { readFile, writeFile } from 'node:fs/promises';
const root = new URL('./site/',import.meta.url);
const get = file => readFile(new URL(file,root),'utf8');
const put = (file, data) => writeFile(new URL(file,root),data,'utf8');
let source = await get('build.mjs');
function change(oldValue,newValue) {
  if (!source.includes(oldValue)) throw Error('Missing build target ' + oldValue.slice(0,90));
  source = source.replace(oldValue, () => newValue);
}
change("import { inquiryForm } from './inquiry-form.mjs';","import { inquiryForm } from './inquiry-form.mjs';\nimport { netlifyTourForm } from './netlify-tour-form.mjs';");
change("const site = 'https://hearts25.netlify.app';","const site = 'https://hearts25.com';\nconst virtualStatus = {en:'Coming Soon',es:'Próximamente',ar:'قريبًا',sw:'Inakuja hivi karibuni',fr:'Bientôt disponible'};");
change("const formScript = ['enrollment','tour','contact'].includes(slug)","const formScript = ['enrollment','contact'].includes(slug)");
change("const formContent = isForm ? inquiryForm({ copy:form, language, kind:slug, path, locales, escape, action:formEndpoint }) : '';","const formContent = slug === 'tour' ? netlifyTourForm({language,path,locales,escape})\n    : isForm ? inquiryForm({ copy:form, language, kind:slug, path, locales, escape, action:formEndpoint }) : '';");
change('<section class="section wrap"><div class="callout">','${virtualTour(language)}\n<section class="section wrap"><div class="callout">');
change("const overrides = await read('./page-translations.json');","const overrides = await read('./page-translations.json');\n\nfunction virtualTour(language) {\n  const t = locales[language];\n  const intro = overrides[language]?.['virtual-tour'].intro ?? pages['virtual-tour'].intro;\n  return `<section class=\"section family\"><div class=\"wrap split\"><div><p class=\"eyebrow\">${escape(virtualStatus[language])}</p><h2>${escape(t.footer[4])}</h2></div><div><p>${escape(intro)}</p><div class=\"actions\">${button(path(language,'virtual-tour'),t.footer[4],true)}${button(path(language,'tour'),t.tour)}</div></div></div></section>`;\n}");
change("${draft ? `<p class=\"eyebrow\">","${slug === 'virtual-tour' ? `<p class=\"eyebrow\">${escape(virtualStatus[language])}</p>` : ''}${draft ? `<p class=\"eyebrow\">");
change('<meta name="robots" content="noindex,nofollow">','${slug === "thank-you" || slug === "404" ? \'<meta name="robots" content="noindex,nofollow">\' : ""}');
await put('build.mjs',source);
const script = await get('public/assets/language.js');
await put('public/assets/language.js',script + `
const tour = document.querySelector("[data-netlify-tour]");
if (tour) {
  const requestedAge = new URLSearchParams(location.search).get("age");
  const age = tour.elements.age_group;
  if (Array.from(age.options).some(option => option.value === requestedAge)) age.value = requestedAge;
}
`);
const css = await get('public/assets/site.css');
await put('public/assets/site.css',css + '\n.inquiry textarea { display:block;width:100%;margin-block-start:.35rem;padding:.6rem .65rem;border:1px solid #778a80;border-radius:.4rem;font:inherit;font-weight:400;resize:vertical }\n');
const headers = await get('public/_headers');
await put('public/_headers',headers.replace('  X-Robots-Tag: noindex, nofollow\n','').replace("form-action 'none'","form-action 'self'"));
await put('public/robots.txt','User-agent: *\nDisallow: /thank-you/\n');
const readme = await get('README.md');
await put('README.md',readme.replace('handles enrollment, tour and contact requests. Its CORS origin and the site\\u0027s canonical URL must be updated when the custom domain is connected.','handles enrollment and contact requests. The existing tour-request is a Netlify Form and uses the separate tour email receiver.').replace('The Netlify address has noindex headers and robots controls pending the custom-domain launch.','Thank-you pages and the 404 page are excluded from search indexing.'));


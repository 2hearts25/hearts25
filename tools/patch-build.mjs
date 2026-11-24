
import { readFile, writeFile } from "node:fs/promises";
const root = new URL("./site/", import.meta.url);
const buildFile = new URL("build.mjs",root);
let source = await readFile(buildFile,"utf8");
function change(oldValue,newValue) {
  if (!source.includes(oldValue)) throw Error("Missing build target " + oldValue.slice(0,90));
  source = source.replace(oldValue, () => newValue);
}
change("import { dirname, join } from 'node:path';","import { dirname, join } from 'node:path';\nimport { inquiryForm } from './inquiry-form.mjs';");
change("const pages = await read('./pages.json');","const pages = await read('./pages.json');\nconst forms = await read('./forms.json');\nconst formEndpoint = 'https://zebeclcvrdmisnxkwode.supabase.co/functions/v1/website-inquiry';\nconst agePages = ['programs/infants-toddlers','programs/preschool','programs/school-age'];");
change("const page = slug === '404' ? '' : slug;","const page = slug === '404' ? '' : slug;\n  const formScript = ['enrollment','tour','contact'].includes(slug) ? '<script defer src=\"/assets/inquiry.js\"></script>' : '';");
change('<script defer src="/assets/language.js"></script>','<script defer src="/assets/language.js"></script>${formScript}');
change("link(path(language,'accessibility'),foot[3])","link(path(language,'accessibility'),foot[3]),link(path(language,'nondiscrimination'),locales[language].policyLabel ?? 'Nondiscrimination')");
change("link(route('safety'),t.quick[0])","link(route('safety'),t.quick[0] + ' · #000000300622')");
change("<h3>${escape(title)}</h3><p>${escape(description)}</p></article>","<h3>${link(route(agePages[index]),title)}</h3><p>${escape(description)}</p></article>");
change('<section class="section wrap"><div class="callout">','<section class="section wrap split"><h2>${escape(t.nav[4])}</h2><div><p>${escape(t.safetyHome ?? "Find the center in Ohio Child Care Search by license number 000000300622.")}</p><div class="actions">${button(route("safety"),t.quick[0],true)}</div></div></section>\n<section class="section wrap"><div class="callout">');
change("const english = pages[slug];","const english = pages[slug];\n  const form = forms[language];\n  const isForm = ['enrollment','tour','contact'].includes(slug);\n  const offer = slug === 'enrollment' ? form[19] : slug === 'tuition-assistance' ? form[20] : '';\n  const draft = ['privacy','accessibility','nondiscrimination'].includes(slug) ? form[24] : '';\n  const formContent = isForm ? inquiryForm({ copy:form, language, kind:slug, path, locales, escape, action:formEndpoint }) : '';");
change("const actions = slug === '404' ? '' :", "const tourPath = path(language,'tour') + (english.age ? '?age=' + english.age : '');\n  const actions = slug === '404' ? '' : slug === 'tuition-assistance' ? `<div class=\"actions\">${button(tel,form[21])}</div>` :");
 
change("${escape(t.fallback)}</p>` : ''}\n<h1","${escape(t.fallback)}</p>` : ''}\n${draft ? `<p class=\"eyebrow\">${escape(draft)}</p>` : ''}<h1");
change("${escape(page.intro)}</p>\n<div","${escape(page.intro)}</p>${offer ? `<p class=\"offer\">${escape(offer)}</p>` : ''}\n<div");
change("</div>${localAddress}${actions}</article>","</div>${localAddress}${actions}${formContent}</article>");
change("button(path(language,'tour'),t.tour)}</div>`;", "button(tourPath,t.tour)}</div>`;");
await writeFile(buildFile,source,"utf8");


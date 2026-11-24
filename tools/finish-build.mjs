
import { readFile, writeFile } from "node:fs/promises";
const file = new URL("./site/build.mjs", import.meta.url);
let text = await readFile(file,"utf8");
function change(oldValue,newValue) {
  if (!text.includes(oldValue)) throw Error("Missing update target " + oldValue.slice(0,90));
  text = text.replace(oldValue, () => newValue);
}
change("const nav = ['programs'","const policyLabels = {en:'Nondiscrimination',es:'No discriminación',ar:'عدم التمييز',sw:'Kutobagua',fr:'Non-discrimination'};\nconst safetyNotes = {en:'Find the center in Ohio Child Care Search by license number 000000300622.',es:'Busca el centro en el registro de Ohio con el número de licencia 000000300622.',ar:'ابحث عن المركز في سجل أوهايو برقم الترخيص 000000300622.',sw:'Tafuta kituo katika orodha ya Ohio kwa nambari ya leseni 000000300622.',fr:'Recherchez le centre dans le registre de l’Ohio avec le numéro 000000300622.'};\nconst nav = ['programs'");
change("locales[language].policyLabel ?? 'Nondiscrimination'","policyLabels[language]");
change('t.safetyHome ?? "Find the center in Ohio Child Care Search by license number 000000300622."','safetyNotes[language]');
change("const hasEnglish = language !== 'en' && !translation && !['tour','contact'].includes(slug);\n  const englishAttrs = hasEnglish ? ' lang=\"en\" dir=\"ltr\"' : '';","const detailKeys = ['sections','questions','links'];\n  const hasEnglish = language !== 'en' && detailKeys.some(key => english[key] && !translation?.[key]);\n  const detailAttrs = key => language !== 'en' && !translation?.[key] ? ' lang=\"en\" dir=\"ltr\"' : '';");
change("  const mixed = hasEnglish && slug === 'enrollment';\n","");
change('<h1${mixed ? \'\' : englishAttrs}>','<h1>');
change('<p class="intro"${mixed ? \'\' : englishAttrs}>','<p class="intro">');
change('<div${englishAttrs}>${page.sections?.map','<div${detailAttrs("sections")}>${page.sections?.map');
change("join('') ?? ''}\n${page.questions?.map","join('') ?? ''}</div>\n<div${detailAttrs(\"questions\")}>${page.questions?.map");
change("join('') ?? ''}\n${links ? list(links) : ''}</div>","join('') ?? ''}</div>\n<div${detailAttrs(\"links\")}>${links ? list(links) : ''}</div>");
change("const destination = join(route,slug === '404' ? '404.html' : 'index.html');","const destination = join(route,slug === '404' ? '404.html' : 'index.html');");
await writeFile(file,text,"utf8");


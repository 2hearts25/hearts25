
import { readFile, writeFile } from 'node:fs/promises';
const root = new URL('./site/',import.meta.url);
const get = file => readFile(new URL(file,root),'utf8');
const put = (file, data) => writeFile(new URL(file,root),data,'utf8');
const parse = async file => JSON.parse((await get(file)).replace(/^\uFEFF/,''));
const names = [
  'enroll','tour','contact','name','email','phone','preferred','age','time','placeholder',
  'unsure','soon','next','later','consent','submit','sending','invalid','error','limited',
  'waiver','free','tuition','received','confirmation','draft'
];
const raw = await parse('forms.json');
const form = Object.fromEntries(Object.entries(raw).map(([locale, values]) => {
  if (values.length !== names.length) throw Error('Invalid form copy for ' + locale);
  return [locale,Object.fromEntries(names.map((name,index) => [name,values[index]]))];
}));
const translations = await parse('page-translations.json');
for (const [locale, values] of Object.entries(translations)) {
  values['thank-you'] = { title: form[locale].received, intro: form[locale].confirmation };
}
const builder = (await get('build.mjs'))
  .replace('form[19]','form.waiver').replace('form[20]','form.free')
  .replace('form[24]','form.draft').replace('form[21]','form.tuition');
const inquiry = (await get('inquiry-form.mjs'))
  .replace('const [enroll, tour, contact,','const {enroll, tour, contact,')
  .replace('error, limited] = copy','error, limited} = copy');
await Promise.all([
  put('forms.json',JSON.stringify(form,null,2) + '\n'),
  put('page-translations.json',JSON.stringify(translations,null,2) + '\n'),
  put('build.mjs',builder),
  put('inquiry-form.mjs',inquiry)
]);


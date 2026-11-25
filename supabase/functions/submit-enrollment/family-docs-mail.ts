// 1.3.0-E2 parent emails. The existing confirmation (family-mail.ts) is kept word for word and EXPANDED with a secure-access block;
// a separate, shorter message is used when a parent asks for a replacement link. No PDF or uploaded file is ever attached, and the
// body never contains the child's name, date of birth or health details. Links go only to the address given in the application.
import { familyEnrollmentMessage } from "./family-mail.ts";

const esc = (v: string) => v.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] ?? c);
type Block = { heading: string; ready: string; open: string; dob: string; expiry: string; keep: string; renewSubject: string; renewIntro: string; noGuarantee: string };
export const DOCS_COPY: Record<string, Block> = {
  en: { heading: "Your enrollment documents", ready: "Copies of your two completed enrollment documents — the Ohio Child Enrollment and Health Records and the Heart to Heart Enrollment Records — are ready for your records.", open: "Open my documents securely", dob: "For your child’s privacy, you will be asked for your child’s date of birth before the documents open.", expiry: "This link expires in {days} days. If it expires, you can ask for a new link on the same page; it will be sent only to this email address.", keep: "These documents contain private information about your child. Please do not forward this email.", renewSubject: "Your new secure link to your enrollment documents", renewIntro: "You asked for a new link to your child’s enrollment documents.", noGuarantee: "Submitting an application does not guarantee enrollment." },
  es: { heading: "Sus documentos de inscripción", ready: "Ya están listas, para sus registros, las copias de sus dos documentos de inscripción completos: los Registros de inscripción y salud de Ohio y los Registros de inscripción de Heart to Heart.", open: "Abrir mis documentos de forma segura", dob: "Para proteger la privacidad de su hijo/a, se le pedirá su fecha de nacimiento antes de abrir los documentos.", expiry: "Este enlace vence en {days} días. Si vence, puede pedir un enlace nuevo en la misma página; se enviará solo a este correo electrónico.", keep: "Estos documentos contienen información privada de su hijo/a. No reenvíe este correo.", renewSubject: "Su nuevo enlace seguro a sus documentos de inscripción", renewIntro: "Usted pidió un enlace nuevo a los documentos de inscripción de su hijo/a.", noGuarantee: "Enviar una solicitud no garantiza la inscripción." },
  fr: { heading: "Vos documents d’inscription", ready: "Les copies de vos deux documents d’inscription complétés — le Dossier d’inscription et de santé de l’Ohio et le Dossier d’inscription Heart to Heart — sont prêtes pour vos dossiers.", open: "Ouvrir mes documents en toute sécurité", dob: "Pour protéger la vie privée de votre enfant, sa date de naissance vous sera demandée avant l’ouverture des documents.", expiry: "Ce lien expire dans {days} jours. S’il expire, vous pouvez demander un nouveau lien sur la même page; il sera envoyé uniquement à cette adresse courriel.", keep: "Ces documents contiennent des renseignements privés sur votre enfant. Veuillez ne pas transférer ce courriel.", renewSubject: "Votre nouveau lien sécurisé vers vos documents d’inscription", renewIntro: "Vous avez demandé un nouveau lien vers les documents d’inscription de votre enfant.", noGuarantee: "L’envoi d’une demande ne garantit pas l’inscription." },
  ar: { heading: "مستندات التسجيل الخاصة بكم", ready: "نسختا مستندَي التسجيل المكتملين — سجلات التسجيل والصحة لولاية أوهايو وسجلات التسجيل لدى Heart to Heart — جاهزتان لسجلاتكم.", open: "فتح مستنداتي بأمان", dob: "لحماية خصوصية طفلكم، سيُطلب منكم تاريخ ميلاده قبل فتح المستندات.", expiry: "تنتهي صلاحية هذا الرابط خلال {days} أيام. وإذا انتهت، يمكنكم طلب رابط جديد من الصفحة نفسها، وسيُرسل إلى هذا البريد الإلكتروني فقط.", keep: "تحتوي هذه المستندات على معلومات خاصة عن طفلكم. يرجى عدم إعادة توجيه هذه الرسالة.", renewSubject: "رابطكم الآمن الجديد إلى مستندات التسجيل", renewIntro: "طلبتم رابطًا جديدًا إلى مستندات تسجيل طفلكم.", noGuarantee: "إرسال الطلب لا يضمن التسجيل." },
  sw: { heading: "Nyaraka zako za usajili", ready: "Nakala za nyaraka zako mbili za usajili zilizokamilika — Kumbukumbu za Usajili na Afya za Ohio na Kumbukumbu za Usajili za Heart to Heart — ziko tayari kwa kumbukumbu zako.", open: "Fungua nyaraka zangu kwa usalama", dob: "Kwa faragha ya mtoto wako, utaulizwa tarehe yake ya kuzaliwa kabla nyaraka hazijafunguka.", expiry: "Kiungo hiki kinaisha muda baada ya siku {days}. Kikiisha, unaweza kuomba kiungo kipya kwenye ukurasa huohuo; kitatumwa kwa anwani hii ya barua pepe pekee.", keep: "Nyaraka hizi zina taarifa za faragha za mtoto wako. Tafadhali usisambaze barua pepe hii.", renewSubject: "Kiungo chako kipya salama cha nyaraka za usajili", renewIntro: "Uliomba kiungo kipya cha nyaraka za usajili za mtoto wako.", noGuarantee: "Kutuma ombi hakuhakikishi usajili." },
};
const pick = (lang: string) => DOCS_COPY[lang] ?? DOCS_COPY.en;

function block(lang: string, url: string, days: number) {
  const c = pick(lang), rtl = lang === "ar";
  const expiry = c.expiry.replace("{days}", String(days));
  const text = [c.heading, c.ready, `${c.open}: ${url}`, c.dob, expiry, c.keep].join("\n");
  const html = `<div dir="${rtl ? "rtl" : "ltr"}" style="margin:18px 0;padding:16px;border:1px solid #c9d5ed;border-radius:10px;background:#f7f9ff;font:15px/1.55 Arial,sans-serif;color:#12204f;text-align:${rtl ? "right" : "left"}"><strong style="font-size:17px">${esc(c.heading)}</strong><p style="margin:8px 0">${esc(c.ready)}</p><p style="margin:12px 0"><a href="${esc(url)}" style="display:inline-block;background:#c00055;color:#fff;text-decoration:none;padding:10px 16px;border-radius:8px;font-weight:bold">${esc(c.open)}</a></p><p style="margin:6px 0;font-size:13px">${esc(c.dob)}</p><p style="margin:6px 0;font-size:13px">${esc(expiry)}</p><p style="margin:6px 0;font-size:13px;color:#8d3e48">${esc(c.keep)}</p></div>`;
  return { text, html };
}

// Expanded confirmation: the existing message (thanks, reference, submission confirmation, next steps, contact, no guarantee)
// plus the secure-access block inserted just before the contact paragraph.
export function familyConfirmationWithDocuments(adultName: string, lang: string, reference: string, url: string, days: number) {
  const base = familyEnrollmentMessage(adultName, lang, reference);
  const b = block(lang, url, days);
  const marker = base.html.lastIndexOf("<p", base.html.indexOf(lang === "en" || !DOCS_COPY[lang] ? "If you have any questions" : "(216) 938-6771."));
  const html = marker > 0 ? base.html.slice(0, marker) + b.html + base.html.slice(marker) : base.html.replace("</td></tr><tr>", b.html + "</td></tr><tr>");
  const parts = base.text.split("\n\n");
  parts.splice(Math.max(parts.length - 3, 3), 0, b.text);
  return { subject: base.subject, text: parts.join("\n\n"), html };
}

export function familyDocumentLinkMessage(lang: string, reference: string, url: string, days: number) {
  const c = pick(lang), b = block(lang, url, days), rtl = lang === "ar";
  const text = [c.renewIntro, `Reference: ${reference}`, b.text, c.noGuarantee, "Heart to Heart Enrichment Center · 3095 W. 25th Street, Cleveland, OH 44113 · (216) 938-6771"].join("\n\n");
  const html = `<div lang="${lang}" dir="${rtl ? "rtl" : "ltr"}" style="background:#fffdf6;padding:16px;font-family:Arial,sans-serif;text-align:${rtl ? "right" : "left"}"><div style="max-width:600px;margin:auto;background:#fff;border:1px solid #c9d5ed;border-radius:12px;padding:24px"><p style="font:bold 18px Arial,sans-serif;color:#c00055;margin:0 0 12px" dir="ltr">Heart to Heart Enrichment Center</p><p>${esc(c.renewIntro)}</p><p dir="ltr"><strong>${esc(reference)}</strong></p>${b.html}<p style="font-size:13px">${esc(c.noGuarantee)}</p><p style="font-size:13px;color:#35436a" dir="ltr">3095 W. 25th Street, Cleveland, OH 44113 · (216) 938-6771</p></div></div>`;
  return { subject: c.renewSubject, text, html };
}

// 1.1.0-P1 shared, branded, localized family emails. Identical copy lives in tour-request-mailer/.
// Family emails never include child names, form free text or other submitted details.
export type Kind = "registration" | "tour" | "information";
const center = "Heart to Heart Enrichment Center";
const phone = "(216) 938-6771";
const address = "3095 W. 25th Street, Cleveland, OH 44113";
const license = "Ohio child care center license #000000300622";
const site = "https://hearts25.com";
const languageNames: Record<string, string> = {
  en: "English", es: "Español", ar: "العربية", sw: "Kiswahili", fr: "Français",
};

type Copy = {
  greeting: string; subject: Record<Kind, string>; received: Record<Kind, string>; next: Record<Kind, string>;
  note: Record<Kind, string>; linksTitle: string; links: Record<string, string>; questions: string; hours: string;
  language: string; why: string;
};
const copy: Record<string, Copy> = {
  es: {
    greeting: "Hola",
    subject: { registration: "Bienvenidos a Heart to Heart", tour: "Gracias por tu interés en Heart to Heart", information: "Gracias por contactar a Heart to Heart" },
    received: {
      registration: "Gracias por inscribirte en Heart to Heart Enrichment Center. Recibimos tu inscripción en línea.",
      tour: "Gracias por comunicarte con Heart to Heart Enrichment Center. Recibimos tu solicitud de visita.",
      information: "Gracias por contactar a Heart to Heart Enrichment Center. Recibimos tu solicitud de más información.",
    },
    next: {
      registration: "Nuestro equipo se comunicará contigo para hablar de los cupos, los documentos requeridos y los próximos pasos.",
      tour: "Un miembro de nuestro equipo te llamará al teléfono que nos diste para acordar una hora.",
      information: "Un miembro de nuestro equipo te contactará con los datos que nos diste.",
    },
    note: {
      registration: "Enviar esta inscripción no garantiza el cupo. Lo confirmaremos cuando se completen la disponibilidad y los documentos.",
      tour: "La hora solicitada no está confirmada hasta que nuestro equipo hable contigo.",
      information: "Por favor no respondas con números de Seguro Social, claves de beneficios, documentos de ingresos ni expedientes médicos.",
    },
    linksTitle: "Enlaces útiles", questions: "¿Preguntas? Responde a este mensaje o llámanos al", hours: "Abierto de 6:00 a. m. a 6:00 p. m.",
    language: "Idioma preferido", why: "Recibes este mensaje único porque enviaste un formulario en hearts25.com. Usamos tus datos solo para responderte.",
    links: { programs: "Nuestros programas", support: "Apoyo familiar y ayuda con beneficios", tuition: "Matrícula y asistencia para el cuidado infantil", faq: "Preguntas frecuentes", safety: "Seguridad y licencia", contact: "Contáctanos" },
  },
  ar: {
    greeting: "مرحبًا",
    subject: { registration: "أهلًا بك في Heart to Heart", tour: "شكرًا لاهتمامك بـ Heart to Heart", information: "شكرًا لتواصلك مع Heart to Heart" },
    received: {
      registration: "شكرًا لتسجيلك في Heart to Heart Enrichment Center. استلمنا تسجيلك عبر الإنترنت.",
      tour: "شكرًا لتواصلك مع Heart to Heart Enrichment Center. استلمنا طلب الزيارة.",
      information: "شكرًا لتواصلك مع Heart to Heart Enrichment Center. استلمنا طلبك للحصول على مزيد من المعلومات.",
    },
    next: {
      registration: "سيتواصل معك فريقنا بشأن الأماكن المتاحة ووثائق التسجيل المطلوبة والخطوات التالية.",
      tour: "سيتصل بك أحد أعضاء فريقنا على رقم الهاتف الذي قدّمته للاتفاق على موعد.",
      information: "سيتواصل معك أحد أعضاء فريقنا باستخدام بيانات الاتصال التي قدّمتها.",
    },
    note: {
      registration: "إرسال هذا التسجيل لا يضمن القبول. سنؤكد ذلك بعد التحقق من توفّر الأماكن واكتمال الوثائق.",
      tour: "لا يُعدّ الموعد المطلوب مؤكَّدًا إلا بعد أن يتحدث معك فريقنا.",
      information: "يُرجى عدم الرد بأرقام الضمان الاجتماعي أو بيانات الدخول إلى حسابات المنافع أو مستندات الدخل أو السجلات الطبية.",
    },
    linksTitle: "روابط مفيدة", questions: "لديك أسئلة؟ رُدّ على هذه الرسالة أو اتصل بنا على", hours: "ساعات العمل 6:00 صباحًا–6:00 مساءً",
    language: "اللغة المفضلة", why: "تصلك هذه الرسالة لمرة واحدة لأنك أرسلت نموذجًا على hearts25.com. نستخدم بياناتك فقط للرد عليك.",
    links: { programs: "برامجنا", support: "دعم الأسرة والمساعدة في المنافع", tuition: "الرسوم والمساعدة في رعاية الأطفال", faq: "أسئلة شائعة", safety: "السلامة والترخيص", contact: "اتصل بنا" },
  },
  sw: {
    greeting: "Habari",
    subject: { registration: "Karibu Heart to Heart", tour: "Asante kwa kuvutiwa na Heart to Heart", information: "Asante kwa kuwasiliana na Heart to Heart" },
    received: {
      registration: "Asante kwa kujisajili katika Heart to Heart Enrichment Center. Tumepokea usajili wako wa mtandaoni.",
      tour: "Asante kwa kuwasiliana na Heart to Heart Enrichment Center. Tumepokea ombi lako la ziara.",
      information: "Asante kwa kuwasiliana na Heart to Heart Enrichment Center. Tumepokea ombi lako la maelezo zaidi.",
    },
    next: {
      registration: "Timu yetu itawasiliana nawe kuhusu nafasi, nyaraka zinazohitajika na hatua zinazofuata.",
      tour: "Mmoja wa timu yetu atakupigia kwa namba ya simu uliyotupa ili kupanga muda.",
      information: "Mmoja wa timu yetu atawasiliana nawe kwa taarifa ulizotupa.",
    },
    note: {
      registration: "Kutuma usajili huu hakuhakikishi nafasi. Tutathibitisha upatikanaji na nyaraka zikikamilika.",
      tour: "Muda ulioomba haujathibitishwa hadi timu yetu izungumze nawe.",
      information: "Tafadhali usijibu kwa namba za Hifadhi ya Jamii, nywila za akaunti za misaada, nyaraka za kipato wala kumbukumbu za matibabu.",
    },
    linksTitle: "Viungo muhimu", questions: "Una maswali? Jibu barua pepe hii au tupigie kwa", hours: "Tuko wazi 6:00 AM–6:00 PM",
    language: "Lugha unayopendelea", why: "Unapokea ujumbe huu wa mara moja kwa sababu ulituma fomu kwenye hearts25.com. Tunatumia taarifa zako kukujibu tu.",
    links: { programs: "Programu zetu", support: "Msaada kwa familia na misaada", tuition: "Ada na msaada wa malezi ya watoto", faq: "Maswali ya mara kwa mara", safety: "Usalama na leseni", contact: "Wasiliana nasi" },
  },
  fr: {
    greeting: "Bonjour",
    subject: { registration: "Bienvenue à Heart to Heart", tour: "Merci de votre intérêt pour Heart to Heart", information: "Merci d’avoir contacté Heart to Heart" },
    received: {
      registration: "Merci de vous être inscrit auprès de Heart to Heart Enrichment Center. Nous avons reçu votre inscription en ligne.",
      tour: "Merci d’avoir contacté Heart to Heart Enrichment Center. Nous avons reçu votre demande de visite.",
      information: "Merci d’avoir contacté Heart to Heart Enrichment Center. Nous avons reçu votre demande d’informations.",
    },
    next: {
      registration: "Notre équipe vous contactera au sujet des places disponibles, des documents exigés et des prochaines étapes.",
      tour: "Un membre de notre équipe vous appellera au numéro que vous nous avez donné pour convenir d’un horaire.",
      information: "Un membre de notre équipe vous recontactera avec les coordonnées que vous nous avez données.",
    },
    note: {
      registration: "L’envoi de cette inscription ne garantit pas une place. Nous confirmerons une fois les disponibilités et les documents complétés.",
      tour: "L’horaire demandé n’est pas confirmé tant que notre équipe ne vous a pas parlé.",
      information: "Merci de ne pas répondre avec des numéros de sécurité sociale, des identifiants de compte de prestations, des justificatifs de revenus ni des dossiers médicaux.",
    },
    linksTitle: "Liens utiles", questions: "Des questions ? Répondez à ce courriel ou appelez-nous au", hours: "Ouvert de 6 h à 18 h",
    language: "Langue préférée", why: "Vous recevez ce message unique parce que vous avez envoyé un formulaire sur hearts25.com. Nous utilisons vos informations uniquement pour vous répondre.",
    links: { programs: "Nos programmes", support: "Soutien aux familles et aide pour les prestations", tuition: "Frais et aide pour la garde d’enfants", faq: "Questions fréquentes", safety: "Sécurité et licence", contact: "Nous contacter" },
  },
};
const linkSets: Record<Kind, [string, string][]> = {
  registration: [["programs", "programs"], ["support", "family-support"], ["tuition", "tuition-assistance"], ["faq", "faq"]],
  tour: [["programs", "programs"], ["safety", "safety"], ["faq", "faq"], ["contact", "contact"]],
  information: [["programs", "programs"], ["support", "family-support"], ["faq", "faq"], ["contact", "contact"]],
};

const escape = (value: string) => value.replace(/[&<>"']/g, char => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
})[char] ?? char);

export function familyMessage(kind: Kind, adultName: string, preferred: string) {
  const language = Object.hasOwn(copy, preferred) ? preferred : "es";
  const c = copy[language];
  const rtl = language === "ar";
  const prefix = "/" + language;
  const first = adultName.trim().split(/\s+/u)[0];
  const greeting = c.greeting + (first ? " " + first : "") + ",";
  const links = linkSets[kind].map(([key, slug]) => ({ label: c.links[key], url: site + prefix + "/" + slug + "/" }));
  const home = site + prefix + "/";
  const body = [c.received[kind], c.next[kind], c.note[kind]];
  const contact = c.questions + " " + phone + ".";
  const langLine = c.language + ": " + languageNames[language];
  const text = [greeting, ...body, c.linksTitle + ":\n" + links.map(l => l.label + " – " + l.url).join("\n") + "\n" + home,
    contact, [center, address, c.hours, phone, license].join("\n"), langLine, c.why].join("\n\n");
  const dir = rtl ? "rtl" : "ltr";
  const align = rtl ? "right" : "left";
  const p = (value: string, style = "") => '<p style="margin:0 0 14px;color:#35436a;font:16px/1.6 Arial,sans-serif;' + style + '">' + escape(value) + "</p>";
  const html = '<div lang="' + language + '" dir="' + dir + '" style="background:#fffdf6;padding:16px;text-align:' + align + '">' +
    '<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;margin:0 auto;background:#ffffff;border:1px solid #c9d5ed;border-radius:12px">' +
    '<tr><td dir="ltr" style="background:#c00055;color:#ffffff;padding:18px 24px;border-radius:12px 12px 0 0;font:bold 20px Arial,sans-serif">' +
    '<span style="color:#ffd522">&#9829;</span> ' + center + "</td></tr>" +
    '<tr><td style="padding:24px">' + p(greeting, "color:#12204f;font-weight:bold") + body.map(t => p(t)).join("") +
    '<p style="margin:18px 0 6px;color:#12204f;font:bold 16px Arial,sans-serif">' + escape(c.linksTitle) + "</p>" +
    '<ul style="margin:0 0 16px;padding-' + (rtl ? "right" : "left") + ':20px">' +
    links.map(l => '<li style="margin:4px 0"><a href="' + l.url + '" style="color:#075b9f;font:16px Arial,sans-serif">' + escape(l.label) + "</a></li>").join("") +
    '<li style="margin:4px 0"><a href="' + home + '" style="color:#075b9f;font:16px Arial,sans-serif">hearts25.com</a></li></ul>' +
    p(contact) + "</td></tr>" +
    '<tr><td style="padding:16px 24px;background:#fff3b8;border-radius:0 0 12px 12px;color:#12204f;font:13px/1.5 Arial,sans-serif">' +
    '<span dir="ltr"><strong>' + center + "</strong><br>" + address + "<br>" + phone + "<br>" + license + "</span><br>" +
    escape(c.hours) + "<br>" + escape(langLine) + '<br><span style="color:#35436a">' + escape(c.why) + "</span></td></tr></table></div>";
  return { subject: c.subject[kind], text, html };
}

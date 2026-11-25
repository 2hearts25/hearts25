// 1.2.1 — ONE approved generic parent acknowledgment, used for BOTH tour requests and information requests, in all five languages.
// English is the existing interestMessage (unchanged). es/fr/ar/sw below are translations of that same message, preserving its meaning, with
// no separate substantive tour/information text. Translations are first-draft and are listed as awaiting native-speaker review in
// docs/MANAGEMENT_DECISIONS.md. Identical copy lives in tour-request-mailer/. Never includes names beyond the greeting, or any submitted details.
import { interestMessage } from "./interest-message.ts";

const escape = (v: string) => v.replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] ?? c);

type Pack = {
  dir: "ltr" | "rtl"; subject: string; greeting: (first: string) => string; heading: string; intro: string; next: string; special: string; belief: string;
  benefits: [string, string][]; closer: string; explore: string; help: string; look: string; sign: string; team: string; hours: string; tagline: string; disclaimer: string;
};
const packs: Record<string, Pack> = {
  es: {
    dir: "ltr", subject: "Gracias por tu interés en Heart to Heart",
    greeting: f => "Hola" + (f ? " " + f : "") + ",",
    heading: "¡Gracias por tu interés en Heart to Heart Enrichment Center!",
    intro: "Encontrar el cuidado infantil adecuado es una decisión importante, y nos alegra que estés considerando a Heart to Heart para tu familia.",
    next: "Recibimos tu solicitud y un miembro de nuestro equipo se comunicará contigo para responder tus preguntas, conversar sobre las necesidades de cuidado infantil de tu familia y orientarte en los próximos pasos.",
    special: "¿Qué hace especial a Heart to Heart?",
    belief: "Creemos que el cuidado infantil es más que cuidar a los niños: se trata de apoyar a toda la familia.",
    benefits: [
      ["Cuidado infantil gratuito para familias elegibles", "Recibimos con gusto a las familias que participan en el programa de Cuidado Infantil con Fondos Públicos (PFCC) de Ohio."],
      ["Sin cuota de solicitud", "Empezar es fácil."],
      ["Comidas gratuitas", "Para los niños bajo nuestro cuidado."],
      ["Transporte escolar gratuito", "Recogida en la escuela dentro de 10 millas de nuestro centro, sujeta a la disponibilidad de la ruta."],
      ["Ayuda con la tarea", "Tiempo dedicado y apoyo para hacer la tarea de los niños en edad escolar."],
      ["Control de esfínteres para niños pequeños", "Fomentamos la independencia con un cuidado paciente y de apoyo."],
      ["Servicios integrales", "Ayudamos a las familias a orientarse en los beneficios públicos y a acceder a recursos de la comunidad."],
      ["Una comunidad acogedora y multicultural", "Un ambiente cálido donde los niños y las familias se sienten como en casa."],
    ],
    closer: "Más que cuidado infantil. Estamos aquí para toda tu familia.",
    explore: "Mientras tanto, te invitamos a visitar hearts25.com para conocer más sobre nuestros programas, servicios y compromiso con las familias.",
    help: "Si tienes preguntas o necesitas ayuda, responde a este correo o llámanos al (216) 938-6771.",
    look: "¡Esperamos hablar contigo pronto!", sign: "Con todo el corazón,", team: "El equipo de Heart to Heart",
    hours: "Horario: 6:00 AM – 6:00 PM", tagline: "Cuidado infantil que se siente como en casa.",
    disclaimer: "La asistencia financiera está sujeta a la elegibilidad del programa, la cobertura autorizada y los copagos aplicables.",
  },
  fr: {
    dir: "ltr", subject: "Merci de votre intérêt pour Heart to Heart",
    greeting: f => "Bonjour" + (f ? " " + f : "") + ",",
    heading: "Merci de votre intérêt pour Heart to Heart Enrichment Center !",
    intro: "Choisir le bon mode de garde est une décision importante, et nous sommes ravis que vous envisagiez Heart to Heart pour votre famille.",
    next: "Nous avons bien reçu votre demande, et un membre de notre équipe vous contactera pour répondre à vos questions, discuter des besoins de garde de votre famille et vous guider dans les prochaines étapes.",
    special: "Ce qui rend Heart to Heart spécial",
    belief: "Nous croyons que la garde d’enfants, c’est plus que s’occuper des enfants : c’est soutenir toute la famille.",
    benefits: [
      ["Garde gratuite pour les familles admissibles", "Nous accueillons avec plaisir les familles qui participent au programme de garde d’enfants financée par des fonds publics (PFCC) de l’Ohio."],
      ["Aucuns frais de dossier", "Commencer est simple."],
      ["Repas gratuits", "Offerts aux enfants que nous accueillons."],
      ["Transport scolaire gratuit", "Ramassage à l’école dans un rayon de 10 miles de notre centre, selon la disponibilité des trajets."],
      ["Aide aux devoirs", "Un temps dédié et un soutien pour les enfants d’âge scolaire."],
      ["Apprentissage de la propreté pour les tout-petits", "Nous encourageons l’autonomie par des soins patients et bienveillants."],
      ["Services complémentaires", "Nous aidons les familles à s’orienter dans les aides publiques et à accéder aux ressources de la communauté."],
      ["Une communauté accueillante et multiculturelle", "Un environnement chaleureux où les enfants et les familles se sentent chez eux."],
    ],
    closer: "Plus que de la garde d’enfants. Nous sommes là pour toute votre famille.",
    explore: "En attendant, nous vous invitons à visiter hearts25.com pour en savoir plus sur nos programmes, nos services et notre engagement envers les familles.",
    help: "Si vous avez des questions ou besoin d’aide, répondez simplement à ce courriel ou appelez-nous au (216) 938-6771.",
    look: "Nous avons hâte d’échanger avec vous !", sign: "Chaleureusement,", team: "L’équipe de Heart to Heart",
    hours: "Heures d’ouverture : 6 h 00 – 18 h 00", tagline: "Une garde d’enfants où l’on se sent comme à la maison.",
    disclaimer: "L’aide financière dépend de l’admissibilité au programme, de la couverture autorisée et des quotes-parts applicables.",
  },
  ar: {
    dir: "rtl", subject: "شكرًا لاهتمامك بـ Heart to Heart",
    greeting: f => "مرحبًا" + (f ? " " + f : "") + "،",
    heading: "شكرًا لاهتمامك بمركز Heart to Heart Enrichment Center!",
    intro: "اختيار رعاية الأطفال المناسبة قرار مهم، ويسعدنا أنك تفكر في Heart to Heart لعائلتك.",
    next: "لقد استلمنا طلبك، وسيتواصل معك أحد أعضاء فريقنا للإجابة عن أسئلتك ومناقشة احتياجات عائلتك في رعاية الأطفال وإرشادك إلى الخطوات التالية.",
    special: "ما الذي يميّز Heart to Heart؟",
    belief: "نؤمن بأن رعاية الأطفال أكثر من الاعتناء بالأطفال؛ إنها دعم للعائلة بأكملها.",
    benefits: [
      ["رعاية أطفال مجانية للعائلات المؤهلة", "نرحّب بالعائلات المشاركة في برنامج رعاية الأطفال الممولة من الأموال العامة (PFCC) في أوهايو."],
      ["بلا رسوم تقديم", "البدء سهل."],
      ["وجبات مجانية", "تُقدَّم للأطفال في رعايتنا."],
      ["نقل مدرسي مجاني", "الاستلام من المدرسة ضمن 10 أميال من مركزنا، بحسب توفر المسار."],
      ["مساعدة في الواجبات المنزلية", "وقت مخصص ودعم للأطفال في سن المدرسة."],
      ["التدريب على المرحاض للأطفال الصغار", "نشجّع الاستقلالية برعاية صبورة وداعمة."],
      ["خدمات شاملة", "نساعد العائلات على التعامل مع المزايا العامة والوصول إلى موارد المجتمع."],
      ["مجتمع مرحّب ومتعدد الثقافات", "بيئة دافئة يشعر فيها الأطفال والعائلات بأنهم في بيتهم."],
    ],
    closer: "أكثر من رعاية أطفال. نحن هنا لعائلتك بأكملها.",
    explore: "في هذه الأثناء، ندعوك لزيارة hearts25.com للتعرف أكثر على برامجنا وخدماتنا والتزامنا تجاه العائلات.",
    help: "إذا كانت لديك أسئلة أو تحتاج إلى مساعدة، فما عليك إلا الرد على هذه الرسالة أو الاتصال بنا على (216) 938-6771.",
    look: "نتطلع إلى التواصل معك!", sign: "بقلوب دافئة،", team: "فريق Heart to Heart",
    hours: "ساعات العمل: 6:00 صباحًا – 6:00 مساءً", tagline: "رعاية أطفال تشبه البيت.",
    disclaimer: "تخضع المساعدة المالية لأهلية البرنامج والتغطية المصرّح بها والمشاركات المالية المعمول بها.",
  },
  sw: {
    dir: "ltr", subject: "Asante kwa kuvutiwa na Heart to Heart",
    greeting: f => "Habari" + (f ? " " + f : "") + ",",
    heading: "Asante kwa kuvutiwa na Heart to Heart Enrichment Center!",
    intro: "Kupata huduma sahihi ya malezi ya watoto ni uamuzi muhimu, na tunafurahi kwamba unafikiria Heart to Heart kwa ajili ya familia yako.",
    next: "Tumepokea ombi lako, na mwanachama wa timu yetu atawasiliana nawe kujibu maswali yako, kujadili mahitaji ya malezi ya watoto ya familia yako na kukuongoza katika hatua zinazofuata.",
    special: "Ni nini kinachofanya Heart to Heart kuwa ya pekee?",
    belief: "Tunaamini kwamba malezi ya watoto ni zaidi ya kuwatunza watoto; ni kuisaidia familia nzima.",
    benefits: [
      ["Malezi ya watoto bila malipo kwa familia zinazostahili", "Tunakaribisha kwa furaha familia zinazoshiriki katika programu ya Huduma ya Malezi ya Watoto Inayofadhiliwa na Umma (PFCC) ya Ohio."],
      ["Hakuna ada ya kutuma ombi", "Kuanza ni rahisi."],
      ["Milo ya bure", "Hutolewa kwa watoto walio chini ya uangalizi wetu."],
      ["Usafiri wa shule wa bure", "Kuchukua watoto shuleni ndani ya maili 10 kutoka kituo chetu, kulingana na upatikanaji wa njia."],
      ["Msaada wa kazi za nyumbani", "Muda maalum na msaada kwa watoto wa umri wa shule."],
      ["Mafunzo ya choo kwa watoto wadogo", "Tunahimiza uhuru kwa malezi ya subira na ya kusaidia."],
      ["Huduma za ziada", "Tunasaidia familia kuelewa mafao ya umma na kupata rasilimali za jamii."],
      ["Jamii ya kukaribisha yenye tamaduni nyingi", "Mazingira ya joto ambapo watoto na familia wanajisikia nyumbani."],
    ],
    closer: "Zaidi ya malezi ya watoto. Tuko hapa kwa ajili ya familia yako yote.",
    explore: "Wakati huo huo, tunakukaribisha utembelee hearts25.com ili kujifunza zaidi kuhusu programu, huduma na dhamira yetu kwa familia.",
    help: "Ikiwa una maswali au unahitaji msaada, jibu barua pepe hii au tupigie simu kwa (216) 938-6771.",
    look: "Tunatarajia kuwasiliana nawe!", sign: "Kwa mioyo ya joto,", team: "Timu ya Heart to Heart",
    hours: "Saa za kazi: 6:00 AM – 6:00 PM", tagline: "Malezi ya watoto yanayohisi kama nyumbani.",
    disclaimer: "Msaada wa kifedha unategemea sifa za programu, bima iliyoidhinishwa na malipo ya pamoja yanayotumika.",
  },
};

/** The one generic acknowledgment, for tour AND information requests, in the family's language (English when unknown). */
export function genericAcknowledgment(adultName: string, locale?: string) {
  const p = locale ? packs[locale] : undefined;
  if (!p) return interestMessage(adultName);
  const first = adultName.trim().split(/\s+/u)[0];
  const greeting = p.greeting(first);
  const address = ["Heart to Heart Enrichment Center", "3095 W. 25th Street", "Cleveland, OH 44113", "(216) 938-6771", p.hours, "hearts25.com"];
  const text = [greeting, p.heading, p.intro, p.next, p.special, p.belief, p.benefits.map(([t, d]) => "- " + t + " — " + d).join("\n"), p.closer, p.explore, p.help, p.look,
    p.sign + "\n\n" + p.team + "\n\n" + address.join("\n"), p.tagline, p.disclaimer].join("\n\n");
  const align = p.dir === "rtl" ? "right" : "left";
  const html = `<div lang="${locale}" dir="${p.dir}" style="background:#f9f2ed;padding:24px 12px;font-family:Arial,sans-serif;color:#243044;line-height:1.6;text-align:${align}"><div style="max-width:640px;margin:auto;background:#fff;border-radius:12px;overflow:hidden">` +
    `<div style="background:#f9f2ed;text-align:center;padding:24px;color:#8d3e48"><img src="https://hearts25.com/assets/welcome-hearts.png" width="96" alt="" style="display:block;width:96px;height:auto;margin:0 auto 10px"><strong style="font-size:20px">Heart to Heart Enrichment Center</strong></div>` +
    `<div style="padding:28px"><p>${escape(greeting)}</p><h1 style="font-size:24px;color:#8d3e48">${escape(p.heading)}</h1><p>${escape(p.intro)}</p><p>${escape(p.next)}</p>` +
    `<h2 style="font-size:19px;color:#8d3e48">${escape(p.special)}</h2><p>${escape(p.belief)}</p><ul>` +
    p.benefits.map(([t, d]) => `<li style="margin-bottom:8px"><strong>${escape(t)}</strong> — ${escape(d)}</li>`).join("") + `</ul>` +
    `<p><strong>${escape(p.closer)}</strong></p><p>${escape(p.explore)}</p><p>${escape(p.help)}</p><p>${escape(p.look)}</p><p>${escape(p.sign)}<br><strong>${escape(p.team)}</strong></p></div>` +
    `<div style="background:#f9f2ed;text-align:center;padding:24px;color:#513b40"><strong>Heart to Heart Enrichment Center</strong><br>3095 W. 25th Street<br>Cleveland, OH 44113<br><a href="tel:+12169386771" style="color:#8d3e48">(216) 938-6771</a><br>${escape(p.hours)}<br><a href="https://hearts25.com" style="color:#8d3e48">hearts25.com</a><p style="font-size:13px">${escape(p.tagline)}</p><p style="font-size:12px;color:#6b5a5e">${escape(p.disclaimer)}</p></div></div></div>`;
  return { subject: p.subject, text, html };
}

// Parent confirmation for the full enrollment application. No child name, no health details: only the reference number.
const center = "Heart to Heart Enrichment Center";
const phone = "(216) 938-6771";
const address = "3095 W. 25th Street, Cleveland, OH 44113";
const site = "https://hearts25.com";
const esc = (v: string) => v.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] ?? c);

type Copy = { subject: string; greeting: string; received: string; refLabel: string; next: string; note: string; questions: string; hours: string; why: string; pdf?: string };
const copy: Record<string, Copy> = {
  es: {
    subject: "Recibimos la solicitud de inscripción de su hijo/a", greeting: "Hola",
    received: "Gracias por elegir Heart to Heart Enrichment Center. Recibimos la solicitud de inscripción de su hijo/a.", refLabel: "Su número de referencia",
    next: "Nuestro equipo la revisará y se comunicará con usted sobre la disponibilidad, los documentos que aún falten (incluidos el contrato y el manual para padres) y los próximos pasos.",
    note: "La inscripción en línea no garantiza un lugar. La inscripción depende de la disponibilidad y de completar los documentos requeridos. La ayuda financiera depende de los requisitos del programa y de los copagos aplicables.",
    questions: "¿Preguntas? Responda este correo o llámenos al", hours: "Horario: 6:00 AM – 6:00 PM", why: "Recibe este mensaje único porque envió una solicitud en hearts25.com.",
  },
  fr: {
    subject: "Nous avons reçu la demande d’inscription de votre enfant", greeting: "Bonjour",
    received: "Merci d’avoir choisi Heart to Heart Enrichment Center. Nous avons reçu la demande d’inscription de votre enfant.", refLabel: "Votre numéro de référence",
    next: "Notre équipe l’examinera et vous contactera au sujet des places disponibles, des documents encore nécessaires (y compris le contrat et le guide des parents) et des prochaines étapes.",
    note: "L’inscription en ligne ne garantit pas une place. L’inscription dépend des disponibilités et de la remise des documents requis. L’aide financière dépend des critères du programme et des quotes-parts applicables.",
    questions: "Des questions ? Répondez à ce courriel ou appelez-nous au", hours: "Horaires : 6 h 00 – 18 h 00", why: "Vous recevez ce message unique parce que vous avez envoyé une demande sur hearts25.com.",
  },
  ar: {
    subject: "استلمنا طلب تسجيل طفلك", greeting: "مرحبًا",
    received: "شكرًا لاختياركم Heart to Heart Enrichment Center. لقد استلمنا طلب تسجيل طفلكم.", refLabel: "رقمكم المرجعي",
    next: "سيراجع فريقنا الطلب ويتواصل معكم بشأن توفّر الأماكن والمستندات المطلوبة (ومنها العقد ودليل أولياء الأمور) والخطوات التالية.",
    note: "التسجيل عبر الإنترنت لا يضمن القبول. يخضع القبول لتوفّر الأماكن واستكمال المستندات المطلوبة. وتخضع المساعدة المالية لشروط البرنامج والمشاركة في التكلفة المعمول بها.",
    questions: "لديكم أسئلة؟ ردّوا على هذه الرسالة أو اتصلوا بنا على", hours: "ساعات العمل: 6:00 صباحًا – 6:00 مساءً", why: "تصلكم هذه الرسالة لمرة واحدة لأنكم أرسلتم طلبًا على hearts25.com.",
  },
  sw: {
    subject: "Tumepokea ombi la usajili wa mtoto wako", greeting: "Habari",
    received: "Asante kwa kuchagua Heart to Heart Enrichment Center. Tumepokea ombi la usajili wa mtoto wako.", refLabel: "Namba yako ya kumbukumbu",
    next: "Timu yetu itaikagua na kuwasiliana nawe kuhusu upatikanaji wa nafasi, nyaraka zinazohitajika bado (pamoja na mkataba na mwongozo wa wazazi) na hatua zinazofuata.",
    note: "Usajili wa mtandaoni hauhakikishi nafasi. Usajili unategemea upatikanaji wa nafasi na kukamilisha nyaraka zinazohitajika. Msaada wa kifedha unategemea masharti ya programu na malipo ya pamoja yanayotumika.",
    questions: "Una maswali? Jibu barua pepe hii au tupigie kwa", hours: "Tuko wazi 6:00 AM – 6:00 PM", why: "Unapokea ujumbe huu wa mara moja kwa sababu ulituma ombi kwenye hearts25.com.",
  },
};

export function familyEnrollmentMessage(adultName: string, language: string, reference: string) {
  const first = adultName.trim().split(/\s+/u)[0];
  if (language === "en" || !copy[language]) return english(first, reference);
  const c = copy[language], rtl = language === "ar", dir = rtl ? "rtl" : "ltr", align = rtl ? "right" : "left";
  const greeting = c.greeting + (first ? " " + first : "") + (rtl ? "،" : ",");
  const home = `${site}/${language}/`;
  const text = [greeting, c.received, `${c.refLabel}: ${reference}`, c.next, c.note, `${c.questions} ${phone}.`, [center, address, c.hours, phone, home].join("\n"), c.why].join("\n\n");
  const p = (t: string, s = "") => `<p style="margin:0 0 14px;color:#35436a;font:16px/1.6 Arial,sans-serif;${s}">${esc(t)}</p>`;
  const html = `<div lang="${language}" dir="${dir}" style="background:#fffdf6;padding:16px;text-align:${align}"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;margin:0 auto;background:#fff;border:1px solid #c9d5ed;border-radius:12px"><tr><td dir="ltr" style="background:#c00055;color:#fff;padding:18px 24px;border-radius:12px 12px 0 0;font:bold 20px Arial,sans-serif"><span style="color:#ffd522">&#9829;</span> ${center}</td></tr><tr><td style="padding:24px">${p(greeting, "color:#12204f;font-weight:bold")}${p(c.received)}<p style="margin:0 0 14px;font:16px Arial,sans-serif;color:#12204f">${esc(c.refLabel)}: <strong dir="ltr" style="font-size:18px">${esc(reference)}</strong></p>${p(c.next)}${p(c.note, "font-size:13px")}${p(c.questions + " " + phone + ".")}<p style="margin:0"><a href="${home}" style="color:#075b9f;font:16px Arial,sans-serif">hearts25.com</a></p></td></tr><tr><td style="padding:16px 24px;background:#fff3b8;border-radius:0 0 12px 12px;color:#12204f;font:13px/1.5 Arial,sans-serif"><span dir="ltr"><strong>${center}</strong><br>${address}<br>${phone}</span><br>${esc(c.hours)}<br><span style="color:#35436a">${esc(c.why)}</span></td></tr></table></div>`;
  return { subject: c.subject, text, html };
}

function english(first: string, reference: string) {
  const greeting = "Hi" + (first ? " " + first : "") + ",";
  const welcome = "Welcome to the Heart to Heart family!";
  const thanks = "Thank you for choosing Heart to Heart Enrichment Center. We have received your child’s enrollment application and are excited to get to know you and your family.";
  const refLine = "Your reference number: " + reference;
  const belief = "At Heart to Heart, we believe childcare is about more than providing a place for children to spend their day. It’s about creating a nurturing environment where children can learn, grow and belong, while supporting their families along the way.";
  const heading = "More than childcare — we’re here for your whole family.";
  const benefits = ["Free childcare tuition for eligible families.", "Free meals for children in our care.", "Free school transportation, with school pickup offered within 10 miles, subject to route availability.", "Dedicated homework time and assistance.", "Toddler potty training support.", "Wraparound services and assistance navigating public benefits."];
  const next = "Our team will review your application and contact you to discuss availability, your family’s childcare needs, any documents still needed (including the Parent/Provider Contract and Parent Handbook) and the next steps in the enrollment process.";
  const help = "If you have any questions or need assistance, simply reply to this email or call us at (216) 938-6771. We’re here to help!";
  const disclaimer = "Online registration does not guarantee enrollment. Enrollment is subject to availability and completion of required paperwork. Financial assistance is subject to program eligibility and applicable copayments.";
  const text = [greeting, welcome, thanks, refLine, belief, heading, benefits.map((b) => "- " + b).join("\n"), "What happens next?", next, "In the meantime, we invite you to explore our programs and learn more about our center at hearts25.com.", help, "We look forward to welcoming your family.", "Warm regards,\n\nThe Heart to Heart Team", `${center}\n3095 W. 25th Street\nCleveland, OH 44113\n(216) 938-6771\nOperating hours: 6:00 AM – 6:00 PM\nwww.hearts25.com`, "Childcare that feels like home.", disclaimer].join("\n\n");
  const html = `<div lang="en" dir="ltr" style="background:#f9f2ed;padding:24px 12px;font-family:Arial,sans-serif;color:#243044;line-height:1.6"><div style="max-width:640px;margin:auto;background:#fff;border-radius:12px;overflow:hidden"><div style="background:#f9f2ed;text-align:center;padding:24px;color:#8d3e48"><img src="https://hearts25.com/assets/welcome-hearts.png" width="96" alt="" style="display:block;width:96px;height:auto;margin:0 auto 10px"><strong style="font-size:20px">Heart to Heart</strong><br>ENRICHMENT CENTER<br><small>Childcare that feels like home.</small></div><div style="padding:28px"><p>${esc(greeting)}</p><h1 style="font-size:24px;color:#8d3e48">${esc(welcome)}</h1><p>${esc(thanks)}</p><p style="background:#f9f2ed;padding:10px 14px;border-radius:8px">Your reference number: <strong>${esc(reference)}</strong></p><p>${esc(belief)}</p><h2 style="font-size:19px;color:#8d3e48">${esc(heading)}</h2><ul>${benefits.map((b) => `<li style="margin-bottom:8px">${esc(b)}</li>`).join("")}</ul><h2 style="font-size:19px;color:#8d3e48">What happens next?</h2><p>${esc(next)}</p><p>In the meantime, we invite you to explore our programs and learn more about our center at <a href="https://hearts25.com" style="color:#8d3e48">hearts25.com</a>.</p><p>${esc(help)}</p><p>We look forward to welcoming your family.</p><p>Warm regards,<br><strong>The Heart to Heart Team</strong></p></div><div style="background:#f9f2ed;text-align:center;padding:24px;color:#513b40"><strong>${center}</strong><br>3095 W. 25th Street<br>Cleveland, OH 44113<br><a href="tel:+12169386771" style="color:#8d3e48">(216) 938-6771</a><br>Operating hours: 6:00 AM – 6:00 PM<br><a href="https://hearts25.com" style="color:#8d3e48">www.hearts25.com</a><p><em>Childcare that feels like home.</em></p><p style="font-size:12px">${esc(disclaimer)}</p></div></div></div>`;
  return { subject: "We received your child’s enrollment application", text, html };
}

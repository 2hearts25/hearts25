import { familyMessage } from "./brand-mail.ts";

const center = "Heart to Heart Enrichment Center";
const phone = "(216) 938-6771";
const address = "3095 W. 25th Street, Cleveland, OH 44113";

const messages = {
  en: {
    subject: "Welcome to Heart to Heart",
    greeting: "Hi",
    thanks: "Thank you for registering with Heart to Heart Enrichment Center. We received your online registration.",
    next: "Our team will contact you about availability, the required enrollment paperwork, and your next steps. We look forward to getting to know your family.",
    call: "If you have questions, reply to this email or call us at",
  },
  es: {
    subject: "Bienvenidos a Heart to Heart",
    greeting: "Hola",
    thanks: "Gracias por inscribirte en Heart to Heart Enrichment Center. Recibimos tu inscripción en línea.",
    next: "Nuestro equipo se comunicará contigo para hablar de los cupos, los documentos requeridos y los próximos pasos. Nos dará gusto conocer a tu familia.",
    call: "Si tienes preguntas, responde a este mensaje o llámanos al",
  },
  ar: {
    subject: "أهلًا بك في Heart to Heart",
    greeting: "مرحبًا",
    thanks: "شكرًا لتسجيلك في Heart to Heart Enrichment Center. استلمنا تسجيلك عبر الإنترنت.",
    next: "سيتواصل معك فريقنا بشأن الأماكن المتاحة ووثائق التسجيل المطلوبة والخطوات التالية. نتطلع إلى التعرف على أسرتك.",
    call: "إذا كانت لديك أسئلة، يمكنك الرد على هذه الرسالة أو الاتصال بنا على الرقم",
  },
  sw: {
    subject: "Karibu Heart to Heart",
    greeting: "Habari",
    thanks: "Asante kwa kujisajili katika Heart to Heart Enrichment Center. Tumepokea usajili wako wa mtandaoni.",
    next: "Timu yetu itawasiliana nawe kuhusu nafasi, nyaraka zinazohitajika na hatua zinazofuata. Tunatazamia kuifahamu familia yako.",
    call: "Ukiwa na maswali, jibu barua pepe hii au tupigie kwa",
  },
  fr: {
    subject: "Bienvenue à Heart to Heart",
    greeting: "Bonjour",
    thanks: "Merci de vous être inscrit auprès de Heart to Heart Enrichment Center. Nous avons reçu votre inscription en ligne.",
    next: "Notre équipe vous contactera au sujet des places disponibles, des documents exigés et des prochaines étapes. Nous avons hâte de faire connaissance avec votre famille.",
    call: "Si vous avez des questions, répondez à ce courriel ou appelez-nous au",
  },
};

const escape = (value: string) => value.replace(/[&<>"']/g, char => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
})[char] ?? char);

export function registrationMessage(adultName: string, preferred: string) {
  if (!Object.hasOwn(messages, preferred) || preferred !== "en") return familyMessage("registration", adultName, preferred);
  const language = "en" as keyof typeof messages;
  const copy = messages[language];
  const name = adultName.trim().split(/\s+/u)[0];
  const greeting = copy.greeting + (name ? " " + name : "") + ",";
  if (language === "en") {
    const welcome = "Welcome to the Heart to Heart family!";
    const thanks = "Thank you for choosing Heart to Heart Enrichment Center. We have received your online registration and are excited to get to know you and your family.";
    const belief = "At Heart to Heart, we believe childcare is about more than providing a place for children to spend their day. It's about creating a nurturing environment where children can learn, grow and belong, while supporting their families along the way.";
    const heading = "More than childcare — we're here for your whole family.";
    const benefits = ["Free childcare tuition for eligible families.", "Free meals for children in our care.", "Free school transportation, with school pickup offered within 10 miles, subject to route availability.", "Dedicated homework time and assistance.", "Toddler potty training support.", "Wraparound services and assistance navigating public benefits."];
    const next = "Our team will contact you to discuss availability, your family's childcare needs, required enrollment paperwork and the next steps in the enrollment process.";
    const explore = "In the meantime, we invite you to explore our programs and learn more about our center at hearts25.com.";
    const help = "If you have any questions or need assistance, simply reply to this email or call us at (216) 938-6771. We're here to help!";
    const disclaimer = "Online registration does not guarantee enrollment. Enrollment is subject to availability and completion of required paperwork. Financial assistance is subject to program eligibility and applicable copayments.";
    const text = [greeting, welcome, thanks, belief, heading, benefits.map(item => "- " + item).join("\n"), "What happens next?", next, explore, help, "We look forward to welcoming your family.", "Warm regards,\n\nThe Heart to Heart Team", "Heart to Heart Enrichment Center\n3095 W. 25th Street\nCleveland, OH 44113\n(216) 938-6771\nOperating hours: 6:00 AM – 6:00 PM\nwww.hearts25.com", "Childcare that feels like home.", disclaimer].join("\n\n");
    const html = `<div lang="en" dir="ltr" style="background:#f9f2ed;padding:24px 12px;font-family:Arial,sans-serif;color:#243044;line-height:1.6"><div style="max-width:640px;margin:auto;background:#fff;border-radius:12px;overflow:hidden"><div style="background:#f9f2ed;text-align:center;padding:24px;color:#8d3e48"><img src="https://hearts25.com/assets/welcome-hearts.png" width="96" alt="" style="display:block;width:96px;height:auto;margin:0 auto 10px"><strong style="font-size:20px">Heart to Heart</strong><br>ENRICHMENT CENTER<br><small>Childcare that feels like home.</small></div><div style="padding:28px"><p>${escape(greeting)}</p><h1 style="font-size:24px;color:#8d3e48">${escape(welcome)}</h1><p>${escape(thanks)}</p><p>${escape(belief)}</p><h2 style="font-size:19px;color:#8d3e48">${escape(heading)}</h2><ul>${benefits.map(item => `<li style="margin-bottom:8px">${escape(item)}</li>`).join("")}</ul><h2 style="font-size:19px;color:#8d3e48">What happens next?</h2><p>${escape(next)}</p><p>In the meantime, we invite you to explore our programs and learn more about our center at <a href="https://hearts25.com" style="color:#8d3e48">hearts25.com</a>.</p><p>${escape(help)}</p><p>We look forward to welcoming your family.</p><p>Warm regards,<br><strong>The Heart to Heart Team</strong></p></div><div style="background:#f9f2ed;text-align:center;padding:24px;color:#513b40"><strong>${center}</strong><br>3095 W. 25th Street<br>Cleveland, OH 44113<br><a href="tel:+12169386771" style="color:#8d3e48">(216) 938-6771</a><br>Operating hours: 6:00 AM – 6:00 PM<br><a href="https://hearts25.com" style="color:#8d3e48">www.hearts25.com</a><p><em>Childcare that feels like home.</em></p><p style="font-size:12px">${escape(disclaimer)}</p></div></div></div>`;
    return { subject: copy.subject, text, html };
  }
  throw new Error("unreachable");
}

export async function registrationMailId(secret: string, email: string, childName: string, age: string) {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"],
  );
  const parts = [email, childName, age].map(value => value.normalize("NFC").trim().toLowerCase());
  const digest = await crypto.subtle.sign("HMAC", key, encoder.encode(JSON.stringify(parts)));
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
}

type MailConfig = { apiKey: string; from: string; replyTo: string };
type Delivery = { recipient: string; guardian: string; language: string; id: string };

export async function sendRegistrationWelcome(config: MailConfig, delivery: Delivery, fetcher = fetch) {
  const payload = JSON.stringify({
    from: config.from,
    to: [delivery.recipient],
    reply_to: config.replyTo,
    ...registrationMessage(delivery.guardian, delivery.language),
  });
  const headers = {
    Authorization: "Bearer " + config.apiKey,
    "Content-Type": "application/json",
    "Idempotency-Key": "heart-to-heart/registration/" + delivery.id,
  };
  let status = 0;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const response = await fetcher("https://api.resend.com/emails", {
        method: "POST", headers, body: payload, signal: AbortSignal.timeout(6500),
      });
      status = response.status;
      await response.body?.cancel().catch(() => {});
    } catch {
      status = 0;
    }
    if (status >= 200 && status < 300) return status;
    if (status !== 0 && status !== 429 && status < 500) return status;
    if (attempt === 0) await new Promise(resolve => setTimeout(resolve, 400));
  }
  return status;
}



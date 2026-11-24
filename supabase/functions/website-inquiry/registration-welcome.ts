
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
  const language = Object.hasOwn(messages, preferred) ? preferred as keyof typeof messages : "en";
  const copy = messages[language];
  const name = adultName.trim().split(/\s+/u)[0];
  const greeting = copy.greeting + (name ? " " + name : "") + ",";
  const contact = copy.call + " " + phone + ".";
  return {
    subject: copy.subject,
    text: [greeting, copy.thanks, copy.next, contact, center + "\n" + address].join("\n\n"),
    html: '<div lang="' + language + '" dir="' + (language === "ar" ? "rtl" : "ltr") + '">' +
      [greeting, copy.thanks, copy.next, contact].map(text => "<p>" + escape(text) + "</p>").join("") +
      '<p dir="ltr">' + center + "<br>" + address + "</p></div>",
  };
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


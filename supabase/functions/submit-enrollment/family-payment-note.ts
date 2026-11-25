// Follow-up note added to the parent confirmation when no payment source was provided. It states only what the parent agreed to see:
// no advance payment, nothing charged, a follow-up date. Never contains card data. Five languages; Arabic is right-to-left.
const esc = (v: string) => v.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] ?? c);
const COPY: Record<string, { h: string; t: string }> = {
  en: { h: "Payment source follow-up", t: "You have not provided credit or debit card information. Please provide a payment source or establish an alternative payment arrangement with Heart to Heart by {date}, which is 30 days after your requested enrollment date. No advance payment is required, nothing has been charged, and your application and your child’s care do not depend on this." },
  es: { h: "Seguimiento de la fuente de pago", t: "No ha proporcionado información de tarjeta de crédito o débito. Por favor, proporcione una fuente de pago o establezca un arreglo de pago alternativo con Heart to Heart antes del {date}, que es 30 días después de la fecha de inscripción solicitada. No se requiere ningún pago por adelantado, no se ha cobrado nada, y su solicitud y el cuidado de su hijo/a no dependen de esto." },
  fr: { h: "Suivi de la source de paiement", t: "Vous n’avez pas fourni de renseignements sur une carte de crédit ou de débit. Veuillez fournir une source de paiement ou convenir d’un autre arrangement de paiement avec Heart to Heart d’ici le {date}, soit 30 jours après la date d’inscription demandée. Aucun paiement anticipé n’est exigé, rien n’a été facturé, et votre demande et la garde de votre enfant n’en dépendent pas." },
  ar: { h: "متابعة مصدر الدفع", t: "لم تقدّموا بيانات بطاقة ائتمان أو خصم. يرجى تقديم مصدر دفع أو الاتفاق مع Heart to Heart على ترتيب دفع بديل بحلول {date}، أي بعد 30 يومًا من تاريخ التسجيل المطلوب. لا يُطلب أي دفع مقدَّم، ولم يُخصم أي مبلغ، ولا يتوقف طلبكم ولا رعاية طفلكم على ذلك." },
  sw: { h: "Ufuatiliaji wa chanzo cha malipo", t: "Hujatoa taarifa za kadi ya mkopo au ya malipo. Tafadhali toa chanzo cha malipo au weka mpangilio mbadala wa malipo na Heart to Heart kufikia {date}, ambayo ni siku 30 baada ya tarehe ya kujiandikisha uliyoomba. Hakuna malipo ya mapema yanayohitajika, hakuna kilichotozwa, na ombi lako na huduma ya mtoto wako havitegemei jambo hili." },
};
const fmt = (iso: string, lang: string) => { try { return new Intl.DateTimeFormat(lang === "ar" ? "ar" : lang, { dateStyle: "long", timeZone: "UTC" }).format(new Date(iso + "T00:00:00Z")); } catch { return iso; } };

// Inserts the note just before the contact paragraph of an existing message (same anchor the document-link block uses).
export function withPaymentNote<M extends { text: string; html: string }>(msg: M, lang: string, dueIso: string | null): M {
  if (!dueIso) return msg;
  const c = COPY[lang] ?? COPY.en, body = c.t.replace("{date}", fmt(dueIso, lang)), rtl = lang === "ar";
  const html = `<div dir="${rtl ? "rtl" : "ltr"}" style="margin:18px 0;padding:14px 16px;border:1px solid #e3d6a8;border-radius:10px;background:#fffaf0;font:15px/1.55 Arial,sans-serif;color:#3d2f0a;text-align:${rtl ? "right" : "left"}"><strong>${esc(c.h)}</strong><br>${esc(body)}</div>`;
  const anchor = msg.html.lastIndexOf("<p", msg.html.indexOf(lang === "en" || !COPY[lang] ? "If you have any questions" : "(216) 938-6771."));
  const outHtml = anchor > 0 ? msg.html.slice(0, anchor) + html + msg.html.slice(anchor) : msg.html.replace("</td></tr><tr>", html + "</td></tr><tr>");
  const parts = msg.text.split("\n\n"); parts.splice(Math.max(parts.length - 3, 3), 0, `${c.h}\n${body}`);
  return { ...msg, text: parts.join("\n\n"), html: outHtml };
}

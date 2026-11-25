import { genericAcknowledgment } from "./generic-ack.ts";
const assert = (c: unknown, m: string) => { if (!c) throw new Error(m); };

Deno.test("one generic acknowledgment exists for every language and carries no tour/information-specific text", () => {
  for (const l of ["en", "es", "fr", "ar", "sw"]) {
    const m = genericAcknowledgment("Amina Test", l);
    assert(m.subject && m.text && m.html, l + " missing parts");
    assert(m.text.includes("(216) 938-6771") && m.text.includes("3095 W. 25th Street") && m.html.includes("hearts25.com"), l + " missing contact details");
    assert(!/tour|visita|visite|ziara|جولة|زيارة/i.test(m.subject), l + " subject must be generic: " + m.subject);
    assert(m.html.includes(`lang="${l}"`) && m.html.includes(l === "ar" ? 'dir="rtl"' : 'dir="ltr"'), l + " lang/dir");
    assert(m.text.includes("Amina") && !m.text.includes("Amina Test") && !m.html.includes("Amina Test"), l + " greets by first name only");
  }
});
Deno.test("unknown or missing language falls back to the English generic message; HTML escapes names", () => {
  assert(genericAcknowledgment("Sam", undefined).subject === genericAcknowledgment("Sam", "en").subject, "fallback");
  assert(genericAcknowledgment("Sam", "xx").subject === genericAcknowledgment("Sam", "en").subject, "fallback xx");
  const m = genericAcknowledgment('<img src=x onerror=alert(1)>', "sw"); assert(!m.html.includes("<img src=x"), "name must be escaped");
});
Deno.test("Swahili acknowledgment renders in full (no missing pieces)", () => {
  const m = genericAcknowledgment("Zawadi", "sw"); assert(m.text.includes("Habari Zawadi,") && m.text.includes("Asante kwa kuvutiwa na Heart to Heart Enrichment Center!") && m.text.includes("Msaada wa kifedha"), "sw content");
  assert(!/undefined|\[object/.test(m.text + m.html), "sw undefined leak");
});

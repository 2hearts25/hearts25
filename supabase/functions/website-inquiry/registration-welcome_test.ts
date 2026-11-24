
import { registrationMailId, registrationMessage, sendRegistrationWelcome } from "./registration-welcome.ts";

function assert(value: unknown, description: string): asserts value {
  if (!value) throw new Error(description);
}

Deno.test("welcome emails are localized and safely render the guardian's first name", () => {
  const english = registrationMessage("<Pat> Example", "en");
  assert(english.subject === "Welcome to Heart to Heart", "English subject");
  assert(english.html.includes("&lt;Pat&gt;") && !english.html.includes("<Pat>"), "HTML encoding");
  assert(!english.text.includes("Example"), "Uses first name only");
  for (const locale of ["en", "es", "ar", "sw", "fr"]) {
    const choice = registrationMessage("Mock Guardian", locale);
    assert(choice.html.includes('lang="' + locale + '"'), "Language metadata");
    assert(choice.html.includes('dir="' + (locale === "ar" ? "rtl" : "ltr") + '"'), "Text direction");
  }
});

Deno.test("idempotency IDs are stable for repeats and different for a second child", async () => {
  const first = await registrationMailId("test-only-key", "Parent@EXAMPLE.com", "First Child", "preschool");
  const retry = await registrationMailId("test-only-key", "parent@example.com", "FIRST CHILD", "preschool");
  const sibling = await registrationMailId("test-only-key", "parent@example.com", "Second Child", "preschool");
  assert(first === retry && first !== sibling && /^[a-f0-9]{64}$/.test(first), "Stable keyed registration identity");
});

Deno.test("the welcome send retries a transient failure with the same Resend key and family-safe payload", async () => {
  const calls: { key: string | null; body: Record<string, unknown> }[] = [];
  const mockedFetch: typeof fetch = async (_input, options) => {
    calls.push({ key:new Headers(options?.headers).get("idempotency-key"), body:JSON.parse(String(options?.body)) });
    return new Response(null, { status:calls.length === 1 ? 503 : 200 });
  };
  const result = await sendRegistrationWelcome(
    { apiKey:"local-test-only", from:"sender@example.com", replyTo:"staff@example.com" },
    { recipient:"guardian@example.com", guardian:"Sam Parent", language:"en", id:"synthetic-id" },
    mockedFetch,
  );
  assert(result === 200 && calls.length === 2, "Retry succeeds");
  assert(calls[0].key === calls[1].key && calls[0].key === "heart-to-heart/registration/synthetic-id", "Stable Resend key");
  assert(calls[1].body.reply_to === "staff@example.com", "Staff replies");
  assert(Array.isArray(calls[1].body.to) && calls[1].body.to[0] === "guardian@example.com", "Only guardian receives email");
  assert(!("childName" in calls[1].body) && !String(calls[1].body.text).includes("Sam Parent"), "Does not disclose personal details");
});



import { createReceiver } from "./receiver.ts";

const secret = "test-only-secret-32-characters-or-more";
const url = "https://example.com/functions/v1/tour-request-mailer";
const fake = {
  id: "fake-submission",
  site_id: "2c0a0593-ea18-4f4f-88bc-dd30a5d39ac5",
  form_id: "6b05b2aec298f9f8127361bd",
  form_name: "tour-request",
  data: {
    name: "Jordan <Demo>",
    phone: "216-555-0100",
    email: "family@example.invalid",
    age_group: "preschool",
    start_month: "January",
    tour_window: "Morning",
    heard_about_us: "Website",
    notes: "Synthetic QA note",
  },
};

function assert(value: unknown, message: string): asserts value {
  if (!value) throw new Error(message);
}

function setup(sendStatus = 200) {
  const pending: Promise<unknown>[] = [];
  const requests: { key: string; body: Record<string, unknown> }[] = [];
  const logs: [string, number][] = [];
  const seen = new Set<string>();
  let delivered = 0;
  const handle = createReceiver({
    secret, resendKey: "local-test-key", staff: "staff@example.invalid", from: "Sender <onboarding@resend.dev>",
    defer: task => pending.push(task),
    fetcher: async (_url, options) => {
      const key = new Headers(options?.headers).get("idempotency-key") ?? "";
      const body = JSON.parse(String(options?.body));
      requests.push({ key, body });
      if (!seen.has(key) && sendStatus === 200) {
        delivered += 1;
        seen.add(key);
      }
      return new Response(null, { status: sendStatus });
    },
    log: (kind, status) => logs.push([kind, status]),
  });
  const post = (payload = fake, auth = secret, useQuery = false) => handle(new Request(
    url + "/webhook/tour-request" + (useQuery ? "?secret=" + auth : ""), {
      method: "POST",
      headers: useQuery || !auth ? {} : { "x-webhook-secret": auth },
      body: JSON.stringify({ payload }),
    }
  ));
  return { pending, requests, logs, handle, post, delivered: () => delivered };
}

Deno.test("health, header authorization, two messages and fast acknowledgment", async () => {
  const t = setup();
  assert((await t.handle(new Request(url + "/health"))).status === 200, "health");
  assert((await t.post()).status === 200, "accepted");
  assert(t.pending.length === 1, "background task");
  await Promise.all(t.pending);
  assert(t.delivered() === 2, "two messages");
  const family = t.requests.find(x => x.key.includes("/family/"));
  const staff = t.requests.find(x => x.key.includes("/staff/"));
  assert(family && staff, "message types");
  assert(family.body.reply_to === "staff@example.invalid", "reply-to");
  assert(String(family.body.text).startsWith("Hi Jordan,"), "first name");
  assert(!/preschool|Demo|Synthetic QA note|216-555-0100/.test(String(family.body.text)), "family data minimization");
  assert(String(staff.body.text).includes("Synthetic QA note"), "staff fields");
});

Deno.test("rejects unauthorized requests and ignores honeypot and other forms", async () => {
  const t = setup();
  assert((await t.post(fake, "")).status === 401, "no secret");
  assert((await t.post(fake, "incorrect")).status === 401, "wrong secret");
  assert((await t.post({ ...fake, data: { ...fake.data, "bot-field": "spam" } } as typeof fake)).status === 200, "ignored spam");
  assert((await t.post({ ...fake, form_name: "other" })).status === 200, "ignored other form");
  assert(t.pending.length === 0, "no email tasks");
});

Deno.test("sends staff only when email is blank and accepts query authentication", async () => {
  const t = setup();
  assert((await t.post({ ...fake, data: { ...fake.data, email: "" } }, secret, true)).status === 200, "accepted");
  await Promise.all(t.pending);
  assert(t.delivered() === 1 && t.requests[0].key.includes("/staff/"), "staff only");
});

Deno.test("reuses welcome idempotency key for the same address across distinct submissions", async () => {
  const t = setup();
  await t.post();
  await t.post({ ...fake, id: "different-fake-id", data: { ...fake.data, email: "FAMILY@example.invalid" } });
  await Promise.all(t.pending);
  const familyKeys = t.requests.filter(req => req.key.includes("/family/")).map(req => req.key);
  assert(familyKeys.length === 2 && familyKeys[0] === familyKeys[1], "dedupe key");
  assert(t.delivered() === 3, "one family welcome and two staff notices");
});

Deno.test("keeps a successful webhook response and does not log PII when Resend fails", async () => {
  const t = setup(403);
  assert((await t.post()).status === 200, "accepted");
  await Promise.all(t.pending);
  assert(t.logs.length === 2 && t.logs.every(([, status]) => status === 403), "sanitized provider status");
  assert(!JSON.stringify(t.logs).includes("family@example.invalid"), "PII-free log");
});

Deno.test("webhook refuses traffic when service secrets are missing", async () => {
  const handler = createReceiver({ defer: () => { throw new Error("should never queue"); } });
  assert((await handler(new Request(url + "/webhook/tour-request", {method:"POST"}))).status === 503, "fails closed");
});


Deno.test("a stored submission reference keys delivery per submission, not per address", async () => {
  const t = setup();
  const withRef = (id: string, reference: string) => ({ ...fake, id, data: { ...fake.data, reference } });
  // Same submission delivered twice (retry): identical keys, so Resend delivers once.
  await t.post(withRef("a", "H2H-20261124-0A1B2C3D"));
  await t.post(withRef("b", "H2H-20261124-0A1B2C3D"));
  // A genuinely separate request from the same parent: its own keys.
  await t.post(withRef("c", "H2H-20261124-FFEEDDCC"));
  await Promise.all(t.pending);
  const keys = (part: string) => [...new Set(t.requests.filter(req => req.key.includes(part)).map(req => req.key))];
  assert(keys("/family/").length === 2 && keys("/staff/").length === 2, "one key per stored submission");
  assert(t.delivered() === 4, "two submissions, each with one staff and one family email");
  const staff = t.requests.find(x => x.key.includes("/staff/"));
  assert(String(staff?.body.text).includes("Reference: H2H-20261124-0A1B2C3D"), "reference in staff alert");
  const family = t.requests.find(x => x.key.includes("/family/"));
  assert(!String(family?.body.text).includes("H2H-"), "no reference or extra data in family email");
});

Deno.test("an invalid reference is ignored and the legacy keys apply", async () => {
  const t = setup();
  await t.post({ ...fake, data: { ...fake.data, reference: "not-a-reference" } });
  await Promise.all(t.pending);
  const staff = t.requests.find(x => x.key.includes("/staff/"));
  assert(String(staff?.body.text).includes("Reference: (blank)"), "blank reference");
});

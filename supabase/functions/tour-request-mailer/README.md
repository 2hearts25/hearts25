# Heart to Heart tour request mailer

Internal Edge Function that emails staff and the family when a tour is requested. It is called **only by the `website-inquiry`
function** after the request has been validated and stored. It is **not** a Netlify Forms webhook: legacy Netlify Forms is
disabled and must stay disabled.

## Environment variables (Supabase Edge Function secrets, project `zebeclcvrdmisnxkwode`)

- `H2H_TOUR_SHARED_SECRET` - 32+ random characters; the same value is used by `website-inquiry` (sent as the `x-webhook-secret` header).
- `H2H_RESEND_API_KEY` - sending-only Resend API key. (`H2H_TOUR_RESEND_API_KEY` is accepted as a fallback name.)
- `H2H_STAFF_NOTIFY_EMAIL` - staff alert and reply-to address (`tohearts25@gmail.com`).
- `H2H_FROM_EMAIL` - `Heart to Heart Enrichment Center <hello@hearts25.com>`.

## Endpoints

Health: `https://zebeclcvrdmisnxkwode.supabase.co/functions/v1/tour-request-mailer/health`

Receiver: `.../tour-request-mailer/webhook/tour-request` (POST, secret required). The body is
`{form_name:"tour-request", id:<reference>, data:{reference, name, email, phone, tour_window, start_month, language}}`.

## Behavior

- English family emails use `interest-message.ts`; other languages use `brand-mail.ts`. Family emails never include form text.
- The staff alert includes the reference (`H2H-YYYYMMDD-XXXXXXXX`, stored in `website_private.inquiries.reference`) and the contact details staff need to call the family.
- Idempotency: with a valid reference, the staff and family Resend keys are derived from that reference, so a retry of one stored submission is delivered once while separate requests from the same parent each get their own emails. Without a reference (legacy callers) the staff key uses the submission id and the family key the normalized address.
- Duplicate submissions (identical within 10 minutes) are stopped earlier, in `website-inquiry`, and never reach this function.

## Local testing

```text
deno check index.ts
deno test receiver_test.ts
```

Tests use synthetic data and a mocked Resend API. They do not send real email.

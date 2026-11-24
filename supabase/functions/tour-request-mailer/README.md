
# Heart to Heart tour request email receiver

This function receives Netlify Forms notifications for `tour-request` on `heart-to-heart-enrichment`. It uses the Resend Send Email API from a Supabase Edge Function.

## Environment variables

Add these as Supabase Edge Function secrets for project `zebeclcvrdmisnxkwode`.

- `H2H_TOUR_SHARED_SECRET` — a newly generated secret with at least 32 random characters. Use the same value in the Netlify notification.
- `H2H_TOUR_RESEND_API_KEY` — a sending-only API key from the Heart to Heart Resend account.
- `H2H_TOUR_STAFF_NOTIFY_EMAIL` — `tohearts25@gmail.com`.
- `H2H_TOUR_FROM_EMAIL` — `Heart to Heart Enrichment Center <onboarding@resend.dev>` for testing. After verifying the domain, change it to `Heart to Heart Enrichment Center <hello@hearts25.com>`.

The test sender is limited to the account’s own address for actual mailbox delivery. Keep the Netlify notification disconnected from real families until the sending domain is verified and the flow has been tested. Use a synthetic submission with the account email as the family email for the initial test.

## Webhook

Health  
`https://zebeclcvrdmisnxkwode.supabase.co/functions/v1/tour-request-mailer/health`

Receiver  
`https://zebeclcvrdmisnxkwode.supabase.co/functions/v1/tour-request-mailer/webhook/tour-request`

In Netlify, open the existing project and go to Forms → Submission notifications → Add notification → Outgoing webhook. Choose the `tour-request` form. If the UI supports a custom header, use `x-webhook-secret` with the shared secret. Otherwise, append `?secret=<URL-encoded shared secret>` to the endpoint. Keep the completed URL private. The endpoint checks the secret before parsing the submission.

The receiver returns HTTP 200 after scheduling email. Inspect Resend for acceptance or delivery and Supabase Edge Function logs for sanitized failure status. A retry with the same submission ID uses the same staff idempotency key. The family idempotency key is based on the normalized recipient address. Resend retains idempotency keys for 24 hours.

## Local testing

```text
deno check index.ts
deno test receiver_test.ts
```

Tests use synthetic data and a mocked Resend API. They do not send real email.


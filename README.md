# Heart to Heart Enrichment Center website (hearts25.com)

Static, five-language (en, es, ar, sw, fr) website for Heart to Heart Enrichment Center,
3095 W. 25th Street, Cleveland, OH 44113. It has no package dependencies. A Node script
generates 120 pages, Netlify hosts them, and Supabase plus Resend handle registrations,
inquiries and email.

## Layout

| Path | Purpose |
| --- | --- |
| `build.mjs` | Generates every page into `dist/` and copies `public/` |
| `pages.json`, `locales.json`, `forms.json`, `page-translations.json`, `registration.json` | English content, translations, form copy |
| `inquiry-form.mjs`, `netlify-tour-form.mjs` | Form markup (Supabase inquiry/registration forms; Netlify Forms tour request) |
| `public/` | Copied as-is: `assets/site.css`, `assets/*.webp`, `assets/inquiry.js`, `assets/language.js`, `_headers`, `robots.txt` |
| `netlify.toml` | Build command and publish directory |
| `supabase/migrations/` | Database schema (private `website_private` schema, service-role-only access) |
| `supabase/functions/website-inquiry/` | Edge Function: validates enrollment, contact and registration submissions, stores them, sends the registration welcome email |
| `supabase/functions/tour-request-mailer/` | Edge Function: receives the Netlify `tour-request` webhook, emails staff and the family |
| `tools/` | QA and one-time helper scripts (see below) |
| `.env.example` | Variable template (no values) |

## Build

Requires Node 22 or later.

```
node build.mjs
```

- **Build command:** `node build.mjs`
- **Publish directory:** `dist`

Output is deterministic: rebuilding the committed source reproduces the deployed site exactly.

## Deploy the website (Netlify)

Netlify project: `heart-to-heart-enrichment` (site ID `2c0a0593-ea18-4f4f-88bc-dd30a5d39ac5`), domain `hearts25.com`.

- **Git-based:** connect this repository in Netlify. `netlify.toml` supplies the build command and publish directory.
- **CLI:** `npx netlify-cli deploy --prod --dir=dist --site 2c0a0593-ea18-4f4f-88bc-dd30a5d39ac5` after running the build.

Each deploy replaces the whole site. Netlify detects the `tour-request` form from the built HTML at deploy time.

## Deploy the backend (Supabase)

Project ref: `zebeclcvrdmisnxkwode` (Heart2Heart website, us-east-2).

1. Apply migrations: `supabase db push` (or paste the files in `supabase/migrations/` in order).
2. Set secrets (Supabase dashboard -> Edge Functions -> Secrets, or `supabase secrets set`): see `.env.example`. Required: `H2H_RESEND_API_KEY`; for tours also `H2H_TOUR_SHARED_SECRET`.
3. Deploy the functions:
   - `supabase functions deploy website-inquiry` (JWT verification on; the browser sends the public anon key)
   - `supabase functions deploy tour-request-mailer --no-verify-jwt` (authenticates with `H2H_TOUR_SHARED_SECRET`)
4. In Netlify, add an outgoing webhook for the `tour-request` form pointing to `https://<ref>.supabase.co/functions/v1/tour-request-mailer/webhook/tour-request` with header `x-webhook-secret`. Details in `supabase/functions/tour-request-mailer/README.md`.

### Tests

```
deno test supabase/functions/website-inquiry/registration-welcome_test.ts
deno test supabase/functions/tour-request-mailer/receiver_test.ts
```

Tests use synthetic data and mocked email calls.

## How data flows

- Enrollment, contact and registration forms post JSON from `assets/inquiry.js` to the `website-inquiry` Edge Function, which calls service-role-only SQL functions that write to `website_private.inquiries` / `website_private.child_registrations` (RLS on, no public policies, rate limits per source and email).
- Registrations send a multilingual welcome email via Resend. Staff address: `tohearts25@gmail.com`.
- Tour requests use Netlify Forms and the `tour-request-mailer` function.

## Security notes

- No secrets are committed. `public/assets/inquiry.js` contains the Supabase **anon (publishable)** key, which is public by design (it ships to every visitor); data access is protected by RLS and the service-role-only functions. Rotate it in Supabase if needed and rebuild.
- Never commit `.env` files, exported registrations, CSVs or database dumps (see `.gitignore`).
- `public/_headers` sets a strict CSP; update `connect-src` if the Supabase project changes.

## tools/

- `check-site.py`, `check-registration.py` - QA checks (links, lang/dir attributes, hreflang, registration form fields). Run from the repo root after `node build.mjs`.
- `optimize-images.py` - image resize/WebP helper.
- `patch-build.mjs`, `finish-build.mjs`, `fix-offer.mjs`, `production-build.mjs` - historical one-time patch scripts already applied to `build.mjs`; kept for provenance and not needed to build.

## Open items (owner decisions)

Operating days, privacy-policy retention period, child-name encryption at rest, additional Ohio safety content, and images (current illustrations are AI-generated and labeled as such). See the site content files for draft text.

## Release 1.1.0-P1 notes

- Build requires `H2H_PUBLIC_ANON_KEY` (the public Supabase anon key; replaces `__H2H_PUBLIC_ANON_KEY__` in `inquiry.js` and `analytics.js`). The Netlify connector cannot set env vars, so production is deployed as a prebuilt `dist/`.
- `p1.json` is generated by `tools/gen-p1.py`. Analytics: `site-event` edge function + `website_private.analytics_daily` / `record_site_event` (migration `p1_site_analytics` was applied directly to Supabase and is not yet exported to `supabase/migrations/`).
- Family emails: English uses `interest-message.ts` / `registration-welcome.ts`; es/fr/ar/sw use `brand-mail.ts`. Arabic and Swahili copy needs native-speaker review.

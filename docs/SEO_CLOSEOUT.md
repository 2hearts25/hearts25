# Heart to Heart SEO closeout

November 24, 2026 (Eastern) · Local release candidate for management review

## Executive summary

Heart to Heart is publicly crawlable at [hearts25.com](https://hearts25.com/). Its live sitemap has 115 canonical URLs across English, Spanish, French, Arabic and Swahili. All 115 returned HTTP 200. All four search crawler user-agent tests reached the live homepage and FAQ.

ChatGPT Search omitted the center in the non-branded sample. Its branded answer found PFCC, meals and school transportation, but told the parent it could not verify an official website. The matching public Google business panel showed **Add website**. The Ohio provider record and Starting Point listing also lacked a link to hearts25.com. Getting the official URL onto the existing business profiles is the highest-priority external action.

The candidate makes the relationship between the center, the official website and its services clearer for search engines. It puts PFCC, free meals and eligible school pickup in homepage metadata, clarifies tuition and transportation limits, consolidates five homepage business descriptions into one structured-data identity and adds verification links to the existing `llms.txt`. The center's visible site copy and layout are preserved. Production and third-party accounts received no changes.

## Findings and disposition

| Priority | Page or file | Baseline and impact | Correction and status |
| --- | --- | --- | --- |
| High | Public Google business panel, Starting Point, Ohio provider record | The matching Google panel offered “Add website.” Starting Point and the state record had no hearts25.com link. ChatGPT relied on the state result and omitted the official URL. The management brief reports that Google Business Profile setup is complete. | Owner review. Confirm the Website field on the existing Google Business Profile, publish the canonical homepage if absent and verify that the public panel shows the Website button. Request the same canonical URL on the existing Starting Point and state profiles where supported. |
| High | Five homepages | The existing descriptions were long and omitted the term PFCC, although approved visible text covers financial assistance, meals and transportation. | Implemented. Keep each approved title and use localized descriptions that connect the location, PFCC, meals and school pickup in one snippet. The English description includes “child care vouchers” in direct association with Ohio PFCC. |
| High | Five Tuition & Assistance and five School-Age pages | Assistance titles led with “free” and “affordable.” School-age descriptions gave the distance without the school and route qualification. These snippets could overstate affordability or available pickup. | Implemented. Lead with PFCC assistance, qualify free tuition by full coverage, preserve county eligibility and copays, and specify the school and route limits. |
| High | Homepage and FAQ | Approved pages cover the three parent questions, with the qualifications spread across sections and pages. A compact, visible answer with links would give parents and retrieval systems one source to cite. | Awaiting approval for visible copy. Add or consolidate one FAQ covering PFCC, meals and school pickup using the wording in the answer coverage section. |
| Medium | `robots.txt` and 20 exclusion pages | The three English confirmation paths were disallowed by the wildcard rule despite having HTML `noindex,nofollow`. Localized confirmation paths could be fetched. Confirmation pages also advertised hreflang, and 404 HTML pointed its canonical at the corresponding homepage. | Implemented. A search-crawler group lets Googlebot, Bingbot, OAI-SearchBot and PerplexityBot retrieve the static noindex pages. The existing wildcard group continues to apply to GPTBot, Google-Extended and other unlisted agents. All confirmations and errors keep noindex and are omitted from canonical and hreflang declarations and the sitemap. |
| Medium | Homepage JSON-LD and `llms.txt` | The five translated business objects lacked a stable identifier and used different URLs for the same center. The AI summary had one provider citation and less explicit pickup language. | Implemented. All five homepages use one ChildCare/LocalBusiness entity with a canonical homepage, license, state Bronze award and verified Ohio and Starting Point profiles. The summary includes county PFCC guidance, complete pickup qualifications, the center phone and relevant canonical links. The classroom illustration remains a social image. |
| Medium | Safety & Trust and Tuition & Assistance | Requests to the existing Ohio quality-program and childcare-information links returned 404. | Implemented. The same anchor text now links to the verified Ohio Administrative Code quality chapter and Ohio Child Care Search, both HTTP 200. |
| Medium | Social metadata and Virtual Tour | Open Graph had language-only locale values. The tour snippet described a future facility tour without clearly stating its status. | Implemented. Use language-and-territory Open Graph values for the US audience, matching alternate locales and localized image alternative text. The tour snippet now leads with the existing coming-soon status and the option to request an in-person visit. |
| Medium | Public assistance resources | Ohio Benefits returned HTTP 404 in the direct test, while official search results still surfaced state resource content. The approved family support copy points to this portal for multiple programs. | Verify the portal from a parent browser before changing it. If the problem reproduces, confirm the current state application URL and preserve the specific program destinations. |
| Low | Netlify default hostname | The Netlify hostname serves HTTP 200 and declares hearts25.com canonical. HTTP, www and the FAQ without a slash reached the expected HTTPS canonical URL. | Existing canonical is consistent. Check host duplication in owner search reports before adding any hosting-level redirect. |
| Low | Multilingual metadata and body | HTML language/direction and reciprocal alternates are correct. Some existing localized templates can label approved English detail fallbacks as English. | Native review recommended for Spanish, French, Arabic and Swahili SEO wording and any substantive English fallback. No native-language accuracy claim was made. |

## Metadata inventory

The [115-URL metadata inventory](SEO_METADATA_INVENTORY.md) records the actual production title and description, revised values where applicable, search intent and indexing evidence. The candidate revises descriptions on 20 URLs and titles on five of those. The other 95 title/description pairs match production. Both builds have distinct titles and descriptions for every sitemap URL.

The keyword strategy leads with Cleveland childcare and daycare, then narrows to PFCC and childcare vouchers, school pickup, free meals, age-specific care, enrollment and family support. “Free childcare” applies where the page explains full PFCC coverage. “Near me” relies on correct business profiles, the address and local relevance. No reliable search-volume or competition data was available. The site uses its verified West 25th Street and Cleveland location. No additional neighborhood claims were added. Winnie labels the location Tremont, so verify any proposed neighborhood language against a boundary source before publication. [Cleveland neighborhood maps](https://levin.csuohio.edu/nodis/cleveland-maps)

## Technical validation

| Check | Evidence |
| --- | --- |
| Approved baseline | Netlify project `heart-to-heart-enrichment` published deploy `6b064f5a6829e00dc7c25e2b` at 10:00 PM Eastern on November 24. Netlify identifies it as a manual deploy and its title references GitHub commit `20fee5a0646e`. GitHub verified the full SHA `20fee5a0646e9d71bc394a07add98b7c17434d4c`. Fetched titles, descriptions, language, direction and schema matched the local baseline across all 115 routes. |
| Sitemap and hreflang | Live XML returned 200. Parsed 115 unique HTTPS canonicals, 23 per language, with five reciprocal alternate language links and English as `x-default` on each entry. Every sitemap URL returned 200 at its listed address. HTML canonical and hreflang matched sitemap entries. The candidate has the same sitemap entries. Confirmation/error pages and private resources are absent, and no synthetic lastmod dates are used. |
| Robots and headers | Live robots, sitemap and llms files returned 200. No live sitemap URL had an HTML or HTTP noindex directive. The missing-route probe returned HTTP 404 and HTML noindex. Live crawler-name requests for Googlebot, Bingbot, OAI-SearchBot and PerplexityBot returned 200 for home and FAQ. The candidate was checked against all 135 URLs with those agents and five other agent strings, including GPTBot and Google-Extended. Spoofed user-agent checks establish the observed HTTP response, while access from the actual crawler IP ranges remains unverified. Netlify reports no password or SSO requirement on the public site. |
| Entity markup | Local JSON parsing verified one identical entity across the five homepages. Schema.org's code-snippet validator reported zero errors and zero warnings. Google's code test detected two valid items, one Local businesses and one Organization. Google reported two non-critical issues on the Local businesses item. Operating days were omitted because management supplied hours only. The state listing reports days separately as program-reported information. No coordinates, review score, private-pay pricing or facility-photo claim was added. [Google Rich Results Test](https://search.google.com/test/rich-results/result?id=09WiXdkxioDCENa24s9jzg) |
| Links and orphans | Zero broken same-site links and zero orphaned indexable pages in both snapshots. Existing routes connect home to tours, program pages to registration, FAQ to registration and family support to assistance. Safety and tuition received the two authoritative link repairs above. An About link from Safety and concentrated links from the FAQ to tuition and school-age care are approval-only opportunities if management wants to improve those journeys. |
| Images and sharing | All 15 generated image tags have alternate text, dimensions and resolvable sources. The hero uses responsive WebP with high fetch priority and an existing AI-illustration disclosure. At the 390 px test width Chrome used the 640 px image. It is about 55 KiB, versus 137 KiB for the 1200 px source. Neither HTML snapshot contained additional below-fold editorial photographs needing lazy-loading work. Open Graph title, description, canonical target and existing share image were checked across languages. |
| Mobile and performance | Local Chrome at 390 × 844 rendered representative pages from all five languages without horizontal overflow or broken images. Arabic rendered RTL. The 1440 × 900 desktop homepage also rendered. For the English homepage, one cold run per version gave mobile LCP 1.40 s baseline and 1.11 s candidate under simulated latency and CPU throttling. Desktop LCP measured 0.22 s and 0.18 s. Sampled CLS was 0.000. These are local lab observations, with ordinary run variance. No Lighthouse score or field INP was collected. CSS is a single roughly 19 KiB stylesheet, scripts follow the existing per-page loading, and the live homepage/image use Netlify revalidation. No measured issue justified altering asset or script delivery. |
| Scope and enrollment regression | Local build generated 135 pages. All rendered page bodies match the baseline after substituting the two corrected public link destinations. Existing enrollment core tests passed all 24 cases. Form flows were not submitted in production. The build used a local placeholder with the anonymous role, and local browser testing blocked external requests. |

## Local citations and ownership checks

| Listing | Observed status and next action |
| --- | --- |
| Google Business Profile | The public panel matched the center's address and phone. It showed “Add website” instead of a center Website button. Owner access was unavailable. Review the existing listing's Website field and public visibility before considering any further listing action. |
| Starting Point | Address, phone, Bronze and PFCC match. The public record has no hearts25.com link. Request the canonical link on this record. [Starting Point](https://starting-point.org/provider/heart-to-heart-enrichment-center/) |
| Ohio Child Care Search | Verified license `000000300622`, continuous status, official Bronze designation, address and phone. Provider-reported service information is distinct from the state-verified license and rating. No hearts25.com link appeared. Ask whether the existing state record can reference the official website. [Ohio provider record](https://childcaresearch.ohio.gov/provider/300622/) |
| Winnie | A public result matches the center and street address, carries a subsidy/vouchers category and is shown as unclaimed in the retrieved snapshot. A direct request returned HTTP 403. The brief reports submission. Check the existing listing and claim/update history in the account before taking further action. [Winnie](https://winnie.com/place/heart-to-heart-enrichment-center-cleveland-2) |
| Daycare.com | Existing listing matched the center name, street and phone. A hearts25.com link was not found on the retrieved page. Verify ownership and ask about adding the canonical URL to the existing record. [Daycare.com](https://www.daycare.com/profile/ohio/cleveland/heart-to-heart-enrichment-center) |
| Bing Places and Apple Maps | Public matching details were not independently verified. The brief reports Bing Places initiated and Apple DNS verified with documentation pending. Review the existing entries with account access and check the public website field. |
| Yelp and Care.com | No matching listing was verified in the focused public web check. Yelp also blocked the browsing tool. These are unverified statuses. |
| Other directory results | Public search surfaced third-party records with the same identity. Some directory results use audience-specific neighborhood labels or independently calculated ratings. Prioritize Ohio, Google, Starting Point and Winnie for confirmed data. No duplicate listing was created. |

Google Search Console opened under an account that did not show the Heart to Heart property. Bing Webmaster Tools required sign-in. Property verification, sitemap acceptance, URL-level indexing, impressions, search terms and Bing AI Performance remain unverified. The public Google results and HTTP checks do not establish the index status of individual site URLs.

## AI Search and GEO

| Platform | Eligibility and control |
| --- | --- |
| ChatGPT Search | OAI-SearchBot is the relevant search crawler. The candidate allows public marketing content and keeps the prior GPTBot training crawl rules. ChatGPT-User is a separate user-initiated agent. [OpenAI crawler documentation](https://developers.openai.com/api/docs/bots) |
| Google AI Overviews and AI Mode | Google requires normal index and snippet eligibility. Current search and sitemap fundamentals apply. No additional AI markup is required. [Google Search Central](https://developers.google.com/search/docs/appearance/ai-features) |
| Google Gemini | Google-Extended is a distinct product token related to training and grounding in covered products outside Google Search. Its existing crawl policy was preserved. [Google crawling documentation](https://developers.google.com/crawling/docs/google-extended) |
| Microsoft Copilot | Bing crawl and indexing fundamentals support grounding eligibility. Bing's AI Performance report can show cited pages and grounding queries when the site is available in the account. [Bing webmaster guidelines](https://www.bing.com/webmasters/help/webmaster-guidelines-30fba23a) [Bing AI Performance](https://www.bing.com/webmasters/help/ai-performance-9f8e7d6c) |
| Perplexity | PerplexityBot is the search crawler. Its named access is explicit in the candidate. Perplexity-User is separate. [Perplexity crawler documentation](https://docs.perplexity.ai/docs/resources/perplexity-crawlers) |

The `llms.txt` summary is supplementary. The site's visible answers, stable URLs, and public citations are the primary supporting evidence. Any placement is decided by the platforms.

### Visibility baseline

All queries below were run November 24, 2026 (Eastern) against the currently published site. The observations are samples in the available browser sessions.

- **A** — “Where can I find affordable daycare in Cleveland that accepts childcare vouchers, provides meals and offers school transportation?”
- **B** — “Does Heart to Heart Enrichment Center in Cleveland accept PFCC, provide meals and offer school transportation? What is its official website?”

| Platform | Query | Center appeared | hearts25.com cited | Observed result and example sources |
| --- | --- | --- | --- | --- |
| ChatGPT Search, signed out | A | No | No | The answer cited other providers and county assistance. [Ohio provider 300752](https://childcaresearch.ohio.gov/provider/300752) [Cuyahoga County assistance](https://hhs.cuyahogacounty.gov/programs/child-care-assistance-programs) |
| ChatGPT Search, signed out | B | Yes | No | Correct address and confirmation of PFCC, meals and transportation. It advised confirming the school and route. It omitted free meals, free transportation and the 10-mile limit, and said it could not verify an official website. [Ohio provider record](https://childcaresearch.ohio.gov/provider/300622/) |
| Google AI Overview | A | No | No | The generated result showed alternatives. [All Around Children Woodland](https://allaroundchildren.com/center/woodland) [Horizon Market Square](https://www.horizoneducationcenters.org/market-square-child-care) |
| Google AI Mode | A | No | No | The generated result included multiple Cleveland providers and transport directories. [All Around Children Woodland](https://allaroundchildren.com/center/woodland) [Winnie transportation directory](https://winnie.com/cleveland/daycares-with-transportation) |
| Google Gemini, temporary chat | A | No | No | The answer suggested state and county resources and named alternatives including Horizon Education Centers. No source for Heart to Heart appeared in the response. |
| Perplexity, incognito | A | No | No | The answer showed 17 sources, including other childcare centers. [All Around Children Woodland](https://allaroundchildren.com/center/woodland) [All Around Children East 55th](https://allaroundchildren.com/center/e55th) |
| Microsoft Copilot | A and B | Unverified | Unverified | The available Copilot page required sign-in. No answer was generated. |
| Public web result sample | A and B | A no, B yes | No for both | Branded retrieval surfaced Ohio, Starting Point and Winnie. [Ohio provider record](https://childcaresearch.ohio.gov/provider/300622/) [Starting Point](https://starting-point.org/provider/heart-to-heart-enrichment-center/) [Winnie](https://winnie.com/place/heart-to-heart-enrichment-center-cleveland-2) |

### Parent question coverage

| Parent intent | Existing page a search answer can cite | Qualifications |
| --- | --- | --- |
| Affordable care and county vouchers | [Tuition & Assistance](https://hearts25.com/tuition-assistance/) | Heart to Heart accepts Ohio PFCC. The county determines eligibility and any copay. Tuition is free with full coverage. The county treats Child Care Choice Voucher as a distinct program, so avoid conflating the two in the center's marketing. |
| Meals, pickup and homework | [School-age care](https://hearts25.com/programs/school-age/) and [FAQ](https://hearts25.com/faq/) | Free meals for children in care. Free pickup from schools within 10 miles of the center, subject to the school and route. Families confirm availability with the center. Homework assistance is available in school-age care. |
| Infant care near West 25th, toddler care and potty training | [Infant and toddler care](https://hearts25.com/programs/infants-toddlers/) and [Programs](https://hearts25.com/programs/) | The Cleveland location is on West 25th Street. Potty training support is for toddlers and involves the family. |
| Licensed and Bronze-rated care | [Safety & Trust](https://hearts25.com/safety/) | Ohio Step Up To Quality Bronze is a program quality designation. License and rating can be verified in the state record. |
| Public benefits help | [Family Support](https://hearts25.com/family-support/) | The center helps families understand and connect to programs. The responsible agencies determine eligibility. |
| How to enroll, visit or ask a question | [Enrollment](https://hearts25.com/enrollment/), [Schedule a tour](https://hearts25.com/tour/) and [Request information](https://hearts25.com/request-information/) | Registration starts the application process. The center confirms enrollment and availability. |
| Language availability | [Homepage](https://hearts25.com/) and localized alternates | English, Spanish, French, Arabic and Swahili are languages of the website. Staff languages are unverified. |

Suggested visible FAQ answer for management approval, using the existing FAQ layout:

> Heart to Heart Enrichment Center accepts Ohio Publicly Funded Child Care (PFCC) and provides free meals for children in care. Tuition is free for eligible families with full PFCC coverage. The county determines any copay. The center offers free pickup from schools within 10 miles of its West 25th Street location, subject to school and route availability. Call (216) 938-6771 to check your school.

If approved, link PFCC to Tuition & Assistance and pickup to School-Age Care. Have native speakers review the four translations before publication.

## Weekly enrollment and discovery reporting

1. Compare weekly page views and acquisition signals by source, landing path and language. The existing analytics stores aggregate views and referrer/UTM dimensions, not unique visits. Use Google and Bing search reports for search clicks where owner access is available. Count ChatGPT referrals when `utm_source=chatgpt.com` or a matching referrer is present. Treat missing signals as unattributed. [OpenAI publisher guidance](https://help.openai.com/en/articles/12627856-publishers-and-developers-faq)
2. Count information and tour request successes from existing aggregate reporting or staff intake totals. Review server-side success dimensions before trying to attribute them to an organic or AI source. The analytics schema allows a registration success event, but the current registration submission endpoint has no success analytics write in its source. Use the existing registrations workflow for submitted application totals.
3. Record the number of center-confirmed new enrollments from management's roster and progress toward **25 additional children**. Calculate confirmed enrollments as a share of submitted applications only for a matched application cohort. Report raw weekly submissions and enrollments separately.
4. Rerun the same two AI queries periodically and capture direct domain citations, cited URLs and accuracy for PFCC, meals, transport and the school/route limits. Cross-check Bing AI Performance when access is available. Aggregate data is enough. No children's details or new tracking are needed.

## Change summary and release gate

- Local branch `seo/local-search-optimization`. Site implementation commit `71156c46620323a0b60522073d120d39fac95e40`. The branch's documentation commit carries this closeout and the inventory.
- Site files `build.mjs`, `p1.json`, `public/robots.txt` and `public/llms.txt`. Documentation files `docs/SEO_CLOSEOUT.md` and `docs/SEO_METADATA_INVENTORY.md`.
- Layout, approved visible copy, images, lead intake, registration, PDFs, backend, Parent Portal documents, analytics and business policies were preserved. Two existing outbound link destinations were corrected. No production enrollment or inquiry records were created.
- Netlify current deploy evidence and the repository README indicate a manual prebuilt workflow. The project connector does not expose linked repository/build settings or branch deploy triggers, so a GitHub push cannot be assumed to be inert. No push, Netlify preview or production deploy occurred. After management approval, use one consolidated production release and recheck HTML, robots, sitemap and search-console status.

## December opportunities

| Item | Opportunity after approval |
| --- | --- |
| Private-pay rates | Add the approved rates and effective date to Tuition & Assistance. Keep the PFCC eligibility and copay explanation next to the rates. |
| Parent Handbook | Add the approved public handbook to the Parent Portal with its language and revision, then link to it where families need policy guidance. |
| Authentic facility photography | Update the relevant page or share image when management approves authentic photography. Supply dimensions, meaningful alt text and responsive versions. |
| Completed virtual tour | Update the existing Virtual Tour page and snippet once the tour is usable. Link from the existing tour and enrollment routes. |
| Community partnerships | Add confirmed partner names and verified public links where the relationship helps families. Request official website links from confirmed reference partners. |

# Build status

## Refinement pass — 2026-10-16

The complete requested scope is preserved in `REFINEMENT_SPEC.md`. This pass substantially revises the prior V1.

### Implemented

- Protected Owner and separate admin accounts; broad operational defaults; grouped individual permissions; temporary-password onboarding; mandatory permanent-password replacement; QR/manual TOTP enrollment and one-use recovery codes; optional/required/disabled per-account TOTP and Owner global policy; account suspension/reset/deletion and attributed audits. The protected ownership model from checkpoint `4f09f48` is unchanged.
- Fashion now leads with a prominent Fashion logo, navy/teal/gold identity, large campaign imagery, asymmetrical editorial composition, curated sections, product badges, selectable variants/color indicators, quantity controls and an accessible mobile filter sheet. Holdings uses its blue-violet identity and leads with all three divisions. Admin forms, tables/navigation and contrast have been refined.
- Unlimited custom category/collection records with translated content/SEO, images, visibility/archive, safe deletion, ordering, landing URLs and multiple product memberships. Twelve configurable Fashion section types; selected products/collections; homepage promotion; scheduled custom badges and safe preset styles.
- Variant SKU/stock/price overrides, currency configuration, region/country delivery rules and thresholds, persisted delivery/price snapshots, order sorting/history, customer-data permissions, notification configuration and granular inventory/deletion/cancellation/archive permissions. No real fees or business facts were invented.
- Dedicated translation-only workflows for products, taxonomies, badges and sections; English/Arabic/Sinhala/Tamil and Arabic RTL. Configurable support and country-specific contacts.

### Verification and current rollout

- Latest deployed implementation: commit `1e59bc7`, Worker version `761f3fe4-7190-4546-8790-4a3e4caff51f`. All 12 migrations are applied. Production contains three curated sections, zero admins and zero orders. The existing separate website Worker, D1 and R2 resources were reused; no new paid service was enabled.
- Refinement validation: 69 runtime tests, 14 browser journeys, typecheck and Worker build. Browser QA covers new collection/badge/section CRUD and resulting storefront output, temporary-password/QR onboarding, checkout/order persistence, media, mobile and four languages. Expanded WCAG A/AA checks cover 23 routes. Desktop/mobile screenshots reviewed; visual overlap and Tamil narrow-screen controls corrected.
- Live Chromium checks passed for Holdings, Fashion, catalog/product, both coming-soon pages, bag persistence, intentionally closed checkout, mobile filters, all four languages/Arabic RTL, admin login and bootstrap QR. No browser runtime errors occurred. Desktop/mobile screenshots were reviewed; all eight Fashion homepage images and five catalog images loaded after scrolling. No production accounts or orders were created. Public-host admin routes return 404 and unauthenticated admin APIs return 401; sitemap returns 200.
- All 15 original DNS records, Mail Worker settings, Mail domain binding and Mail D1/R2 resource metadata still match the pre-deployment baseline; Mail HTTPS returns 200. Original supplied images remain unchanged. Production dependency audit reports zero vulnerabilities. Website-only database snapshots were saved privately before migrations.
- Owner explicitly chose self-enrollment on 2026-10-16. **Do not create a temporary production Owner or change the ownership model.** Production has no Owner yet; authenticated production CRUD, account/permission/TOTP workflows and controlled live orders are deferred until enrollment. Local tests are not claimed as authenticated production verification.

### Remaining owner-dependent work

1. Enroll the real Owner, save recovery codes, securely back up AUTH_KEY, then remove BOOTSTRAP_TOKEN. Perform authenticated production QA using that account.
2. Review actual product facts, prices/currency, variants/stock, delivery fees/coverage, contacts/socials, terms/privacy and business translations before opening orders.
3. Supply verified email sender/recipients, Telegram bot/chat settings and WhatsApp number; verify account sending capability and controlled live deliveries. Optional free Turnstile keys may be added.

## Prior deployment milestone — 2026-10-15

Production deployed on 2026-10-15. Public website: https://uniglobeholdings.com. Admin: https://admin.uniglobeholdings.com. Ordering and notification delivery remain disabled pending owner configuration and Main Admin enrollment.

## Production deployment

- Created separate Worker `uniglobe-website`, D1 `uniglobe-website-db` (`5c41e08b-2d92-4ed2-a473-99001eac41bd`) and R2 `uniglobe-website-media`.
- Applied all ten production migrations. Initial state: four preview products, zero orders, zero admins. Installed independently generated `AUTH_KEY` and `BOOTSTRAP_TOKEN` securely.
- Published version `ef8cc0f4-8ab0-48b5-8d48-187517647e97` to the two exact website custom domains; Workers.dev and preview URLs disabled. Outbox cron runs every five minutes.
- All 15 original DNS records remain identical. Only apex/admin website records were added. Existing Mail Worker settings and custom-domain binding remain identical; Mail HTTPS returns 200. No Mail resources or Email Routing configuration were altered. No new paid service was enabled.
- Updated token successfully reads Email Routing rules. GET `/zones/{zone_id}/email/routing` still returns Cloudflare 403 / code 10000; inspecting settings requires Zone → Email Routing Settings → Read. This optional inspection does not block the website. Email sending is not enabled or claimed verified.
- Live Chromium checks pass for nine public routes, images and mobile layouts in all four languages (including Arabic RTL), with no browser runtime errors. Live desktop Holdings and mobile Fashion screenshots inspected. Chromium trusts the environment proxy via its specific CA public-key pin; HTTPS HTTP checks use the system trust store.
- Live public/catalog, robots/sitemap, admin login and setup checks pass. Public-host admin access returns 404; unauthenticated admin API returns 401. HTTPS security headers and admin no-store policy verified.
- Production authenticated admin/order writes await owner enrollment and approved business data; complete equivalent journeys pass against isolated local test data.

## Completed

- Holdings, Fashion, About, Contact, Work With UniGlobe and intentional Real Estate/Academy coming-soon experiences.
- Configurable catalog/products/variants/gallery/taxonomy/prices/countries, search/filter/sort, availability filters, related products, persistent bag, checkout and private receipts. Fractional LKR prices display accurately. Initial four products remain editable LKR 1,500 previews with unknown facts unset.
- Server-authoritative prices; atomic D1 order/inventory/outbox writes; unique human-readable order numbers; idempotency and concurrent stock protection. WhatsApp is optional after persistence.
- Native Cloudflare `ORDER_EMAIL` binding implementation plus optional HTTPS email adapter; company/customer receipts; Telegram Bot API transport; configurable recipients, sender, destinations and templates. All external delivery is tested with mocks.
- Durable notification snapshots, bounded concurrent dispatch, fenced leases, exponential retries, Telegram rate-limit handling and acknowledged-chunk resume. Interrupted final attempts become visible failures; manual retry is available.
- Secure Main Admin bootstrap, required password/TOTP login, granular server permissions, protected Main Admin, encrypted TOTP, hashed sessions, CSRF/origin checks, throttling, credential/session management and audit history.
- Admin catalog/content/branding/contact/social/translation/order/user management, including configurable campaign images and collaboration button destinations. Orders have search, filters, pagination, archiving and optimistic version checks to prevent overwritten edits.
- Validated R2 image upload, browser optimization and an accessible visual image picker for reusing uploaded or supplied assets in products, pages and branding.
- English/Arabic/Sinhala/Tamil storefront controls and editable business translations; Arabic RTL. Missing business translations explicitly fall back to English and are marked in admin.
- Configurable important-page/product metadata, catalog SEO, canonical language URLs, hreflang, sitemap, robots and structured data. Admin and receipts are excluded from indexing.
- Transparent Holdings/Fashion logo derivatives and responsive images. All eight original supplied assets are unchanged.
- Responsive layouts, keyboard/focus/reduced-motion handling, contrast fixes, CI and setup/architecture/security/deployment/notification documentation.

## Final verification

- TypeScript check, **54 Workers-runtime tests**, **12 Chromium browser journeys**, Worker dry-run build and local migrations pass. The post-deployment rerun exposed Wrangler forwarding local requests through the production hostname; explicit development host configuration fixes this without changing production host restrictions.
- Browser coverage includes all four languages, Arabic RTL, 320px/390px mobile and tablet layouts, catalog/bag/checkout/receipt flows, admin editing, media upload/reuse and order handling.
- Automated WCAG A/AA checks pass across 16 key public/admin pages. These supplement visual review; they are not an independent accessibility certification.
- Desktop/mobile screenshots visually inspected for Holdings/Fashion, product, bag, checkout, receipt, About/Contact, both coming-soon pages, admin products/orders and the media picker.
- Production dependency audit: zero reported vulnerabilities. Original-asset diff and Git whitespace checks pass.

## Resources and local state

Production resources are listed above. Local D1/R2 and random local-only secrets are ignored by Git. Browser tests use a separate temporary database and never populate production with test orders or administrators.

Production secret backups are in ignored, mode-600 `.production-secrets/website-secrets.json` in this deployment workspace. Transfer them to an owner-controlled secret vault before retiring the workspace. Do not publish their values. Use the bootstrap token at https://admin.uniglobeholdings.com/admin/setup to choose Main Admin credentials and enroll TOTP, then remove the production `BOOTSTRAP_TOKEN` secret. Preserve `AUTH_KEY`; changing it requires planned TOTP re-encryption.

## Only remaining external or owner-dependent work

1. Owner completes Main Admin enrollment and securely backs up production secrets.
2. Verify the account's native Email Sending entitlement, binding contract, approved sender and arbitrary customer-receipt support; configure recipients. Supply Telegram bot/chat settings, the WhatsApp contact number and optional free Turnstile keys. Perform controlled live delivery checks once these exist. See `docs/NOTIFICATIONS.md`.
3. Owner supplies/reviews actual product names/prices/stock/variants, delivery coverage/terms, contacts/socials, factual business copy, privacy/retention choices and missing business translations/native-speaker review. Owner enrolls the production Main Admin authenticator. Then complete the documented launch checklist and open ordering.

No known unfinished local application implementation blocker remains. Production is live; ordering remains intentionally closed pending business configuration. Native email/Telegram mocks cannot establish real deliverability or Cloudflare account entitlement. At-least-once notification delivery can duplicate a send after an ambiguous timeout; persisted orders remain unique.

## Git checkpoints

Foundation: `34f3432`. Initial complete local build: `b4b607b` / status `44d8800`. Final implementation: `c98d517`. Tamil typography/final local status: `28344b3`. Environment blocker checkpoint: `2ba6fcf`. Identity refinement: `4f09f48`. Brand/catalog/store refinement deployed: `1e59bc7`. The following documentation checkpoint records final live verification; `git log -1` identifies the latest repository checkpoint.

# Build status

## Refinement pass — in progress, 2026-10-15

The prior V1 is not the final design or feature scope. The complete new requirements are preserved in `REFINEMENT_SPEC.md`.

First stable checkpoint: protected singleton ownership with atomic transfer; temporary-password onboarding; password replacement before dashboard access; QR/manual TOTP enrollment; per-account required/optional/disabled TOTP; owner-enforced global TOTP; one-use recovery codes; grouped permissions with broad operational defaults; admin profile, suspension, reset and deletion controls; attributed security auditing. Owner protections remain server-side and database-enforced. Existing account permissions are retained rather than silently expanded.

Validation: 61 runtime tests and 13 browser journeys pass, including a complete new-admin password/QR/recovery-code journey. Typecheck and Worker build pass. Migration 0011 adds identity state without resetting existing accounts. Production rollout of this checkpoint is pending below; authenticated live QA remains dependent on production Owner enrollment.

Remaining in this refinement pass: full taxonomy and collections, curated homepage merchandising, badges, granular catalog/order enforcement, delivery rules, Fashion/Holdings redesign, polished retail controls, final mobile/localization and live persistence QA. No claim is made that the new specification is finished.

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

Foundation: `34f3432`. Initial complete local build: `b4b607b` / status `44d8800`. Final implementation: `c98d517`. Tamil typography/final local status: `28344b3`. Environment blocker checkpoint: `2ba6fcf`. The next checkpoint records the successful production deployment; `git log -1` identifies the latest repository checkpoint.

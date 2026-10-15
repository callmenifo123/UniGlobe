# Build status

## Current milestone — 2026-10-15

Completed local implementation and final QA of the requested V1 scope. The owner has now authorized production deployment, but this running environment has not received Cloudflare credentials or network access. No live deployment or real notification delivery is claimed. The local site runs at http://localhost:8787; no owner localhost testing is required to continue development.

## Production deployment attempt — blocked by environment propagation

- Owner reports `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` configured. Both are absent from the running command environment; no Cloudflare keys exist in the local development settings file.
- The environment configuration read returned no secret bindings or runtime variable requirements, and only package-manager/GitHub network presets.
- Read-only HTTPS requests to `api.cloudflare.com`, `uniglobeholdings.com`, `admin.uniglobeholdings.com` and `mail.uniglobeholdings.com` all fail at the egress proxy with `Tunnel connection failed: 403 Forbidden`. This is not evidence of a Cloudflare API token permission failure: the API is not reachable.
- Saved a draft adding the existing token binding (destination only `api.cloudflare.com`), the account-ID runtime-variable requirement, and those four exact allowed domains, preserving network presets. Saving succeeded and returned `requires_publish: true`.
- The owner must bind the existing values to this environment, review/save the draft and publish the environment. Do not ask for token values in chat or generate a replacement token merely because the saved configuration has not propagated.
- No DNS inspection, resource creation, migrations against production, production secret installation, deployment or live verification could run. No Cloudflare/Mail resources were changed and no new paid service was enabled.
- Local pre-deployment validation was rerun successfully: TypeScript, 54 runtime tests, 12 browser journeys and Worker dry-run build. These are not post-deployment checks.
- Once access propagates, resume from DNS/resource inventory before any writes. Recheck both variable presence and authenticated API access; use the existing `work` checkout. Run the release procedure in `docs/DEPLOYMENT.md`, then collect business configuration/Main Admin enrollment in one batch.

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

- TypeScript check, **54 Workers-runtime tests**, **12 Chromium browser journeys**, Worker dry-run build and local migrations pass.
- Browser coverage includes all four languages, Arabic RTL, 320px/390px mobile and tablet layouts, catalog/bag/checkout/receipt flows, admin editing, media upload/reuse and order handling.
- Automated WCAG A/AA checks pass across 16 key public/admin pages. These supplement visual review; they are not an independent accessibility certification.
- Desktop/mobile screenshots visually inspected for Holdings/Fashion, product, bag, checkout, receipt, About/Contact, both coming-soon pages, admin products/orders and the media picker.
- Production dependency audit: zero reported vulnerabilities. Original-asset diff and Git whitespace checks pass.

## Resources and local state

Dedicated planned names: `uniglobe-website`, `uniglobe-website-db`, `uniglobe-website-media`. Ten migrations apply to local D1; browser tests use a separate temporary database and do not populate the development catalog with test products/orders.

Local D1/R2 and random local-only secrets are ignored by Git. README documents setup. No default admin password is supplied; the owner chooses Main Admin credentials and enrolls TOTP using the private bootstrap token. Ordering defaults closed until business content is reviewed. The server must be restarted with `npm run dev` if this environment stops.

No production resources, DNS, MX/SPF/DKIM/DMARC, Email Routing or existing UniGlobe Mail services have been modified.

## Only remaining external or owner-dependent work

1. Apply/publish the existing Cloudflare deployment credentials and four required network domains to this running environment so deployment can inspect resources, provision the separate website bindings, set production secrets, bind the explicit apex/admin hostnames and verify the deployed service without affecting Mail.
2. Verify the account's native Email Sending entitlement, binding contract, approved sender and arbitrary customer-receipt support; configure recipients. Supply Telegram bot/chat settings, the WhatsApp contact number and optional free Turnstile keys. Perform controlled live delivery checks once these exist. See `docs/NOTIFICATIONS.md`.
3. Owner supplies/reviews actual product names/prices/stock/variants, delivery coverage/terms, contacts/socials, factual business copy, privacy/retention choices and missing business translations/native-speaker review. Owner enrolls the production Main Admin authenticator. Then complete the documented launch checklist and open ordering.

No known unfinished local application implementation blocker remains. Production is currently blocked by the environment credential/network propagation described above. Native email/Telegram mocks cannot establish real deliverability or Cloudflare account entitlement. At-least-once notification delivery can duplicate a send after an ambiguous timeout; persisted orders remain unique.

## Git checkpoints

Foundation: `34f3432`. Initial complete local build: `b4b607b` / status `44d8800`. Final implementation: `c98d517`. Tamil typography/final local status: `28344b3`. The next checkpoint records the production environment blocker; `git log -1` identifies the latest repository checkpoint.

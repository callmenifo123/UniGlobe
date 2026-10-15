# Build status

## Current milestone
First local foundation: public website, seed catalog, bag/checkout, transactional orders, notification outbox and authenticated admin screens implemented. Active development; not production-ready yet.

## Verified
- Original 8 images unchanged; derived WebP copies separate.
- Local D1 migrations applied; Worker dry-run bundles successfully.
- 33 Workers-runtime tests pass: auth/TOTP, permissions, protected Main Admin, CSRF, catalog, order atomicity/idempotency/overselling, receipts, mocked email/Telegram and configuration validation.
- Public desktop/mobile screenshots inspected. Typography and layout work; symbol/font fallbacks and more configurable copy need polish.

## Runtime / resources
Local server: http://localhost:8787 (Wrangler, local D1/R2).
Planned resource names: uniglobe-website, uniglobe-website-db, uniglobe-website-media.
No Cloudflare production resources created, no DNS changes, no Mail changes. User explicitly deferred deployment credentials and requested continued local implementation.

## Remaining work
Browser end-to-end admin/order tests; concurrency hardening for admin inventory edits; additional upload validation; permissions editing; complete configurable secondary copy and division fields; interface translation coverage; local admin setup helper; security review and visual polish. Live integration and deployment remain deferred.

## Secrets/setup
Production: AUTH_KEY, BOOTSTRAP_TOKEN; optional TELEGRAM_BOT_TOKEN; email transport credential and verified endpoint pending Cloudflare Email Sending capability inspection. Cloudflare API token/account ID only needed later for deployment. No secrets in Git.
Ordering defaults closed until catalog and delivery settings are reviewed. Local tests explicitly open isolated stores.

## Git
This file is included in the first foundation checkpoint. Use `git log -1` for its exact commit; subsequent milestones record their preceding checkpoint here.

# Deployment — deferred until Cloudflare access is supplied

## Preserve UniGlobe Mail

Before creating production resources or changing DNS, inspect the account's existing Workers, routes, D1 databases, R2 buckets, all zone DNS records and Email Routing configuration. Record the existing apex/admin targets and mail-related records. Never alter the Mail Worker, its bindings, its D1/R2 resources, mail.uniglobeholdings.com, MX, SPF, DKIM, DMARC or Email Routing. Do not use wildcard Workers routes. Any existing apex/admin service must be identified before replacement.

Use distinct resources:

- Worker: `uniglobe-website`
- D1: `uniglobe-website-db`
- R2: `uniglobe-website-media`
- Public hostname: `uniglobeholdings.com`
- Admin hostname: `admin.uniglobeholdings.com`

The checked-in database ID is intentionally a local-only placeholder. Replace it only with the ID returned by creating/identifying the dedicated website database after inspection. Do not activate paid add-ons.

## Secrets and bindings

Use `wrangler secret put NAME` or Cloudflare's secret UI; never commit values. Separate local secrets from production.

| Name                                | Purpose                                                                                                                                                                               |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `AUTH_KEY`                          | Random encryption key, at least 32 characters; generate at least 32 random bytes. Protect and back it up. Changing it requires a planned re-encryption of stored TOTP secrets.        |
| `BOOTSTRAP_TOKEN`                   | Random, one-time Main Admin setup credential. Remove from production after Main Admin exists.                                                                                         |
| `TELEGRAM_BOT_TOKEN`                | Optional Telegram Bot API credential. Set destinations/enabled state in Admin.                                                                                                        |
| `EMAIL_API_TOKEN` / `EMAIL_API_URL` | Optional server-side HTTPS email adapter credential/endpoint. Fallback adapter uses JSON `{from,to,subject,text}` and a bearer token. Native ORDER_EMAIL is preferred when supported. |
| `TURNSTILE_SECRET_KEY`              | Optional free Turnstile server credential.                                                                                                                                            |
| `TURNSTILE_SITE_KEY`                | Public Turnstile key, scoped to the website hostname. Not a credential.                                                                                                               |

`SITE_URL` and `ADMIN_HOST` are public runtime configuration. Telegram requires egress to `api.telegram.org`; Turnstile uses `challenges.cloudflare.com`. Configure only the selected verified email endpoint. No external paid email subscription is required or activated by this project.

The native `ORDER_EMAIL: SendEmail` integration is implemented alongside the optional HTTPS adapter. See [notification transport setup](NOTIFICATIONS.md) for the exact binding and request contract. Cloudflare's legacy Email Routing outbound binding may restrict recipients to verified addresses; do not assume it supports arbitrary customer receipts. Inspect the account's Email Sending entitlement, sender and recipient restrictions and verify the implemented binding against the live service without changing Mail's existing resources or DNS. Until then, email is verified through mocks and must remain disabled in production.

## Release procedure

1. Inspect and document existing resources/DNS as above. Confirm this project's bindings are distinct.
2. Run `npm ci`, typecheck, unit/integration tests, browser tests and dry-run build.
3. Create the separate website D1/R2 resources. Set the returned D1 ID and production secrets.
4. Back up any existing website database before applying migrations. Apply with `node scripts/wrangler.mjs d1 migrations apply uniglobe-website-db --remote` only after checking the binding's ID.
5. Deploy the tested Worker with its static assets. Bind only the explicit apex and admin hostnames after verifying their existing uses. Do not modify any mail hostname, email record or wildcard routing.
6. Verify the public site and admin-host authentication over HTTPS. Verify Mail's existing service and DNS are unchanged.
7. Bootstrap Main Admin; remove `BOOTSTRAP_TOKEN`. Verify session cookies use the `__Host-` prefix, Secure, HttpOnly and SameSite=Strict.
8. Enter real business content, contacts, product details, translations and delivery countries. Validate notification credentials with controlled test recipients.
9. Review privacy/retention and delivery terms for the business. Enable ordering only after these checks. Free Turnstile is recommended for public checkout.
10. Submit a controlled live order, verify D1 storage, internal/customer notifications and optional WhatsApp. Verify the five-minute outbox schedule and monitor failed delivery attempts in Admin.

Production runtime processes do not survive environment snapshots. For local tasks, use the existing checkout (no worktree unless explicitly requested), `npm run setup:local`, then `npm run dev`.

## Rollback

Keep the previous Worker version and a pre-migration D1 backup. Roll back Worker code through Cloudflare versions if needed; do not automatically roll back data migrations or delete orders. DNS rollback must restore only records changed specifically for this website. Never alter Mail as part of website rollback.

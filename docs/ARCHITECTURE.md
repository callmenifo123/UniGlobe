# UniGlobe website architecture

## Runtime and boundaries

A TypeScript/Hono Worker renders semantic HTML. Small browser modules handle the bag and admin forms; business rules remain on the server. D1 is authoritative for orders, catalog, settings, sessions and audits. R2 holds validated public image uploads. Original supplied assets remain untouched; optimized derivatives live in public/assets.

## Routes

Public: /, /fashion, /fashion/shop, /fashion/products/:slug, /bag, /checkout, /orders/:token, /about, /contact, /real-estate, /academy. Language preference uses ?lang=en|ar|si|ta and a cookie; Arabic uses dir=rtl. Metadata, sitemap and robots exclude private pages.
Admin: admin.uniglobeholdings.com (development /admin), /admin/login, /admin/setup, overview, products, categories, collections, orders, content, media, settings, users, security, audit. No public admin link. Admin responses are no-store and noindex.

## Data

Products contain localized names/descriptions/SEO, galleries, taxonomy, prices in integer minor units, explicit availability and variants. Unspecified stock is null, never invented. Content/settings records contain structured editable business fields and locale variants. Orders store immutable product/price/customer snapshots with unique database sequence numbers and random private receipt tokens. Order insertion, item inventory reservation and notification-outbox creation are atomic. Idempotency keys prevent duplicate submissions. Outbox delivery retries do not roll back orders. Outbox payload snapshots and Telegram chunk cursors make retries stable. Order versions prevent concurrent admin edits from overwriting each other.
Admins contain PBKDF2 password hashes, encrypted TOTP seeds, permissions and a protected main flag. Sessions use hashed random tokens, expiry and per-session CSRF tokens. D1 rate-limit counters cover login and checkout. Audit history is append-only through application APIs.

## Configuration and languages

Admin forms manage products, variants, categories, collections, branding, contacts, division pages, campaigns, SEO and ordering settings. Structured content fields have English/Arabic/Sinhala/Tamil values; missing translations explicitly fall back to English and are marked in admin. Interface strings live in a separate translation dictionary. Secret material is never returned through settings APIs. Telegram token and encryption/bootstrap keys use Worker secrets.

## Cloudflare resource plan

Create ONLY uniglobe-website Worker, uniglobe-website-db D1, uniglobe-website-media R2. Inspect existing DNS, Workers/routes, email routing and resource identities before production changes. Bind only apex and admin hostnames; never use a wildcard route. Preserve mail.uniglobeholdings.com and every MX/SPF/DKIM/DMARC record. No paid add-ons. Cloudflare Email Sending will require checking account capability and its current API before activation; the implemented native ORDER_EMAIL binding and an optional HTTPS adapter allow explicit transport configuration without touching Mail. See NOTIFICATIONS.md.

## Order flow

Server validates customer and current catalog/variant/country/price; server computes totals. An atomic D1 batch persists the order, stock reservations and notification jobs. Receipt token grants access only to that receipt. The confirmation page states the order has been received. Optional WhatsApp continuation is generated only afterward. Scheduled outbox delivery records each attempt and uses bounded retries. Customer email is sent when email transport is enabled and an email was supplied.

## Deployment and validation

Run typecheck, unit/integration tests, local D1 migrations, functional browser checks and Worker dry-run before checkpoints. Push to the existing repository without force. Production uses the dedicated website resources and explicit apex/admin custom domains recorded in BUILD_STATUS.md. Repeat DNS/resource inspection before changing deployment bindings. Never invent resource IDs or claim an unverified live deployment.

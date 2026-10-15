# Build status

## Current milestone — 2026-10-15

Full local testing milestone. Holdings, Fashion, About, Contact and the Real Estate/Academy coming-soon pages are implemented. Production deployment is explicitly deferred by the owner; this is not a live deployment claim.

## Implemented

- Responsive server-rendered storefront, search/filter/sort, product galleries, persistent bag, checkout and private confirmation pages. LKR 1,500 preview prices; unknown stock, sizes and materials are not invented.
- Server-authoritative order totals; atomic order/inventory/outbox persistence; idempotency; concurrent stock protection and stale admin edit detection. Optional WhatsApp continuation happens after order persistence.
- Email/customer/Telegram notification outbox with bounded retries, leases, delivery status and manual retry. Local transports are mocked. Email uses a configurable HTTPS adapter; native Cloudflare Email Sending integration still requires account capability/API verification.
- Authenticated admin with required TOTP, password hashing, encrypted TOTP secrets, hashed sessions, CSRF/origin checks, throttling, audit records, protected Main Admin, scoped permissions and session revocation.
- Editable catalog/variants/taxonomy, ordering/country settings, branding, page copy/SEO, translations, contacts/socials, notification destinations/templates, orders and admin users. Validated R2 media uploads with browser image optimization.
- English, Arabic, Sinhala and Tamil storefront controls; RTL Arabic. Missing business translations remain visible in admin and fall back to English publicly.
- Separate transparent-background Holdings and Fashion logos, with responsive derivatives. All eight original supplied assets remain unchanged.
- Local setup helper, isolated test databases, GitHub Actions checks and operational/security/deployment documentation.

## Verification

- TypeScript check; 46 Workers-runtime tests; eight Chromium end-to-end journeys; Worker dry-run build.
- Tests cover authorization/CSRF/TOTP, owner protection, translation-only navigation and writes, inventory concurrency, order idempotency, notification mocks, upload validation, checkout, admin editing and mobile/RTL layouts.
- Desktop/mobile screenshots inspected across the public site, product, checkout, receipt and admin. Admin tables scroll horizontally on small screens while preserving readable columns.
- Production dependency audit reports no vulnerabilities. Original asset diff is empty.

## Local manual testing

Server: http://localhost:8787. Fashion: http://localhost:8787/fashion. Admin setup: http://localhost:8787/admin/setup.

Follow README.md to use the private local bootstrap token from the ignored `.dev.vars` file, create Main Admin and enroll an authenticator. No default admin password is committed. Ordering starts closed; enable it in the local admin to test checkout with dummy customer data. Test catalog/bag, all four language selectors, mobile layout, admin product/content changes and order management.

## Deferred before production launch

- Cloudflare account/zone inspection and separate website Workers/D1/R2 provisioning; production domain bindings, secrets and deployment validation.
- Verify Cloudflare Email Sending capability and configure the actual email transport/verified sender; configure Telegram and optional Turnstile, then test real delivery. Local mocked delivery does not prove live integration.
- Owner review of real prices, inventory/variants, service countries, contacts, policies, business copy and native-speaker translations. Ordering remains closed until reviewed.
- Complete the deployment checklist, including backups and live security/integration checks, in docs/DEPLOYMENT.md.

No production resources, DNS, MX/SPF/DKIM/DMARC, Email Routing or existing UniGlobe Mail services have been modified. Resource configuration is exclusively for a separate website application.

## Git checkpoints

Previous foundation checkpoint: `34f3432`. Completed and validated local implementation checkpoint: `b4b607b`. Use `git log -1` for the latest documentation checkpoint.

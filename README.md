# UniGlobe Holdings

A server-rendered TypeScript/Hono application for Cloudflare Workers, D1 and R2. Includes the Holdings website, Fashion catalog, persistent orders and a protected business-management workspace. No payment gateway or paid WhatsApp integration.

## Local development

Node.js 22–24 is supported; this environment uses Node 24.19.0.

```sh
npm ci
npm run setup:local
npm run dev
```

Open http://localhost:8787. Fashion is at `/fashion`; administration is at `/admin`. Local D1/R2 state is retained under the ignored `.wrangler/` directory. `setup:local` creates random local-only secrets in `.dev.vars` **only if the file does not already exist**, then applies migrations. Do not commit or share that file.

### Create your local Main Admin

1. Open http://localhost:8787/admin/setup.
2. Read the `BOOTSTRAP_TOKEN` value from your local `.dev.vars` privately and enter it in the setup form. Do not paste it into chat or GitHub.
3. Choose your username and a unique password of at least 12 characters.
4. Add the displayed setup key to Google Authenticator, Microsoft Authenticator or another TOTP app: time-based, SHA-1, six digits, 30-second interval.
5. Enter the current authenticator code. Setup closes once Main Admin exists.

Keep the authenticator account backed up securely. TOTP can be changed under **Security** using the current password and authenticator. No other admin can reset or demote Main Admin. There is intentionally no unauthenticated password/TOTP recovery endpoint; disaster recovery requires an authorized operator and a database backup.

### Exercise ordering locally

The supplied catalog is deliberately marked as a preview, with the requested temporary LKR 1,500 prices. Unknown sizes/SKUs/stock are unset. Ordering is closed by default.

In **Ordering & notifications**, enable **Accept real orders** for your local test instance. Use dummy customer data only. You can then test `/fashion` → product → bag → checkout → confirmation. Notifications remain disabled unless their transports are configured. Enable WhatsApp continuation only with a number you control. The order remains recorded without opening WhatsApp.

Image pickers let editors reuse uploaded and supplied assets without copying paths. Orders are paginated and versioned to prevent stale edits. The admin can manage products, galleries, variants, categories, collections, prices, priorities, country availability, branding, page copy, translations, contact/social channels, notification destinations/templates, order statuses, users/permissions, sessions and audits.

## Validation

```sh
npm run typecheck
npm test
npm run test:browser
npm run build
```

`npm test` runs against isolated local Workers/D1/R2 bindings. Native Cloudflare email and network notification transports are mocked. Browser journeys include automated WCAG AA accessibility checks; these supplement visual review, not replace it. Browser tests start a separate Worker on port 8788 with a temporary database, generate temporary credentials, and remove that database afterward. They do not modify the development database. Install Chromium with `npx playwright install chromium` if needed, or set `CHROMIUM_PATH`. The provided cloud machine uses `/usr/bin/chromium`.

`npm run build` is a **dry run**, not a deployment. CI runs these same checks. Screenshots used for manual visual review are local QA artifacts, not proof of production deployment.

## Production configuration

See [notification integration instructions](docs/NOTIFICATIONS.md), [deployment instructions](docs/DEPLOYMENT.md), [architecture](docs/ARCHITECTURE.md), [security notes](docs/SECURITY.md), and [current build status](docs/BUILD_STATUS.md).

Production is live: [Holdings](https://uniglobeholdings.com), [Fashion](https://uniglobeholdings.com/fashion), and [Admin](https://admin.uniglobeholdings.com). Ordering and notifications remain closed until owner configuration and Main Admin enrollment. See [deployment instructions](docs/DEPLOYMENT.md) for bootstrap and secure secret backup. UniGlobe Mail and its existing DNS/resources were preserved.

## Assets and content

The eight original files under `UniGlobe/` are unchanged. `public/assets/` contains derived WebP copies and licensed font assets. Holdings and Fashion logos have separate transparent-background derivatives and responsive small versions; the original gray/white-background files remain intact. Product photography is not generated or materially altered. Embedded branding/text in source photography remains visible where cropping would remove product detail.

English business content is seeded into D1 and editable. Arabic, Sinhala and Tamil business translations remain explicitly marked as missing until entered by the owner; public pages fall back to English. Common storefront controls and checkout labels are translated, and Arabic uses RTL with direction-aware English fallback. All translated copy should receive native-speaker review before launch.

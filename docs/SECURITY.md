# Security and operational notes

## Authentication and authorization

Passwords are individually salted PBKDF2-SHA256 hashes at 100,000 iterations, the Web Crypto PBKDF2 iteration limit in the Workers runtime. Login is throttled per account and trusted Cloudflare client IP; Owner authentication requires TOTP. Normal admins default to required TOTP; an account may be optional or disabled unless the Owner enables the global requirement. TOTP secrets are AES-GCM encrypted with `AUTH_KEY`. Six-digit, SHA-1, 30-second TOTP codes support a ±1 step clock window; login codes cannot be replayed in that window.

Sessions use 256-bit random tokens; only SHA-256 digests are stored. Cookies are host-only, HttpOnly, SameSite=Strict, and Secure with the `__Host-` prefix over HTTPS. Sessions expire after eight hours. First-login onboarding sessions last twenty minutes and cannot access operational routes. Login and credential changes rotate sessions; password/TOTP changes and permission changes revoke affected sessions. Administration is restricted to the configured admin hostname (localhost permitted for development). No parent-domain cookie is shared with Mail.

All private mutations require a matching Origin and session CSRF token. Server-side permissions protect every admin operation. Only users with admin-management permission can manage peers, and they cannot grant or manipulate privileges beyond their own scope. Main Admin cannot be deleted, disabled, demoted or modified by another admin; database triggers also guard its role and deletion. Self-service password and TOTP updates require existing credentials.

## Account onboarding and ownership

Creating an admin requires an explicit creation capability; default accounts receive broad operational permissions without account-administration capabilities. Per-account permissions are grouped by business function. Delegated managers cannot grant or manage capabilities outside their own scope and can never alter the Owner.

New admins receive an automatically generated or administrator-selected temporary password with a seven-day expiration. They must choose a different permanent password before dashboard access. Required TOTP is enrolled by the new admin through a QR/manual key and a verified code; creators never receive that authenticator secret. Eight one-use recovery codes are shown after enrollment and stored only as hashes. Password resets revoke sessions and return a new temporary password; TOTP resets force enrollment when policy requires it.

Ownership is represented by a singleton database record and protected account flags/triggers. The explicit transfer endpoint requires the current Owner, password, TOTP and typed confirmation; its target must already be active and enrolled. The database batch transfers ownership, demotes the previous Owner to broad operational access, revokes both sessions and records attribution. Ownership is never tied to a username or email. The real Owner will self-enroll; no temporary production Owner is authorized or created.

## Orders and notifications

The server validates the bag against current product/variant/country availability and calculates monetary totals in integer minor units. D1 batches atomically reserve stock, insert the order/history and queue notifications. Variant price/SKU, currency and configured delivery fees are snapshotted in the order. CHECK constraints prevent overselling; catalog and inventory revisions prevent stale admin edits from replacing newer stock. Admin order updates use optimistic version checks, preventing stale status/note overwrites. Unique idempotency keys avoid duplicate orders; a key reused with a different payload is rejected.

Receipt URLs are private 256-bit capabilities, not sequential order IDs. They use no-store, noindex and no-referrer headers. Treat a receipt link as private because it contains delivery information. Admin-only notes never appear in receipts or outbound customer messages.

Notification delivery uses fenced leases, bounded concurrent work, retry backoff, a five-attempt cap and per-job status. Expired final attempts become failed jobs. Native email uses a stable Message-ID; HTTPS email also uses an idempotency key where the provider supports it. Telegram checkpoints acknowledged message chunks and honors rate-limit delays. Telegram has no idempotency primitive: a timeout after successful delivery or a crash before checkpointing can still produce a duplicate chunk. The persisted order itself remains unique and valid. Telegram messages exceeding the provider limit are split without dropping order details.

Checkout always has server rate limits and a honeypot. Optional free Turnstile validates server-side and checks the expected hostname. A challenge/transport failure cannot silently accept a missing verification result. No contact submission endpoint is exposed; configured contact links are displayed instead.

## Content and media

HTML output is escaped. Dynamic JSON-LD and language data escape `<`; CSP blocks inline executable scripts, framing, objects and foreign form targets. Database queries use bound parameters. Public image paths prohibit traversal; social/CTA protocols are validated.

Uploads require media permission and CSRF. Only JPEG/PNG/WebP magic bytes and matching MIME types are accepted, with an 8 MB file limit, 12,000 pixel edge limit and 40 megapixel limit. The browser re-encodes ordinary uploads into WebP, strips metadata and limits their longest edge to 2,400 pixels. Server validation is independent of browser restrictions. R2 objects use random keys and are served as images with nosniff, restrictive CSP and immutable caching. SVG/executable uploads are rejected. The media library is public imagery, never a place for private documents.

Sensitive actions are audited; no application API can modify/delete audit history. No passwords, bootstrap tokens, TOTP seeds, session tokens or transport secrets are included in audit records. Keep deployment logs and database access restricted.

## Before accepting real customer data

Verify production email delivery, Telegram, Turnstile and TLS/host configuration; perform a native-speaker translation review; configure business contacts and delivery terms; decide data retention, privacy policy and backup access. Protect `AUTH_KEY` backups separately from D1 backups. This code has local automated and visual checks, not an independent penetration-test certification.

# Public design revamp — 2026-10-17

Built in `/workspace/UniGlobe` from `8252972` on `work`, following the previously deployed `b8f41f8` design. **Approved and deployed as commit `d23ff25` on 2026-10-17**, Worker version `c04d8911-42cf-4bd9-9e0a-7875f6f7b700`. Previous version / rollback target: `29aba046-0aaa-4ef6-9abb-6b661129a45c`. See `BUILD_STATUS.md` for the deployment record and live verification.

## Direction and rationale

The earlier Holdings page led with a Fashion photograph and repeated the Fashion feature; the future divisions were mostly text links. Its visual weight made the parent company feel like a storefront. The new opening is a company masthead followed by three staggered photographic portals. Fashion, Real Estate and Academy each receive a distinct image, heading, introduction and destination. A full-width navy statement with subtle orbital linework establishes the shared identity. Fashion's active chapter follows as a compact feature instead of dominating the opening.

Fashion is designed as an editorial issue: oversized serif typography, numbered sections, an asymmetric two-image opening, a collection introduction beside staggered product pairs, and a sage-colored image story with italic display type. Photography, rhythm and typography carry the design rather than bordered containers. Catalog, collection pages, product details, bag and checkout use the same public visual language while retaining their existing behavior. All configurable merchandising section types, product selection, badges, section ordering and taxonomy remain supported.

The approved Holdings and Fashion logos and shared favicon assets are unchanged. Fashion is the only prominent logo on Fashion pages. A small translated “Back to UniGlobe Holdings” link above its header makes the parent site reachable immediately; the footer provides parent attribution and links to all divisions. Holdings navigation now exposes all three divisions directly.

## Responsive behavior and controls

Desktop uses the broad three-sector composition and Fashion's editorial image spreads. Tablet scales typography to retain complete words and readable product names. Mobile changes the division portals into alternating image/text rows, moves merchandising introductions above two-column product grids, stacks stories and retains the product gallery's scroll-snap behavior.

Buttons, native selects, variant choices, quantity controls, filter dialogs and disclosure panels have consistent public styling. Native keyboard behavior, focus visibility, Escape/focus return, reduced motion, forced colors and Arabic RTL are preserved. The new return path is covered by a keyboard browser journey at desktop and mobile sizes in English and Arabic, including retained language selection while visiting every division.

## Review images

Screenshots use local preview content and do not indicate production data changes. All visible images were loaded before capture.

| Page     | Desktop (1440)                             | Tablet (768)                              | Mobile (390)                              |
| -------- | ------------------------------------------ | ----------------------------------------- | ----------------------------------------- |
| Holdings | [View](design-review/holdings-desktop.png) | [View](design-review/holdings-tablet.png) | [View](design-review/holdings-mobile.png) |
| Fashion  | [View](design-review/fashion-desktop.png)  | [View](design-review/fashion-tablet.png)  | [View](design-review/fashion-mobile.png)  |

## Assets and configuration

- `estate-concept.webp` and `academy-concept.webp` are newly generated conceptual artwork: a warm limestone architecture study and an open-book still life. They represent the future divisions, not actual property listings, campuses, courses or completed company projects. Both are optimized, self-hosted WebP files. The coming-soon presentation is retained.
- Existing page images configured by the owner take precedence over those fallback illustrations. Homepage sector introductions come from the existing division content records; no new data model, migration or configuration reset is involved. The homepage CTA remains configurable.
- Display type is self-hosted Latin Modern Roman regular/italic under the GUST Font License, included at `public/assets/fonts/LATIN-MODERN-LICENSE.txt`. Existing Arabic, Sinhala and Tamil font coverage remains intact. No external font service or package dependency was added.
- Original supplied photography, logos and favicon assets were preserved unchanged.

## Verification and boundaries

Final checks passed: TypeScript, 69 Workers-runtime tests, 15 Chromium browser journeys, automated WCAG A/AA checks across 23 public/admin routes, and the Worker **dry-run** build. Expanded browser coverage includes Holdings, Fashion and both coming-soon pages at 320 and 768 pixels in every supported language. Existing catalog, cart, checkout, order, admin editing, media, roles and authenticator journeys still pass.

Additional review covered desktop/mobile Holdings, Fashion, catalog, product, About, Contact, Real Estate and bag; tablet/small-mobile checks covered all four division entry points in all four languages. Images loaded, no horizontal overflow or browser runtime errors occurred, and public/admin favicon requests succeeded. Filter keyboard open/Escape/focus return, open-dialog accessibility and reduced-motion behavior passed. These automated accessibility checks supplement visual review and do not constitute an independent certification.

The public stylesheet remains isolated from Admin. Admin UX, security, API contracts, catalog/order/delivery/notification business logic, schema, production data and Cloudflare configuration are unchanged. The only additional server-rendering read obtains existing division copy/images for the public homepage. Implementation involved no production operations. The subsequent approved deployment changed only the website code/assets version; no DNS changes, migrations, Mail changes or new paid services occurred.

No blocking defect remains from this pass. Existing preview products, unfinished business translations and closed production ordering remain owner-configuration concerns. Approved production verification passed at 1440, 768, 390 and 320 pixels, including all four languages, Arabic RTL, keyboard division navigation, catalog controls, gallery scrolling, favicons, image loading, reduced motion and public/admin authorization boundaries. Live automated accessibility checks passed on Holdings, Fashion and catalog at desktop/mobile sizes. No rollback was required.

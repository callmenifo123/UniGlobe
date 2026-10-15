We need a substantial refinement and completion pass.

Do NOT treat the current website/design/admin implementation as final.

The site is functional and deployed, but the branding, Fashion experience, Admin system, authentication model, merchandising tools and backend/store management need a serious upgrade.

You have permission to significantly redesign existing frontend structures where necessary.

==================================================
1. ADMIN / OWNER MODEL
==================================================

Implement a proper multi-admin system.

There must be exactly ONE protected Owner / Main Admin.

OWNER / MAIN ADMIN:

The Owner has full control over the entire system.

Owner can:

- access every operational feature
- manage products
- manage categories
- manage collections
- manage orders
- manage content
- manage branding
- manage translations
- manage contacts/socials
- manage media
- manage store settings
- manage notification settings
- manage delivery settings
- manage admins
- create admins
- suspend admins
- delete non-owner admins
- configure permissions for each admin
- reset admin TOTP where appropriate
- inspect security/audit information
- transfer ownership

The Owner is protected.

No normal admin may:

- delete the Owner
- disable the Owner
- suspend the Owner
- demote the Owner
- reset Owner credentials
- reset Owner TOTP
- lock the Owner out
- secretly assume ownership

Ownership can only change through the explicit ownership-transfer process.

==================================================
2. DEFAULT ADMIN PERMISSIONS
==================================================

Normal admins should NOT be unnecessarily restricted.

A newly created Admin should DEFAULT to having essentially all normal operational business capabilities.

For example, by default an Admin may:

- create/edit/archive products
- manage prices
- manage variants
- manage stock
- manage categories
- manage collections
- manage merchandising
- manage product badges
- manage orders
- change order statuses
- view customer details
- manage homepage content
- manage Fashion content
- manage Holdings content
- manage Real Estate / Academy content
- manage translations
- manage media
- manage contact details
- manage social links
- manage normal store configuration
- manage delivery configuration
- manage notification recipients
- inspect normal audit activity

By DEFAULT, a normal admin should NOT have high-security permissions such as:

- creating additional admins
- deleting admins
- changing other admins' privileges
- transferring ownership
- modifying Owner security
- deleting/resetting Owner
- accessing especially sensitive security controls

==================================================
3. CONFIGURABLE ADMIN PERMISSIONS
==================================================

Permissions must be configurable PER ADMIN by the Owner.

Do not force us into rigid roles only.

Create sensible permission groups such as:

CATALOG
- products.read
- products.write
- products.delete
- categories.manage
- collections.manage
- merchandising.manage
- inventory.manage

ORDERS
- orders.read
- orders.write
- orders.cancel
- orders.archive
- customers.read

CONTENT
- content.manage
- branding.manage
- media.manage
- translations.manage
- contacts.manage

BUSINESS
- delivery.manage
- notifications.manage
- store_settings.manage

ADMINISTRATION
- audit.read
- admins.read
- admins.create
- admins.manage
- security.manage

The exact internal names may differ.

The important behavior:

Owner can grant or revoke individual capabilities for each Admin.

Therefore:

A normal Admin defaults to broad business access,
BUT the Owner can make an Admin very limited OR extremely powerful.

For example:

Admin A:
full operational access, no admin management

Admin B:
products + orders only

Admin C:
content + translations only

Admin D:
full operational access + ability to create/manage other non-owner admins

The permissions UI should be understandable and not look like a developer ACL editor.

Use grouped toggles/checklists with clear labels.

==================================================
4. NON-CONFIGURABLE OWNER PROTECTION
==================================================

Some security invariants should NOT be grantable as ordinary permissions.

Even an extremely privileged Admin must NOT be able to:

- remove the Owner
- demote the Owner
- hijack ownership
- silently change Owner authentication
- bypass the ownership-transfer process

Keep Owner protection enforced server-side.

==================================================
5. ADMIN CREATION FLOW
==================================================

Use the SAME philosophy we used successfully for UniGlobe Mail accounts.

Owner (or an Admin explicitly granted admin-management permission) creates a new Admin.

During creation configure:

- display name
- username
- email
- initial permissions
- TOTP requirement
- enabled/suspended status

The system then creates a TEMPORARY PASSWORD.

Allow either:

- secure auto-generation
OR
- Owner setting the temporary password

Temporary password behavior:

- clearly marked temporary
- cannot be reused as permanent password
- forces password creation on first login
- optional expiration is desirable

Do NOT send permanent passwords by email.

==================================================
6. FIRST ADMIN LOGIN FLOW
==================================================

For a newly created Admin:

STEP 1:
Enter username/email + temporary password.

STEP 2:
Immediately force them to create their own permanent password.

Do NOT allow dashboard access before this is done.

STEP 3:
If TOTP is enabled/required for that Admin:

show authenticator enrollment.

Display:

- scannable QR code
- manual secret/setup key
- clear instructions
- verification field

Compatible with normal TOTP apps such as:

- Google Authenticator
- Microsoft Authenticator
- Authy / compatible applications

Require the Admin to enter a valid generated code before enrollment is completed.

STEP 4:
Generate recovery codes if practical.

STEP 5:
Only then grant dashboard access.

==================================================
7. TOTP BEHAVIOR
==================================================

Keep TOTP.

TOTP should be ENABLED / REQUIRED BY DEFAULT for newly created Admin accounts.

However, make it configurable.

Each Admin should have:

Account
→ Security
→ Two-Factor Authentication

Show:

- TOTP status
- authenticator enrollment
- QR code when setting up
- regenerate/reset flow
- recovery codes where appropriate

If Owner has NOT forced TOTP for the account:

the Admin may disable their own TOTP from Account Settings.

Disabling TOTP should require strong confirmation such as:

- current password
- current TOTP code

If Owner has FORCED TOTP for that Admin:

the Admin cannot disable it themselves.

Owner should be able to configure per Admin:

TOTP:
- Required
- Optional
- Disabled

Suggested default:
Required

Owner may also have a global policy such as:

Require TOTP for all Admins

If that global policy is enabled, individual Admins cannot turn it off.

Log security changes in the audit log.

==================================================
8. OWNER INITIAL SETUP
==================================================

The production Owner bootstrap should use the same basic philosophy.

Owner establishes:

- username/email
- permanent password
- TOTP enrollment using QR code

TOTP should remain enabled by default for the Owner.

Do not weaken Owner authentication merely because normal Admin TOTP can be configurable.

==================================================
9. OWNERSHIP TRANSFER
==================================================

This website will eventually be transferred to another person.

Implement:

TRANSFER OWNERSHIP

Owner should be able to select another existing Admin and transfer Main Admin / Owner status.

Requirements:

- current Owner only
- target must already be a valid Admin
- re-enter Owner password
- require Owner TOTP if enabled
- explicit warning
- explicit confirmation
- audit event
- atomic server-side update

After transfer:

New Admin becomes the protected Owner.

Previous Owner becomes a normal high-level Admin by default.

Do not delete them automatically.

There must always be exactly one Owner.

Do NOT hardcode ownership to a specific username/email.

==================================================
10. ADMIN ACCOUNT MANAGEMENT
==================================================

Create a proper Admin Users page.

Show:

- Admin name
- username
- email
- status
- TOTP status
- permission summary
- last login
- creation date

Actions where authorized:

- edit
- suspend
- reactivate
- permissions
- reset temporary password
- force password reset
- reset TOTP
- require TOTP
- disable TOTP where policy permits
- view security/session information
- delete non-owner Admin

==================================================
11. SECURITY / AUDIT
==================================================

Audit important activity including:

- successful admin login
- failed login
- password change
- forced password reset
- TOTP enabled
- TOTP disabled
- TOTP reset
- admin created
- admin suspended
- admin deleted
- permission change
- ownership transfer
- security-policy change
- notification destination changes
- product price changes
- product deletion
- order status changes

Include WHO performed the action.

This is one major reason we use separate Admin accounts rather than sharing one account.

==================================================
12. BRAND REVIEW
==================================================

Rethink the visual system using the actual supplied brand assets.

Inspect again:

- UniGlobe Holdings logo
- UniGlobe Fashion logo
- product photography

The current site colors do not match the brands well enough.

Derive an intentional palette from the actual branding.

Do NOT preserve arbitrary colors merely because they are already in the implementation.

Create separate but related visual identities for:

- UniGlobe Holdings
- UniGlobe Fashion

==================================================
13. HOLDINGS VS FASHION BRANDING
==================================================

MAIN SITE:

uniglobeholdings.com

Here:

UniGlobe Holdings is the primary brand.

Fashion, Real Estate and Academy are divisions.

==================================================

FASHION:

uniglobeholdings.com/fashion

Here:

UNIGLOBE FASHION is the primary brand.

The Fashion logo needs to become much more prominent.

Currently the Fashion logo feels too small and secondary.

Fix this.

On Fashion pages, customers should immediately perceive:

UniGlobe Fashion

NOT:

UniGlobe Holdings with a Fashion subsection.

Treat the relationship like a proper parent brand / sub-brand relationship.

Use Holdings subtly where appropriate, such as:

- footer
- About
- subtle “A UniGlobe Holdings company” treatment

Do NOT plaster the parent Holdings identity over Fashion pages.

==================================================
14. FASHION VISUAL REDESIGN
==================================================

The current Fashion site does NOT feel enough like an actual Fashion store.

This is not a tiny polish task.

RETHINK IT.

Use much stronger Fashion/art-direction judgment.

You now have significantly more creative freedom.

Aim for:

- real fashion ecommerce
- editorial layouts
- strong photography
- larger campaign imagery
- strong typography
- distinctive spacing
- bold composition
- clean luxury/street-fashion influence where suitable
- visually interesting collection presentation
- premium product presentation
- strong product hierarchy
- tasteful motion
- modern navigation
- deliberate asymmetry where useful
- immersive Fashion hero sections

Do NOT turn it into an ordinary SaaS website with clothes inserted into boxes.

==================================================
15. STOP THE BOX/CARD PROBLEM
==================================================

The current UI relies too much on:

- boxes
- bordered sections
- generic cards
- default selects
- standard browser-looking inputs
- generic dropdowns

It looks weak.

Fix this significantly.

Avoid wrapping every piece of information in another rectangle.

Use layout, typography, whitespace, imagery, dividers and hierarchy rather than endless containers.

==================================================
16. FASHION CONTROLS
==================================================

Fashion storefront controls should look intentional.

SIZE:

Prefer styled selectable options:

XS
S
M
L
XL

instead of ugly native dropdowns.

COLOR:

Use tasteful color swatches / styled selectors where suitable.

QUANTITY:

Clean +/- control.

SORT:

Styled select/popover.

FILTERS:

Desktop:
refined sidebar/popover where appropriate.

Mobile:
clean filter drawer/sheet.

PRODUCT CTA:

Strong Add to Bag treatment.

Do not use generic component-library defaults without customizing them to the brand.

==================================================
17. ADMIN DESIGN
==================================================

Admin does NOT need to look like a fashion editorial website.

It should prioritize:

- clarity
- efficiency
- business usability
- professional hierarchy

But it also should NOT look like generic browser controls dumped into cards.

Improve:

- forms
- selects
- dropdowns
- tables
- filters
- dialogs
- switches
- buttons
- navigation
- empty states
- status indicators

Make it look like polished modern business-management software.

==================================================
18. CATEGORIES
==================================================

Fashion must support unlimited custom CATEGORIES.

Examples only:

- T-Shirts
- Shirts
- Pants
- Dresses
- Shorts
- Sets
- Accessories

These examples MUST NOT be hardcoded.

Admin can:

- create
- edit
- hide
- archive
- delete safely
- reorder

Category fields:

- name
- slug
- translated name
- description
- translations
- cover image
- visibility
- sort priority
- SEO

==================================================
19. COLLECTIONS
==================================================

Fashion must support unlimited CUSTOM COLLECTIONS.

Examples only:

- New Arrivals
- Essentials
- Summer
- Limited Collection
- Featured Looks
- Sale

Do NOT hardcode these.

Admin can:

- create
- edit
- archive
- hide
- delete
- reorder

Collection fields:

- name
- slug
- translated content
- description
- cover image
- hero/banner
- visibility
- homepage visibility
- homepage priority
- SEO
- associated products

Products should be able to belong to multiple collections.

==================================================
20. FASHION HOMEPAGE MERCHANDISING
==================================================

The Fashion homepage:

/fashion

should NOT just automatically show one fixed collection.

Make it a configurable merchandising experience.

Admin controls:

- which sections appear
- section order
- which collections are featured
- which products are highlighted
- section title
- subtitle
- imagery
- visibility
- layout preset where appropriate

Provide high-quality PREDEFINED Fashion section types.

For example:

- Hero Campaign
- Featured Collection
- New Arrivals
- Product Spotlight
- Editorial Split
- Shop by Category
- Featured Products
- Promotional Banner
- Limited Drop
- Sale Highlight
- Image + Copy Story
- Collection Grid

Do NOT make a freeform page builder that lets Admin destroy the design.

Instead:

provide curated Fashion layouts with configurable content.

Allow drag/reorder or simple ordering controls.

==================================================
21. PRODUCT BADGES / MERCHANDISING TAGS
==================================================

Create a real product badge/tag system.

Provide preset types such as:

NEW ARRIVAL
LIMITED QUANTITY
LIMITED DISCOUNT
SALE
BEST SELLER
EXCLUSIVE
BACK IN STOCK
TRENDING
FEATURED
NEW DROP

Be creative and choose additional sensible Fashion merchandising labels if useful.

Badges should have tasteful visual treatments.

Examples:

NEW ARRIVAL:
stylish premium accent

LIMITED QUANTITY:
urgency treatment

LIMITED DISCOUNT:
sale emphasis

EXCLUSIVE:
premium treatment

Do NOT make it look like a casino.

Support:

- one or multiple badges per product
- badge priority
- show on product card
- show on product page
- optional start time
- optional end time
- enable/disable

Also support:

CUSTOM BADGE

with safe predefined styling choices.

==================================================
22. PRODUCT MANAGEMENT
==================================================

Finish Product Admin completely.

Products must support:

- title
- slug
- short description
- description
- translations
- regular price
- sale price
- currency
- SKU
- images
- image gallery
- category
- multiple collections
- sizes
- colors
- variants
- stock
- availability
- Sri Lanka availability
- Saudi Arabia availability
- badges
- Featured
- New Arrival
- homepage promotion
- visibility
- sorting
- SEO

Every field must genuinely persist to production D1/storage and affect the live storefront.

No fake Admin UI.

==================================================
23. INVENTORY / VARIANTS
==================================================

Make variants usable.

Example:

Product:
Oversized T-Shirt

Color:
Black
Pink
Blue

Size:
S
M
L
XL

Each variant may support:

- SKU
- stock quantity
- enabled/disabled
- price override where useful

Do not require complexity where it is unnecessary.

==================================================
24. BACKEND / SHOP COMPLETION
==================================================

Finish the complete store backend.

Verify every major feature is genuinely functional.

CATALOG:

- products
- categories
- collections
- product membership
- variants
- stock
- pricing
- images
- badges
- visibility
- sort order

CART:

- persistence
- quantities
- variants
- totals
- remove/update

CHECKOUT:

- validated customer information
- delivery information
- country
- notes
- pricing snapshot

ORDERS:

- real D1 persistence
- unique order IDs
- customer information
- delivery information
- item snapshots
- variant snapshots
- price-at-order-time
- quantities
- totals
- timestamp
- order status
- customer notes
- admin notes
- notification status

==================================================
25. ORDER ADMIN
==================================================

Complete order-management UX.

Support:

- order list
- search
- filter
- sorting
- order detail
- customer details
- item details
- variants
- pricing
- delivery information
- customer notes
- internal notes
- notification status
- status history where practical

Statuses initially:

- New
- Confirmed
- Processing
- Contacted
- Shipped
- Completed
- Cancelled

==================================================
26. STORE SETTINGS
==================================================

Finish configurable store settings.

Admin should control:

- ordering enabled/disabled
- served countries
- checkout wording
- delivery wording
- currency configuration
- WhatsApp number
- notification emails
- Telegram configuration
- customer confirmation email
- notification channels
- order confirmation wording

If ordering is disabled:

show a proper intentional storefront state.

Do NOT expose a broken checkout.

==================================================
27. DELIVERY RULES
==================================================

Prepare configurable delivery rules.

Support:

- country
- optional region
- delivery fee
- optional free-delivery threshold
- enabled/disabled

Do NOT invent real delivery fees.

==================================================
28. CONTACT / SOCIAL MANAGEMENT
==================================================

Ensure Admin can configure:

- business email
- support email
- phone
- WhatsApp
- Sri Lanka contact
- Saudi contact if used
- addresses
- hours

Social links:

- Instagram
- TikTok
- Facebook
- YouTube
- WhatsApp
- others

Unset items automatically disappear from public UI.

==================================================
29. MULTILINGUAL MANAGEMENT
==================================================

Retain support for:

- English
- Arabic
- Sinhala
- Tamil

Admin can manage translated business content.

Arabic must remain proper RTL.

Products, categories, collections, badges where relevant, homepage sections and business content should work correctly with localization.

==================================================
30. MAIN HOLDINGS DESIGN
==================================================

Also refine the main Holdings website.

Its colors/design should match the actual Holdings identity.

Fashion may be visually expressive.

Holdings should feel:

- modern
- professional
- premium
- adaptable across Fashion, Real Estate and Academy

Do not make Holdings itself look like a Fashion-only company.

==================================================
31. REAL ESTATE / ACADEMY
==================================================

Keep current V1 concept:

- professional Coming Soon experiences
- editable through Admin
- architected for future expansion

Make sure their presentation still fits the corrected Holdings brand system.

==================================================
32. IMAGE / LOGO SCALE
==================================================

Review logo usage everywhere.

Current branding feels undersized.

Especially:

UniGlobe Fashion logo.

Ensure logos:

- are readable
- have proper breathing room
- are not tiny decorative marks
- retain correct proportions

Fashion logo should command the Fashion navigation/landing experience.

==================================================
33. DESIGN FREEDOM
==================================================

Previous instructions may have made the design too conservative.

You now have permission to substantially rethink layout.

You are NOT required to preserve existing:

- section composition
- cards
- grids
- navigation layouts
- component styling
- hero layout

if they are preventing quality.

Requirements are:

- brand accurate
- professional
- Fashion-oriented where appropriate
- fast
- responsive
- accessible
- manageable through Admin

Do NOT merely recolor the current design and call this complete.

==================================================
34. FASHION QUALITY TEST
==================================================

Judge the Fashion site beside real modern Fashion ecommerce brands.

Ask:

Does the UniGlobe Fashion identity dominate appropriately?

Does it look like a real Fashion shop?

Are images large enough?

Is product merchandising intentional?

Are collections compelling?

Does New Arrival actually FEEL new?

Do limited/sale products visually communicate that?

Do size/color controls feel native to Fashion retail?

Does the homepage feel curated rather than database-generated?

Does mobile feel deliberately designed?

If not:

keep improving.

==================================================
35. MOBILE
==================================================

Do a deliberate mobile pass.

Do NOT just stack desktop components.

Review:

- Fashion logo
- nav
- campaign hero
- collection navigation
- product grid
- badges
- filters
- sort
- product page
- size selection
- colors
- bag
- checkout
- admin usable on tablets/mobile where reasonable

==================================================
36. LIVE DEPLOYMENT WORKFLOW
==================================================

The project is already live.

Continue using safe production checkpoints.

After meaningful stable work:

1. run tests
2. run typecheck/build
3. commit
4. push to existing work branch
5. deploy
6. verify live behavior

Do not knowingly deploy broken intermediate states.

Preserve:

mail.uniglobeholdings.com

Do NOT alter or recreate UniGlobe Mail resources.

==================================================
37. TESTING
==================================================

Update/expand automated tests for:

ADMIN:
- temporary password flow
- forced permanent password creation
- multiple admins
- default admin permissions
- custom admin permissions
- permission denial
- admin creation permission
- owner protection
- ownership transfer
- suspension
- password reset
- TOTP enrollment
- QR enrollment data
- TOTP required/optional/disabled
- Owner-enforced TOTP
- TOTP reset
- security audit attribution

CATALOG:
- custom categories
- custom collections
- category ordering
- collection ordering
- multiple collection membership
- products
- variants
- stock
- price changes
- badges
- scheduled badges
- homepage merchandising

STORE:
- cart
- checkout
- order creation
- price snapshot
- order status
- delivery rules
- order configuration
- notification settings

LOCALIZATION:
- language switching
- Arabic RTL
- localized categories
- localized collections
- localized products
- homepage content

==================================================
38. LIVE QA
==================================================

After redesign/completion:

Perform real live browser QA.

Review:

- Holdings desktop
- Holdings mobile
- Fashion homepage desktop
- Fashion homepage mobile
- product listing
- categories
- collections
- product page
- product badges
- bag
- checkout
- admin dashboard
- Admin product creation
- Admin collection creation
- Admin merchandising
- Admin creation
- permission changes
- TOTP enrollment flow

Review visual quality, not only functional correctness.

==================================================
39. BACKEND VERIFICATION
==================================================

Before saying something is completed, verify it actually works against production resources.

Do not claim:

“Admin can edit X”

if the UI exists but the database update does not persist.

Verify CRUD and resulting storefront changes.

==================================================
40. KEEP COSTS THE SAME
==================================================

Do not enable a new paid service.

Continue using existing:

- Worker
- D1
- R2
- Cloudflare infrastructure

unless genuinely necessary.

Ask before adding any recurring paid dependency.

==================================================
41. GIT / HANDOFF
==================================================

Continue maintaining:

docs/BUILD_STATUS.md

Update it with:

- latest deployment
- latest commit
- completed work
- remaining work
- production resource state
- required business configuration

Push stable commits regularly.

==================================================
42. END GOAL
==================================================

This is a major quality/completion pass.

Final result should have:

- proper Owner account
- proper separate Admin accounts
- temporary-password onboarding
- first-login password creation
- TOTP QR enrollment
- configurable TOTP
- granular permissions
- broad default Admin access
- protected ownership
- ownership transfer
- polished Admin management

AND:

- correctly branded Holdings site
- strongly branded UniGlobe Fashion site
- prominent Fashion logo
- genuine Fashion visual identity
- custom categories
- custom collections
- configurable Fashion homepage
- product merchandising
- product badges
- polished product controls
- completed catalog backend
- completed inventory/variant backend
- completed orders backend
- delivery settings
- full production persistence
- strong mobile UX

Do not stop after surface-level styling.

Finish the system properly.

Only stop for genuinely required business information/secrets.

When complete give me a SHORT report containing:

- authentication/admin changes
- Fashion redesign summary
- merchandising/catalog additions
- backend/store additions
- tests passed
- latest live deployment
- latest commit
- only remaining business input/configuration
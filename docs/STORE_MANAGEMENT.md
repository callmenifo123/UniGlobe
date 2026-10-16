# Store management

## Catalog and merchandising

Products have separate translated name, short/full description and SEO fields; SKU, regular/sale price and currency; gallery; one primary category; multiple collection memberships; variant size/color/SKU/stock/price overrides; country availability; visibility, archive, featured/new-arrival flags and display priority. Prices and fees are stored in integer minor units. A variant price overrides the product's regular/sale price. Unknown stock is blank; zero is sold out. Price changes do not alter existing order snapshots.

Categories and collections are custom D1 records, not fixed lists. Their stable identifier links products; their editable slug determines `/fashion/categories/:slug` or `/fashion/collections/:slug`. They support localized names/descriptions/SEO, cover/banner, visibility, archiving, display order and homepage promotion. Hidden/archived entries disappear from navigation and landing routes. Delete only after removing product and homepage references; database triggers protect product references too.

Fashion merchandising supplies twelve curated section types rather than arbitrary HTML: hero, featured collection, new arrivals, product spotlight, editorial split, shop by category, featured products, promotional banner, limited drop, sale highlight, image story and collection grid. Choose a preset, images, translated text, links, collection or selected products, visibility and priority. Lower priority numbers appear first. Section text is authoritative for the Fashion homepage; its page-content entry edits search metadata only. Holdings and coming-soon content remain in Pages & content.

Product badges use editable translated labels and five safe style treatments. Suggested presets include New Arrival, Limited Quantity, Limited Discount, Sale, Best Seller, Exclusive, Back in Stock, Trending, Featured and New Drop. Assign badges in a product editor, choose card/page placement and priority, and optional start/end dates in UTC. Unchecking assignment removes the product badge; globally disabling the badge hides it across products. Timed badges are evaluated at request time.

## Delivery, currency and orders

Delivery rules use country, optional region, actual fee and optional free-delivery threshold. Region matches are case-insensitive and take precedence over country rules; lower priority breaks ties. No real fee is seeded or invented. An unmatched destination has delivery explicitly marked **to be confirmed**, not advertised as free. Fees and rule identity are snapshotted with each order.

The store currency is configurable as LKR, SAR or USD. Changing currency never converts numeric prices. Update product prices/currency and delivery fees intentionally; checkout rejects products in a different currency from the current store. Existing orders retain their original currency and amounts.

Ordering is closed until the business is ready. Customers can browse and save a bag; checkout explains the closed state and cannot submit orders. Server validation remains authoritative. Once enabled, checkout atomically reserves inventory and stores customer/delivery details, item and variant/SKU snapshots, subtotal, delivery, total, order ID and notification jobs. Idempotency prevents duplicate orders. Status and internal-note changes use version checks and append attributed history. Cancellation does not automatically restock goods; reconcile returns explicitly.

Order management supports search, status/archive filters, newest/oldest/total sorting, details, internal notes, status history and notification retries. Customer information requires its own permission. Email customer receipts can be disabled independently of company notifications; transports and recipients must be configured before enabling delivery.

## Translation workflow

Translations provides dedicated editors for products, categories, collections, badges and homepage sections, in addition to page content. Translators can change existing localized text only; prices, stock, destinations and settings are rejected server-side. English supplies the explicit fallback for missing Arabic, Sinhala or Tamil business content. Arabic pages use RTL. Have native speakers review business copy before launch.

## Production verification boundary

The runtime and browser tests perform CRUD and checkout against isolated local D1/R2. The public deployment uses the production D1/R2 bindings. Authenticated production CRUD, real notification delivery and a controlled live order must be verified after the real Owner enrolls and business configuration is approved. Do not represent local QA as proof of authenticated production workflows.

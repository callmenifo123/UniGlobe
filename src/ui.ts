import { html, raw } from "hono/html";
import { text, money, type Locale, type Product } from "./model";
export const escape = (s: unknown) =>
  String(s ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
import { t, languageDictionary } from "./i18n";
export { t } from "./i18n";
function logoResponsive(path: string, width: number) {
  if (!/^\/assets\/(holdings|fashion)-logo-transparent\.webp$/.test(path))
    return "";
  const large = path.includes("holdings") ? 1170 : 1308;
  return raw(
    `srcset="${path.replace(".webp", "-small.webp")} 320w, ${path} ${large}w" sizes="${width}px"`,
  );
}
export function shell(
  title: string,
  body: any,
  {
    lang = "en",
    page = "",
    branding = {},
    contacts = {},
    description = "",
    image = "",
    canonical = "",
    footer = {},
    admin = false,
    csrf = "",
    user = null,
  }: any = {},
) {
  return html`<!doctype html>
    <html lang="${lang}" dir="${lang === "ar" ? "rtl" : "ltr"}">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width,initial-scale=1" />
        <title>${title}</title>
        <meta name="description" content="${description}" />
        <meta name="theme-color" content="#f7f5f0" />
        ${canonical ? html`<link rel="canonical" href="${canonical}" /><meta property="og:url" content="${canonical}" />` : ""}
        ${canonical && !admin && !/\/(bag|checkout)$/.test(canonical) ? ["en", "ar", "si", "ta", "x-default"].map((code) => html`<link rel="alternate" hreflang="${code}" href="${canonical.split("?")[0]}${code === "en" || code === "x-default" ? "" : "?lang=" + code}" />`) : ""}
        <meta property="og:title" content="${title}" />
        <meta property="og:description" content="${description}" />
        <meta property="og:type" content="website" />
        ${image ? html`<meta property="og:image" content="${image}" />` : ""}${admin ? html`<meta name="robots" content="noindex,nofollow" /><meta name="csrf-token" content="${csrf}" />` : ""}
        <link rel="stylesheet" href="/style.css" />
        ${branding.favicon ? html`<link rel="icon" href="${branding.favicon}" />` : ""}
        <script src="${admin ? "/admin.js" : "/store.js"}" defer></script>
      </head>
      <body class="${admin ? "admin-body" : ""} ${page}">
        <a class="skip" href="#main">${t("Skip to content", lang)}</a>${
          admin
            ? html`<header class="admin-top">
                <a class="wordmark" href="/admin"
                  >UNIGLOBE <small>WORKSPACE</small></a
                >${
                  user
                    ? html`<span>${user.username}</span>
                        <form method="post" action="/api/auth/logout">
                          <input
                            type="hidden"
                            name="csrf"
                            value="${csrf}"
                          /><button class="text-button">Log out</button>
                        </form>`
                    : ""
                }
              </header>`
            : html`<header class="site-header">
                <a
                  class="wordmark brand-signature"
                  href="/"
                  aria-label="${branding.companyName || "UniGlobe Holdings"}"
                  >${branding.holdingsLogo ? html`<img src="${branding.holdingsLogo}" ${logoResponsive(branding.holdingsLogo, 75)} alt="${branding.companyName || "UniGlobe Holdings"}" width="70" height="80" />` : html`UNIGLOBE<span>HOLDINGS</span>`}</a
                >
                <nav aria-label="Main navigation">
                  <a
                    href="/fashion"
                    ${raw(page === "fashion" ? 'aria-current="page"' : "")}
                    >${t("fashion", lang)}</a
                  ><a href="/about">${t("about", lang)}</a
                  ><a href="/contact">${t("contact", lang)}</a>
                </nav>
                <div class="header-tools">
                  <form method="get" class="language">
                    <label class="sr-only" for="language"
                      >${t("Language", lang)}</label
                    ><select
                      id="language"
                      name="lang"
                      aria-label="${t("Language", lang)}"
                    >
                      <option
                        value="en"
                        ${raw(lang === "en" ? "selected" : "")}
                      >
                        EN
                      </option>
                      <option
                        value="ar"
                        ${raw(lang === "ar" ? "selected" : "")}
                      >
                        العربية
                      </option>
                      <option
                        value="si"
                        ${raw(lang === "si" ? "selected" : "")}
                      >
                        සිංහල
                      </option>
                      <option
                        value="ta"
                        ${raw(lang === "ta" ? "selected" : "")}
                      >
                        தமிழ்
                      </option></select
                    ><button class="language-go">Go</button>
                  </form>
                  <a href="/bag" class="bag-link"
                    >${t("bag", lang)} <span data-bag-count>0</span></a
                  >
                </div>
              </header>`
        }${body}${
          admin
            ? ""
            : html`<footer class="site-footer">
                <div class="footer-brand">
                  ${branding.companyName || "UniGlobe Holdings"}<span dir="auto"
                    >${text(footer.title, lang)}</span
                  >
                </div>
                <div>
                  <a href="/fashion">UniGlobe Fashion</a
                  ><a href="/real-estate">Real Estate</a
                  ><a href="/academy">Academy</a>
                </div>
                <div>
                  <a href="/about">${t("about", lang)}</a
                  ><a href="/contact">${t("contact", lang)}</a
                  >${contacts.email ? html`<a href="mailto:${contacts.email}">${contacts.email}</a>` : ""}${(contacts.socials || []).map((s: any) => html`<a href="${s.url}" rel="noopener noreferrer">${s.label}</a>`)}
                </div>
                <div class="footer-bottom">
                  <span
                    >© ${new Date().getFullYear()}
                    ${branding.companyName || "UniGlobe Holdings"}</span
                  ><span dir="auto">${text(footer.closing, lang)}</span>
                </div>
              </footer>`
        }${
          !admin
            ? html`<script id="ui-language" type="application/json">
                ${raw(JSON.stringify(languageDictionary(lang)).replace(/</g, "\\u003c"))}
              </script>`
            : ""
        }
        <div id="toast" class="toast" role="status" aria-live="polite"></div>
      </body>
    </html>`;
}
export function card(p: Product, l: Locale) {
  return html`<article class="product-card">
    <a class="product-photo" href="/fashion/products/${p.slug}"
      >${p.images[0] ? html`<img src="${p.images[0]}" ${raw(/^\/assets\/product-[1-6]\.webp$/.test(p.images[0]) ? `srcset="${p.images[0].replace(".webp", "-small.webp")} 480w, ${p.images[0]} 1000w" sizes="(max-width: 760px) 44vw, 22vw"` : "")} alt="${text(p.name, l)}" loading="lazy" width="804" height="1000" />` : html`<div class="image-empty">${t("Image coming soon", l)}</div>`}${p.images[1] ? html`<img class="secondary" src="${p.images[1]}" alt="" loading="lazy" width="804" height="1000" />` : ""}${p.newArrival ? html`<span class="product-label">${t("New arrival", l)}</span>` : ""}</a
    >
    <div class="product-meta">
      <a href="/fashion/products/${p.slug}" dir="auto">${text(p.name, l)}</a
      ><span
        >${money(p.salePrice ?? p.price, l)}${p.salePrice ? html` <s>${money(p.price, l)}</s>` : ""}</span
      >
    </div>
    ${p.variants.every((v) => !v.available || v.stock === 0) ? html`<small class="stock-status">${t("Sold out", l)}</small>` : ""}
    ${p.placeholder ? html`<small class="muted">${t("Preview catalog · details being finalized", l)}</small>` : ""}
  </article>`;
}
export function home(content: any, l: Locale, brand: any) {
  return html`<main id="main">
    <section class="holdings-intro wrap">
      <div class="eyebrow">${text(content.eyebrow, l)}</div>
      <h1 dir="auto">${text(content.title, l)}</h1>
      <div class="intro-bottom">
        <span class="index-number">${text(content.indexLabel, l)}</span>
        <p dir="auto">${text(content.intro, l)}</p>
      </div>
    </section>
    <section class="division-feature">
      <div class="division-image">
        <img
          src="${content.image || brand.heroImage || "/assets/product-2.webp"}"
          alt="UniGlobe Fashion collection"
          width="782"
          height="819"
        />
      </div>
      <div class="division-copy">
        <div class="eyebrow">
          ${text(content.featureEyebrow, l)}
          <span class="status-dot"></span> ${text(content.featureState, l)}
        </div>
        <h2 dir="auto">${text(content.featureTitle, l)}</h2>
        <p dir="auto">${text(content.body, l)}</p>
        <a class="button" href="${content.ctaHref || "/fashion"}"
          >${text(content.cta, l)} <span>↗</span></a
        ><span class="large-number" aria-hidden="true">01</span>
      </div>
    </section>
    <section class="wrap divisions">
      <div class="section-top">
        <h2 dir="auto">${text(content.divisionTitle, l)}</h2>
        <p dir="auto">${text(content.divisionIntro, l)}</p>
      </div>
      <a class="division-row" href="/fashion"
        ><span>01</span>
        <h3>${text(content.fashionLabel, l)}</h3>
        <span class="division-state">${text(content.fashionState, l)}</span
        ><span>↗</span></a
      ><a class="division-row" href="/real-estate"
        ><span>02</span>
        <h3>${text(content.realEstateLabel, l)}</h3>
        <span class="division-state">${t("soon", l)}</span><span>↗</span></a
      ><a class="division-row" href="/academy"
        ><span>03</span>
        <h3>${text(content.academyLabel, l)}</h3>
        <span class="division-state">${t("soon", l)}</span><span>↗</span></a
      >
    </section>
  </main>`;
}
export function fashion(content: any, list: Product[], l: Locale, brand: any) {
  return html`<main id="main">
    <div class="fashion-subnav">
      <span class="fashion-signature"
        >${brand.fashionLogo ? html`<img src="${brand.fashionLogo}" ${logoResponsive(brand.fashionLogo, 46)} alt="${brand.fashionName}" width="38" height="35" />` : text(content.eyebrow, l)}</span
      ><a href="/fashion/shop">${t("all", l)} ↗</a>
    </div>
    <section class="fashion-hero">
      <div class="fashion-hero-copy">
        <div class="eyebrow">${text(content.eyebrow, l)}</div>
        <h1 dir="auto">${text(content.title, l)}</h1>
        <p dir="auto">${text(content.intro, l)}</p>
        <a href="${content.ctaHref || "/fashion/shop"}" class="button"
          >${text(content.cta, l)} <span>↗</span></a
        ><span class="hero-caption">${text(content.campaignCaption, l)}</span>
      </div>
      <div class="fashion-hero-image">
        <img
          src="${content.image || "/assets/product-2.webp"}"
          alt="${text(content.heroAlt, l)}"
          width="782"
          height="819"
        /><span>${text(content.imageCaption, l)}</span>
      </div>
    </section>
    <section class="wrap catalog-section">
      <div class="section-top">
        <div class="eyebrow">${text(content.editEyebrow, l)}</div>
        <h2 dir="auto">${text(content.editTitle, l)}</h2>
        <a class="underlink" href="/fashion/shop">${t("view", l)} ↗</a>
      </div>
      <div class="product-grid">
        ${list
          .filter((p) => p.featured)
          .slice(0, 4)
          .map((p) => card(p, l))}
      </div>
    </section>
    <section class="fashion-note wrap">
      <span class="eyebrow">${text(content.noteEyebrow, l)}</span>
      <h2 dir="auto">${text(content.noteTitle, l)}</h2>
      <p dir="auto">${text(content.body, l)}</p>
      <a href="/about" class="underlink">${text(content.noteCta, l)} ↗</a>
    </section>
  </main>`;
}
export function listing(
  list: Product[],
  l: Locale,
  taxonomies: any[],
  query: any,
  content: any,
) {
  return html`<main id="main" class="wrap listing">
    <div class="eyebrow" dir="auto">${text(content?.eyebrow, l)}</div>
    <h1 dir="auto">
      ${text(content?.title, l) || t("all", l)}<sup
        >${list.length.toString().padStart(2, "0")}</sup
      >
    </h1>
    ${text(content?.intro, l) ? html`<p dir="auto">${text(content.intro, l)}</p>` : ""}
    <form class="filters" method="get">
      <label
        >${t("search", l)}<input
          type="search"
          name="q"
          value="${query.q || ""}"
          placeholder="${t("Find your next favourite", l)}" /></label
      ><label
        >${t("Category", l)}<select name="category">
          <option value="">${t("All categories", l)}</option>
          ${taxonomies.filter((x) => x.kind === "categories").map((x) => html`<option value="${x.id}" ${raw(query.category === x.id ? "selected" : "")}>${text(x.name, l)}</option>`)}
        </select></label
      ><label
        >${t("Collection", l)}<select name="collection">
          <option value="">${t("All collections", l)}</option>
          ${taxonomies.filter((x) => x.kind === "collections").map((x) => html`<option value="${x.id}" ${raw(query.collection === x.id ? "selected" : "")}>${text(x.name, l)}</option>`)}
        </select></label
      ><label
        >${t("Sort", l)}<select name="sort">
          ${[
            ["featured", "Featured"],
            ["price-asc", "Price: low to high"],
            ["price-desc", "Price: high to low"],
            ["name", "Name"],
          ].map(
            ([v, n]) =>
              html`<option
                value="${v}"
                ${raw(query.sort === v ? "selected" : "")}
              >
                ${t(n, l)}
              </option>`,
          )}
        </select></label
      ><label
        >${t("Availability", l)}<select name="availability">
          ${[
            ["", "All availability"],
            ["available", "Available to order"],
            ["sold-out", "Sold out"],
          ].map(
            ([v, n]) =>
              html`<option
                value="${v}"
                ${raw(query.availability === v ? "selected" : "")}
              >
                ${t(n, l)}
              </option>`,
          )}
        </select></label
      ><button class="button">${t("Apply", l)}</button>
    </form>
    <div class="product-grid">${list.map((p) => card(p, l))}</div>
    ${
      !list.length
        ? html`<div class="empty-state">
            <h2 dir="auto">${t("No pieces found.", l)}</h2>
            <a href="/fashion/shop">${t("Clear your filters", l)}</a>
          </div>`
        : ""
    }
  </main>`;
}
export function detail(
  p: Product,
  l: Locale,
  related: Product[],
  ordering: any,
) {
  return html`<main id="main" class="wrap product-page">
    <nav class="breadcrumbs">
      <a href="/fashion">Fashion</a> /
      <a href="/fashion/shop">${t("Collection", l)}</a> / ${text(p.name, l)}
    </nav>
    <section class="product-detail">
      <div class="product-gallery">
        ${p.images.map((src, i) => html`<a href="${src}" target="_blank" rel="noopener"><img src="${src}" alt="${text(p.name, l)} — view ${i + 1}" loading="${i === 0 ? "eager" : "lazy"}" width="804" height="1000" /></a>`)}
      </div>
      <div class="product-info">
        <div class="eyebrow">UNIGLOBE FASHION</div>
        <h1 dir="auto">${text(p.name, l)}</h1>
        <p class="price" dir="auto">
          ${money(p.salePrice ?? p.price, l)}
          ${p.salePrice ? html`<s>${money(p.price, l)}</s>` : ""}
        </p>
        ${p.placeholder ? html`<p class="notice" dir="auto">${t("Preview piece. Name and price are temporary; product details are being finalized.", l)}</p>` : ""}
        <p dir="auto">${text(p.shortDescription, l)}</p>
        <form id="add-to-bag" data-product="${p.id}">
          <label
            >${t("Choose an option", l)}<select name="variant">
              ${p.variants.map((v) => html`<option value="${v.id}" ${raw(!v.available || v.stock === 0 ? "disabled" : "")}>${[v.size, v.color].filter(Boolean).join(" / ") || t("Details to be confirmed", l)}${v.stock === 0 ? " — " + t("Out of stock", l) : ""}</option>`)}
            </select></label
          ><label
            >${t("Quantity", l)}<input
              type="number"
              name="quantity"
              value="1"
              min="1"
              max="20"
              required /></label
          ><button
            class="button wide"
            ${raw(p.variants.every((v) => !v.available || v.stock === 0) ? "disabled" : "")}
          >
            ${t("add", l)} <span>+</span>
          </button>
        </form>
        <div class="detail-disclosures">
          <details open>
            <summary>${t("Details", l)}</summary>
            <p dir="auto">
              ${text(p.description, l) || t("Further product details will be added soon.", l)}
            </p>
          </details>
          <details>
            <summary>${t("Ordering & delivery", l)}</summary>
            <p dir="auto">${text(ordering?.deliveryNote, l)}</p>
            <p dir="auto">
              ${t("Your order is received when this website shows your confirmation. Sending a WhatsApp message is optional.", l)}
            </p>
          </details>
        </div>
      </div>
    </section>
    <section class="related">
      <div class="section-top">
        <h2 dir="auto">${t("Also in the edit.", l)}</h2>
      </div>
      <div class="product-grid">
        ${related.slice(0, 3).map((p) => card(p, l))}
      </div>
    </section>
  </main>`;
}
export function bagPage(l: Locale, ordering: any) {
  return html`<main id="main" class="wrap bag-page">
    <div class="eyebrow">YOUR SELECTION</div>
    <h1 dir="auto">${t("bag", l)}.</h1>
    <div
      id="bag-content"
      data-delivery-note="${text(ordering?.deliveryNote, l)}"
    >
      <p dir="auto">${t("Loading your bag…", l)}</p>
    </div>
    <noscript
      >Enable JavaScript to manage your bag and place an order.</noscript
    >
  </main>`;
}
export function checkoutPage(l: Locale, settings: any, siteKey?: string) {
  return html`<main id="main" class="wrap checkout-page">
    <div class="eyebrow">UNIGLOBE FASHION</div>
    <h1 dir="auto">${t("checkout", l)}.</h1>
    ${!settings?.enabled ? html`<p class="notice" dir="auto">${t("Ordering is not open yet. You can explore the collection and save pieces in your bag.", l)}</p>` : ""}
    <div class="checkout-grid">
      <form
        id="checkout-form"
        data-ordering-enabled="${settings?.enabled ? "true" : "false"}"
      >
        <h2 dir="auto">${t("Contact & delivery", l)}</h2>
        <div class="form-grid">
          <label class="full"
            >${t("Full name", l)}<input
              name="name"
              autocomplete="name"
              required
              maxlength="120" /></label
          ><label
            >${t("Phone number", l)}<input
              name="phone"
              type="tel"
              autocomplete="tel"
              required
              maxlength="25" /></label
          ><label
            >${t("WhatsApp (if different)", l)}<input
              name="whatsapp"
              type="tel"
              maxlength="25" /></label
          ><label class="full"
            >${t("Email (optional, for your receipt)", l)}<input
              name="email"
              type="email"
              autocomplete="email"
              maxlength="254" /></label
          ><label class="full"
            >${t("Delivery address", l)}<textarea
              name="address"
              autocomplete="street-address"
              required
              maxlength="500"
            ></textarea></label
          ><label
            >${t("City", l)}<input
              name="city"
              autocomplete="address-level2"
              required
              maxlength="100" /></label
          ><label
            >${t("Province / region", l)}<input
              name="region"
              autocomplete="address-level1"
              maxlength="100" /></label
          ><label
            >${t("Postal code", l)}<input
              name="postalCode"
              autocomplete="postal-code"
              maxlength="20" /></label
          ><label
            >${t("Country", l)}<select name="country">
              ${(settings?.countries || ["LK"]).map((c: string) => html`<option value="${c}">${t(c === "LK" ? "Sri Lanka" : "Saudi Arabia", l)}</option>`)}
            </select></label
          ><label class="full"
            >${t("Order notes (optional)", l)}<textarea
              name="notes"
              maxlength="1500"
            ></textarea></label
          ><label class="honey" aria-hidden="true"
            >Website<input name="website" tabindex="-1" autocomplete="off"
          /></label>
        </div>
        <p class="fine-print" dir="auto">
          ${t("Your details are used to process and deliver this order. No online payment is collected. Delivery arrangements will be confirmed with you.", l)}
        </p>
        ${
          settings?.turnstileEnabled && siteKey
            ? html`<div class="cf-turnstile" data-sitekey="${siteKey}"></div>
                <script
                  src="https://challenges.cloudflare.com/turnstile/v0/api.js"
                  defer
                ></script>`
            : ""
        }
        <div class="form-error" role="alert"></div>
        <button
          class="button wide"
          ${raw(!settings?.enabled ? "disabled" : "")}
        >
          ${t("order", l)} <span>↗</span>
        </button>
        <p class="fine-print" dir="auto">
          ${t("Your order is received when this website shows your confirmation. Sending a WhatsApp message is optional.", l)}
        </p>
      </form>
      <aside id="checkout-summary" class="order-summary">
        <h2 dir="auto">${t("Your selection", l)}</h2>
        <p dir="auto">${t("Loading…", l)}</p>
      </aside>
    </div>
  </main>`;
}
export function confirmation(o: any, settings: any, wa: string, l: Locale) {
  return html`<main id="main" class="wrap confirmation">
    <div class="success-mark">✓</div>
    <div class="eyebrow">${t("ORDER PLACED SUCCESSFULLY", l)}</div>
    <h1 dir="auto">${t("Thank you", l)}, ${o.customer.name.split(" ")[0]}.</h1>
    <p class="lead" dir="auto">
      ${text(settings?.confirmation, l) || "Your order has already been received."}
    </p>
    <div class="receipt">
      <div class="section-top">
        <h2 dir="auto">UGF-${o.id}</h2>
        <span>${o.created_at} UTC</span>
      </div>
      ${o.items.map(
        (i: any) =>
          html`<div class="receipt-item">
            <span
              >${i.name}<small
                >${i.variant} · ${t("Quantity", l)} ${i.quantity}</small
              ></span
            ><span>${money(i.price * i.quantity, l)}</span>
          </div>`,
      )}
      <div class="receipt-total">
        <span>${t("Order total", l)}</span><strong>${money(o.total, l)}</strong>
      </div>
      <h3>${t("Delivery details", l)}</h3>
      <p dir="auto">
        ${o.customer.name}<br />${o.customer.address}<br />${o.customer.city},
        ${o.customer.region} ${o.customer.postalCode}<br />${t(o.customer.country === "LK" ? "Sri Lanka" : "Saudi Arabia", l)}<br />${o.customer.phone}
      </p>
      <p dir="auto">${text(settings?.deliveryNote, l)}</p>
    </div>
    ${
      wa
        ? html`<div class="whatsapp-note">
            <h2 dir="auto">${t("Keep the conversation going.", l)}</h2>
            <p dir="auto">
              ${t("Your order is already confirmed. Sending this WhatsApp message is optional and may help us contact you faster.", l)}
            </p>
            <a
              class="button"
              href="${wa}"
              target="_blank"
              rel="noopener noreferrer"
              >${t("Continue on WhatsApp", l)} ↗</a
            >
          </div>`
        : ""
    }<a class="underlink" href="/fashion/shop"
      >${t("Back to the collection", l)} ↗</a
    >
  </main>`;
}
export function contentPage(
  id: string,
  content: any,
  work: any,
  contacts: any,
  l: Locale,
) {
  const soon = ["academy", "real-estate"].includes(id);
  const workEmail = work.contactEmail || contacts.email;
  const workHref =
    work.ctaHref && work.ctaHref !== "/contact"
      ? work.ctaHref
      : workEmail
        ? "mailto:" + workEmail
        : work.contactPhone
          ? "tel:" + work.contactPhone
          : id !== "contact"
            ? work.ctaHref || "/contact"
            : "";
  return html`<main id="main" class="content-page ${id}">
    <section class="wrap content-intro">
      <div class="eyebrow">${text(content.eyebrow, l)}</div>
      ${content.logo ? html`<img class="division-logo" src="${content.logo}" alt="${text(content.eyebrow, l)}" />` : ""}${soon && content.comingSoon !== false ? html`<span class="coming-tag">${t("soon", l)}</span>` : ""}
      <h1 dir="auto">${text(content.title, l)}</h1>
      <p class="lead" dir="auto">${text(content.intro, l)}</p>
      ${content.image ? html`<img class="content-image" src="${content.image}" alt="" width="1000" height="600" />` : ""}
      <div class="content-body">
        <span class="section-index"
          >${soon ? "NEXT CHAPTER" : "OUR PERSPECTIVE"}</span
        >
        <div>
          <p dir="auto">${text(content.body, l)}</p>
          ${soon ? html`<a class="underlink" href="${content.ctaHref || "/contact"}">${text(content.cta, l)} ↗</a>` : ""}${content.contactEmail || content.contactPhone ? html`<div class="contact-channels">${content.contactEmail ? html`<a href="mailto:${content.contactEmail}">${content.contactEmail}</a>` : ""}${content.contactPhone ? html`<a href="tel:${content.contactPhone}">${content.contactPhone}</a>` : ""}</div>` : ""}${(content.socials || []).map((s: any) => html`<a class="underlink" href="${s.url}" rel="noopener noreferrer">${s.label}</a>`)}${id === "contact" ? html`<div class="contact-channels">${contacts.email ? html`<a href="mailto:${contacts.email}">${contacts.email} ↗</a>` : ""}${contacts.phone ? html`<a href="tel:${contacts.phone}">${contacts.phone}</a>` : ""}${contacts.whatsapp ? html`<a href="https://wa.me/${contacts.whatsapp.replace(/\D/g, "")}">WhatsApp ↗</a>` : ""}${contacts.address ? html`<p dir="auto">${contacts.address}</p>` : ""}${contacts.hours ? html`<p dir="auto">${contacts.hours}</p>` : ""}</div>` : ""}
        </div>
      </div>
    </section>
    ${
      ["about", "contact"].includes(id)
        ? html`<section class="work-section wrap">
            <div class="eyebrow">${text(work.eyebrow, l)}</div>
            <h2 dir="auto">${text(work.title, l)}</h2>
            <p dir="auto">${text(work.intro, l)}</p>
            ${workHref ? html`<a class="button" href="${workHref}">${text(work.cta, l)} ↗</a>` : html`<p class="muted" dir="auto">Contact details will be available here soon.</p>`}
          </section>`
        : ""
    }
  </main>`;
}
export function adminLayout(user: any, section: string, body: any) {
  const can = (p: string) =>
    user.is_main ||
    JSON.parse(user.permissions).includes(p) ||
    (p === "admins.read" &&
      ["admins.create", "admins.write"].some((x) =>
        JSON.parse(user.permissions).includes(x),
      ));
  const links = [
    ["", "Overview", ""],
    ["products", "Products", "products.read"],
    ["categories", "Categories", "products.read"],
    ["collections", "Collections", "products.read"],
    ["orders", "Orders", "orders.read"],
    ["content", "Pages & content", "content.write"],
    ["translations", "Translations", "translations.write"],
    ["media", "Media library", "media.write"],
    ["branding", "Branding", "branding.write"],
    ["contacts", "Contact & socials", "contacts.write"],
    ["ordering", "Ordering & notifications", "settings.write"],
    ["users", "Admin users", "admins.read"],
    ["security", "Security", ""],
    ["audit", "Audit log", "audit.read"],
  ];
  return html`<div class="admin-frame">
    <aside class="admin-sidebar">
      <span class="eyebrow">BUSINESS MANAGEMENT</span>
      <nav aria-label="Administration">
        ${links.filter(([, , p]) => !p || can(p)).map(([id, label]) => html`<a href="/admin${id ? "/" + id : ""}" ${raw(section === id ? 'aria-current="page"' : "")}>${label}</a>`)}
      </nav>
      <a href="/" class="underlink">View website ↗</a>
    </aside>
    <main id="main" class="admin-main">${body}</main>
  </div>`;
}
export const field = (
  label: string,
  name: string,
  value: any = "",
  type = "text",
  extra = "",
) =>
  html`<label
    >${label}<input
      type="${type}"
      name="${name}"
      value="${value ?? ""}"
      ${raw(extra)}
  /></label>`;
export function authPage(setup = false, secret = "") {
  return html`<main id="main" class="auth-page">
    <div class="eyebrow">UNIGLOBE WORKSPACE</div>
    <h1 dir="auto">${setup ? "Set up Main Admin" : "Welcome back."}</h1>
    <p dir="auto">
      ${setup ? "Create the protected owner account. An authenticator app is required." : "Sign in with your password and authenticator code."}
    </p>
    <form id="auth-form" data-mode="${setup ? "setup" : "login"}">
      ${setup ? field("Bootstrap token", "bootstrap", "", "password", 'required autocomplete="off"') : ""}${field("Username or email", "username", "", "text", 'required autocomplete="username"')}${field("Password", "password", "", "password", 'required minlength="12" maxlength="128" autocomplete="current-password"')}${
        setup
          ? html`<div class="notice">
                Add this setup key to your authenticator app as a time-based
                account, then enter its six-digit code.<code class="totp-key"
                  >${secret}</code
                >
              </div>
              <input type="hidden" name="secret" value="${secret}" />`
          : ""
      }${field("Authenticator code", "code", "", "text", setup ? 'required pattern="[0-9]{6}" inputmode="numeric" autocomplete="one-time-code"' : 'autocomplete="one-time-code"')}
      <p class="form-error" role="alert"></p>
      <button class="button wide">
        ${setup ? "Create Main Admin" : "Sign in"} ↗
      </button>
    </form>
  </main>`;
}

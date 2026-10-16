import { html, raw } from "hono/html";
import { field } from "./ui";
import { locales, L, text, money, permissions, type Product } from "./model";
export function localizedFields(
  label: string,
  name: string,
  value: any,
  area = false,
) {
  return html`<fieldset class="localized-fields">
    <legend>${label}</legend>
    <div class="locale-fields">
      ${locales.map((l) => html`<label>${{ en: "English", ar: "Arabic", si: "Sinhala", ta: "Tamil" }[l]} ${!value?.[l] && l !== "en" ? html`<span class="missing">Missing · English fallback</span>` : ""}${area ? html`<textarea name="${name}.${l}" dir="${l === "ar" ? "rtl" : "ltr"}" rows="3">${value?.[l] || ""}</textarea>` : html`<input name="${name}.${l}" value="${value?.[l] || ""}" dir="${l === "ar" ? "rtl" : "ltr"}" />`}</label>`)}
    </div>
  </fieldset>`;
}
export function productForm(p: Partial<Product>, tax: any[]) {
  return html`<div class="admin-heading">
      <div>
        <div class="eyebrow">CATALOG</div>
        <h1>${p.id ? "Edit product" : "New product"}</h1>
      </div>
      <a href="/admin/products">Back to products</a>
    </div>
    <form
      class="admin-editor"
      data-api="/api/admin/products${p.id ? "/" + p.id : ""}"
      data-method="${p.id ? "PUT" : "POST"}"
      data-product-form
    >
      <input type="hidden" name="version" value="${p.version || 0}" /><input
        type="hidden"
        name="inventoryRevision"
        value="${p.inventoryRevision || 0}"
      />
      <section class="panel">
        ${localizedFields("Product name", "name", p.name || L(""))}${field("URL slug", "slug", p.slug || "", "text", 'required pattern="[a-z0-9]+(-[a-z0-9]+)*"')}${localizedFields("Short description", "shortDescription", p.shortDescription, true)}${localizedFields("Full description", "description", p.description, true)}
      </section>
      <section class="panel">
        <h2>Price & merchandising</h2>
        <div class="form-grid">
          ${field("Regular price (selected currency)", "price", (p.price || 150000) / 100, "number", 'required min="0.01" step="0.01"')}${field("Sale price (selected currency, optional)", "salePrice", p.salePrice ? p.salePrice / 100 : "", "number", 'min="0.01" step="0.01"')}<label
            >Category<select name="category">
              <option value="">Uncategorized</option>
              ${tax.filter((x) => x.kind === "categories").map((x) => html`<option value="${x.id}" ${raw(x.id === p.category ? "selected" : "")}>${x.name.en}</option>`)}
            </select></label
          ><label
            >Primary collection<select name="collection">
              <option value="">No collection</option>
              ${tax.filter((x) => x.kind === "collections").map((x) => html`<option value="${x.id}" ${raw(x.id === p.collection ? "selected" : "")}>${x.name.en}</option>`)}
            </select></label
          >${field("Display priority (lower comes first)", "priority", p.priority || 0, "number")}
        </div>
        <fieldset>
          <legend>Additional collections</legend>
          <div class="permission-groups">
            ${tax.filter((x) => x.kind === "collections").map((x) => html`<label class="check"><input type="checkbox" name="collections" value="${x.id}" ${raw(p.collections?.includes(x.id) ? "checked" : "")} />${text(x.name)}</label>`)}
          </div>
        </fieldset>
        ${field("Product SKU", "sku", p.sku || "")}
        <label
          >Currency<select name="currency">
            ${["LKR", "SAR", "USD"].map((v) => html`<option value="${v}" ${raw((p.currency || "LKR") === v ? "selected" : "")}>${v}</option>`)}
          </select></label
        >
        <div class="check-row">
          ${[
            ["visible", "Visible"],
            ["featured", "Featured"],
            ["newArrival", "New arrival"],
            ["placeholder", "Temporary catalog details"],
            ["archived", "Archived"],
          ].map(
            ([key, label]) =>
              html`<label
                ><input
                  type="checkbox"
                  name="${key}"
                  ${raw((p as any)[key] ? "checked" : "")}
                />${label}</label
              >`,
          )}
        </div>
        <div class="check-row">
          ${[
            ["LK", "Sri Lanka"],
            ["SA", "Saudi Arabia"],
          ].map(
            ([v, n]) =>
              html`<label
                ><input
                  type="checkbox"
                  name="countries"
                  value="${v}"
                  ${raw((p.countries || ["LK"]).includes(v as any) ? "checked" : "")}
                />Available in ${n}</label
              >`,
          )}
        </div>
      </section>
      <section class="panel">
        <h2>Gallery</h2>
        <p class="muted">
          Choose images from the media library, or enter a website asset path.
          First image is the cover.
        </p>
        <div id="image-fields">
          ${(p.images?.length ? p.images : [""]).map((src) => html`<div class="image-entry"><input name="images" value="${src}" placeholder="/media/…" /><button type="button" class="text-button" data-remove-row>Remove</button></div>`)}
        </div>
        <button type="button" class="button secondary-button" data-add-image>
          Add image</button
        ><a class="underlink" href="/admin/media" target="_blank"
          >Open media library ↗</a
        >
      </section>
      <section class="panel">
        <h2>Variants & availability</h2>
        <p class="muted">
          Leave stock blank when unknown. Zero means sold out. Do not invent
          sizes or stock.
        </p>
        <div id="variant-fields">
          ${(
            p.variants || [
              {
                id: "standard",
                size: "",
                color: "",
                sku: "",
                stock: null,
                price: null,
                available: true,
              },
            ]
          ).map(
            (v) =>
              html`<fieldset class="variant-row">
                <legend>Variant</legend>
                ${field("Stable ID", "variant.id", v.id, "text", 'required pattern="[a-zA-Z0-9_-]+"')}${field("Size", "variant.size", v.size)}${field("Color", "variant.color", v.color)}${field("SKU", "variant.sku", v.sku)}${field("Stock", "variant.stock", v.stock ?? "", "number", 'min="0"')}${field("Price override (optional)", "variant.price", v.price ? v.price / 100 : "", "number", 'min="0.01" step="0.01"')}<label
                  class="check"
                  ><input
                    type="checkbox"
                    name="variant.available"
                    ${raw(v.available ? "checked" : "")}
                  />Available</label
                ><button type="button" class="text-button" data-remove-row>
                  Remove variant
                </button>
              </fieldset>`,
          )}
        </div>
        <button type="button" class="button secondary-button" data-add-variant>
          Add variant
        </button>
      </section>
      <section class="panel">
        <h2>Product badges</h2>
        <p>
          Timing is in UTC. Empty dates mean no time limit. Create labels and
          styles in Product badges.
        </p>
        ${tax
          .filter((x) => x.kind === "badges")
          .map((x) => {
            const b = p.badges?.find((b) => b.id === x.id);
            return html`<fieldset class="badge-row" data-badge-id="${x.id}">
              <legend>${text(x.name)}</legend>
              <label class="check"
                ><input
                  type="checkbox"
                  name="badge.enabled"
                  ${raw(b?.enabled ? "checked" : "")}
                />Assign this badge</label
              >
              <div class="form-grid">
                ${field("Priority", "badge.priority", b?.priority || 0, "number")}${field("Start (UTC)", "badge.start", b?.start?.slice(0, 16) || "", "datetime-local")}${field("End (UTC)", "badge.end", b?.end?.slice(0, 16) || "", "datetime-local")}
              </div>
              <label class="check"
                ><input
                  type="checkbox"
                  name="badge.card"
                  ${raw(b?.card !== false ? "checked" : "")}
                />Product cards</label
              ><label class="check"
                ><input
                  type="checkbox"
                  name="badge.page"
                  ${raw(b?.page !== false ? "checked" : "")}
                />Product page</label
              >
            </fieldset>`;
          })}
      </section>
      <section class="panel">
        <h2>Search & sharing</h2>
        ${localizedFields("SEO title", "seoTitle", p.seoTitle)}${localizedFields("SEO description", "seoDescription", p.seoDescription, true)}
      </section>
      <div class="save-bar">
        <p class="form-error" role="alert"></p>
        <button class="button">Save product</button
        ><span class="save-status" role="status"></span>
      </div>
    </form>`;
}
export function productTable(list: Product[]) {
  return html`<div class="admin-heading">
      <div>
        <div class="eyebrow">CATALOG</div>
        <h1>Products <small>${list.length}</small></h1>
      </div>
      <a class="button" href="/admin/products/new">Add product +</a>
    </div>
    <div class="panel table-scroll">
      <table>
        <thead>
          <tr>
            <th>Product</th>
            <th>Price</th>
            <th>Visibility</th>
            <th>Details</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          ${list.map(
            (p) =>
              html`<tr>
                <td>
                  <a class="table-product" href="/admin/products/${p.id}"
                    >${p.images[0] ? html`<img src="${p.images[0]}" alt="" width="44" height="56" />` : ""}<strong
                      >${p.name.en}</strong
                    ></a
                  >
                </td>
                <td>${money(p.salePrice ?? p.price)}</td>
                <td>
                  <span class="badge"
                    >${p.archived ? "Archived" : p.visible ? "Visible" : "Hidden"}</span
                  >
                </td>
                <td>${p.placeholder ? "Needs review" : "Ready"}</td>
                <td>
                  <a href="/admin/products/${p.id}">Edit</a
                  ><button
                    class="text-button"
                    data-action="/api/admin/products/${p.id}/duplicate"
                  >
                    Duplicate</button
                  ><button
                    class="text-button danger"
                    data-delete="/api/admin/products/${p.id}"
                    data-confirm="Delete this product? Products referenced by orders can only be archived."
                  >
                    Delete
                  </button>
                </td>
              </tr>`,
          )}
        </tbody>
      </table>
    </div>`;
}
const contentLabels: Record<string, string> = {
  eyebrow: "Section label",
  title: "Heading",
  intro: "Introduction",
  body: "Main text",
  cta: "Button label",
  ctaHref: "Button destination",
  image: "Main image",
  seoTitle: "Search engine title",
  seoDescription: "Search engine description",
  contactEmail: "Contact email",
  contactPhone: "Contact phone",
  logo: "Division logo",
  comingSoon: "Show Coming Soon badge",
  featureEyebrow: "Feature section label",
  featureState: "Feature status",
  featureTitle: "Feature heading",
  divisionTitle: "Divisions heading",
  divisionIntro: "Divisions introduction",
  fashionLabel: "Fashion division name",
  realEstateLabel: "Real Estate division name",
  academyLabel: "Academy division name",
  fashionState: "Fashion availability label",
  indexLabel: "Introduction label",
  editEyebrow: "Collection section label",
  editTitle: "Collection heading",
  noteEyebrow: "Editorial section label",
  noteTitle: "Editorial heading",
  noteCta: "Editorial button label",
  campaignCaption: "Campaign caption",
  imageCaption: "Campaign image caption",
  heroAlt: "Campaign image description",
  closing: "Footer closing line",
};
export function recordForm(kind: string, id: string, data: any) {
  return html`<div class="admin-heading">
      <div>
        <div class="eyebrow">BUSINESS CONFIGURATION</div>
        <h1>
          ${kind === "content" ? (id === "home" ? "Holdings homepage" : id === "work" ? "Work With UniGlobe" : id.charAt(0).toUpperCase() + id.slice(1).replaceAll("-", " ")) : ({ branding: "Branding", contacts: "Contact & social channels", ordering: "Ordering & notifications" } as any)[kind] || kind}
        </h1>
      </div>
    </div>
    <form
      class="admin-editor panel"
      data-api="/api/admin/records/${kind}/${id}"
      data-method="PUT"
      data-record-kind="${kind}"
    >
      ${kind === "content" && id === "fashion" ? html`<p>Fashion campaign copy, imagery and section order are managed in <a class="underlink" href="/admin/sections">Fashion merchandising</a>. Edit search metadata here.</p>` : ""}<input
        type="hidden"
        name="version"
        value="${data?.version || 0}"
      />${
        kind === "content"
          ? Object.entries(data || {})
              .filter(
                ([k]) =>
                  k !== "version" &&
                  k !== "socials" &&
                  (id !== "fashion" ||
                    ["seoTitle", "seoDescription"].includes(k)),
              )
              .map(([k, v]) =>
                typeof v === "object" && v !== null
                  ? localizedFields(
                      contentLabels[k] || k.replace(/([A-Z])/g, " $1"),
                      k,
                      v,
                      ["body", "intro", "seoDescription"].includes(k),
                    )
                  : typeof v === "boolean"
                    ? html`<label class="check"
                        ><input
                          type="checkbox"
                          name="${k}"
                          ${raw(v ? "checked" : "")}
                        />${contentLabels[k] || k}</label
                      >`
                    : field(contentLabels[k] || k, k, v),
              )
          : ""
      }${
        kind === "content" && Array.isArray(data.socials)
          ? html`<fieldset>
              <legend>Division social channels</legend>
              <div id="social-fields">
                ${data.socials.map((s: any) => html`<div class="social-entry">${field("Channel", "social.label", s.label)}${field("HTTPS link", "social.url", s.url, "url")}<button type="button" data-remove-row>Remove</button></div>`)}
              </div>
              <button
                type="button"
                class="button secondary-button"
                data-add-social
              >
                Add channel
              </button>
            </fieldset>`
          : ""
      }${
        kind === "branding"
          ? html`${field("Company name", "companyName", data.companyName)}${field("Fashion name", "fashionName", data.fashionName)}${field("Holdings logo path", "holdingsLogo", data.holdingsLogo)}${field("Fashion logo path", "fashionLogo", data.fashionLogo)}${field("Favicon path (optional)", "favicon", data.favicon)}${field("Holdings feature image", "heroImage", data.heroImage)}
              <p class="muted">
                Use an image from the Media library. Original supplied assets
                remain preserved.
              </p>`
          : ""
      }${
        kind === "contacts"
          ? html`${field("Email", "email", data.email, "email")}${field("Support email", "supportEmail", data.supportEmail || "", "email")}${field("Sri Lanka contact", "sriLankaContact", data.sriLankaContact || "")}${field("Saudi Arabia contact", "saudiContact", data.saudiContact || "")}${field("Phone", "phone", data.phone, "tel")}${field("WhatsApp", "whatsapp", data.whatsapp, "tel")}${field("Address", "address", data.address)}${field("Working hours", "hours", data.hours)}
              <fieldset>
                <legend>Social channels</legend>
                <div id="social-fields">
                  ${(data.socials || []).map((s: any) => html`<div class="social-entry">${field("Channel", "social.label", s.label)}${field("HTTPS link", "social.url", s.url, "url")}<button type="button" data-remove-row>Remove</button></div>`)}
                </div>
                <button
                  type="button"
                  class="button secondary-button"
                  data-add-social
                >
                  Add channel
                </button>
              </fieldset>
              <p class="muted">
                Empty contact channels are automatically hidden on the website.
              </p>`
          : ""
      }${
        kind === "ordering"
          ? html`<h2>Store availability</h2>
              <label class="check"
                ><input
                  type="checkbox"
                  name="enabled"
                  ${raw(data.enabled ? "checked" : "")}
                />Accept real orders</label
              >
              <p class="notice">
                The seed catalog is a preview. Review product information,
                prices, delivery coverage and contact settings before opening
                ordering.
              </p>
              <div class="check-row">
                ${[
                  ["LK", "Sri Lanka"],
                  ["SA", "Saudi Arabia"],
                ].map(
                  ([v, n]) =>
                    html`<label
                      ><input
                        type="checkbox"
                        name="countries"
                        value="${v}"
                        ${raw(data.countries.includes(v) ? "checked" : "")}
                      />${n}</label
                    >`,
                )}
              </div>
              ${localizedFields("Delivery message", "deliveryNote", data.deliveryNote, true)}${localizedFields("Confirmation message", "confirmation", data.confirmation, true)}
              <h2>Checkout protection</h2>
              <label class="check"
                ><input
                  type="checkbox"
                  name="turnstileEnabled"
                  ${raw(data.turnstileEnabled ? "checked" : "")}
                />Enable free Cloudflare Turnstile</label
              >
              <p class="muted">
                Requires TURNSTILE_SITE_KEY and TURNSTILE_SECRET_KEY. Server
                rate limits and the spam trap are always active.
              </p>
              <label
                >Store currency<select name="currency">
                  ${["LKR", "SAR", "USD"].map((v) => html`<option value="${v}" ${raw((data.currency || "LKR") === v ? "selected" : "")}>${v}</option>`)}
                </select></label
              >
              <p>
                Prices are not converted automatically. Products must use the
                store currency to be ordered together.
              </p>
              ${localizedFields("Checkout introduction", "checkoutIntro", data.checkoutIntro, true)}
              <h2>Email</h2>
              <label class="check"
                ><input
                  type="checkbox"
                  name="customerEmailEnabled"
                  ${raw(data.customerEmailEnabled !== false ? "checked" : "")}
                />Send customer confirmation emails when email is enabled</label
              >
              <label class="check"
                ><input
                  type="checkbox"
                  name="emailEnabled"
                  ${raw(data.emailEnabled ? "checked" : "")}
                />Email notifications enabled</label
              >${field("Company recipients (comma separated)", "emailRecipients", data.emailRecipients.join(", "))}${field("Sender address", "emailSender", data.emailSender, "email")}
              <p class="muted">
                A native Cloudflare email binding or an approved HTTPS transport
                must be configured on the server. Verify the sender and customer
                receipt capability before enabling live delivery.
              </p>
              <h2>Telegram</h2>
              <label class="check"
                ><input
                  type="checkbox"
                  name="telegramEnabled"
                  ${raw(data.telegramEnabled ? "checked" : "")}
                />Telegram notifications enabled</label
              >${field("Chat IDs (comma separated)", "telegramChats", data.telegramChats.join(", "))}
              <p class="muted">
                Configure TELEGRAM_BOT_TOKEN as a Worker secret. It is never
                shown in this dashboard.
              </p>
              <h2>WhatsApp continuation</h2>
              <label class="check"
                ><input
                  type="checkbox"
                  name="whatsappEnabled"
                  ${raw(data.whatsappEnabled ? "checked" : "")}
                />Offer optional WhatsApp after confirmation</label
              >${field("WhatsApp international number", "whatsappNumber", data.whatsappNumber, "tel")}
              <h2>Notification templates</h2>
              <p class="muted">
                Use {orderNumber}, {customerName} and {orderDetails}. Keep
                {orderDetails} in message templates.
              </p>
              ${field("Email subject", "emailSubject", data.emailSubject || "Order received · {orderNumber}")}<label
                >Email message<textarea name="emailTemplate" rows="4">
${data.emailTemplate || "{orderDetails}"}</textarea></label
              ><label
                >Telegram message<textarea name="telegramTemplate" rows="4">
${data.telegramTemplate || "{orderDetails}"}</textarea>
              </label>
              <h2>Order statuses</h2>
              ${field("Statuses (comma separated)", "statuses", data.statuses.join(", "))}
              <p class="muted">
                Keep New and Cancelled. Status changes do not automatically
                return stock; reconcile returned items in the product editor.
              </p>`
          : ""
      }
      <p class="form-error" role="alert"></p>
      <div class="save-bar">
        <button class="button">Save changes</button
        ><span class="save-status" role="status"></span>
      </div>
    </form>`;
}
export function taxonomyPage(kind: string, items: any[]) {
  return html`<div class="admin-heading">
      <h1>${kind === "categories" ? "Categories" : "Collections"}</h1>
    </div>
    ${[
      ...items,
      { id: "", name: L(""), description: L(""), priority: 0, version: 0 },
    ].map(
      (item) =>
        html`<form
          class="panel admin-editor"
          data-api="/api/admin/records/${kind}/${item.id || "new"}"
          data-method="PUT"
          data-taxonomy="${kind}"
        >
          <h2>${item.id ? text(item.name) : "Add new"}</h2>
          <input
            type="hidden"
            name="version"
            value="${item.version || 0}"
          />${field("Identifier", "id", item.id, "text", item.id ? "readonly" : 'required pattern="[a-z0-9-]+"')}${localizedFields("Name", "name", item.name)}${localizedFields("Description", "description", item.description, true)}${field("Display priority", "priority", item.priority, "number")}
          <p class="form-error" role="alert"></p>
          <button class="button">Save</button
          ><span class="save-status"></span
          >${item.id ? html`<button type="button" class="text-button danger" data-delete="/api/admin/records/${kind}/${item.id}" data-confirm="Delete this entry? Entries used by products cannot be deleted.">Delete</button>` : ""}
        </form>`,
    )}`;
}
export function ordersPage(orders: any[], query: any, statuses: string[]) {
  const pageLink = (page: number) =>
    "/admin/orders?" +
    new URLSearchParams({
      q: query.q || "",
      status: query.status || "",
      archived: query.archived || "",
      sort: query.sort || "newest",
      page: String(page),
    });
  return html`<div class="admin-heading">
      <div>
        <div class="eyebrow">SALES & FULFILMENT</div>
        <h1>Orders</h1>
      </div>
    </div>
    <form class="filters">
      <label
        >Search<input
          name="q"
          value="${query.q || ""}"
          placeholder="Order number, name, phone" /></label
      ><label for="order-status">Status</label
      ><select id="order-status" name="status">
        <option value="">All statuses</option>
        ${statuses.map((s) => html`<option ${raw(query.status === s ? "selected" : "")}>${s}</option>`)}</select
      ><label class="check"
        ><input
          name="archived"
          value="1"
          type="checkbox"
          ${raw(query.archived ? "checked" : "")}
        />Show archived</label
      ><label
        >Sort orders<select name="sort">
          ${[
            ["newest", "Newest first"],
            ["oldest", "Oldest first"],
            ["total-high", "Highest total"],
            ["total-low", "Lowest total"],
          ].map(
            ([v, label]) =>
              html`<option
                value="${v}"
                ${raw((query.sort || "newest") === v ? "selected" : "")}
              >
                ${label}
              </option>`,
          )}
        </select></label
      ><button class="button">Filter</button>
    </form>
    <div class="panel table-scroll">
      <table>
        <thead>
          <tr>
            <th>Order</th>
            <th>Customer</th>
            <th>Status</th>
            <th>Total</th>
            <th>Received (UTC)</th>
          </tr>
        </thead>
        <tbody>
          ${orders.map(
            (o) =>
              html`<tr>
                <td><a href="/admin/orders/${o.id}">UGF-${o.id}</a></td>
                <td>${JSON.parse(o.customer).name}</td>
                <td><span class="badge">${o.status}</span></td>
                <td>${money(o.total, "en", o.currency)}</td>
                <td>${o.created_at}</td>
              </tr>`,
          )}
        </tbody>
      </table>
      ${!orders.length ? html`<p class="empty-state">No orders match this view.</p>` : ""}
    </div>
    <nav class="pagination" aria-label="Order pages">
      ${query.page > 1 ? html`<a class="underlink" href="${pageLink(query.page - 1)}">← Previous</a>` : ""}
      <span>Page ${query.page}</span>
      ${query.hasNext ? html`<a class="underlink" href="${pageLink(query.page + 1)}">Next →</a>` : ""}
    </nav>`;
}
export function orderPage(
  o: any,
  jobs: any[],
  statuses: string[],
  history: any[] = [],
) {
  return html`<div class="admin-heading">
      <div>
        <div class="eyebrow">ORDER · ${o.created_at} UTC</div>
        <h1>UGF-${o.id}</h1>
      </div>
      <a href="/admin/orders">All orders</a>
    </div>
    <div class="admin-columns">
      <section class="panel">
        <h2>Items</h2>
        ${o.items.map(
          (i: any) =>
            html`<div class="receipt-item">
              <span
                >${i.name}<small
                  >${i.variant} · Qty
                  ${i.quantity}${i.sku ? " · SKU " + i.sku : ""}</small
                ></span
              ><strong>${money(i.price * i.quantity, "en", o.currency)}</strong>
            </div>`,
        )}
        <p>
          Subtotal: ${money(o.subtotal || o.total, "en", o.currency)} ·
          Delivery:
          ${o.delivery_rule ? money(o.delivery_fee, "en", o.currency) : "To be confirmed"}
        </p>
        <div class="receipt-total">
          <strong>Total</strong
          ><strong>${money(o.total, "en", o.currency)}</strong>
        </div>
        <h2>Customer & delivery</h2>
        <p>
          ${o.customer.name}<br /><a href="tel:${o.customer.phone}"
            >${o.customer.phone}</a
          >${o.customer.whatsapp ? html`<br />WhatsApp: ${o.customer.whatsapp}` : ""}${o.customer.email ? html`<br /><a href="mailto:${o.customer.email}">${o.customer.email}</a>` : ""}
        </p>
        <p>
          ${o.customer.address}<br />${o.customer.city}, ${o.customer.region}
          ${o.customer.postalCode}<br />${o.customer.country}
        </p>
        <h3>Customer notes</h3>
        <p>${o.customer.notes || "None"}</p>
      </section>
      <form
        class="panel admin-editor"
        data-api="/api/admin/orders/${o.id}"
        data-method="PUT"
        data-order-form
      >
        <h2>Manage order</h2>
        <input type="hidden" name="version" value="${o.version}" />
        <label for="order-status">Status</label
        ><select id="order-status" name="status">
          ${statuses.map((s) => html`<option ${raw(o.status === s ? "selected" : "")}>${s}</option>`)}</select
        ><label
          >Internal notes<textarea name="notes" rows="6" maxlength="5000">
${o.notes}</textarea></label
        ><label class="check"
          ><input
            type="checkbox"
            name="archived"
            ${raw(o.archived ? "checked" : "")}
          />Archive order</label
        >
        <p class="form-error" role="alert"></p>
        <button class="button">Save order</button
        ><span class="save-status"></span>
      </form>
    </div>
    <section class="panel">
      <h2>Status history</h2>
      ${
        history.length
          ? html`<ol class="order-history">
              ${history.map(
                (h) =>
                  html`<li>
                    <strong>${h.status}</strong> ·
                    ${h.username || h.actor || "Checkout"}<small
                      >${h.created_at}</small
                    >
                    <p>${h.note}</p>
                  </li>`,
              )}
            </ol>`
          : html`<p>Order received ${o.created_at}.</p>`
      }
    </section>
    <section class="panel">
      <h2>Notification delivery</h2>
      ${
        jobs.length
          ? html`<div class="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Channel</th>
                    <th>Destination</th>
                    <th>Status</th>
                    <th>Attempts</th>
                    <th>Detail</th>
                  </tr>
                </thead>
                <tbody>
                  ${jobs.map(
                    (j) =>
                      html`<tr>
                        <td>${j.channel}</td>
                        <td>${j.destination}</td>
                        <td>${j.status}</td>
                        <td>${j.attempts}</td>
                        <td>
                          ${j.error || j.sent_at || "Awaiting delivery"}
                          ${j.status === "failed" ? html`<button class="text-button" data-action="/api/admin/notifications/${j.id}/retry">Retry</button>` : ""}
                        </td>
                      </tr>`,
                  )}
                </tbody>
              </table>
            </div>`
          : html`<p>
              Notifications were disabled when this order was placed. The order
              is safely recorded.
            </p>`
      }
    </section>`;
}
export function usersPage(users: any[], main: boolean) {
  return html`<div class="admin-heading"><h1>Admin users</h1></div>
    <div class="panel table-scroll">
      <table>
        <thead>
          <tr>
            <th>Username</th>
            <th>Role</th>
            <th>Access</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          ${users.map(
            (u) =>
              html`<tr>
                <td>${u.username}</td>
                <td>${u.is_main ? "Main Admin" : "Admin"}</td>
                <td>${u.disabled ? "Disabled" : "Active"}</td>
                <td>
                  ${!u.is_main ? html`<button class="text-button" data-action="/api/admin/users/${u.id}/toggle">${u.disabled ? "Enable" : "Disable"}</button><button class="text-button danger" data-delete="/api/admin/users/${u.id}" data-confirm="Remove this admin and revoke all their sessions?">Remove</button>` : html`<span class="muted">Protected owner</span>`}
                </td>
              </tr>`,
          )}
        </tbody>
      </table>
    </div>
    ${users
      .filter((u) => !u.is_main)
      .map(
        (u) =>
          html`<details class="panel">
            <summary>Permissions · ${u.username}</summary>
            <form
              class="admin-editor"
              data-api="/api/admin/users/${u.id}/permissions"
              data-method="PUT"
              data-permissions-form
            >
              <div class="permission-grid">
                ${permissions.filter((p) => main || p !== "admins.write").map((p) => html`<label class="check"><input type="checkbox" name="permissions" value="${p}" ${raw(JSON.parse(u.permissions).includes(p) ? "checked" : "")} />${p}</label>`)}
              </div>
              <p class="form-error" role="alert"></p>
              <button class="button">Save permissions & revoke sessions</button
              ><span class="save-status"></span>
            </form>
          </details>`,
      )}
    <form id="create-admin" class="panel">
      <h2>Add admin</h2>
      <p>
        Give the new admin their temporary password and TOTP setup key through a
        private channel. They must use both to sign in.
      </p>
      ${field("Username or email", "username", "", "text", "required")}${field("Initial password (12+ characters)", "password", "", "password", 'required minlength="12" autocomplete="new-password"')}
      <fieldset>
        <legend>Permissions</legend>
        <div class="permission-grid">
          ${permissions.filter((p) => main || p !== "admins.write").map((p) => html`<label class="check"><input type="checkbox" name="permissions" value="${p}" />${p}</label>`)}
        </div>
      </fieldset>
      <p class="form-error" role="alert"></p>
      <button class="button">Create admin</button>
      <div id="admin-created" role="status"></div>
    </form>`;
}

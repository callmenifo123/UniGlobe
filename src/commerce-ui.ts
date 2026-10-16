import { html, raw } from "hono/html";
import { field } from "./ui";
import { localizedFields } from "./admin-ui";
import { L, text, type Product } from "./model";
import { sectionTypes, badgeStyles, badgePresets } from "./commerce";
const check = (label: string, name: string, checked: boolean) =>
  html`<label class="check"
    ><input
      type="checkbox"
      name="${name}"
      ${raw(checked ? "checked" : "")}
    />${label}</label
  >`;
const select = (label: string, name: string, values: string[], value: string) =>
  html`<label
    >${label}<select name="${name}">
      ${values.map((v) => html`<option value="${v}" ${raw(value === v ? "selected" : "")}>${v.replaceAll("-", " ")}</option>`)}
    </select></label
  >`;
export function commercePage(
  kind: string,
  items: any[],
  products: Product[],
  tax: any[],
) {
  const labels: Record<string, string> = {
    categories: "Categories",
    collections: "Collections",
    sections: "Fashion merchandising",
    badges: "Product badges",
    delivery: "Delivery rules",
  };
  return html`<div class="admin-heading">
      <div>
        <p class="eyebrow">STORE MANAGEMENT</p>
        <h1>${labels[kind]}</h1>
        <p>
          ${kind === "sections" ? "Curated layouts, your content. Lower priority numbers appear first. Hidden sections stay off the storefront." : kind === "delivery" ? "Set your actual delivery fees. Region-specific rules take precedence over country-wide rules. With no matching rule, delivery remains to be confirmed." : "Create, reorder, hide and archive without changing code."}
        </p>
      </div>
    </div>
    ${kind === "badges" ? html`<p class="muted">Suggested labels: ${badgePresets.join(" · ")}. These are suggestions; names and translations are entirely yours.</p>` : ""}${[
      ...items,
      {
        id: "",
        version: 0,
        priority: items.length * 10,
        visible: true,
        enabled: false,
        name: L(""),
        description: L(""),
        title: L(""),
      },
    ].map(
      (item) =>
        html`<details
          class="commerce-editor panel"
          ${raw(item.id ? "" : "open")}
        >
          <summary>
            ${item.id ? text(item.name) || text(item.title) || item.id : "Create " + (kind === "sections" ? "section" : kind === "delivery" ? "delivery rule" : kind.slice(0, -1))}<small
              >${item.id ? " · Priority " + item.priority + (item.visible === false ? " · Hidden" : "") + (item.archived ? " · Archived" : "") : ""}</small
            >
          </summary>
          <form
            class="admin-editor"
            data-api="/api/admin/records/${kind}/${item.id || "new"}"
            data-method="PUT"
            data-commerce="${kind}"
          >
            <input
              type="hidden"
              name="version"
              value="${item.version || 0}"
            />${field("Stable identifier", "id", item.id, "text", item.id ? "readonly" : 'required pattern="[a-z0-9-]+"')}${field("Display priority", "priority", item.priority, "number")}${
              ["categories", "collections"].includes(kind)
                ? html`${localizedFields("Name", "name", item.name)}${field("URL slug", "slug", item.slug || item.id, "text", 'pattern="[a-z0-9]+(-[a-z0-9]+)*"')}${localizedFields("Description", "description", item.description, true)}${field("Cover image", "cover", item.cover)}${field("Hero / banner image", "hero", item.hero)}
                    <div class="check-row">
                      ${check("Visible", "visible", item.visible !== false)}${check("Archived", "archived", !!item.archived)}${check("Show on Fashion homepage", "homepageVisible", !!item.homepageVisible)}
                    </div>
                    ${field("Homepage priority", "homepagePriority", item.homepagePriority || 0, "number")}${localizedFields("SEO title", "seoTitle", item.seoTitle)}${localizedFields("SEO description", "seoDescription", item.seoDescription, true)}${
                      kind === "collections" && item.id
                        ? html`<p>
                              Assign products to this collection in each product
                              editor. A product can belong to multiple
                              collections.
                            </p>
                            <div class="collection-members">
                              ${products.filter((p) => p.collection === item.id || p.collections.includes(item.id)).map((p) => html`<a href="/admin/products/${p.id}">${text(p.name)} ↗</a>`)}
                            </div>`
                        : ""
                    }`
                : ""
            }${
              kind === "badges"
                ? html`<label
                      >Badge preset<select data-badge-preset>
                        <option value="">Custom badge</option>
                        ${badgePresets.map((label) => html`<option value="${label}">${label}</option>`)}
                      </select></label
                    >${localizedFields("Badge label", "name", item.name)}${select("Visual treatment", "style", [...badgeStyles], item.style || "accent")}${check("Enabled", "enabled", item.enabled !== false)}
                    <p>
                      Assign badges, timing, display placement and priority in
                      product editors.
                    </p>`
                : ""
            }${
              kind === "sections"
                ? html`${select("Section type", "type", [...sectionTypes], item.type || "hero")}${select("Layout preset", "layout", ["editorial", "wide", "split", "grid"], item.layout || "editorial")}${localizedFields("Title", "title", item.title)}${localizedFields("Subtitle", "subtitle", item.subtitle, true)}${localizedFields("Section label", "eyebrow", item.eyebrow)}${localizedFields("Button label", "cta", item.cta)}${field("Button destination", "href", item.href || "/fashion/shop")}${field("Main image", "image", item.image)}${field("Supporting image", "secondaryImage", item.secondaryImage)}<label
                      >Featured collection<select name="collection">
                        <option value="">Select if needed</option>
                        ${tax.filter((t) => t.kind === "collections").map((t) => html`<option value="${t.id}" ${raw(item.collection === t.id ? "selected" : "")}>${text(t.name)}</option>`)}
                      </select></label
                    >
                    <fieldset>
                      <legend>Selected products</legend>
                      <p>
                        Leave blank to use the section’s selection rule
                        (featured, new arrival, sale or collection membership).
                      </p>
                      <div class="permission-groups">
                        ${products.map((p) => html`<label class="check"><input type="checkbox" name="products" value="${p.id}" ${raw(item.products?.includes(p.id) ? "checked" : "")} />${text(p.name)}</label>`)}
                      </div>
                    </fieldset>
                    <fieldset>
                      <legend>Categories / collections to feature</legend>
                      ${tax.map((t) => html`<label class="check"><input type="checkbox" name="taxonomies" value="${t.id}" ${raw(item.taxonomies?.includes(t.id) ? "checked" : "")} />${t.kind} · ${text(t.name)}</label>`)}
                    </fieldset>
                    ${check("Visible", "visible", item.visible !== false)}`
                : ""
            }${kind === "delivery" ? html`${field("Rule name", "name", item.name?.en ?? item.name ?? "")}${select("Country", "country", ["LK", "SA"], item.country || "LK")}${field("Region (blank for whole country)", "region", item.region)}${field("Delivery fee (store currency)", "fee", item.fee === undefined ? "" : item.fee / 100, "number", 'required min="0" step="0.01"')}${field("Free delivery from (optional)", "freeAbove", item.freeAbove == null ? "" : item.freeAbove / 100, "number", 'min="0" step="0.01"')}${check("Enabled", "enabled", !!item.enabled)}` : ""}
            <p class="form-error" role="alert"></p>
            <div class="save-bar">
              <button class="button">
                Save ${kind === "sections" ? "section" : "changes"}</button
              ><span class="save-status" role="status"></span
              >${item.id ? html`<button type="button" class="text-button danger" data-delete="/api/admin/records/${kind}/${item.id}" data-confirm="Delete this entry? Product and merchandising references must be removed first.">Delete</button>` : ""}
            </div>
          </form>
        </details>`,
    )}`;
}

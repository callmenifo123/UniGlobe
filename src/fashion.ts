import { html, raw } from "hono/html";
import { card } from "./ui";
import { type Product, type Locale, text } from "./model";
import { member } from "./commerce";
export function curatedFashion(
  sections: any[],
  products: Product[],
  tax: any[],
  l: Locale,
) {
  return html`<main id="main" class="fashion-canvas">
    ${sections.map((s, index) => {
      const heading =
        index === 0
          ? html`<h1 dir="auto">${text(s.title, l)}</h1>`
          : html`<h2 dir="auto">${text(s.title, l)}</h2>`;
      const copy = html`<div class="campaign-copy">
        <p class="eyebrow">${text(s.eyebrow, l)}</p>
        ${heading}
        <p dir="auto">${text(s.subtitle, l)}</p>
        ${s.href && text(s.cta, l) ? html`<a class="button" href="${s.href}">${text(s.cta, l)} <span aria-hidden="true">↗</span></a>` : ""}
      </div>`;
      let chosen = products;
      if (s.products?.length)
        chosen = s.products
          .map((id: string) => products.find((p) => p.id === id))
          .filter(Boolean);
      else if (s.collection)
        chosen = products.filter((p) => member(p, s.collection));
      else if (s.type === "new-arrivals")
        chosen = products.filter((p) => p.newArrival);
      else if (s.type === "sale-highlight")
        chosen = products.filter((p) => p.salePrice !== null);
      else if (s.type === "limited-drop")
        chosen = products.filter((p) => p.badges.some((b) => b.enabled));
      else chosen = products.filter((p) => p.featured);
      if (s.type === "hero")
        return html`<section
          class="campaign campaign-${s.layout || "editorial"}"
        >
          <div class="campaign-visual">
            ${s.image ? html`<img src="${s.image}" alt="${text(s.title, l)}" width="900" height="1050" fetchpriority="${index === 0 ? "high" : "auto"}" />` : ""}
          </div>
          ${copy}${s.secondaryImage ? html`<div class="campaign-secondary"><img src="${s.secondaryImage}" alt="" width="700" height="900" loading="lazy" /><span>UNIGLOBE FASHION</span></div>` : ""}
          <div class="campaign-index" aria-hidden="true">
            ${String(index + 1).padStart(2, "0")} / THE EDIT
          </div>
        </section>`;
      if (
        ["editorial-split", "image-story", "promotional-banner"].includes(
          s.type,
        )
      )
        return html`<section
          class="editorial-story story-${s.layout || "split"} ${s.type}"
        >
          ${s.image ? html`<div class="story-image"><img src="${s.image}" alt="${text(s.title, l)}" width="800" height="1000" loading="lazy" /></div>` : ""}${copy}
        </section>`;
      if (["shop-by-category", "collection-grid"].includes(s.type)) {
        const kind =
          s.type === "shop-by-category" ? "categories" : "collections";
        const choices = tax.filter(
          (t) =>
            t.kind === kind &&
            (!s.taxonomies?.length || s.taxonomies.includes(t.id)),
        );
        return html`<section class="merch-section wrap">
          <header class="section-top">${copy}</header>
          <div class="collection-grid">
            ${choices.map(
              (t, i) =>
                html`<a
                  class="collection-tile"
                  href="/fashion/${kind}/${t.slug || t.id}"
                  >${t.cover ? html`<img src="${t.cover}" alt="${text(t.name, l)}" width="800" height="1000" loading="lazy" />` : ""}<span
                    class="eyebrow"
                    >${String(i + 1).padStart(2, "0")}</span
                  >
                  <h3>${text(t.name, l)} ↗</h3>
                  <p>${text(t.description, l)}</p></a
                >`,
            )}
          </div>
        </section>`;
      }
      if (s.type === "product-spotlight" && chosen[0]) {
        const p = chosen[0];
        return html`<section class="product-spotlight wrap">
          ${copy}
          <div>${card(p, l)}</div>
        </section>`;
      }
      return html`<section
        class="merch-section wrap layout-${s.layout || "grid"}"
      >
        <header class="section-top">${copy}</header>
        <div class="product-grid">
          ${chosen.slice(0, 12).map((p) => card(p, l))}
        </div>
        ${chosen.length === 0 ? html`<p class="muted">${text(s.subtitle, l)}</p>` : ""}
      </section>`;
    })}${
      tax.filter((t) => t.homepageVisible).length
        ? html`<section class="wrap merch-section">
            <div class="collection-grid">
              ${tax
                .filter((t) => t.homepageVisible)
                .sort((a, b) => a.homepagePriority - b.homepagePriority)
                .map(
                  (t) =>
                    html`<a
                      class="collection-tile"
                      href="/fashion/${t.kind}/${t.slug || t.id}"
                      >${t.cover ? html`<img src="${t.cover}" alt="${text(t.name, l)}" loading="lazy" width="800" height="1000" />` : ""}
                      <h2>${text(t.name, l)} ↗</h2></a
                    >`,
                )}
            </div>
          </section>`
        : ""
    }
  </main>`;
}

(() => {
  "use strict";
  const $ = (s) => document.querySelector(s);
  const ui = JSON.parse($("#ui-language")?.textContent || "{}");
  const tr = (s) => ui[s] || s;
  const esc = (v) =>
    String(v ?? "").replace(
      /[&<>"']/g,
      (c) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        })[c],
    );
  let storeCurrency = "LKR",
    deliveryRules = [],
    orderingEnabled = false;
  const money = (n, currency = storeCurrency) =>
    new Intl.NumberFormat(
      { ar: "ar-SA", si: "si-LK", ta: "ta-LK" }[
        document.documentElement.lang
      ] || "en-LK",
      {
        style: "currency",
        currency,
        minimumFractionDigits: n % 100 === 0 ? 0 : 2,
        maximumFractionDigits: 2,
      },
    ).format(n / 100);
  let catalog;
  let memoryBag = [];
  let pendingKey;
  const name = (p) =>
    p?.name?.[document.documentElement.lang] ||
    p?.name?.en ||
    tr("Unavailable product");
  const read = () => {
    try {
      const v = JSON.parse(localStorage.getItem("ug-bag") || "[]");
      return Array.isArray(v)
        ? v
            .filter(
              (x) =>
                x &&
                typeof x === "object" &&
                typeof x.productId === "string" &&
                typeof x.variantId === "string" &&
                Number.isInteger(x.quantity) &&
                x.quantity > 0 &&
                x.quantity <= 20,
            )
            .slice(0, 30)
        : [];
    } catch {
      return memoryBag;
    }
  };
  const write = (items) => {
    memoryBag = items;
    try {
      localStorage.setItem("ug-bag", JSON.stringify(items));
    } catch {
      toast(
        "Enable browser storage to keep your bag when moving between pages.",
      );
    }
    document
      .querySelectorAll("[data-bag-count]")
      .forEach(
        (el) =>
          (el.textContent = String(items.reduce((n, x) => n + x.quantity, 0))),
      );
  };
  function toast(s) {
    const el = $("#toast");
    el.textContent = s;
    el.classList.add("visible");
    setTimeout(() => el.classList.remove("visible"), 3500);
  }
  async function load() {
    if (!catalog) {
      const r = await fetch("/api/catalog");
      if (!r.ok) throw new Error("Could not load the catalog. Please refresh.");
      const data = await r.json();
      catalog = data.products;
      storeCurrency = data.currency || "LKR";
      deliveryRules = data.deliveryRules || [];
      orderingEnabled = data.orderingEnabled;
    }
    return catalog;
  }
  function resolve(items) {
    return items.map((line) => {
      const p = catalog.find((p) => p.id === line.productId),
        v = p?.variants.find((v) => v.id === line.variantId);
      return {
        ...line,
        p,
        v,
        available:
          !!p &&
          !!v &&
          p.currency === storeCurrency &&
          v.available &&
          (v.stock === null || v.stock >= line.quantity) &&
          (!$("#checkout-form") ||
            p.countries.includes($("#checkout-form").elements.country.value)),
      };
    });
  }
  async function render() {
    await load();
    const lines = resolve(read());
    const total = lines.reduce(
      (n, x) =>
        n + (x.p ? (x.v?.price ?? x.p.salePrice ?? x.p.price) * x.quantity : 0),
      0,
    );
    const body = lines
      .map(
        (x, i) =>
          `<div class="bag-item">${x.p?.images[0] ? `<img src="${esc(x.p.images[0])}" alt="${esc(name(x.p))}" width="110" height="140">` : ""}<div><h3>${esc(name(x.p))}</h3><p>${esc([x.v?.size, x.v?.color].filter(Boolean).join(" / ") || tr("Details to be confirmed"))}</p>${!x.available ? `<p class="form-error">${esc(tr("No longer available"))}</p>` : ""}<label>${esc(tr("Quantity"))} <input type="number" data-quantity="${i}" min="1" max="20" value="${x.quantity}" aria-label="${esc(tr("Quantity"))}: ${esc(name(x.p))}"></label><button class="text-button" data-remove="${i}">${esc(tr("Remove"))}</button></div><strong>${x.p ? money((x.v?.price ?? x.p.salePrice ?? x.p.price) * x.quantity) : "—"}</strong></div>`,
      )
      .join("");
    if ($("#bag-content"))
      $("#bag-content").innerHTML = lines.length
        ? `<div class="bag-layout"><div>${body}</div><aside class="order-summary"><h2>${esc(tr("Your selection"))}</h2><div class="receipt-total"><span>${esc(tr("Subtotal"))}</span><strong>${money(total)}</strong></div><p dir="auto">${esc($("#bag-content")?.dataset.deliveryNote || tr("Delivery arrangements will be confirmed with you."))}</p>${orderingEnabled && lines.every((x) => x.available) ? `<a class="button wide" href="/checkout">${esc(tr("Continue to checkout"))} ↗</a>` : `<p class="notice">${esc(tr(orderingEnabled ? "Remove unavailable items to continue." : "Ordering is not open yet. You can explore the collection and save pieces in your bag."))}</p>`}<a class="underlink" href="/fashion/shop">${esc(tr("Continue exploring"))}</a></aside></div>`
        : `<div class="empty-state"><h2>${esc(tr("Your selection"))}</h2><p>${esc(tr("Your bag is currently empty."))}</p><a class="button" href="/fashion/shop">${esc(tr("Explore the collection"))} ↗</a></div>`;
    if ($("#checkout-summary")) {
      const country = $("#checkout-form").elements.country.value,
        region = $("#checkout-form").elements.region.value.trim().toLowerCase();
      const rule = deliveryRules
        .filter(
          (r) =>
            r.enabled &&
            r.country === country &&
            (!r.region || r.region.trim().toLowerCase() === region),
        )
        .sort(
          (a, b) =>
            Number(!!b.region) - Number(!!a.region) || a.priority - b.priority,
        )[0];
      const fee = rule
        ? rule.freeAbove !== null && total >= rule.freeAbove
          ? 0
          : rule.fee
        : 0;

      $("#checkout-summary").innerHTML =
        `<h2>${esc(tr("Your selection"))}</h2>${lines.map((x) => `<div class="receipt-item"><span>${esc(name(x.p))}<small>${esc([x.v?.size, x.v?.color].filter(Boolean).join(" / "))} · ${esc(tr("Quantity"))} ${x.quantity}</small></span><strong>${x.p ? money((x.v?.price ?? x.p.salePrice ?? x.p.price) * x.quantity) : "—"}</strong></div>`).join("")}<div class="receipt-total"><span>${esc(tr("Subtotal"))}</span><strong>${money(total)}</strong></div><p>${esc(tr("Delivery"))}: ${rule ? money(fee) : esc(tr("Delivery arrangements will be confirmed with you."))}</p><div class="receipt-total"><span>${esc(tr("Order total"))}</span><strong>${money(total + fee)}</strong></div><a href="/bag" class="underlink">${esc(tr("Edit bag"))}</a>`;
      const invalid = !lines.length || lines.some((x) => !x.available);
      const form = $("#checkout-form");
      form.querySelector("button").disabled =
        invalid || form.dataset.orderingEnabled !== "true";
      form.querySelector(".form-error").textContent = invalid
        ? tr(
            "Your bag is empty or contains unavailable items. Return to your bag to update it.",
          )
        : "";
    }
  }
  document.querySelectorAll("[data-step]").forEach((button) =>
    button.addEventListener("click", () => {
      const input = button.parentElement.querySelector("input");
      input.value = String(
        Math.max(
          1,
          Math.min(20, Number(input.value) + Number(button.dataset.step)),
        ),
      );
      input.dispatchEvent(new Event("change", { bubbles: true }));
    }),
  );
  $(".filter-toggle")?.addEventListener("click", (e) => {
    const form = $("#catalog-filters"),
      marker = document.createComment("filters"),
      dialog = document.createElement("dialog");
    dialog.className = "filter-sheet";
    dialog.setAttribute("aria-label", tr("Filters & sort"));
    const close = document.createElement("button");
    close.type = "button";
    close.className = "text-button";
    close.textContent = tr("Close");
    close.onclick = () => dialog.close();
    form.before(marker);
    dialog.append(close, form);
    form.classList.add("is-open");
    document.body.append(dialog);
    e.currentTarget.setAttribute("aria-expanded", "true");
    dialog.showModal();
    dialog.addEventListener("close", () => {
      marker.replaceWith(form);
      form.classList.remove("is-open");
      dialog.remove();
      $(".filter-toggle").setAttribute("aria-expanded", "false");
      $(".filter-toggle").focus();
    });
  });
  $("#add-to-bag")?.addEventListener("change", async (e) => {
    if (e.target.name !== "variant") return;
    await load();
    const p = catalog.find((p) => p.id === $("#add-to-bag").dataset.product),
      v = p?.variants.find((v) => v.id === e.target.value);
    if (p && v && $("[data-product-price]"))
      $("[data-product-price]").textContent = money(
        v.price ?? p.salePrice ?? p.price,
        p.currency,
      );
  });
  $("#checkout-form")?.elements.region?.addEventListener("change", () =>
    render().catch((e) => toast(e.message)),
  );
  write(read());
  $(".language select")?.addEventListener("change", (e) =>
    e.target.form.requestSubmit(),
  );
  $("#add-to-bag")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const f = e.currentTarget;
    try {
      await load();
      const productId = f.dataset.product,
        variantId = f.elements.variant.value,
        quantity = Number(f.elements.quantity.value);
      const p = catalog.find((p) => p.id === productId),
        v = p?.variants.find((v) => v.id === variantId);
      if (!v || !v.available || v.stock === 0)
        throw new Error(tr("This option is unavailable."));
      const items = read();
      const existing = items.find(
        (x) => x.productId === productId && x.variantId === variantId,
      );
      const combined = quantity + (existing?.quantity || 0);
      if (
        !Number.isInteger(combined) ||
        combined < 1 ||
        combined > 20 ||
        (v.stock !== null && combined > v.stock)
      )
        throw new Error(tr("This quantity is not available."));
      if (!existing && items.length >= 30)
        throw new Error("Your bag can contain up to 30 different options.");
      if (existing) existing.quantity = combined;
      else items.push({ productId, variantId, quantity });
      write(items);
      toast(tr("Added to your bag."));
    } catch (e) {
      toast(e.message);
    }
  });
  document.addEventListener("click", (e) => {
    const el = e.target.closest("[data-remove]");
    if (el) {
      const items = read();
      items.splice(Number(el.dataset.remove), 1);
      write(items);
      render().catch((e) => toast(e.message));
    }
  });
  document.addEventListener("change", (e) => {
    if (e.target.matches("[data-quantity]")) {
      const n = Number(e.target.value);
      if (!Number.isInteger(n) || n < 1 || n > 20) {
        toast(tr("Choose a quantity between 1 and 20."));
        render().catch((error) => toast(error.message));
        return;
      }
      const items = read();
      const item = items[Number(e.target.dataset.quantity)];
      if (!item) return;
      item.quantity = n;
      write(items);
      render().catch((e) => toast(e.message));
    }
  });
  $("#checkout-form [name=country]")?.addEventListener("change", () =>
    render().catch((error) => toast(error.message)),
  );
  if ($("#bag-content") || $("#checkout-summary"))
    render().catch((e) => toast(e.message));
  $("#checkout-form")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const f = e.currentTarget,
      button = f.querySelector("button"),
      error = f.querySelector(".form-error");
    button.disabled = true;
    error.textContent = "";
    try {
      let key = pendingKey;
      try {
        key = sessionStorage.getItem("ug-order-key") || key;
      } catch {}
      if (!key) {
        key = crypto.randomUUID();
        pendingKey = key;
        try {
          sessionStorage.setItem("ug-order-key", key);
        } catch {}
      }
      const customer = Object.fromEntries(new FormData(f));
      const website = customer.website;
      const turnstileToken = customer["cf-turnstile-response"];
      delete customer["cf-turnstile-response"];
      delete customer.website;
      const r = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          key,
          items: read(),
          customer,
          website,
          turnstileToken,
        }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || "Could not place your order.");
      write([]);
      pendingKey = undefined;
      try {
        sessionStorage.removeItem("ug-order-key");
      } catch {}
      location.assign(data.url);
    } catch (e) {
      error.textContent = e.message;
      button.disabled = false;
      if (window.turnstile) window.turnstile.reset();
    }
  });
  window.addEventListener("storage", (e) => {
    if (e.key === "ug-bag") {
      write(read());
      if ($("#bag-content") || $("#checkout-summary"))
        render().catch((error) => toast(error.message));
    }
  });
})();

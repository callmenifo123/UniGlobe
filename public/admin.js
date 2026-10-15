(() => {
  "use strict";
  const $ = (s) => document.querySelector(s);
  const csrf = $("meta[name=csrf-token]")?.content || "";
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
  async function request(url, method = "POST", body) {
    const r = await fetch(url, {
      method,
      headers: {
        "X-CSRF-Token": csrf,
        ...(body instanceof FormData
          ? {}
          : { "Content-Type": "application/json" }),
      },
      body:
        body === undefined
          ? undefined
          : body instanceof FormData
            ? body
            : JSON.stringify(body),
    });
    let d;
    try {
      d = await r.json();
    } catch {
      throw new Error("Unexpected response. Refresh and try again.");
    }
    if (!r.ok) throw new Error(d.error || "Request failed");
    return d;
  }
  async function showCredentials(result) {
    if (!result.recoveryCodes && !result.temporaryPassword) return;
    const dialog = document.createElement("dialog");
    dialog.className = "credential-dialog";
    const values = result.recoveryCodes || [result.temporaryPassword];
    dialog.innerHTML = `<h2>${result.recoveryCodes ? "Save your recovery codes" : "Temporary password"}</h2><p>${result.recoveryCodes ? "Each code can be used once instead of an authenticator code at login. Store these privately; they are shown only now." : "Share this securely with the admin. It expires in seven days and must be changed before workspace access."}</p><pre>${values.map(esc).join("\n")}</pre><button class="button">I have saved these securely</button>`;
    document.body.append(dialog);
    dialog.showModal();
    await new Promise((resolve) => {
      dialog.querySelector("button").onclick = () => {
        dialog.close();
        resolve();
      };
      dialog.addEventListener("cancel", (e) => e.preventDefault());
    });
    dialog.remove();
  }
  function collect(f) {
    const d = {};
    for (const [k, v] of new FormData(f)) {
      if (k.includes(".")) {
        const [parent, child] = k.split(".");
        if (["variant", "social"].includes(parent)) continue;
        (d[parent] ??= {})[child] = v;
      } else d[k] = v;
    }
    f.querySelectorAll("input[type=checkbox]").forEach((el) => {
      if (!["countries", "permissions", "variant.available"].includes(el.name))
        d[el.name] = el.checked;
    });
    if ("version" in d) d.version = Number(d.version);
    if ("inventoryRevision" in d)
      d.inventoryRevision = Number(d.inventoryRevision);
    if ("priority" in d) d.priority = Number(d.priority);
    return d;
  }
  $("#auth-form")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const f = e.currentTarget;
    const b = f.querySelector("button");
    b.disabled = true;
    try {
      const result = await request(
        "/api/auth/" + f.dataset.mode,
        "POST",
        Object.fromEntries(new FormData(f)),
      );
      await showCredentials(result);
      location.assign(result.redirect || "/admin");
    } catch (e) {
      f.querySelector(".form-error").textContent = e.message;
      b.disabled = false;
    }
  });
  document.querySelectorAll(".admin-editor").forEach((f) =>
    f.addEventListener("submit", async (e) => {
      e.preventDefault();
      const button = f.querySelector("button:not([type=button])");
      if (button) button.disabled = true;
      const error = f.querySelector(".form-error");
      error.textContent = "";
      try {
        let d = collect(f);
        if (f.hasAttribute("data-permissions-form"))
          d.permissions = new FormData(f).getAll("permissions");
        if (f.hasAttribute("data-product-form")) {
          d.price = Math.round(Number(d.price) * 100);
          d.salePrice =
            d.salePrice === "" ? null : Math.round(Number(d.salePrice) * 100);
          d.currency = "LKR";
          d.countries = new FormData(f).getAll("countries");
          d.images = new FormData(f).getAll("images").filter(Boolean);
          d.variants = [...f.querySelectorAll(".variant-row")].map((row) => ({
            id: row.querySelector('[name="variant.id"]').value,
            size: row.querySelector('[name="variant.size"]').value,
            color: row.querySelector('[name="variant.color"]').value,
            sku: row.querySelector('[name="variant.sku"]').value,
            stock:
              row.querySelector('[name="variant.stock"]').value === ""
                ? null
                : Number(row.querySelector('[name="variant.stock"]').value),
            available: row.querySelector('[name="variant.available"]').checked,
          }));
        }
        if (f.querySelector("#social-fields"))
          d.socials = [...f.querySelectorAll(".social-entry")].map((r) => ({
            label: r.querySelector('[name="social.label"]').value,
            url: r.querySelector('[name="social.url"]').value,
          }));
        if (f.dataset.recordKind === "ordering") {
          for (const k of ["emailRecipients", "telegramChats", "statuses"])
            d[k] = d[k]
              .split(",")
              .map((v) => v.trim())
              .filter(Boolean);
          d.countries = new FormData(f).getAll("countries");
        }
        const result = await request(f.dataset.api, f.dataset.method, d);
        await showCredentials(result);
        if (result.version && f.elements.version)
          f.elements.version.value = result.version;
        const status = f.querySelector(".save-status");
        if (status) status.textContent = "Saved successfully";
        if (result.redirect) location.assign(result.redirect);
        else if (result.reload) setTimeout(() => location.reload(), 500);
      } catch (e) {
        error.textContent = e.message;
      } finally {
        if (button) button.disabled = false;
      }
    }),
  );
  document.addEventListener("click", async (e) => {
    const row = e.target.closest("[data-remove-row]");
    if (row) {
      row.parentElement.remove();
      return;
    }
    if (e.target.closest("[data-add-image]")) {
      $("#image-fields").insertAdjacentHTML(
        "beforeend",
        '<div class="image-entry"><input name="images" placeholder="/media/…"><button type="button" class="text-button" data-remove-row>Remove</button></div>',
      );
      return;
    }
    if (e.target.closest("[data-add-variant]")) {
      const id = "variant-" + crypto.randomUUID().slice(0, 8);
      $("#variant-fields").insertAdjacentHTML(
        "beforeend",
        `<fieldset class="variant-row"><legend>Variant</legend><label>Stable ID<input name="variant.id" value="${id}" required></label><label>Size<input name="variant.size"></label><label>Color<input name="variant.color"></label><label>SKU<input name="variant.sku"></label><label>Stock<input type="number" min="0" name="variant.stock"></label><label class="check"><input type="checkbox" name="variant.available" checked>Available</label><button type="button" class="text-button" data-remove-row>Remove variant</button></fieldset>`,
      );
      return;
    }
    if (e.target.closest("[data-add-social]")) {
      $("#social-fields").insertAdjacentHTML(
        "beforeend",
        '<div class="social-entry"><label>Channel<input name="social.label" required></label><label>HTTPS link<input name="social.url" type="url" required></label><button type="button" data-remove-row>Remove</button></div>',
      );
      return;
    }
    const action = e.target.closest("[data-action],[data-delete]");
    if (action) {
      if (action.dataset.confirm && !confirm(action.dataset.confirm)) return;
      action.disabled = true;
      try {
        const result = await request(
          action.dataset.action || action.dataset.delete,
          action.dataset.delete ? "DELETE" : "POST",
        );
        if (result.redirect) location.assign(result.redirect);
        else location.reload();
      } catch (e) {
        alert(e.message);
        action.disabled = false;
      }
    }
  });
  // The same picker works for catalog galleries, page imagery and branding.
  let imageTarget;
  const picker = document.createElement("dialog");
  picker.className = "media-picker";
  picker.setAttribute("aria-labelledby", "media-picker-title");
  picker.innerHTML =
    '<div class="section-top"><h2 id="media-picker-title">Choose an image</h2><button type="button" class="text-button" data-close-picker>Close</button></div><p class="muted">Select an uploaded image or an optimized supplied asset.</p><div class="form-error" role="alert"></div><div class="media-grid"></div><button type="button" class="button secondary-button" data-more-media hidden>Load more</button>';
  document.body.append(picker);
  let nextMediaPage = 1;
  async function loadMedia() {
    const more = picker.querySelector("[data-more-media]");
    more.disabled = true;
    try {
      const result = await request(
        "/api/admin/media?page=" + nextMediaPage,
        "GET",
      );
      picker
        .querySelector(".media-grid")
        .insertAdjacentHTML(
          "beforeend",
          result.items
            .map(
              (m) =>
                `<button type="button" class="media-choice" data-image-path="${esc(m.path)}"><img src="${esc(m.path)}" alt="" loading="lazy"><span>${esc(m.name)}</span></button>`,
            )
            .join(""),
        );
      nextMediaPage = result.nextPage;
      more.hidden = !nextMediaPage;
    } catch (error) {
      picker.querySelector(".form-error").textContent = error.message;
    } finally {
      more.disabled = false;
    }
  }
  picker
    .querySelector("[data-close-picker]")
    .addEventListener("click", () => picker.close());
  picker
    .querySelector("[data-more-media]")
    .addEventListener("click", loadMedia);
  picker.addEventListener("click", (event) => {
    const choice = event.target.closest("[data-image-path]");
    if (choice && imageTarget) {
      imageTarget.value = choice.dataset.imagePath;
      imageTarget.dispatchEvent(new Event("change", { bubbles: true }));
      picker.close();
      imageTarget.focus();
    }
  });
  const imageInputs =
    'input[name="images"], input[name="image"], input[name="logo"], input[name="holdingsLogo"], input[name="fashionLogo"], input[name="favicon"], input[name="heroImage"]';
  function addImagePickers() {
    document.querySelectorAll(imageInputs).forEach((input) => {
      if (input.dataset.pickerReady) return;
      input.dataset.pickerReady = "true";
      if (!input.getAttribute("aria-label") && input.name === "images")
        input.setAttribute("aria-label", "Gallery image path");
      const button = document.createElement("button");
      button.type = "button";
      button.className = "text-button image-browse";
      button.textContent = "Choose image";
      input.insertAdjacentElement("afterend", button);
      button.addEventListener("click", () => {
        imageTarget = input;
        nextMediaPage = 1;
        picker.querySelector(".media-grid").replaceChildren();
        picker.querySelector(".form-error").textContent = "";
        picker.showModal();
        loadMedia();
      });
    });
  }
  addImagePickers();
  if ($("#image-fields"))
    new MutationObserver(addImagePickers).observe($("#image-fields"), {
      childList: true,
      subtree: true,
    });
  $("#media-upload")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const f = e.currentTarget,
      b = f.querySelector("button");
    b.disabled = true;
    try {
      const original = f.elements.file.files[0];
      if (!original || original.size > 8 * 1024 * 1024)
        throw new Error("Choose an image up to 8 MB.");
      const bitmap = await createImageBitmap(original);
      if (bitmap.width * bitmap.height > 40000000) {
        bitmap.close();
        throw new Error("Image exceeds the 40 megapixel limit.");
      }
      const ratio = Math.min(1, 2400 / Math.max(bitmap.width, bitmap.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(bitmap.width * ratio);
      canvas.height = Math.round(bitmap.height * ratio);
      canvas
        .getContext("2d")
        .drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      bitmap.close();
      const blob = await new Promise((resolve) =>
        canvas.toBlob(resolve, "image/webp", 0.88),
      );
      if (!blob) throw new Error("Could not optimize this image.");
      const upload = new FormData();
      upload.set("file", blob, original.name.replace(/\.[^.]+$/, "") + ".webp");
      await request("/api/admin/media", "POST", upload);
      location.reload();
    } catch (e) {
      f.querySelector(".form-error").textContent = e.message;
      b.disabled = false;
    }
  });
  for (const stage of ["start", "confirm"])
    $("#totp-" + stage)?.addEventListener("submit", async (e) => {
      e.preventDefault();
      const f = e.currentTarget,
        b = f.querySelector("button");
      b.disabled = true;
      try {
        const result = await request(
          "/api/admin/totp/" + stage,
          "POST",
          Object.fromEntries(new FormData(f)),
        );
        if (stage === "start") {
          $("#new-totp").textContent = result.secret;
          if ($("#new-totp-qr")) $("#new-totp-qr").innerHTML = result.qr;
          $("#totp-confirm").hidden = false;
          f.hidden = true;
        } else {
          await showCredentials(result);
          location.assign(result.redirect || "/admin/security");
        }
      } catch (e) {
        f.querySelector(".form-error").textContent = e.message;
      } finally {
        b.disabled = false;
      }
    });
  $("#create-admin")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const f = e.currentTarget,
      b = f.querySelector("button");
    b.disabled = true;
    try {
      const d = collect(f);
      d.permissions = new FormData(f).getAll("permissions");
      const r = await request("/api/admin/users", "POST", d);
      await showCredentials(r);
      $("#admin-created").textContent =
        "Admin created. They can now sign in with their temporary password.";
      f.reset();
    } catch (e) {
      f.querySelector(".form-error").textContent = e.message;
    } finally {
      b.disabled = false;
    }
  });
})();

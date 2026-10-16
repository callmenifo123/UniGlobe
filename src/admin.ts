import {
  taxonomySchema,
  badgeSchema,
  sectionSchema,
  deliverySchema,
  entries,
  member,
} from "./commerce";
import { commercePage } from "./commerce-ui";
import { identity, identityUsers, identitySecurity } from "./identity";
import { Hono } from "hono";
import { emailConfigured } from "./email";
import { suppliedMedia } from "./media";
import { HTTPException } from "hono/http-exception";
import { imageSize } from "image-size";
import { getCookie, setCookie, deleteCookie } from "hono/cookie";
import { html } from "hono/html";
import { z } from "zod";
import {
  type Env,
  productSchema,
  permissions,
  products,
  record,
  audit,
  localized,
  imagePath,
  L,
} from "./model";
import {
  hash,
  random,
  passwordHash,
  passwordValid,
  encrypt,
  decrypt,
  verifyTotp,
  newTotp,
  rate,
  session,
  equal,
} from "./security";
import { shell, adminLayout, authPage, field } from "./ui";
import {
  localizedFields,
  productTable,
  productForm,
  recordForm,
  taxonomyPage,
  ordersPage,
  orderPage,
  usersPage,
} from "./admin-ui";
type App = { Bindings: Env; Variables: { user: any } };
export const admin = new Hono<App>();
const cookieName = (c: any) =>
  new URL(c.req.url).protocol === "https:" ? "__Host-ug_admin" : "ug_admin";
const allow = (u: any, p: string) =>
  !!u && (u.is_main || JSON.parse(u.permissions).includes(p));
const required = (p: string) => async (c: any, next: any) => {
  if (!allow(c.get("user"), p))
    return c.json({ error: "Permission denied" }, 403);
  await next();
};
const authBody = z.object({
  username: z.string().trim().min(3).max(120),
  password: z.string().min(12).max(128),
  code: z.string().regex(/^\d{6}$/),
});
async function makeSession(c: any, u: any) {
  const token = random();
  const now = Date.now();
  await c.env.DB.prepare(
    "INSERT INTO sessions(token_hash,admin_id,csrf,expires_at,created_at,user_agent) VALUES(?,?,?,?,?,?)",
  )
    .bind(
      await hash(token),
      u.id,
      random(),
      now + 8 * 3600000,
      now,
      (c.req.header("User-Agent") || "").slice(0, 200),
    )
    .run();
  setCookie(c, cookieName(c), token, {
    httpOnly: true,
    secure: new URL(c.req.url).protocol === "https:",
    sameSite: "Strict",
    path: "/",
    maxAge: 8 * 3600,
  });
}
admin.use("*", async (c, next) => {
  if (
    !c.req.path.startsWith("/admin") &&
    !c.req.path.startsWith("/api/admin") &&
    !c.req.path.startsWith("/api/auth")
  )
    return next();
  c.header("Cache-Control", "no-store");
  c.header("X-Robots-Tag", "noindex, nofollow");
  const host = new URL(c.req.url).hostname;
  const local = ["localhost", "127.0.0.1"].includes(host);
  if (!local && host !== c.env.ADMIN_HOST) return c.notFound();
  if (!["GET", "HEAD", "OPTIONS"].includes(c.req.method)) {
    const origin = c.req.header("Origin");
    if (origin !== new URL(c.req.url).origin)
      return c.json({ error: "Untrusted request origin" }, 403);
  }
  await next();
});
admin.route("/", identity);
async function validateProductAccess(c: any, p: any, old?: any) {
  if (!allow(c.get("user"), "inventory.manage")) {
    const stocks = (v: any[]) =>
      JSON.stringify(v.map((x) => [x.id, x.stock]).sort());
    if (
      old
        ? stocks(p.variants) !== stocks(old.variants)
        : p.variants.some((v: any) => v.stock !== null)
    )
      throw new HTTPException(403, {
        message: "Inventory-management permission required",
      });
  }
  if (
    !allow(c.get("user"), "merchandising.manage") &&
    JSON.stringify(p.badges) !== JSON.stringify(old?.badges || [])
  )
    throw new HTTPException(403, {
      message: "Merchandising permission required",
    });
  for (const [kind, ids] of [
    ["categories", [p.category].filter(Boolean)],
    [
      "collections",
      [...new Set([p.collection, ...p.collections].filter(Boolean))],
    ],
    ["badges", p.badges.map((b: any) => b.id)],
  ] as [string, string[]][]) {
    const rows = await entries(c.env.DB, kind);
    if (ids.some((id) => !rows.some((r) => r.id === id)))
      throw new HTTPException(400, {
        message: "Select existing " + kind + " before saving",
      });
  }
}
admin.post("/api/admin/products", required("products.write"), async (c) => {
  const p = productSchema.parse(await c.req.json());
  const id = crypto.randomUUID();
  await validateProductAccess(c, p);
  await saveProduct(c.env, id, p, null);
  await audit(c.env.DB, c.get("user").id, "product.created", id);
  return c.json({ ok: true, redirect: "/admin/products/" + id });
});
async function saveProduct(
  env: Env,
  id: string,
  p: z.infer<typeof productSchema>,
  version: number | null,
  inventoryRevision?: number,
) {
  const stmts: D1PreparedStatement[] = [];
  if (version !== null) {
    const row = await env.DB.prepare(
      "SELECT version,inventory_revision FROM products WHERE id=?",
    )
      .bind(id)
      .first<any>();
    if (
      !row ||
      row.version !== version ||
      row.inventory_revision !== inventoryRevision
    )
      throw new HTTPException(409, {
        message: "This product or its stock changed. Reload before saving.",
      });
    stmts.push(
      env.DB.prepare(
        "INSERT INTO inventory(product_id,variant_id,quantity) SELECT ?,?, -1 WHERE NOT EXISTS(SELECT 1 FROM products WHERE id=? AND version=? AND inventory_revision=?)",
      ).bind(id, "guard-" + random(8), id, version, inventoryRevision),
    );
    stmts.push(
      env.DB.prepare(
        "UPDATE products SET data=?,slug=?,version=version+1,updated_at=CURRENT_TIMESTAMP WHERE id=? AND version=?",
      ).bind(JSON.stringify(p), p.slug, id, version),
    );
  } else
    stmts.push(
      env.DB.prepare("INSERT INTO products(id,slug,data) VALUES(?,?,?)").bind(
        id,
        p.slug,
        JSON.stringify(p),
      ),
    );
  stmts.push(
    env.DB.prepare("DELETE FROM inventory WHERE product_id=?").bind(id),
  );
  for (const v of p.variants)
    stmts.push(
      env.DB.prepare(
        "INSERT INTO inventory(product_id,variant_id,quantity) VALUES(?,?,?) ON CONFLICT(product_id,variant_id) DO UPDATE SET quantity=excluded.quantity",
      ).bind(id, v.id, v.stock),
    );
  await env.DB.batch(stmts);
}
admin.put("/api/admin/products/:id", required("products.write"), async (c) => {
  const d = await c.req.json();
  const p = productSchema.parse(d);
  const old = (await products(c.env.DB, true)).find(
    (p) => p.id === c.req.param("id"),
  );
  if (
    !old ||
    old.version !== d.version ||
    old.inventoryRevision !== d.inventoryRevision
  )
    return c.json(
      { error: "This product or its stock changed. Reload before saving." },
      409,
    );
  await validateProductAccess(c, p, old);
  await saveProduct(
    c.env,
    c.req.param("id"),
    p,
    z.number().int().min(1).parse(d.version),
    z.number().int().min(1).parse(d.inventoryRevision),
  );
  if (old.price !== p.price || old.salePrice !== p.salePrice)
    await audit(
      c.env.DB,
      c.get("user").id,
      "product.price_changed",
      old.id,
      JSON.stringify({
        from: { price: old.price, salePrice: old.salePrice },
        to: { price: p.price, salePrice: p.salePrice },
      }),
    );
  await audit(
    c.env.DB,
    c.get("user").id,
    "product.updated",
    c.req.param("id"),
    "Catalog, pricing or inventory updated",
  );
  return c.json({ ok: true, reload: true });
});
admin.post(
  "/api/admin/products/:id/duplicate",
  required("products.write"),
  async (c) => {
    const p = (await products(c.env.DB, true)).find(
      (p) => p.id === c.req.param("id"),
    );
    if (!p) return c.notFound();
    const id = crypto.randomUUID();
    const copy = productSchema.parse({
      ...p,
      slug: p.slug + "-copy-" + random(3),
      name: { ...p.name, en: p.name.en + " (copy)" },
      visible: false,
    });
    await validateProductAccess(c, copy);
    await saveProduct(c.env, id, copy, null);
    await audit(c.env.DB, c.get("user").id, "product.duplicated", id);
    return c.json({ ok: true, redirect: "/admin/products/" + id });
  },
);
admin.delete(
  "/api/admin/products/:id",
  required("products.delete"),
  async (c) => {
    const id = c.req.param("id");
    const used = await c.env.DB.prepare(
      "SELECT id FROM orders WHERE EXISTS(SELECT 1 FROM json_each(orders.items) WHERE json_extract(value,'$.productId')=?) LIMIT 1",
    )
      .bind(id)
      .first();
    if (used)
      return c.json(
        { error: "This product appears in orders. Archive it instead." },
        409,
      );
    await c.env.DB.batch([
      c.env.DB.prepare("DELETE FROM inventory WHERE product_id=?").bind(id),
      c.env.DB.prepare("DELETE FROM products WHERE id=?").bind(id),
    ]);
    await audit(c.env.DB, c.get("user").id, "product.deleted", id);
    return c.json({ ok: true });
  },
);
const recordPermission: Record<string, string> = {
  content: "content.write",
  translations: "translations.write",
  branding: "branding.write",
  contacts: "contacts.write",
  ordering: "settings.write",
  categories: "categories.manage",
  collections: "collections.manage",
  badges: "merchandising.manage",
  sections: "merchandising.manage",
  delivery: "delivery.manage",
};
const safeLink = z
  .string()
  .url()
  .max(1000)
  .refine((x) => new URL(x).protocol === "https:", "Use an HTTPS URL");
const optImage = z.union([imagePath, z.literal("")]);
const schemas: Record<string, z.ZodType> = {
  content: z
    .object({
      eyebrow: localized,
      title: localized,
      intro: localized,
      body: localized,
      cta: localized,
      image: optImage,
      seoTitle: localized,
      seoDescription: localized,
      comingSoon: z.boolean().optional(),
      ctaHref: z
        .string()
        .max(1000)
        .refine((x) => /^\/(?!\/)/.test(x) || /^https:\/\//.test(x))
        .optional(),
      contactEmail: z.union([z.string().email(), z.literal("")]).optional(),
      contactPhone: z.string().max(30).optional(),
      logo: optImage.optional(),
      socials: z
        .array(z.object({ label: z.string().max(50), url: safeLink }))
        .max(20)
        .optional(),
    })
    .catchall(localized),
  branding: z.object({
    companyName: z.string().min(1).max(100),
    fashionName: z.string().min(1).max(100),
    holdingsLogo: optImage,
    fashionLogo: optImage,
    favicon: optImage,
    heroImage: optImage,
  }),
  contacts: z.object({
    email: z.union([z.string().email(), z.literal("")]),
    supportEmail: z.union([z.string().email(), z.literal("")]).default(""),
    sriLankaContact: z.string().max(500).default(""),
    saudiContact: z.string().max(500).default(""),
    phone: z.string().max(30),
    whatsapp: z
      .string()
      .regex(/^[+\d ()-]*$/)
      .max(30),
    address: z.string().max(500),
    hours: z.string().max(200),
    socials: z
      .array(z.object({ label: z.string().min(1).max(50), url: safeLink }))
      .max(20),
  }),
  ordering: z.object({
    currency: z.enum(["LKR", "SAR", "USD"]).default("LKR"),
    customerEmailEnabled: z.boolean().default(true),
    checkoutIntro: localized.default(L("")),
    turnstileEnabled: z.boolean().default(false),
    enabled: z.boolean(),
    emailEnabled: z.boolean(),
    emailRecipients: z.array(z.string().email()).max(10),
    emailSender: z.union([z.string().email(), z.literal("")]),
    telegramEnabled: z.boolean(),
    telegramChats: z
      .array(z.string().regex(/^-?\d+$|^@[a-zA-Z0-9_]+$/))
      .max(10),
    whatsappEnabled: z.boolean(),
    whatsappNumber: z
      .string()
      .regex(/^\+?\d*$/)
      .max(20),
    countries: z.array(z.enum(["LK", "SA"])).min(1),
    deliveryNote: localized,
    confirmation: localized,
    emailSubject: z
      .string()
      .min(1)
      .max(200)
      .refine((x) => !/[\r\n]/.test(x), "Subject must be one line")
      .default("Order received · {orderNumber}"),
    emailTemplate: z
      .string()
      .min(1)
      .max(6000)
      .refine(
        (x) => x.includes("{orderDetails}"),
        "Include {orderDetails} so the receipt contains the full order",
      )
      .default("{orderDetails}"),
    telegramTemplate: z
      .string()
      .min(1)
      .max(6000)
      .refine((x) => x.includes("{orderDetails}"), "Include {orderDetails}")
      .default("{orderDetails}"),
    statuses: z
      .array(z.string().min(1).max(40))
      .min(2)
      .max(20)
      .refine(
        (x) =>
          x.includes("New") &&
          x.includes("Cancelled") &&
          new Set(x).size === x.length,
      ),
  }),
  categories: taxonomySchema,
  collections: taxonomySchema,
  badges: badgeSchema,
  sections: sectionSchema,
  delivery: deliverySchema,
};
admin.put("/api/admin/records/:kind/:id", async (c) => {
  const { kind } = c.req.param();
  if (
    !schemas[kind] ||
    (!allow(c.get("user"), recordPermission[kind]) &&
      !(kind === "ordering" && allow(c.get("user"), "notifications.manage")) &&
      !(kind === "content" && allow(c.get("user"), "translations.write")))
  )
    return c.json({ error: "Permission denied" }, 403);
  const body = await c.req.json();
  const id =
    c.req.param("id") === "new"
      ? z
          .string()
          .regex(/^[a-z0-9-]{1,80}$/)
          .parse(body.id)
      : c.req.param("id");
  const { version: submittedVersion, ...recordData } = body;
  const existing = await record(c.env.DB, kind, id);
  const previous = existing
    ? Object.fromEntries(
        Object.entries(existing).filter(([k]) => k !== "version"),
      )
    : {};
  const data = schemas[kind].parse(
    kind === "content" && id === "fashion"
      ? { ...previous, ...recordData }
      : recordData,
  ) as any;
  if (kind === "ordering") {
    if (
      data.turnstileEnabled &&
      (!c.env.TURNSTILE_SITE_KEY || !c.env.TURNSTILE_SECRET_KEY)
    )
      return c.json(
        {
          error:
            "Configure the free Turnstile site key and server secret first",
        },
        400,
      );
    if (data.emailEnabled && (!emailConfigured(c.env) || !data.emailSender))
      return c.json(
        {
          error:
            "Configure the email transport server secrets and sender first",
        },
        400,
      );
    if (
      data.telegramEnabled &&
      (!c.env.TELEGRAM_BOT_TOKEN || !data.telegramChats.length)
    )
      return c.json(
        {
          error: "Configure TELEGRAM_BOT_TOKEN and at least one Chat ID first",
        },
        400,
      );
    if (
      data.whatsappEnabled &&
      !/^\d{7,15}$/.test(data.whatsappNumber.replace(/^\+/, ""))
    )
      return c.json(
        { error: "A valid international WhatsApp number is required" },
        400,
      );
  }
  if (["categories", "collections"].includes(kind)) {
    data.slug ||= id;
    if (
      (await entries(c.env.DB, kind)).some(
        (x) => x.id !== id && (x.slug || x.id) === data.slug,
      )
    )
      return c.json({ error: "This URL slug is already used" }, 409);
  }
  if (
    kind === "ordering" &&
    existing &&
    !allow(c.get("user"), "notifications.manage")
  ) {
    for (const key of [
      "emailEnabled",
      "emailRecipients",
      "emailSender",
      "customerEmailEnabled",
      "telegramEnabled",
      "telegramChats",
      "emailSubject",
      "emailTemplate",
      "telegramTemplate",
    ]) {
      if (
        JSON.stringify(data[key]) !==
        JSON.stringify(
          existing[key] ?? (key === "customerEmailEnabled" ? true : undefined),
        )
      )
        return c.json(
          { error: "Notification-management permission required" },
          403,
        );
    }
  }
  if (
    kind === "ordering" &&
    existing &&
    !allow(c.get("user"), "settings.write")
  ) {
    const notificationKeys = [
      "emailEnabled",
      "emailRecipients",
      "emailSender",
      "customerEmailEnabled",
      "telegramEnabled",
      "telegramChats",
      "emailSubject",
      "emailTemplate",
      "telegramTemplate",
    ];
    for (const key of Object.keys(data))
      if (
        !notificationKeys.includes(key) &&
        JSON.stringify(data[key]) !== JSON.stringify(existing[key])
      )
        return c.json({ error: "Store-settings permission required" }, 403);
  }
  if (kind === "content" && !allow(c.get("user"), "content.write")) {
    if (!existing)
      return c.json({ error: "Translators cannot create pages" }, 403);
    for (const [key, value] of Object.entries(data)) {
      if (
        !(
          value &&
          typeof value === "object" &&
          !Array.isArray(value) &&
          "en" in value
        ) &&
        JSON.stringify(value) !== JSON.stringify(existing[key])
      )
        return c.json(
          {
            error: "Translation permission only allows localized text changes",
          },
          403,
        );
    }
  }
  if (existing) {
    if (body.version !== existing.version)
      return c.json(
        { error: "This content changed. Reload before saving." },
        409,
      );
    const result = await c.env.DB.prepare(
      "UPDATE records SET data=?,version=version+1 WHERE kind=? AND id=? AND version=?",
    )
      .bind(JSON.stringify(data), kind, id, body.version)
      .run();
    if (!result.meta.changes)
      return c.json(
        { error: "This content changed. Reload before saving." },
        409,
      );
  } else
    await c.env.DB.prepare("INSERT INTO records(kind,id,data) VALUES(?,?,?)")
      .bind(kind, id, JSON.stringify(data))
      .run();
  await audit(c.env.DB, c.get("user").id, kind + ".updated", id);
  return c.json({ ok: true, reload: true });
});
admin.delete("/api/admin/records/:kind/:id", async (c) => {
  const { kind, id } = c.req.param();
  if (
    !["categories", "collections", "badges", "sections", "delivery"].includes(
      kind,
    )
  )
    return c.notFound();
  if (!allow(c.get("user"), recordPermission[kind]))
    return c.json({ error: "Permission denied" }, 403);
  const field = kind === "categories" ? "category" : "collection";
  if (
    (await products(c.env.DB, true)).some((p) =>
      kind === "collections"
        ? member(p, id)
        : kind === "categories"
          ? p.category === id
          : kind === "badges"
            ? p.badges.some((b) => b.id === id)
            : false,
    ) ||
    (await entries(c.env.DB, "sections")).some(
      (s) => s.collection === id || (s.taxonomies || []).includes(id),
    )
  )
    return c.json(
      { error: "This entry is used by products. Reassign them first." },
      409,
    );
  await c.env.DB.prepare("DELETE FROM records WHERE kind=? AND id=?")
    .bind(kind, id)
    .run();
  await audit(c.env.DB, c.get("user").id, kind + ".deleted", id);
  return c.json({ ok: true });
});
admin.put("/api/admin/orders/:id", required("orders.write"), async (c) => {
  const d = z
    .object({
      version: z.number().int().min(1),
      status: z.string(),
      notes: z.string().max(5000),
      archived: z.boolean(),
    })
    .parse(await c.req.json());
  const settings = await record(c.env.DB, "ordering");
  if (!settings.statuses.includes(d.status))
    return c.json({ error: "Unknown status" }, 400);
  const old = await c.env.DB.prepare("SELECT * FROM orders WHERE id=?")
    .bind(c.req.param("id"))
    .first<any>();
  if (!old) return c.notFound();
  if (old.version !== d.version)
    return c.json({ error: "This order changed. Reload before saving." }, 409);
  if (
    d.status !== old.status &&
    d.status === "Cancelled" &&
    !allow(c.get("user"), "orders.cancel")
  )
    return c.json({ error: "Cancellation permission required" }, 403);
  if (d.archived !== !!old.archived && !allow(c.get("user"), "orders.archive"))
    return c.json({ error: "Archiving permission required" }, 403);
  const results = await c.env.DB.batch([
    c.env.DB.prepare(
      "INSERT INTO order_history(order_id,actor,status,note) SELECT id,?,?,? FROM orders WHERE id=? AND version=?",
    ).bind(c.get("user").id, d.status, d.notes, c.req.param("id"), d.version),
    c.env.DB.prepare(
      "UPDATE orders SET status=?,notes=?,archived=?,version=version+1 WHERE id=? AND version=?",
    ).bind(d.status, d.notes, d.archived ? 1 : 0, c.req.param("id"), d.version),
  ]);
  const result = results[1];
  if (!result.meta.changes)
    return c.json(
      {
        error: "This order changed or no longer exists. Reload before saving.",
      },
      409,
    );
  await audit(
    c.env.DB,
    c.get("user").id,
    "order.updated",
    c.req.param("id"),
    d.status,
  );
  return c.json({ ok: true, version: d.version + 1 });
});
admin.post(
  "/api/admin/notifications/:id/retry",
  required("orders.write"),
  async (c) => {
    await c.env.DB.prepare(
      "UPDATE outbox SET status='pending',attempts=0,next_attempt=0,lease_until=0 WHERE id=? AND status='failed'",
    )
      .bind(c.req.param("id"))
      .run();
    await audit(
      c.env.DB,
      c.get("user").id,
      "notification.retry",
      c.req.param("id"),
    );
    return c.json({ ok: true });
  },
);
admin.put(
  "/api/admin/translations/:kind/:id",
  required("translations.write"),
  async (c) => {
    const { kind, id } = c.req.param();
    if (
      ![
        "products",
        "categories",
        "collections",
        "sections",
        "badges",
        "content",
      ].includes(kind)
    )
      return c.notFound();
    const original =
      kind === "products"
        ? (await products(c.env.DB, true)).find((p) => p.id === id)
        : await record(c.env.DB, kind, id);
    if (!original) return c.notFound();
    const d = z
      .object({
        version: z.number().int().min(1),
        fields: z.record(z.string(), localized),
      })
      .parse(await c.req.json());
    for (const key of Object.keys(d.fields))
      if (
        !original[key] ||
        typeof original[key] !== "object" ||
        !("en" in original[key])
      )
        return c.json(
          { error: "Only existing translated text can be changed" },
          403,
        );
    if (
      ["products", "categories", "collections", "sections", "badges"].includes(
        kind,
      )
    )
      for (const key of ["name", "title"])
        if (d.fields[key] && !d.fields[key].en.trim())
          return c.json(
            { error: "Keep an English fallback name or title" },
            400,
          );
    const stmt =
      kind === "products"
        ? c.env.DB.prepare(
            "UPDATE products SET data=json_patch(data,?),version=version+1,updated_at=CURRENT_TIMESTAMP WHERE id=? AND version=?",
          ).bind(JSON.stringify(d.fields), id, d.version)
        : c.env.DB.prepare(
            "UPDATE records SET data=json_patch(data,?),version=version+1 WHERE kind=? AND id=? AND version=?",
          ).bind(JSON.stringify(d.fields), kind, id, d.version);
    const result = await stmt.run();
    if (!result.meta.changes)
      return c.json(
        { error: "This content changed. Reload before saving." },
        409,
      );
    await audit(
      c.env.DB,
      c.get("user").id,
      "translations.updated",
      kind + ":" + id,
    );
    return c.json({ ok: true, reload: true });
  },
);
admin.get("/api/admin/media", async (c) => {
  if (
    !["media.write", "products.write", "branding.write", "content.write"].some(
      (p) => allow(c.get("user"), p),
    )
  )
    return c.json({ error: "Permission denied" }, 403);
  const page = Math.max(
    1,
    Math.min(10000, Number.parseInt(c.req.query("page") || "1") || 1),
  );
  const rows = await c.env.DB.prepare(
    "SELECT id,name FROM media ORDER BY created_at DESC,id LIMIT 61 OFFSET ?",
  )
    .bind((page - 1) * 60)
    .all<any>();
  return c.json({
    items: [
      ...(page === 1 ? suppliedMedia : []),
      ...rows.results
        .slice(0, 60)
        .map((r) => ({ path: "/media/" + r.id, name: r.name })),
    ],
    nextPage: rows.results.length > 60 ? page + 1 : null,
  });
});
admin.post("/api/admin/media", required("media.write"), async (c) => {
  const data = await c.req.parseBody();
  const file = data.file;
  if (!(file instanceof File) || file.size > 8 * 1024 * 1024 || file.size < 16)
    return c.json(
      { error: "Upload a JPEG, PNG or WebP image up to 8 MB" },
      400,
    );
  const bytes = new Uint8Array(await file.arrayBuffer());
  let type = "",
    ext = "";
  if (bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) {
    type = "image/jpeg";
    ext = "jpg";
  } else if (
    [137, 80, 78, 71, 13, 10, 26, 10].every((b, i) => bytes[i] === b)
  ) {
    type = "image/png";
    ext = "png";
  } else if (
    new TextDecoder().decode(bytes.slice(0, 4)) === "RIFF" &&
    new TextDecoder().decode(bytes.slice(8, 12)) === "WEBP"
  ) {
    type = "image/webp";
    ext = "webp";
  } else
    return c.json(
      {
        error:
          "Unsupported image content. SVG and executable files are not accepted.",
      },
      400,
    );
  if (file.type !== type)
    return c.json({ error: "File type does not match image content" }, 400);
  try {
    const dimensions = imageSize(bytes);
    if (
      !dimensions.width ||
      !dimensions.height ||
      dimensions.width > 12000 ||
      dimensions.height > 12000 ||
      dimensions.width * dimensions.height > 40000000
    )
      return c.json(
        { error: "Image dimensions exceed the 40 megapixel limit" },
        400,
      );
  } catch {
    return c.json({ error: "Invalid or damaged image" }, 400);
  }
  const id = random(20) + "." + ext;
  await c.env.MEDIA.put(id, bytes, { httpMetadata: { contentType: type } });
  await c.env.DB.prepare("INSERT INTO media(id,name,type,size) VALUES(?,?,?,?)")
    .bind(id, file.name.slice(0, 200), type, file.size)
    .run();
  await audit(c.env.DB, c.get("user").id, "media.uploaded", id);
  return c.json({ ok: true, path: "/media/" + id });
});
async function taxonomy(db: D1Database) {
  const r = await db
    .prepare("SELECT * FROM records WHERE kind IN ('categories','collections')")
    .all<any>();
  return r.results.map((x) => ({
    ...JSON.parse(x.data),
    id: x.id,
    kind: x.kind,
    version: x.version,
  }));
}
admin.get("/admin/:section?/:id?", async (c) => {
  const user = c.get("user"),
    section = c.req.param("section") || "",
    id = c.req.param("id");
  let body: any;
  const per: Record<string, string> = {
    products: "products.read",
    categories: "categories.manage",
    collections: "collections.manage",
    badges: "merchandising.manage",
    sections: "merchandising.manage",
    delivery: "delivery.manage",
    orders: "orders.read",
    content: "content.write",
    translations: "translations.write",
    branding: "branding.write",
    contacts: "contacts.write",
    ordering: "settings.write",
    media: "media.write",

    audit: "audit.read",
  };
  if (
    per[section] &&
    !allow(user, per[section]) &&
    !(section === "ordering" && allow(user, "notifications.manage"))
  )
    return c.html(
      shell(
        "Access denied",
        html`<main id="main" class="auth-page">
          <h1>Access denied.</h1>
          <p>Your role does not include access to this area.</p>
          <a href="/admin">Back to workspace</a>
        </main>`,
        { admin: true, user, csrf: user.csrf },
      ),
      403,
    );
  if (section === "products") {
    const list = await products(c.env.DB, true);
    if (id) {
      if (!allow(user, "products.write"))
        return c.text("Permission denied", 403);
      const p = id === "new" ? {} : list.find((p) => p.id === id);
      if (!p) return c.notFound();
      body = productForm(p, [
        ...(await taxonomy(c.env.DB)),
        ...(await entries(c.env.DB, "badges")),
      ]);
    } else body = productTable(list);
  } else if (
    ["categories", "collections", "badges", "sections", "delivery"].includes(
      section,
    )
  )
    body = commercePage(
      section,
      await entries(c.env.DB, section),
      await products(c.env.DB, true),
      await taxonomy(c.env.DB),
    );
  else if (["branding", "contacts", "ordering"].includes(section))
    body = recordForm(section, "main", await record(c.env.DB, section));
  else if (section === "content" || section === "translations") {
    if (id) {
      const data = await record(c.env.DB, "content", id);
      if (!data) return c.notFound();
      body = recordForm("content", id, data);
    } else {
      const rows = await c.env.DB.prepare(
        "SELECT id,data FROM records WHERE kind='content'",
      ).all<any>();
      const translatedEntities =
        section === "translations"
          ? [
              ...(await products(c.env.DB, true)).map((p) => ({
                ...p,
                kind: "products",
              })),
              ...(await entries(c.env.DB, "categories")),
              ...(await entries(c.env.DB, "collections")),
              ...(await entries(c.env.DB, "sections")),
              ...(await entries(c.env.DB, "badges")),
            ]
          : [];
      body = html`<div class="admin-heading"><h1>Pages & translations</h1></div>
        <div class="panel">
          <p>
            Edit page copy, images, SEO and all four language versions. Blank
            translations fall back to English.
          </p>
          ${translatedEntities.map((r: any) => html`<a class="content-link" href="/admin/translations/${r.id}?kind=${r.kind}"><strong>${r.kind}</strong><span>${r.name?.en || r.title?.en || r.id} ↗</span></a>`)}
          ${rows.results.map((r) => html`<a class="content-link" href="/admin/${section}/${r.id}"><strong>${r.id}</strong><span>${JSON.parse(r.data).title.en} ↗</span></a>`)}
        </div>`;
    }
  } else if (section === "orders") {
    const settings = await record(c.env.DB, "ordering");
    if (id) {
      const row = await c.env.DB.prepare("SELECT * FROM orders WHERE id=?")
        .bind(id)
        .first<any>();
      if (!row) return c.notFound();
      body = orderPage(
        {
          ...row,
          customer: allow(user, "customers.read")
            ? JSON.parse(row.customer)
            : {
                name: "Restricted",
                phone: "",
                email: "",
                address: "",
                city: "",
                country: "",
                notes: "",
              },
          items: JSON.parse(row.items),
        },
        (
          await c.env.DB.prepare("SELECT * FROM outbox WHERE order_id=?")
            .bind(id)
            .all()
        ).results.map((r: any) =>
          allow(user, "customers.read")
            ? r
            : { ...r, destination: "Restricted" },
        ),
        settings.statuses,
        (
          await c.env.DB.prepare(
            "SELECT h.*,a.username FROM order_history h LEFT JOIN admins a ON a.id=h.actor WHERE order_id=? ORDER BY h.id DESC",
          )
            .bind(id)
            .all()
        ).results,
      );
    } else {
      const q = c.req.query();
      const page = Math.max(
        1,
        Math.min(100000, Number.parseInt(q.page || "1") || 1),
      );
      const sort =
        (
          {
            newest: "id DESC",
            oldest: "id ASC",
            "total-high": "total DESC,id DESC",
            "total-low": "total ASC,id DESC",
          } as Record<string, string>
        )[q.sort || "newest"] || "id DESC";
      const rows = await c.env.DB.prepare(
        `SELECT * FROM orders WHERE archived=? AND (?='' OR status=?) AND (?='' OR customer LIKE ? OR CAST(id AS TEXT)=?) ORDER BY ${sort} LIMIT 51 OFFSET ?`,
      )
        .bind(
          q.archived === "1" ? 1 : 0,
          q.status || "",
          q.status || "",
          q.q || "",
          "%" + (q.q || "") + "%",
          (q.q || "").replace("UGF-", ""),
          (page - 1) * 50,
        )
        .all();
      body = ordersPage(
        rows.results.slice(0, 50).map((r: any) =>
          allow(user, "customers.read")
            ? r
            : {
                ...r,
                customer: JSON.stringify({ name: "Restricted", phone: "" }),
              },
        ),
        { ...q, page, hasNext: rows.results.length > 50 },
        settings.statuses,
      );
    }
  } else if (section === "media") {
    const rows = await c.env.DB.prepare(
      "SELECT * FROM media ORDER BY created_at DESC LIMIT 200",
    ).all<any>();
    body = html`<div class="admin-heading"><h1>Media library</h1></div>
      <form id="media-upload" class="panel">
        <label
          >Upload an image<input
            type="file"
            name="file"
            accept="image/jpeg,image/png,image/webp"
            required
        /></label>
        <p class="muted">
          JPEG, PNG or WebP · up to 8 MB. Images uploaded here are public.
        </p>
        <button class="button">Upload image</button>
        <p class="form-error" role="alert"></p>
      </form>
      <div class="media-grid">
        ${rows.results.map((r) => html`<article class="panel"><img src="/media/${r.id}" alt="${r.name}" loading="lazy" /><strong>${r.name}</strong><input aria-label="Image path" readonly value="/media/${r.id}" /></article>`)}
      </div>
      <section class="panel">
        <h2>Supplied website assets</h2>
        <p>
          Original files are preserved in the repository. Use these optimized
          copies in your catalog and page settings.
        </p>
        <div class="media-grid">
          ${suppliedMedia.map((m) => html`<div><img src="${m.path}" alt="${m.name}" loading="lazy" /><input readonly aria-label="Asset path" value="${m.path}" /></div>`)}
        </div>
      </section>`;
  } else if (section === "users") {
    if (
      !["admins.read", "admins.create", "admins.write"].some((p) =>
        allow(user, p),
      )
    )
      return c.text("Permission denied", 403);
    body = identityUsers(
      (
        await c.env.DB.prepare(
          "SELECT id,username,email,display_name,is_main,disabled,permissions,totp_policy,totp,must_reset,last_login,created_at FROM admins ORDER BY is_main DESC,created_at DESC",
        ).all()
      ).results,
      user,
      (
        await c.env.DB.prepare(
          "SELECT token_hash,admin_id,user_agent,expires_at FROM sessions WHERE expires_at>?",
        )
          .bind(Date.now())
          .all()
      ).results,
    );
  } else if (section === "security") {
    body = await identitySecurity(c);
  } else if (section === "audit") {
    const rows = await c.env.DB.prepare(
      "SELECT audit.*,admins.username AS actor_name FROM audit LEFT JOIN admins ON admins.id=audit.actor ORDER BY audit.id DESC LIMIT 200",
    ).all<any>();
    body = html`<div class="admin-heading"><h1>Audit log</h1></div>
      <div class="panel table-scroll">
        <table>
          <thead>
            <tr>
              <th>Time (UTC)</th>
              <th>Actor</th>
              <th>Action</th>
              <th>Target</th>
              <th>Detail</th>
            </tr>
          </thead>
          <tbody>
            ${rows.results.map(
              (r) =>
                html`<tr>
                  <td>${r.created_at}</td>
                  <td>${r.actor_name || r.actor || "Unauthenticated"}</td>
                  <td>${r.action}</td>
                  <td>${r.target}</td>
                  <td>${r.detail}</td>
                </tr>`,
            )}
          </tbody>
        </table>
      </div>`;
  } else if (!section) {
    const list = allow(user, "products.read")
      ? await products(c.env.DB, true)
      : [];
    const count = allow(user, "orders.read")
      ? await c.env.DB.prepare(
          "SELECT COUNT(*) AS total,SUM(CASE WHEN status='New' THEN 1 ELSE 0 END) AS new FROM orders",
        ).first<any>()
      : null;
    body = html`<div class="admin-heading">
        <div>
          <div class="eyebrow">YOUR BUSINESS, AT A GLANCE</div>
          <h1>Good to see you, ${user.username}.</h1>
        </div>
      </div>
      <div class="overview-grid">
        ${allow(user, "products.read") ? html`<a class="panel" href="/admin/products"><span>Catalog pieces</span><strong>${list.length}</strong><small>${list.filter((x) => x.placeholder).length} awaiting detail review ↗</small></a>` : ""}${count ? html`<a class="panel" href="/admin/orders"><span>Orders received</span><strong>${count.total}</strong><small>${count.new || 0} new orders ↗</small></a>` : ""}<a
          class="panel"
          href="/admin/security"
          ><span>Account security</span><strong>2FA</strong
          ><small>Authenticator required ↗</small></a
        >
      </div>
      <section class="panel">
        <h2>Launch checklist</h2>
        <p>
          Review temporary product names, pricing, sizes and availability. Add
          business contact details, complete translations and configure
          notification transports before accepting orders.
        </p>
        <p>
          Keep your catalog and contact details up to date so customers have the
          information they need.
        </p>
      </section>`;
  } else return c.notFound();
  return c.html(
    shell("Workspace · UniGlobe", adminLayout(user, section, body), {
      admin: true,
      user,
      csrf: user.csrf,
    }),
  );
});

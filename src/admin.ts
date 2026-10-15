import { Hono } from "hono";
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
admin.get("/admin/login", (c) =>
  c.html(shell("Sign in · UniGlobe", authPage(), { admin: true })),
);
admin.get("/admin/setup", async (c) => {
  if (await c.env.DB.prepare("SELECT id FROM admins WHERE is_main=1").first())
    return c.notFound();
  if (!c.env.BOOTSTRAP_TOKEN || !c.env.AUTH_KEY)
    return c.html(
      shell(
        "Setup unavailable",
        html`<main id="main" class="auth-page">
          <h1>Setup not configured.</h1>
          <p>
            Configure the AUTH_KEY and BOOTSTRAP_TOKEN server secrets before
            creating Main Admin.
          </p>
        </main>`,
        { admin: true },
      ),
      503,
    );
  return c.html(
    shell("Set up Main Admin", authPage(true, newTotp()), { admin: true }),
  );
});
admin.post("/api/auth/setup", async (c) => {
  if (
    !(await rate(
      c.env.DB,
      "setup:" + (c.req.header("CF-Connecting-IP") || "local"),
      5,
      900,
    ))
  )
    return c.json({ error: "Too many attempts. Try again later." }, 429);
  if (!c.env.BOOTSTRAP_TOKEN || !c.env.AUTH_KEY)
    return c.json({ error: "Server secrets not configured" }, 503);
  const data = authBody
    .extend({
      bootstrap: z.string(),
      secret: z.string().regex(/^[A-Z2-7]{32}$/),
    })
    .parse(await c.req.json());
  if (!equal(data.bootstrap, c.env.BOOTSTRAP_TOKEN))
    return c.json({ error: "Setup credentials invalid" }, 403);
  if (verifyTotp(data.secret, data.code) === null)
    return c.json({ error: "Authenticator code invalid" }, 400);
  if (await c.env.DB.prepare("SELECT id FROM admins WHERE is_main=1").first())
    return c.json({ error: "Setup is already complete" }, 409);
  const id = crypto.randomUUID();
  try {
    await c.env.DB.prepare(
      "INSERT INTO admins(id,username,password_hash,totp,permissions,is_main) VALUES(?,?,?,?,?,1)",
    )
      .bind(
        id,
        data.username,
        await passwordHash(data.password),
        await encrypt(data.secret, c.env.AUTH_KEY),
        JSON.stringify(permissions),
      )
      .run();
  } catch {
    return c.json({ error: "Setup is already complete" }, 409);
  }
  await audit(c.env.DB, id, "admin.bootstrap", id);
  await makeSession(c, { id });
  return c.json({ ok: true });
});
admin.post("/api/auth/login", async (c) => {
  const data = authBody.parse(await c.req.json());
  const ip = c.req.header("CF-Connecting-IP") || "local";
  if (
    !(await rate(c.env.DB, "login-ip:" + ip, 30, 900)) ||
    !(await rate(
      c.env.DB,
      "login-user:" + (await hash(data.username.toLowerCase())),
      8,
      900,
    ))
  )
    return c.json(
      { error: "Too many attempts. Try again in 15 minutes." },
      429,
    );
  const u = await c.env.DB.prepare(
    "SELECT * FROM admins WHERE username=? COLLATE NOCASE",
  )
    .bind(data.username)
    .first<any>();
  let valid = false;
  let step: number | null = null;
  if (u && !u.disabled) {
    valid = await passwordValid(data.password, u.password_hash);
    if (valid)
      step = verifyTotp(await decrypt(u.totp, c.env.AUTH_KEY), data.code);
  } else {
    await passwordHash(data.password, "00000000000000000000000000000000");
  }
  if (!valid || step === null) {
    await audit(
      c.env.DB,
      null,
      "auth.failed",
      "",
      await hash(data.username.toLowerCase()),
    );
    return c.json(
      { error: "Username, password or authenticator code is incorrect" },
      401,
    );
  }
  try {
    await c.env.DB.prepare("INSERT INTO totp_used(admin_id,step) VALUES(?,?)")
      .bind(u.id, step)
      .run();
  } catch {
    return c.json(
      {
        error:
          "This authenticator code was already used. Wait for the next code.",
      },
      401,
    );
  }
  const old = getCookie(c, cookieName(c));
  if (old)
    await c.env.DB.prepare("DELETE FROM sessions WHERE token_hash=?")
      .bind(await hash(old))
      .run();
  await makeSession(c, u);
  await audit(c.env.DB, u.id, "auth.login", u.id);
  return c.json({ ok: true });
});
admin.use("*", async (c, next) => {
  if (
    !c.req.path.startsWith("/admin") &&
    !c.req.path.startsWith("/api/admin") &&
    !c.req.path.startsWith("/api/auth")
  )
    return next();
  const u = await session(c.env, getCookie(c, cookieName(c)));
  if (!u) {
    if (c.req.path.startsWith("/api/"))
      return c.json({ error: "Sign in required" }, 401);
    return c.redirect("/admin/login");
  }
  c.set("user", u);
  if (!["GET", "HEAD"].includes(c.req.method)) {
    let token = c.req.header("X-CSRF-Token");
    if (!token && c.req.path === "/api/auth/logout")
      token = (await c.req.parseBody()).csrf as string;
    if (!token || !equal(token, u.csrf))
      return c.json({ error: "Invalid CSRF token" }, 403);
  }
  await next();
});
admin.post("/api/auth/logout", async (c) => {
  await c.env.DB.prepare("DELETE FROM sessions WHERE token_hash=?")
    .bind(c.get("user").token_hash)
    .run();
  deleteCookie(c, cookieName(c), { path: "/" });
  return c.redirect("/admin/login", 303);
});
admin.post("/api/admin/password", async (c) => {
  const d = z
    .object({
      current: z.string().max(128),
      password: z.string().min(12).max(128),
      code: z.string(),
    })
    .parse(await c.req.json());
  const user = c.get("user");
  if (!(await rate(c.env.DB, "change-password:" + user.id, 5, 900)))
    return c.json({ error: "Try again later" }, 429);
  const u = await c.env.DB.prepare("SELECT * FROM admins WHERE id=?")
    .bind(user.id)
    .first<any>();
  if (
    !(await passwordValid(d.current, u.password_hash)) ||
    verifyTotp(await decrypt(u.totp, c.env.AUTH_KEY), d.code) === null
  )
    return c.json({ error: "Current password or code is incorrect" }, 403);
  await c.env.DB.batch([
    c.env.DB.prepare("UPDATE admins SET password_hash=? WHERE id=?").bind(
      await passwordHash(d.password),
      user.id,
    ),
    c.env.DB.prepare("DELETE FROM sessions WHERE admin_id=?").bind(user.id),
  ]);
  await makeSession(c, user);
  await audit(c.env.DB, user.id, "auth.password_changed", user.id);
  return c.json({ ok: true, reload: true });
});
admin.post("/api/admin/totp/start", async (c) => {
  const user = c.get("user");
  if (!(await rate(c.env.DB, "totp-change:" + user.id, 5, 900)))
    return c.json({ error: "Try again later" }, 429);
  const data = z
    .object({ password: z.string().max(128), code: z.string() })
    .parse(await c.req.json());
  const owner = await c.env.DB.prepare(
    "SELECT password_hash,totp FROM admins WHERE id=?",
  )
    .bind(user.id)
    .first<any>();
  if (
    !(await passwordValid(data.password, owner.password_hash)) ||
    verifyTotp(await decrypt(owner.totp, c.env.AUTH_KEY), data.code) === null
  )
    return c.json(
      { error: "Password or authenticator code is incorrect" },
      403,
    );
  const secret = newTotp();
  await c.env.DB.prepare(
    "UPDATE sessions SET pending_totp=?,pending_totp_expires=? WHERE token_hash=?",
  )
    .bind(
      await encrypt(secret, c.env.AUTH_KEY),
      Date.now() + 600000,
      user.token_hash,
    )
    .run();
  return c.json({ ok: true, secret });
});
admin.post("/api/admin/totp/confirm", async (c) => {
  const user = c.get("user");
  if (!(await rate(c.env.DB, "totp-confirm:" + user.id, 5, 600)))
    return c.json({ error: "Try again later" }, 429);
  const data = z.object({ code: z.string() }).parse(await c.req.json());
  const row = await c.env.DB.prepare(
    "SELECT pending_totp,pending_totp_expires FROM sessions WHERE token_hash=?",
  )
    .bind(user.token_hash)
    .first<any>();
  if (
    !row?.pending_totp ||
    row.pending_totp_expires < Date.now() ||
    verifyTotp(await decrypt(row.pending_totp, c.env.AUTH_KEY), data.code) ===
      null
  )
    return c.json({ error: "Setup expired or code is incorrect" }, 400);
  await c.env.DB.batch([
    c.env.DB.prepare("UPDATE admins SET totp=? WHERE id=?").bind(
      row.pending_totp,
      user.id,
    ),
    c.env.DB.prepare("DELETE FROM sessions WHERE admin_id=?").bind(user.id),
    c.env.DB.prepare("DELETE FROM totp_used WHERE admin_id=?").bind(user.id),
  ]);
  await makeSession(c, user);
  await audit(c.env.DB, user.id, "auth.totp_changed", user.id);
  return c.json({ ok: true, reload: true });
});
admin.delete("/api/admin/sessions/:id", async (c) => {
  await c.env.DB.prepare(
    "DELETE FROM sessions WHERE token_hash=? AND admin_id=?",
  )
    .bind(c.req.param("id"), c.get("user").id)
    .run();
  return c.json({ ok: true });
});
admin.post("/api/admin/products", required("products.write"), async (c) => {
  const p = productSchema.parse(await c.req.json());
  const id = crypto.randomUUID();
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
  await saveProduct(
    c.env,
    c.req.param("id"),
    p,
    z.number().int().min(1).parse(d.version),
    z.number().int().min(1).parse(d.inventoryRevision),
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
    await saveProduct(c.env, id, copy, null);
    await audit(c.env.DB, c.get("user").id, "product.duplicated", id);
    return c.json({ ok: true, redirect: "/admin/products/" + id });
  },
);
admin.delete(
  "/api/admin/products/:id",
  required("products.write"),
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
  categories: "products.write",
  collections: "products.write",
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
  categories: z.object({
    name: localized,
    description: localized,
    priority: z.number().int(),
  }),
  collections: z.object({
    name: localized,
    description: localized,
    priority: z.number().int(),
  }),
};
admin.put("/api/admin/records/:kind/:id", async (c) => {
  const { kind } = c.req.param();
  if (
    !schemas[kind] ||
    (!allow(c.get("user"), recordPermission[kind]) &&
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
  const data = schemas[kind].parse(recordData) as any;
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
    if (
      data.emailEnabled &&
      (!c.env.EMAIL_API_TOKEN || !c.env.EMAIL_API_URL || !data.emailSender)
    )
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
  const existing = await record(c.env.DB, kind, id);
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
admin.delete(
  "/api/admin/records/:kind/:id",
  required("products.write"),
  async (c) => {
    const { kind, id } = c.req.param();
    if (!["categories", "collections"].includes(kind)) return c.notFound();
    const field = kind === "categories" ? "category" : "collection";
    if ((await products(c.env.DB, true)).some((p) => (p as any)[field] === id))
      return c.json(
        { error: "This entry is used by products. Reassign them first." },
        409,
      );
    await c.env.DB.prepare("DELETE FROM records WHERE kind=? AND id=?")
      .bind(kind, id)
      .run();
    await audit(c.env.DB, c.get("user").id, kind + ".deleted", id);
    return c.json({ ok: true });
  },
);
admin.put("/api/admin/orders/:id", required("orders.write"), async (c) => {
  const d = z
    .object({
      status: z.string(),
      notes: z.string().max(5000),
      archived: z.boolean(),
    })
    .parse(await c.req.json());
  const settings = await record(c.env.DB, "ordering");
  if (!settings.statuses.includes(d.status))
    return c.json({ error: "Unknown status" }, 400);
  await c.env.DB.prepare(
    "UPDATE orders SET status=?,notes=?,archived=? WHERE id=?",
  )
    .bind(d.status, d.notes, d.archived ? 1 : 0, c.req.param("id"))
    .run();
  await audit(
    c.env.DB,
    c.get("user").id,
    "order.updated",
    c.req.param("id"),
    d.status,
  );
  return c.json({ ok: true });
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
admin.post("/api/admin/users", required("admins.write"), async (c) => {
  const d = z
    .object({
      username: z.string().trim().min(3).max(120),
      password: z.string().min(12).max(128),
      permissions: z.array(z.enum(permissions)).max(permissions.length),
    })
    .parse(await c.req.json());
  const actor = c.get("user");
  if (
    !actor.is_main &&
    (d.permissions.includes("admins.write") ||
      d.permissions.some((p) => !JSON.parse(actor.permissions).includes(p)))
  )
    return c.json(
      { error: "You cannot grant permissions beyond your own access" },
      403,
    );
  const id = crypto.randomUUID(),
    secret = newTotp();
  await c.env.DB.prepare(
    "INSERT INTO admins(id,username,password_hash,totp,permissions) VALUES(?,?,?,?,?)",
  )
    .bind(
      id,
      d.username,
      await passwordHash(d.password),
      await encrypt(secret, c.env.AUTH_KEY),
      JSON.stringify(d.permissions),
    )
    .run();
  await audit(c.env.DB, actor.id, "admin.created", id);
  return c.json({ ok: true, secret });
});
admin.put(
  "/api/admin/users/:id/permissions",
  required("admins.write"),
  async (c) => {
    const actor = c.get("user");
    const target = await c.env.DB.prepare(
      "SELECT id,is_main,permissions FROM admins WHERE id=?",
    )
      .bind(c.req.param("id"))
      .first<any>();
    if (!target) return c.notFound();
    if (target.is_main || target.id === actor.id)
      return c.json({ error: "This admin is protected" }, 403);
    const data = z
      .object({
        permissions: z.array(z.enum(permissions)).max(permissions.length),
      })
      .parse(await c.req.json());
    const own = JSON.parse(actor.permissions);
    if (
      !actor.is_main &&
      (JSON.parse(target.permissions).some((p: string) => !own.includes(p)) ||
        data.permissions.some((p) => !own.includes(p)) ||
        data.permissions.includes("admins.write"))
    )
      return c.json(
        {
          error:
            "You cannot grant or manage access beyond your own permissions",
        },
        403,
      );
    await c.env.DB.batch([
      c.env.DB.prepare("UPDATE admins SET permissions=? WHERE id=?").bind(
        JSON.stringify(data.permissions),
        target.id,
      ),
      c.env.DB.prepare("DELETE FROM sessions WHERE admin_id=?").bind(target.id),
    ]);
    await audit(
      c.env.DB,
      actor.id,
      "admin.permissions_changed",
      target.id,
      JSON.stringify(data.permissions),
    );
    return c.json({ ok: true });
  },
);
admin.post(
  "/api/admin/users/:id/toggle",
  required("admins.write"),
  async (c) => {
    const u = await c.env.DB.prepare("SELECT * FROM admins WHERE id=?")
      .bind(c.req.param("id"))
      .first<any>();
    if (!u) return c.notFound();
    if (u.is_main || u.id === c.get("user").id)
      return c.json({ error: "This admin is protected" }, 403);
    if (
      !c.get("user").is_main &&
      JSON.parse(u.permissions).some(
        (p: string) => !JSON.parse(c.get("user").permissions).includes(p),
      )
    )
      return c.json({ error: "Permission denied" }, 403);
    await c.env.DB.batch([
      c.env.DB.prepare("UPDATE admins SET disabled=? WHERE id=?").bind(
        u.disabled ? 0 : 1,
        u.id,
      ),
      c.env.DB.prepare("DELETE FROM sessions WHERE admin_id=?").bind(u.id),
    ]);
    await audit(c.env.DB, c.get("user").id, "admin.access_changed", u.id);
    return c.json({ ok: true });
  },
);
admin.delete("/api/admin/users/:id", required("admins.write"), async (c) => {
  const u = await c.env.DB.prepare("SELECT * FROM admins WHERE id=?")
    .bind(c.req.param("id"))
    .first<any>();
  if (!u) return c.notFound();
  if (u.is_main || u.id === c.get("user").id)
    return c.json({ error: "This admin is protected" }, 403);
  if (
    !c.get("user").is_main &&
    JSON.parse(u.permissions).some(
      (p: string) => !JSON.parse(c.get("user").permissions).includes(p),
    )
  )
    return c.json({ error: "Permission denied" }, 403);
  await c.env.DB.prepare("DELETE FROM admins WHERE id=?").bind(u.id).run();
  await audit(c.env.DB, c.get("user").id, "admin.deleted", u.id);
  return c.json({ ok: true });
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
    categories: "products.read",
    collections: "products.read",
    orders: "orders.read",
    content: "content.write",
    translations: "translations.write",
    branding: "branding.write",
    contacts: "contacts.write",
    ordering: "settings.write",
    media: "media.write",
    users: "admins.write",
    audit: "audit.read",
  };
  if (per[section] && !allow(user, per[section]))
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
      body = productForm(p, await taxonomy(c.env.DB));
    } else body = productTable(list);
  } else if (["categories", "collections"].includes(section))
    body = taxonomyPage(
      section,
      (await taxonomy(c.env.DB)).filter((x) => x.kind === section),
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
      body = html`<div class="admin-heading"><h1>Pages & translations</h1></div>
        <div class="panel">
          <p>
            Edit page copy, images, SEO and all four language versions. Blank
            translations fall back to English.
          </p>
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
          customer: JSON.parse(row.customer),
          items: JSON.parse(row.items),
        },
        (
          await c.env.DB.prepare("SELECT * FROM outbox WHERE order_id=?")
            .bind(id)
            .all()
        ).results,
        settings.statuses,
      );
    } else {
      const q = c.req.query();
      const rows = await c.env.DB.prepare(
        "SELECT * FROM orders WHERE archived=? AND (?='' OR status=?) AND (?='' OR customer LIKE ? OR CAST(id AS TEXT)=?) ORDER BY id DESC LIMIT 200",
      )
        .bind(
          q.archived === "1" ? 1 : 0,
          q.status || "",
          q.status || "",
          q.q || "",
          "%" + (q.q || "") + "%",
          (q.q || "").replace("UGF-", ""),
        )
        .all();
      body = ordersPage(rows.results, q, settings.statuses);
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
          ${["product-1", "product-2", "product-3", "product-4", "product-5", "product-6", "fashion-logo-transparent", "holdings-logo"].map((n) => html`<div><img src="/assets/${n}.webp" alt="${n}" loading="lazy" /><input readonly aria-label="Asset path" value="/assets/${n}.webp" /></div>`)}
        </div>
      </section>`;
  } else if (section === "users")
    body = usersPage(
      (
        await c.env.DB.prepare(
          "SELECT id,username,is_main,disabled,permissions FROM admins ORDER BY is_main DESC",
        ).all()
      ).results,
      !!user.is_main,
    );
  else if (section === "security") {
    const rows = await c.env.DB.prepare(
      "SELECT token_hash,created_at,expires_at,user_agent FROM sessions WHERE admin_id=?",
    )
      .bind(user.id)
      .all<any>();
    body = html`<div class="admin-heading"><h1>Security</h1></div>
      <section class="panel">
        <h2>Active sessions</h2>
        ${rows.results.map(
          (r) =>
            html`<div class="content-link">
              <span
                >${r.token_hash === user.token_hash ? "This session" : "Other session"}<small
                  >${r.user_agent} · Expires
                  ${new Date(r.expires_at).toISOString()}</small
                ></span
              ><button
                class="text-button"
                data-delete="/api/admin/sessions/${r.token_hash}"
                data-confirm="Revoke this session?"
              >
                Revoke
              </button>
            </div>`,
        )}
      </section>
      <form
        class="panel admin-editor"
        data-api="/api/admin/password"
        data-method="POST"
      >
        <h2>Change password</h2>
        ${field("Current password", "current", "", "password", 'required autocomplete="current-password"')}${field("New password", "password", "", "password", 'required minlength="12" autocomplete="new-password"')}${field("Authenticator code", "code", "", "text", 'required pattern="[0-9]{6}"')}
        <p class="muted">
          Changing your password revokes all existing sessions.
        </p>
        <p class="form-error" role="alert"></p>
        <button class="button">Update password</button>
      </form>
      <form id="totp-start" class="panel">
        <h2>Change authenticator</h2>
        <p>
          Your existing authenticator remains active until you verify the new
          setup. Other sessions will then be revoked.
        </p>
        ${field("Current password", "password", "", "password", 'required autocomplete="current-password"')}${field("Current authenticator code", "code", "", "text", 'required pattern="[0-9]{6}"')}
        <p class="form-error" role="alert"></p>
        <button class="button">Set up new authenticator</button>
      </form>
      <form id="totp-confirm" class="panel" hidden>
        <h2>Verify new authenticator</h2>
        <code id="new-totp" class="totp-key"></code
        >${field("New authenticator code", "code", "", "text", 'required pattern="[0-9]{6}"')}
        <p class="form-error" role="alert"></p>
        <button class="button">Activate & revoke other sessions</button>
      </form>`;
  } else if (section === "audit") {
    const rows = await c.env.DB.prepare(
      "SELECT * FROM audit ORDER BY id DESC LIMIT 200",
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
                  <td>${r.actor || "Unauthenticated"}</td>
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

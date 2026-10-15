import { env } from "cloudflare:test";
import { describe, it, expect, afterEach, vi } from "vitest";
import { app } from "../src/index";
import {
  type Env,
  productSchema,
  products,
  record,
  whatsappLink,
  L,
  money,
} from "../src/model";
import {
  random,
  hash,
  passwordHash,
  passwordValid,
  encrypt,
  decrypt,
  verifyTotp,
  totp,
  newTotp,
  rate,
} from "../src/security";
import { placeOrder } from "../src/orders";
import { deliver, telegramChunks } from "../src/notifications";
import { sendReceipt } from "../src/email";
const e = env as unknown as Env;
const customer = {
  name: "Test Customer",
  phone: "+94771234567",
  whatsapp: "",
  email: "customer@example.test",
  address: "10 Test Street",
  city: "Colombo",
  region: "Western",
  postalCode: "00100",
  country: "LK",
  notes: "Test only",
};
const order = () => ({
  key: crypto.randomUUID(),
  items: [
    {
      productId: "00000000-0000-4000-8000-000000000001",
      variantId: "standard",
      quantity: 1,
    },
  ],
  customer,
  website: "",
});
async function open(settings: any = {}) {
  const s = await record(e.DB, "ordering");
  await e.DB.prepare(
    "UPDATE records SET data=? WHERE kind='ordering' AND id='main'",
  )
    .bind(
      JSON.stringify({
        ...s,
        enabled: true,
        emailEnabled: false,
        telegramEnabled: false,
        ...settings,
      }),
    )
    .run();
  await e.DB.prepare("UPDATE inventory SET quantity=NULL").run();
}
async function user(perms: string[] = [], main = false) {
  const id = crypto.randomUUID(),
    token = random(),
    csrf = random(),
    secret = newTotp();
  const password = random(10);
  await e.DB.prepare(
    "INSERT INTO admins(id,username,password_hash,totp,permissions,is_main) VALUES(?,?,?,?,?,?)",
  )
    .bind(
      id,
      "user-" + id,
      await passwordHash(password),
      await encrypt(secret, e.AUTH_KEY),
      JSON.stringify(perms),
      main ? 1 : 0,
    )
    .run();
  await e.DB.prepare(
    "INSERT INTO sessions(token_hash,admin_id,csrf,expires_at,created_at) VALUES(?,?,?,?,?)",
  )
    .bind(await hash(token), id, csrf, Date.now() + 3600000, Date.now())
    .run();
  return { id, token, csrf, secret, password, username: "user-" + id };
}
async function req(
  path: string,
  method = "GET",
  body?: any,
  u?: any,
  origin = "http://localhost",
) {
  const headers: Record<string, string> = { Origin: origin };
  if (u) {
    headers.Cookie = "ug_admin=" + u.token;
    headers["X-CSRF-Token"] = u.csrf;
  }
  if (body !== undefined) headers["Content-Type"] = "application/json";
  return app.request(
    "http://localhost" + path,
    {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    },
    e,
    { waitUntil: () => {}, passThroughOnException: () => {} } as any,
  );
}
afterEach(() => {
  vi.restoreAllMocks();
});
describe("security primitives", () => {
  it("hashes passwords with unique salts and rejects wrong passwords", async () => {
    const a = await passwordHash("a secure test password");
    const b = await passwordHash("a secure test password");
    expect(a).not.toBe(b);
    expect(await passwordValid("a secure test password", a)).toBe(true);
    expect(await passwordValid("wrong password", a)).toBe(false);
  });
  it("encrypts TOTP secrets and rejects a different key", async () => {
    const value = newTotp();
    const encrypted = await encrypt(value, e.AUTH_KEY);
    expect(encrypted).not.toContain(value);
    expect(await decrypt(encrypted, e.AUTH_KEY)).toBe(value);
    await expect(decrypt(encrypted, random())).rejects.toThrow();
  });
  it("verifies standard TOTP and rejects bad or expired codes", () => {
    const secret = newTotp(),
      time = 1700000000000;
    const code = totp(secret).generate({ timestamp: time });
    expect(verifyTotp(secret, code, time)).not.toBeNull();
    expect(verifyTotp(secret, code, time + 120000)).toBeNull();
    expect(verifyTotp(secret, "123", time)).toBeNull();
  });
  it("enforces persistent request limits", async () => {
    expect(await rate(e.DB, "test", 2, 60)).toBe(true);
    expect(await rate(e.DB, "test", 2, 60)).toBe(true);
    expect(await rate(e.DB, "test", 2, 60)).toBe(false);
  });
});
describe("public website and catalog", () => {
  it("renders Holdings and all core public routes without authentication", async () => {
    for (const path of [
      "/",
      "/fashion",
      "/fashion/shop",
      "/about",
      "/contact",
      "/real-estate",
      "/academy",
      "/bag",
      "/checkout",
    ]) {
      const r = await req(path);
      expect(r.status, path).toBe(200);
      expect(r.headers.get("Content-Security-Policy")).toContain(
        "frame-ancestors 'none'",
      );
    }
  });
  it("renders Arabic RTL with an English business-content fallback", async () => {
    const r = await req("/fashion?lang=ar");
    const body = await r.text();
    expect(body).toContain('lang="ar" dir="rtl"');
    expect(body).toContain("Everyday, considered.");
    expect(body).toContain("الأزياء");
  });
  it("filters the catalog and emits SEO metadata", async () => {
    const r = await req("/fashion/shop?q=Forever");
    const body = await r.text();
    expect(body).toContain("Forever tee");
    expect(body).not.toContain("Focus lounge set");
    const p = await req("/fashion/products/focus-lounge-set");
    expect(await p.text()).toContain("application/ld+json");
  });
  it("preserves fractional LKR prices and localized search canonicals", async () => {
    expect(money(150050, "en")).toContain("1,500.50");
    const page = await (await req("/fashion/shop?lang=ar")).text();
    expect(page).toContain(
      'rel="canonical" href="https://uniglobeholdings.com/fashion/shop?lang=ar"',
    );
    expect(page).toContain('hreflang="ta"');
    expect(page).toContain('name="availability"');
    const content = await record(e.DB, "content", "catalog");
    expect(content.seoDescription.en.length).toBeGreaterThan(20);
  });
  it("uses temporary LKR 1500 prices and no invented stock", async () => {
    const ps = await products(e.DB);
    expect(ps).toHaveLength(4);
    expect(
      ps.every(
        (p) =>
          p.price === 150000 && p.placeholder && p.variants[0].stock === null,
      ),
    ).toBe(true);
  });
  it("excludes private routes from sitemap", async () => {
    const r = await req("/sitemap.xml"),
      xml = await r.text();
    expect(xml).toContain("/fashion/products/focus-lounge-set");
    expect(xml).not.toContain("/admin");
    expect(xml).not.toContain("/orders");
  });
  it("rejects unsafe image paths and malformed variants", async () => {
    const p = (await products(e.DB))[0];
    expect(
      productSchema.safeParse({ ...p, images: ["javascript:alert(1)"] })
        .success,
    ).toBe(false);
    expect(
      productSchema.safeParse({
        ...p,
        variants: [p.variants[0], p.variants[0]],
      }).success,
    ).toBe(false);
    expect(
      productSchema.safeParse({ ...p, salePrice: p.price + 1 }).success,
    ).toBe(false);
  });
});
describe("ordering transaction", () => {
  it("persists the server-calculated order before exposing confirmation", async () => {
    await open();
    const d = { ...order(), total: 1 };
    const token = await placeOrder(e, d);
    const o = await e.DB.prepare("SELECT * FROM orders WHERE token=?")
      .bind(token)
      .first<any>();
    expect(o.total).toBe(150000);
    expect(JSON.parse(o.items)[0].price).toBe(150000);
    const r = await req("/orders/" + token);
    expect(r.status).toBe(200);
    expect(r.headers.get("Cache-Control")).toBe("no-store");
    expect(await r.text()).toContain("ORDER PLACED SUCCESSFULLY");
  });
  it("makes retries idempotent and rejects changed retry payloads", async () => {
    await open();
    const d = order();
    expect(await placeOrder(e, d)).toBe(await placeOrder(e, d));
    await expect(
      placeOrder(e, {
        ...d,
        customer: { ...customer, name: "Another customer" },
      }),
    ).rejects.toThrow("different order");
    expect(
      (await e.DB.prepare("SELECT COUNT(*) AS n FROM orders").first<any>()).n,
    ).toBe(1);
  });
  it("allocates unique order numbers for simultaneous requests", async () => {
    await open();
    await Promise.all([
      placeOrder(e, order()),
      placeOrder(e, order()),
      placeOrder(e, order()),
    ]);
    const r = await e.DB.prepare("SELECT id FROM orders").all<any>();
    expect(new Set(r.results.map((r) => r.id)).size).toBe(3);
  });
  it("rolls back stock and the order when a line is oversold", async () => {
    await open();
    await e.DB.prepare("UPDATE inventory SET quantity=1 WHERE product_id=?")
      .bind(order().items[0].productId)
      .run();
    const d = order();
    d.items[0].quantity = 2;
    await expect(placeOrder(e, d)).rejects.toThrow("insufficient stock");
    expect(
      (await e.DB.prepare("SELECT COUNT(*) AS n FROM orders").first<any>()).n,
    ).toBe(0);
    expect(
      (
        await e.DB.prepare("SELECT quantity FROM inventory WHERE product_id=?")
          .bind(d.items[0].productId)
          .first<any>()
      ).quantity,
    ).toBe(1);
  });
  it("does not oversell under concurrent checkout", async () => {
    await open();
    await e.DB.prepare("UPDATE inventory SET quantity=1 WHERE product_id=?")
      .bind(order().items[0].productId)
      .run();
    const results = await Promise.allSettled([
      placeOrder(e, order()),
      placeOrder(e, order()),
    ]);
    expect(results.filter((x) => x.status === "fulfilled")).toHaveLength(1);
    expect(
      (
        await e.DB.prepare("SELECT quantity FROM inventory WHERE product_id=?")
          .bind(order().items[0].productId)
          .first<any>()
      ).quantity,
    ).toBe(0);
  });
  it("rejects invalid variants, countries, quantities and honeypot submissions", async () => {
    await open();
    await expect(
      placeOrder(e, {
        ...order(),
        items: [{ ...order().items[0], variantId: "fake" }],
      }),
    ).rejects.toThrow();
    await expect(
      placeOrder(e, { ...order(), customer: { ...customer, country: "SA" } }),
    ).rejects.toThrow();
    await expect(
      placeOrder(e, {
        ...order(),
        items: [{ ...order().items[0], quantity: -1 }],
      }),
    ).rejects.toThrow();
    await expect(
      placeOrder(e, { ...order(), website: "spam" }),
    ).rejects.toThrow();
  });
  it("rejects forged cross-origin checkout", async () => {
    const r = await req(
      "/api/orders",
      "POST",
      order(),
      null,
      "https://attacker.test",
    );
    expect(r.status).toBe(403);
  });
  it("does not disclose receipts through sequential numbers", async () => {
    await open();
    await placeOrder(e, order());
    expect((await req("/orders/1")).status).toBe(404);
    expect((await req("/orders/" + "0".repeat(64))).status).toBe(404);
  });
  it("builds optional WhatsApp continuation with the existing order number", () => {
    const url = whatsappLink("+94 77 1234567", {
      id: 1042,
      customer,
      items: [{ name: "Focus set", variant: "", quantity: 2 }],
      total: 300000,
    });
    expect(url).toMatch(/^https:\/\/wa.me\/94771234567\?text=/);
    expect(decodeURIComponent(url)).toContain("UGF-1042");
  });
});
describe("notification outbox", () => {
  it("records internal and customer email plus Telegram jobs atomically", async () => {
    await open({
      emailEnabled: true,
      emailRecipients: ["orders@example.test"],
      telegramEnabled: true,
      telegramChats: ["12345"],
    });
    await placeOrder(e, order());
    const jobs = await e.DB.prepare("SELECT * FROM outbox").all();
    expect(jobs.results).toHaveLength(3);
  });
  it("sends Telegram via a mocked server secret transport", async () => {
    await open({ telegramEnabled: true, telegramChats: ["12345"] });
    await placeOrder(e, order());
    const mock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(Response.json({ ok: true }));
    await deliver({ ...e, TELEGRAM_BOT_TOKEN: "test-only-token" });
    expect(
      (await e.DB.prepare("SELECT status FROM outbox").first<any>()).status,
    ).toBe("sent");
    expect(mock).toHaveBeenCalled();
  });
  it("sends complete email receipts through the configured HTTPS adapter", async () => {
    await open({
      emailEnabled: true,
      emailRecipients: ["orders@example.test"],
      emailSender: "orders@example.test",
    });
    await placeOrder(e, order());
    const mock = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(async (_url, init) => {
        expect(String(init?.body)).toContain("UGF-");
        expect(String(init?.body)).toContain("Test Customer");
        return Response.json({ id: "test" });
      });
    await deliver({
      ...e,
      EMAIL_API_URL: "https://email.example.test/send",
      EMAIL_API_TOKEN: "test-only",
    });
    expect(
      (
        await e.DB.prepare(
          "SELECT COUNT(*) AS n FROM outbox WHERE status='sent'",
        ).first<any>()
      ).n,
    ).toBe(2);
    expect(mock).toHaveBeenCalledTimes(2);
  });
  it("sends native Cloudflare email receipts with stable IDs and safe headers", async () => {
    await open({
      emailEnabled: true,
      emailRecipients: ["orders@example.test"],
      emailSender: "orders@example.test",
    });
    await placeOrder(e, order());
    const send = vi.fn().mockResolvedValue({ messageId: "native-test" });
    const fetchMock = vi.spyOn(globalThis, "fetch");
    await deliver({ ...e, ORDER_EMAIL: { send } });
    expect(send).toHaveBeenCalledTimes(2);
    const email = send.mock.calls[0][0];
    expect(email.text).toContain("Test Customer");
    expect(email.text).toContain("10 Test Street");
    expect(email.headers["Message-ID"]).toMatch(
      /^<uniglobe-.*@uniglobeholdings.com>$/,
    );
    expect(fetchMock).not.toHaveBeenCalled();
    await sendReceipt(
      { ...e, ORDER_EMAIL: { send } },
      {
        id: "safe-id",
        from: "orders@example.test",
        to: "customer@example.test",
        subject: "Hello\r\nBcc: invalid",
        text: "Receipt",
      },
    );
    expect(send.mock.calls[2][0].subject).not.toMatch(/[\r\n]/);
  });
  it("recovers interrupted final attempts and prevents overlapping delivery", async () => {
    await open({ telegramEnabled: true, telegramChats: ["12345"] });
    await placeOrder(e, order());
    await e.DB.prepare(
      "UPDATE outbox SET status='sending',attempts=5,lease_until=1",
    ).run();
    await deliver(e);
    expect(
      (await e.DB.prepare("SELECT status FROM outbox").first<any>()).status,
    ).toBe("failed");
    await e.DB.prepare(
      "UPDATE outbox SET status='pending',attempts=0,next_attempt=0",
    ).run();
    const mock = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(async () => Response.json({ ok: true }));
    const transport = { ...e, TELEGRAM_BOT_TOKEN: "test-token" };
    await Promise.all([deliver(transport), deliver(transport)]);
    expect(mock).toHaveBeenCalledTimes(1);
    expect(
      (await e.DB.prepare("SELECT status FROM outbox").first<any>()).status,
    ).toBe("sent");
  });
  it("resumes acknowledged Telegram chunks and respects rate-limit retry timing", async () => {
    await open({
      telegramEnabled: true,
      telegramChats: ["12345"],
      telegramTemplate: "x".repeat(5000) + "{orderDetails}",
    });
    await placeOrder(e, order());
    const mock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(Response.json({ ok: true }))
      .mockResolvedValueOnce(
        Response.json(
          { ok: false, parameters: { retry_after: 600 } },
          { status: 429 },
        ),
      );
    await deliver({ ...e, TELEGRAM_BOT_TOKEN: "test-token" });
    let job = await e.DB.prepare("SELECT * FROM outbox").first<any>();
    expect(job.progress).toBe(1);
    expect(job.status).toBe("retry");
    expect(job.next_attempt).toBeGreaterThan(Date.now() + 590000);
    await e.DB.prepare("UPDATE outbox SET next_attempt=0").run();
    mock.mockResolvedValue(Response.json({ ok: true }));
    await deliver({ ...e, TELEGRAM_BOT_TOKEN: "test-token" });
    expect(mock).toHaveBeenCalledTimes(3);
    expect(JSON.parse(String(mock.mock.calls[2][1]?.body)).text).toBe(
      JSON.parse(String(mock.mock.calls[1][1]?.body)).text,
    );
    job = await e.DB.prepare("SELECT * FROM outbox").first<any>();
    expect(job.status).toBe("sent");
    const unicode = "😀".repeat(3000);
    const chunks = telegramChunks(unicode);
    expect(chunks.join("")).toBe(unicode);
    expect(
      chunks.every(
        (part) =>
          part.length <= 3900 && Array.from(part).every((c) => c === "😀"),
      ),
    ).toBe(true);
  });
  it("deduplicates company/customer destinations without dropping receipts", async () => {
    await open({
      emailEnabled: true,
      emailRecipients: [customer.email, customer.email],
      emailSender: "orders@example.test",
    });
    await placeOrder(e, order());
    expect(
      (await e.DB.prepare("SELECT * FROM outbox").all()).results,
    ).toHaveLength(1);
  });
  it("retains orders when notification transport fails", async () => {
    await open({ telegramEnabled: true, telegramChats: ["12345"] });
    const token = await placeOrder(e, order());
    await deliver(e);
    const job = await e.DB.prepare("SELECT * FROM outbox").first<any>();
    expect(job.status).toBe("retry");
    expect(job.error).toBe("Telegram transport not configured");
    expect(
      await e.DB.prepare("SELECT id FROM orders WHERE token=?")
        .bind(token)
        .first(),
    ).not.toBeNull();
  });
});
describe("admin boundaries", () => {
  it("requires authentication for private APIs", async () => {
    expect((await req("/api/admin/products", "POST", {})).status).toBe(401);
  });
  it("requires CSRF and same-origin for authenticated writes", async () => {
    const u = await user(["products.write"]);
    expect(
      (await req("/api/admin/products", "POST", {}, { ...u, csrf: "wrong" }))
        .status,
    ).toBe(403);
    expect(
      (await req("/api/admin/products", "POST", {}, u, "https://attacker.test"))
        .status,
    ).toBe(403);
  });
  it("enforces server-side permissions and private-page access", async () => {
    const u = await user([]);
    expect((await req("/api/admin/products", "POST", {}, u)).status).toBe(403);
    expect((await req("/admin/orders", "GET", undefined, u)).status).toBe(403);
    expect((await req("/api/admin/media", "POST", {}, u)).status).toBe(403);
  });
  it("lets catalog editors reuse images without granting upload or settings access", async () => {
    const u = await user(["products.write"]);
    const listing = await req("/api/admin/media", "GET", undefined, u);
    expect(listing.status).toBe(200);
    expect(
      ((await listing.json()) as any).items.some(
        (m: any) => m.path === "/assets/holdings-logo-transparent.webp",
      ),
    ).toBe(true);
    expect((await req("/api/admin/media", "POST", {}, u)).status).toBe(403);
    expect(
      (await req("/api/admin/media", "GET", undefined, await user([]))).status,
    ).toBe(403);
  });
  it("requires password and TOTP, then sets a secure HttpOnly session policy", async () => {
    const u = await user();
    const good = {
      username: u.username,
      password: u.password,
      code: totp(u.secret).generate(),
    };
    expect(
      (
        await req("/api/auth/login", "POST", {
          ...good,
          password: "invalid password",
        })
      ).status,
    ).toBe(401);
    const response = await req("/api/auth/login", "POST", good);
    expect(response.status).toBe(200);
    expect(response.headers.get("set-cookie")).toContain("HttpOnly");
    expect(response.headers.get("set-cookie")).toContain("SameSite=Strict");
    expect((await req("/api/auth/login", "POST", good)).status).toBe(401);
  });
  it("protects Main Admin from disable, delete and database demotion", async () => {
    let main = await e.DB.prepare(
      "SELECT id FROM admins WHERE is_main=1",
    ).first<any>();
    if (!main) main = await user([...permissionsForTest], true);
    const actor = await user(["admins.write"]);
    expect(
      (await req("/api/admin/users/" + main.id + "/toggle", "POST", {}, actor))
        .status,
    ).toBe(403);
    expect(
      (await req("/api/admin/users/" + main.id, "DELETE", undefined, actor))
        .status,
    ).toBe(403);
    await expect(
      e.DB.prepare("UPDATE admins SET disabled=1 WHERE id=?")
        .bind(main.id)
        .run(),
    ).rejects.toThrow();
  });
  it("prevents an admin from granting privileges they do not hold", async () => {
    const u = await user(["admins.write", "products.read"]);
    expect(
      (
        await req(
          "/api/admin/users",
          "POST",
          {
            username: "escalation",
            password: "long test password",
            permissions: ["settings.write"],
          },
          u,
        )
      ).status,
    ).toBe(403);
  });
  it("allows product creation and records an audit entry", async () => {
    const u = await user(["products.write"]);
    const p = (await products(e.DB))[0];
    const r = await req(
      "/api/admin/products",
      "POST",
      { ...p, slug: "test-created-" + random(3), visible: false },
      u,
    );
    expect(r.status).toBe(200);
    expect(
      await e.DB.prepare(
        "SELECT id FROM audit WHERE actor=? AND action='product.created'",
      )
        .bind(u.id)
        .first(),
    ).not.toBeNull();
  });
  it("rejects unsafe social links and preserves config on validation failure", async () => {
    const u = await user(["contacts.write"]);
    const before = await record(e.DB, "contacts");
    const r = await req(
      "/api/admin/records/contacts/main",
      "PUT",
      { ...before, socials: [{ label: "Bad", url: "javascript:alert(1)" }] },
      u,
    );
    expect(r.status).toBe(400);
    expect((await record(e.DB, "contacts")).socials).toEqual(before.socials);
  });
  it("does not enable notification channels without server credentials", async () => {
    const u = await user(["settings.write"]);
    const s = await record(e.DB, "ordering");
    expect(
      (
        await req(
          "/api/admin/records/ordering/main",
          "PUT",
          { ...s, telegramEnabled: true, telegramChats: ["12345"] },
          u,
        )
      ).status,
    ).toBe(400);
  });
  it("revokes sessions on logout", async () => {
    const u = await user();
    expect((await req("/api/auth/logout", "POST", {}, u)).status).toBe(303);
    expect((await req("/api/admin/products", "POST", {}, u)).status).toBe(401);
  });
});
describe("configuration and security regression checks", () => {
  it("blocks stale inventory edits after a customer places an order", async () => {
    await open();
    const u = await user(["products.write"]);
    const p = (await products(e.DB))[0];
    await placeOrder(e, order());
    const r = await req("/api/admin/products/" + p.id, "PUT", p, u);
    expect(r.status).toBe(409);
    expect(((await r.json()) as any).error).toContain("stock changed");
  });
  it("shows current stock to admin editors after reservations", async () => {
    await open();
    await e.DB.prepare("UPDATE inventory SET quantity=5 WHERE product_id=?")
      .bind(order().items[0].productId)
      .run();
    await placeOrder(e, order());
    expect(
      (await products(e.DB, true)).find(
        (p) => p.id === order().items[0].productId,
      )!.variants[0].stock,
    ).toBe(4);
  });
  it("prevents deleting products referenced by orders at API and database layers", async () => {
    await open();
    const u = await user(["products.write"]);
    await placeOrder(e, order());
    const id = order().items[0].productId;
    expect(
      (await req("/api/admin/products/" + id, "DELETE", undefined, u)).status,
    ).toBe(409);
    await expect(
      e.DB.prepare("DELETE FROM products WHERE id=?").bind(id).run(),
    ).rejects.toThrow();
  });
  it("allows translation-only updates while blocking branding and links", async () => {
    const u = await user(["translations.write"]);
    const listing = await req("/admin/translations", "GET", undefined, u);
    expect(listing.status).toBe(200);
    expect(await listing.text()).toContain("/admin/translations/about");
    expect(
      (await req("/admin/translations/about", "GET", undefined, u)).status,
    ).toBe(200);
    expect(
      (await req("/admin/content/about", "GET", undefined, u)).status,
    ).toBe(403);
    let content = await record(e.DB, "content", "about");
    expect(
      (
        await req(
          "/api/admin/records/content/about",
          "PUT",
          { ...content, title: { ...content.title, ar: "نص تجريبي" } },
          u,
        )
      ).status,
    ).toBe(200);
    content = await record(e.DB, "content", "about");
    expect(
      (
        await req(
          "/api/admin/records/content/about",
          "PUT",
          { ...content, ctaHref: "https://other.example.test" },
          u,
        )
      ).status,
    ).toBe(403);
  });
  it("paginates orders while retaining search filters", async () => {
    const batch = Array.from({ length: 51 }, (_, i) =>
      e.DB.prepare(
        "INSERT INTO orders(token,idempotency,request_hash,customer,items,total) VALUES(?,?,?,?,?,?)",
      ).bind(
        random(),
        crypto.randomUUID(),
        "test",
        JSON.stringify({ ...customer, name: "Paging customer" }),
        "[]",
        150000,
      ),
    );
    await e.DB.batch(batch);
    const u = await user(["orders.read"]);
    const first = await (
      await req("/admin/orders?q=Paging", "GET", undefined, u)
    ).text();
    expect(first.match(/<td><a href="\/admin\/orders\//g)).toHaveLength(50);
    expect(first).toContain("page=2");
    const second = await (
      await req("/admin/orders?q=Paging&page=2", "GET", undefined, u)
    ).text();
    expect(second.match(/<td><a href="\/admin\/orders\//g)).toHaveLength(1);
    expect(second).toContain("Page 2");
    expect(second).toContain("q=Paging");
  });
  it("uses configured campaign imagery and collaboration destinations", async () => {
    const u = await user(["content.write"]);
    const home = await record(e.DB, "content", "home");
    expect(
      (
        await req(
          "/api/admin/records/content/home",
          "PUT",
          { ...home, image: "/assets/product-4.webp", ctaHref: "/contact" },
          u,
        )
      ).status,
    ).toBe(200);
    const page = await (await req("/")).text();
    expect(page).toContain('src="/assets/product-4.webp"');
    expect(page).toContain('class="button" href="/contact"');
    const work = await record(e.DB, "content", "work");
    expect(
      (
        await req(
          "/api/admin/records/content/work",
          "PUT",
          { ...work, ctaHref: "https://partners.example.test" },
          u,
        )
      ).status,
    ).toBe(200);
    expect(await (await req("/contact")).text()).toContain(
      'href="https://partners.example.test"',
    );
  });
  it("rejects stale configuration writes", async () => {
    const u = await user(["contacts.write"]);
    const contacts = await record(e.DB, "contacts");
    const d = { ...contacts, email: "hello@example.test" };
    expect(
      (await req("/api/admin/records/contacts/main", "PUT", d, u)).status,
    ).toBe(200);
    expect(
      (await req("/api/admin/records/contacts/main", "PUT", d, u)).status,
    ).toBe(409);
  });
  it("escapes stored product copy instead of executing markup", async () => {
    const u = await user(["products.write"]);
    const p = (await products(e.DB))[0];
    const slug = "xss-" + random(4);
    expect(
      (
        await req(
          "/api/admin/products",
          "POST",
          { ...p, slug, name: L("<script>alert(1)</script>"), visible: true },
          u,
        )
      ).status,
    ).toBe(200);
    const html = await (await req("/fashion/products/" + slug)).text();
    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
    expect(html).not.toContain("<script>alert(1)</script>");
  });
  it("rejects image traversal paths", async () => {
    const p = (await products(e.DB))[0];
    expect(
      productSchema.safeParse({ ...p, images: ["/assets/../admin.js"] })
        .success,
    ).toBe(false);
  });
  it("requires authenticated media upload and rejects SVG disguised as PNG", async () => {
    const u = await user(["media.write"]);
    const form = new FormData();
    form.set(
      "file",
      new File(
        [
          '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>',
        ],
        "unsafe.png",
        { type: "image/png" },
      ),
    );
    const r = await app.request(
      "http://localhost/api/admin/media",
      {
        method: "POST",
        headers: {
          Origin: "http://localhost",
          Cookie: "ug_admin=" + u.token,
          "X-CSRF-Token": u.csrf,
        },
        body: form,
      },
      e,
    );
    expect(r.status).toBe(400);
  });
  it("updates order status with validation and records the change", async () => {
    await open();
    const token = await placeOrder(e, order());
    const o = await e.DB.prepare("SELECT id FROM orders WHERE token=?")
      .bind(token)
      .first<any>();
    const u = await user(["orders.write"]);
    expect(
      (
        await req(
          "/api/admin/orders/" + o.id,
          "PUT",
          { version: 1, status: "Invalid", notes: "", archived: false },
          u,
        )
      ).status,
    ).toBe(400);
    expect(
      (
        await req(
          "/api/admin/orders/" + o.id,
          "PUT",
          {
            version: 1,
            status: "Processing",
            notes: "Contacted customer",
            archived: false,
          },
          u,
        )
      ).status,
    ).toBe(200);
    expect(
      (
        await req(
          "/api/admin/orders/" + o.id,
          "PUT",
          { version: 1, status: "Cancelled", notes: "stale", archived: false },
          u,
        )
      ).status,
    ).toBe(409);
    expect(
      (
        await e.DB.prepare("SELECT status,notes FROM orders WHERE id=?")
          .bind(o.id)
          .first<any>()
      ).status,
    ).toBe("Processing");
    expect(
      await e.DB.prepare(
        "SELECT id FROM audit WHERE target=? AND action='order.updated'",
      )
        .bind(String(o.id))
        .first(),
    ).not.toBeNull();
  });
  it("revokes target sessions when their permissions change", async () => {
    const actor = await user(["admins.write", "products.read", "orders.read"]);
    const target = await user(["products.read"]);
    const r = await req(
      "/api/admin/users/" + target.id + "/permissions",
      "PUT",
      { permissions: ["orders.read"] },
      actor,
    );
    expect(r.status).toBe(200);
    expect((await req("/admin", "GET", undefined, target)).status).toBe(302);
  });
  it("changes TOTP only after verifying both existing and replacement authenticators", async () => {
    const u = await user([]);
    const start = await req(
      "/api/admin/totp/start",
      "POST",
      { password: u.password, code: totp(u.secret).generate() },
      u,
    );
    expect(start.status).toBe(200);
    const d = (await start.json()) as any;
    expect(
      (await req("/api/admin/totp/confirm", "POST", { code: "bad" }, u)).status,
    ).toBe(400);
    const confirm = await req(
      "/api/admin/totp/confirm",
      "POST",
      { code: totp(d.secret).generate() },
      u,
    );
    expect(confirm.status).toBe(200);
    const row = await e.DB.prepare("SELECT totp FROM admins WHERE id=?")
      .bind(u.id)
      .first<any>();
    expect(await decrypt(row.totp, e.AUTH_KEY)).toBe(d.secret);
    expect((await req("/admin", "GET", undefined, u)).status).toBe(302);
  });
  it("does not permit enabling Turnstile without its server-side configuration", async () => {
    const u = await user(["settings.write"]);
    const settings = await record(e.DB, "ordering");
    expect(
      (
        await req(
          "/api/admin/records/ordering/main",
          "PUT",
          { ...settings, turnstileEnabled: true },
          u,
        )
      ).status,
    ).toBe(400);
  });
  it("enforces account throttling against repeated failed logins", async () => {
    const u = await user();
    for (let i = 0; i < 8; i++)
      expect(
        (
          await req("/api/auth/login", "POST", {
            username: u.username,
            password: "wrong-long-password",
            code: "123456",
          })
        ).status,
      ).toBe(401);
    expect(
      (
        await req("/api/auth/login", "POST", {
          username: u.username,
          password: u.password,
          code: totp(u.secret).generate(),
        })
      ).status,
    ).toBe(429);
  });
});
const permissionsForTest = [
  "products.read",
  "products.write",
  "orders.read",
  "orders.write",
  "content.write",
  "media.write",
  "branding.write",
  "contacts.write",
  "translations.write",
  "admins.write",
  "settings.write",
  "audit.read",
];

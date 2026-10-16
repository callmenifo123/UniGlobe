import { env } from "cloudflare:test";
import { describe, it, expect } from "vitest";
import { app } from "../src/index";
import { type Env, products, productSchema, record, L } from "../src/model";
import { entries, activeBadges, deliveryQuote } from "../src/commerce";
import { capabilities } from "../src/permissions";
import { random, hash, passwordHash, encrypt, newTotp } from "../src/security";
import { placeOrder } from "../src/orders";
const e = env as unknown as Env;
async function user(perms = capabilities) {
  const id = crypto.randomUUID(),
    token = random(),
    csrf = random();
  await e.DB.prepare(
    "INSERT INTO admins(id,username,password_hash,totp,permissions) VALUES(?,?,?,?,?)",
  )
    .bind(
      id,
      "commerce-" + id,
      await passwordHash(random()),
      await encrypt(newTotp(), e.AUTH_KEY),
      JSON.stringify(perms),
    )
    .run();
  await e.DB.prepare(
    "INSERT INTO sessions(token_hash,admin_id,csrf,expires_at,created_at) VALUES(?,?,?,?,?)",
  )
    .bind(await hash(token), id, csrf, Date.now() + 3600000, Date.now())
    .run();
  return { id, token, csrf };
}
async function api(path: string, method = "GET", body?: any, u?: any) {
  return app.request(
    "http://localhost" + path,
    {
      method,
      headers: {
        Origin: "http://localhost",
        "Content-Type": "application/json",
        ...(u ? { Cookie: "ug_admin=" + u.token, "X-CSRF-Token": u.csrf } : {}),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    },
    e,
  );
}
async function tax(u: any, kind = "collections", extra: any = {}) {
  const id = "custom-" + random(4),
    r = await api(
      "/api/admin/records/" + kind + "/new",
      "PUT",
      {
        id,
        name: { ...L("Studio collection"), ar: "مجموعة الاستوديو" },
        description: L("An intentional edit"),
        priority: 20,
        ...extra,
      },
      u,
    );
  expect(r.status).toBe(200);
  return id;
}
async function product(u: any, extra: any = {}) {
  const template = (await products(e.DB))[0],
    slug = "piece-" + random(4),
    data = productSchema.parse({
      ...template,
      name: L("Studio tee"),
      slug,
      placeholder: false,
      category: "",
      collection: "",
      collections: [],
      price: 20000,
      salePrice: null,
      variants: [
        {
          id: "black-m",
          size: "M",
          color: "Black",
          sku: "TEST-M",
          stock: 8,
          available: true,
          price: 23000,
        },
      ],
      ...extra,
    });
  const r = await api("/api/admin/products", "POST", data, u);
  expect(r.status).toBe(200);
  return (await products(e.DB)).find((p) => p.slug === slug)!;
}
describe("Merchandising and store persistence", () => {
  it("persists localized custom categories and multiple collection membership with ordered visible landing pages", async () => {
    const u = await user(),
      cat = await tax(u, "categories", { priority: -30 }),
      a = await tax(u),
      b = await tax(u, "collections", { priority: -20 });
    const p = await product(u, { category: cat, collections: [a, b] });
    expect(
      (await products(e.DB)).find((x) => x.id === p.id)?.collections,
    ).toEqual([a, b]);
    for (const id of [a, b]) {
      const r = await api("/fashion/collections/" + id + "?lang=ar");
      expect(r.status).toBe(200);
      expect(await r.text()).toContain("مجموعة الاستوديو");
    }
    const all = await entries(e.DB, "collections", true);
    expect(all.findIndex((x) => x.id === b)).toBeLessThan(
      all.findIndex((x) => x.id === a),
    );
    expect(
      (await api("/api/admin/records/collections/" + a, "DELETE", undefined, u))
        .status,
    ).toBe(409);
    const row = await record(e.DB, "collections", a);
    await api(
      "/api/admin/records/collections/" + a,
      "PUT",
      { ...row, visible: false },
      u,
    );
    expect((await api("/fashion/collections/" + a)).status).toBe(404);
    expect((await api("/sitemap.xml")).status).toBe(200);
  });
  it("supports taxonomy archive and safe deletion with duplicate slug prevention", async () => {
    const u = await user(),
      id = await tax(u, "categories", { slug: "unique-" + random(4) }),
      r = await record(e.DB, "categories", id);
    expect(
      (
        await api(
          "/api/admin/records/categories/new",
          "PUT",
          { ...r, id: "other-" + random(4) },
          u,
        )
      ).status,
    ).toBe(409);
    expect(
      (
        await api(
          "/api/admin/records/categories/" + id,
          "PUT",
          { ...r, archived: true },
          u,
        )
      ).status,
    ).toBe(200);
    expect(
      (await entries(e.DB, "categories", true)).some((x) => x.id === id),
    ).toBe(false);
    expect(
      (await api("/api/admin/records/categories/" + id, "DELETE", undefined, u))
        .status,
    ).toBe(200);
  });
  it("persists badges and enforces schedules and placements in the live renderer", async () => {
    const u = await user(),
      id = "badge-" + random(4);
    expect(
      (
        await api(
          "/api/admin/records/badges/new",
          "PUT",
          {
            id,
            name: { ...L("Exclusive"), ar: "حصري" },
            style: "premium",
            enabled: true,
            priority: 0,
          },
          u,
        )
      ).status,
    ).toBe(200);
    const p = await product(u, {
      badges: [
        {
          id,
          priority: 1,
          enabled: true,
          card: true,
          page: false,
          start: "2020-01-01T00:00:00Z",
          end: "2099-01-01T00:00:00Z",
        },
      ],
    });
    const defs = await entries(e.DB, "badges", true);
    expect(activeBadges(p, defs, "card")).toHaveLength(1);
    expect(activeBadges(p, defs, "page")).toHaveLength(0);
    expect(
      activeBadges(p, defs, "card", Date.parse("2100-01-01")),
    ).toHaveLength(0);
    expect(await (await api("/fashion/shop?lang=ar")).text()).toContain("حصري");
    expect(
      (await api("/api/admin/records/badges/" + id, "DELETE", undefined, u))
        .status,
    ).toBe(409);
  });
  it("renders persisted curated homepage content and validates safe section layouts", async () => {
    const u = await user(),
      p = await product(u),
      id = "section-" + random(4);
    const r = await api(
      "/api/admin/records/sections/new",
      "PUT",
      {
        id,
        type: "product-spotlight",
        title: { ...L("The studio spotlight"), ar: "اختيارات الاستوديو" },
        products: [p.id],
        visible: true,
        priority: -20,
      },
      u,
    );
    expect(r.status).toBe(200);
    const html = await (await api("/fashion?lang=ar")).text();
    expect(html).toContain("اختيارات الاستوديو");
    expect(html).toContain(p.slug);
    const row = await record(e.DB, "sections", id);
    expect(
      (
        await api(
          "/api/admin/records/sections/" + id,
          "PUT",
          { ...row, type: "arbitrary-script" },
          u,
        )
      ).status,
    ).toBe(400);
  });
  it("respects inventory, deletion, merchandising and customer permissions separately", async () => {
    const owner = await user(),
      p = await product(owner),
      editor = await user(["products.write", "products.read"]);
    expect(
      (
        await api(
          "/api/admin/products/" + p.id,
          "PUT",
          { ...p, variants: p.variants.map((v) => ({ ...v, stock: 9 })) },
          editor,
        )
      ).status,
    ).toBe(403);
    expect(
      (await api("/api/admin/products/" + p.id, "DELETE", undefined, editor))
        .status,
    ).toBe(403);
    expect(
      (await api("/api/admin/records/sections/new", "PUT", {}, editor)).status,
    ).toBe(403);
    expect(
      (
        await api(
          "/api/admin/products/" + p.id,
          "PUT",
          { ...p, name: L("Renamed piece") },
          editor,
        )
      ).status,
    ).toBe(200);
  });
  it("calculates region precedence and free-delivery thresholds without invented fees", () => {
    const rules = [
      {
        id: "country",
        country: "LK",
        region: "",
        fee: 500,
        freeAbove: null,
        enabled: true,
        priority: 0,
      },
      {
        id: "region",
        country: "LK",
        region: "Colombo",
        fee: 200,
        freeAbove: 10000,
        enabled: true,
        priority: 10,
      },
    ];
    expect(deliveryQuote(rules, "LK", "colombo", 9000)?.fee).toBe(200);
    expect(deliveryQuote(rules, "LK", "Colombo", 10000)?.fee).toBe(0);
    expect(deliveryQuote(rules, "LK", "Galle", 9000)?.fee).toBe(500);
    expect(deliveryQuote(rules, "SA", "", 9000)).toBeNull();
  });
  it("persists variant price/SKU, delivery and immutable order snapshots with attributed status history", async () => {
    const u = await user(),
      p = await product(u),
      settings = await record(e.DB, "ordering");
    await e.DB.prepare(
      "UPDATE records SET data=? WHERE kind='ordering' AND id='main'",
    )
      .bind(
        JSON.stringify({
          ...settings,
          enabled: true,
          emailEnabled: false,
          telegramEnabled: false,
        }),
      )
      .run();
    const rule = "delivery-" + random(4);
    expect(
      (
        await api(
          "/api/admin/records/delivery/new",
          "PUT",
          {
            id: rule,
            name: "Configured delivery",
            country: "LK",
            region: "Colombo",
            fee: 700,
            freeAbove: 100000,
            enabled: true,
            priority: -100,
          },
          u,
        )
      ).status,
    ).toBe(200);
    const token = await placeOrder(e, {
      key: crypto.randomUUID(),
      items: [{ productId: p.id, variantId: "black-m", quantity: 2 }],
      customer: {
        name: "Test Customer",
        phone: "+94771234567",
        email: "customer@example.test",
        address: "123 Test Street",
        city: "Colombo",
        region: "Colombo",
        country: "LK",
      },
    });
    const o = await e.DB.prepare("SELECT * FROM orders WHERE token=?")
      .bind(token)
      .first<any>();
    expect(o.total).toBe(46700);
    expect(o.subtotal).toBe(46000);
    expect(o.delivery_fee).toBe(700);
    expect(JSON.parse(o.items)[0]).toMatchObject({
      price: 23000,
      sku: "TEST-M",
      quantity: 2,
    });
    await api(
      "/api/admin/products/" + p.id,
      "PUT",
      { ...(await products(e.DB)).find((x) => x.id === p.id), price: 50000 },
      u,
    );
    expect(
      JSON.parse(
        (
          await e.DB.prepare("SELECT items FROM orders WHERE token=?")
            .bind(token)
            .first<any>()
        ).items,
      )[0].price,
    ).toBe(23000);
    expect(
      (
        await api(
          "/api/admin/orders/" + o.id,
          "PUT",
          {
            version: o.version,
            status: "Confirmed",
            notes: "Confirmed by team",
            archived: false,
          },
          u,
        )
      ).status,
    ).toBe(200);
    expect(
      await e.DB.prepare(
        "SELECT actor,status FROM order_history WHERE order_id=? AND status='Confirmed'",
      )
        .bind(o.id)
        .first(),
    ).toEqual({ actor: u.id, status: "Confirmed" });
    const restricted = await user(["orders.read"]);
    expect(
      await (
        await api("/admin/orders/" + o.id, "GET", undefined, restricted)
      ).text(),
    ).not.toContain("customer@example.test");
  });
});

it("allows a translator to change product/section language content without price or inventory access", async () => {
  const owner = await user(),
    p = await product(owner),
    translator = await user(["translations.write"]);
  const r = await api(
    "/api/admin/translations/products/" + p.id,
    "PUT",
    {
      version: p.version,
      fields: { name: { ...p.name, ar: "قميص الاستوديو" } },
    },
    translator,
  );
  expect(r.status).toBe(200);
  const updated = (await products(e.DB)).find((x) => x.id === p.id)!;
  expect(updated.name.ar).toBe("قميص الاستوديو");
  expect(updated.price).toBe(p.price);
  expect(updated.variants[0].stock).toBe(8);
  expect(
    (
      await api(
        "/api/admin/translations/products/" + p.id,
        "PUT",
        { version: updated.version, fields: { currency: L("USD") } },
        translator,
      )
    ).status,
  ).toBe(403);
  expect(
    await (
      await api("/admin/translations", "GET", undefined, translator)
    ).text(),
  ).toContain("kind=products");
});

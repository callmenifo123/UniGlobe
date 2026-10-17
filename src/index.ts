import { entries, member, activeBadges, deliveryQuote } from "./commerce";
import { curatedFashion } from "./fashion";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { bodyLimit } from "hono/body-limit";
import { getCookie, setCookie } from "hono/cookie";
import { html, raw } from "hono/html";
import { ZodError } from "zod";
import {
  type Env,
  type Locale,
  locales,
  text,
  record,
  products,
  whatsappLink,
} from "./model";
import { rate } from "./security";
import { placeOrder } from "./orders";
import { deliver } from "./notifications";
import { admin } from "./admin";
import {
  shell,
  holdingsLogo,
  home,
  fashion,
  listing,
  detail,
  bagPage,
  checkoutPage,
  confirmation,
  contentPage,
  escape,
} from "./ui";
const app = new Hono<{ Bindings: Env; Variables: { lang: Locale } }>();
app.use("/api/*", (c, next) =>
  bodyLimit({
    maxSize: c.req.path === "/api/admin/media" ? 9 * 1024 * 1024 : 200000,
    onError: (c) => c.json({ error: "Request too large" }, 413),
  })(c, next),
);
app.use("*", async (c, next) => {
  c.header("X-Content-Type-Options", "nosniff");
  c.header("Referrer-Policy", "same-origin");
  c.header("X-Frame-Options", "DENY");
  c.header("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  c.header(
    "Content-Security-Policy",
    "default-src 'self'; script-src 'self' https://challenges.cloudflare.com; frame-src https://challenges.cloudflare.com; style-src 'self'; img-src 'self' data:; connect-src 'self' https://challenges.cloudflare.com; font-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'; object-src 'none'",
  );
  if (new URL(c.req.url).protocol === "https:")
    c.header("Strict-Transport-Security", "max-age=31536000");
  const len = Number(c.req.header("Content-Length") || 0);
  if (len > 9 * 1024 * 1024) return c.json({ error: "Request too large" }, 413);
  if (
    c.req.path.startsWith("/api/") &&
    !c.req.path.endsWith("/media") &&
    len > 100000
  )
    return c.json({ error: "Request too large" }, 413);
  const chosen = c.req.query("lang");
  const l = (chosen || getCookie(c, "ug_lang") || "en") as Locale;
  c.set("lang", locales.includes(l) ? l : "en");
  if (chosen && locales.includes(chosen as Locale))
    setCookie(c, "ug_lang", chosen, {
      path: "/",
      sameSite: "Lax",
      maxAge: 31536000,
      secure: new URL(c.req.url).protocol === "https:",
    });
  await next();
});
app.onError((e, c) => {
  if (e instanceof HTTPException) return c.json({ error: e.message }, e.status);
  if (e instanceof ZodError)
    return c.json(
      {
        error: e.issues
          .map((i) => `${i.path.join(".")}: ${i.message}`)
          .join("; "),
      },
      400,
    );
  console.error("Request failed:", e.name);
  return c.json(
    { error: "The request could not be completed. Please try again." },
    500,
  );
});
app.get("/style.css", (c) => c.env.ASSETS.fetch(c.req.raw));
app.get("/store.js", (c) => c.env.ASSETS.fetch(c.req.raw));
app.get("/admin.js", (c) => c.env.ASSETS.fetch(c.req.raw));
app.get("/favicon.ico", (c) => c.env.ASSETS.fetch(c.req.raw));
app.get("/assets/*", (c) => c.env.ASSETS.fetch(c.req.raw));
app.get("/media/:id", async (c) => {
  const id = c.req.param("id");
  if (!/^[a-f0-9]{40}\.(jpg|png|webp)$/.test(id)) return c.notFound();
  const object = await c.env.MEDIA.get(id);
  if (!object) return c.notFound();
  return new Response(object.body, {
    headers: {
      "Content-Type":
        object.httpMetadata?.contentType || "application/octet-stream",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'",
      "Cache-Control": "public,max-age=31536000,immutable",
      ETag: object.httpEtag,
    },
  });
});
app.route("/", admin);
// The admin app only matches its explicit routes; all other routes continue below.
app.get("/api/catalog", async (c) => {
  const list = await products(c.env.DB);
  const ordering = await record(c.env.DB, "ordering");
  c.header("Cache-Control", "no-store");
  return c.json({
    products: list,
    currency: ordering?.currency || "LKR",
    orderingEnabled: !!ordering?.enabled,
    deliveryRules: await entries(c.env.DB, "delivery", true),
  });
});
app.post("/api/orders", async (c) => {
  if (c.req.header("Origin") !== new URL(c.req.url).origin)
    return c.json({ error: "Untrusted request origin" }, 403);
  if (
    !(await rate(
      c.env.DB,
      "checkout:" + (c.req.header("CF-Connecting-IP") || "local"),
      12,
      3600,
    ))
  )
    return c.json(
      { error: "Too many checkout attempts. Please try again later." },
      429,
    );
  try {
    const body = await c.req.json();
    const config = await record(c.env.DB, "ordering");
    if (config.turnstileEnabled) {
      if (
        !c.env.TURNSTILE_SECRET_KEY ||
        typeof body.turnstileToken !== "string"
      )
        return c.json({ error: "Please complete the security check" }, 400);
      const verification = await fetch(
        "https://challenges.cloudflare.com/turnstile/v0/siteverify",
        {
          method: "POST",
          body: new URLSearchParams({
            secret: c.env.TURNSTILE_SECRET_KEY,
            response: body.turnstileToken,
            remoteip: c.req.header("CF-Connecting-IP") || "",
          }),
          signal: AbortSignal.timeout(10000),
        },
      );
      const result = (await verification.json()) as any;
      if (!result.success || result.hostname !== new URL(c.req.url).hostname)
        return c.json({ error: "Security check failed. Please retry." }, 400);
    }
    const token = await placeOrder(c.env, body);
    c.executionCtx.waitUntil(deliver(c.env));
    return c.json({ ok: true, url: "/orders/" + token }, 201);
  } catch (e) {
    if (e instanceof ZodError) throw e;
    return c.json(
      { error: e instanceof Error ? e.message : "Could not place order" },
      409,
    );
  }
});
app.get("/robots.txt", (c) =>
  c.text(
    `User-agent: *\n${new URL(c.req.url).hostname === c.env.ADMIN_HOST ? "Disallow: /" : "Allow: /\nDisallow: /admin\nDisallow: /api\nDisallow: /orders/\nDisallow: /checkout\nDisallow: /bag"}\nSitemap: ${c.env.SITE_URL}/sitemap.xml\n`,
  ),
);
app.get("/sitemap.xml", async (c) => {
  const list = await products(c.env.DB);
  const paths = [
    "/",
    "/fashion",
    "/fashion/shop",
    "/about",
    "/contact",
    "/real-estate",
    "/academy",
    ...list.map((p) => "/fashion/products/" + p.slug),
    ...[
      ...(await entries(c.env.DB, "categories", true)),
      ...(await entries(c.env.DB, "collections", true)),
    ].map((t) => "/fashion/" + t.kind + "/" + (t.slug || t.id)),
  ];
  return c.body(
    `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${paths.map((p) => `<url><loc>${escape(c.env.SITE_URL + p)}</loc></url>`).join("")}</urlset>`,
    200,
    { "Content-Type": "application/xml" },
  );
});
app.get("*", async (c) => {
  const path = c.req.path,
    l = c.get("lang");
  const hostname = new URL(c.req.url).hostname;
  if (hostname === c.env.ADMIN_HOST) return c.redirect("/admin");
  const [branding, contacts, footer] = await Promise.all([
    record(c.env.DB, "branding"),
    record(c.env.DB, "contacts"),
    record(c.env.DB, "content", "footer"),
  ]);
  let body: any,
    title = "UniGlobe Holdings",
    description = "",
    image = "",
    page = "",
    structured: any = null;
  const contentId =
    path === "/"
      ? "home"
      : path === "/fashion"
        ? "fashion"
        : path === "/fashion/shop"
          ? "catalog"
          : path.slice(1);
  const content = await record(c.env.DB, "content", contentId);
  if (content) {
    title = text(content.seoTitle, l) || text(content.title, l);
    description = text(content.seoDescription, l);
    image = content.image ? c.env.SITE_URL + content.image : "";
  }
  if (path === "/") {
    body = home(
      content,
      l,
      branding,
      await Promise.all(
        ["fashion", "real-estate", "academy"].map((id) =>
          record(c.env.DB, "content", id),
        ),
      ),
    );
    structured = {
      "@context": "https://schema.org",
      "@type": "Organization",
      name: branding.companyName,
      url: c.env.SITE_URL,
      logo: c.env.SITE_URL + holdingsLogo(branding.holdingsLogo),
    };
  } else if (path === "/fashion") {
    page = "fashion";
    const list = await products(c.env.DB),
      badges = await entries(c.env.DB, "badges", true);
    list.forEach(
      (p) => ((p as any).displayBadges = activeBadges(p, badges, "card")),
    );
    body = curatedFashion(
      await entries(c.env.DB, "sections", true),
      list,
      [
        ...(await entries(c.env.DB, "categories", true)),
        ...(await entries(c.env.DB, "collections", true)),
      ],
      l,
    );
  } else if (
    path === "/fashion/shop" ||
    /^\/fashion\/(categories|collections)\/[^/]+$/.test(path)
  ) {
    page = "fashion";
    title = text(content?.seoTitle, l) || "Collection · UniGlobe Fashion";
    const q = c.req.query();
    let landing: any = null;
    if (path !== "/fashion/shop") {
      const [, , kind, slug] = path.split("/");
      landing = (await entries(c.env.DB, kind, true)).find(
        (t) => (t.slug || t.id) === slug,
      );
      if (!landing) return c.notFound();
      q[kind === "categories" ? "category" : "collection"] = landing.id;
      title = text(landing.seoTitle, l) || text(landing.name, l);
      description =
        text(landing.seoDescription, l) || text(landing.description, l);
      image = landing.hero || landing.cover || "";
    }
    let list = await products(c.env.DB);
    const badges = await entries(c.env.DB, "badges", true);
    list.forEach(
      (p) => ((p as any).displayBadges = activeBadges(p, badges, "card")),
    );
    if (q.q)
      list = list.filter((p) =>
        text(p.name, l).toLowerCase().includes(q.q.toLowerCase()),
      );
    if (q.category) list = list.filter((p) => p.category === q.category);
    if (q.collection) list = list.filter((p) => member(p, q.collection));
    if (q.availability === "available")
      list = list.filter((p) =>
        p.variants.some((v) => v.available && v.stock !== 0),
      );
    if (q.availability === "sold-out")
      list = list.filter((p) =>
        p.variants.every((v) => !v.available || v.stock === 0),
      );
    if (q.sort === "price-asc")
      list.sort((a, b) => (a.salePrice ?? a.price) - (b.salePrice ?? b.price));
    if (q.sort === "price-desc")
      list.sort((a, b) => (b.salePrice ?? b.price) - (a.salePrice ?? a.price));
    if (q.sort === "name")
      list.sort((a, b) => text(a.name, l).localeCompare(text(b.name, l)));
    const tax = [
      ...(await entries(c.env.DB, "categories", true)),
      ...(await entries(c.env.DB, "collections", true)),
    ];
    body = listing(
      list,
      l,
      tax.sort((a, b) => a.priority - b.priority),
      q,
      landing
        ? {
            ...landing,
            title: landing.name,
            intro: landing.description,
            eyebrow: content?.eyebrow,
            image: landing.hero || landing.cover,
          }
        : content,
    );
  } else if (path.startsWith("/fashion/products/")) {
    page = "fashion";
    const list = await products(c.env.DB),
      p = list.find((p) => p.slug === path.split("/")[3]);
    if (!p) return c.notFound();
    title = text(p.seoTitle, l) || text(p.name, l);
    description = text(p.seoDescription, l) || text(p.shortDescription, l);
    image = p.images[0] ? c.env.SITE_URL + p.images[0] : "";
    const badges = await entries(c.env.DB, "badges", true);
    (p as any).pageBadges = activeBadges(p, badges, "page");
    list.forEach(
      (p) => ((p as any).displayBadges = activeBadges(p, badges, "card")),
    );
    body = detail(
      p,
      l,
      list.filter((x) => x.id !== p.id),
      await record(c.env.DB, "ordering"),
    );
    structured = {
      "@context": "https://schema.org",
      "@type": "Product",
      name: text(p.name, l),
      description,
      image: p.images.map((x) => c.env.SITE_URL + x),
      offers: {
        "@type": "Offer",
        priceCurrency: p.currency,
        price:
          (p.variants.find((v) => v.available && v.stock !== 0)?.price ??
            p.salePrice ??
            p.price) / 100,
        url: c.env.SITE_URL + path,
        availability: !p.variants.some((v) => v.available && v.stock !== 0)
          ? "https://schema.org/OutOfStock"
          : p.variants.some(
                (v) => v.available && v.stock !== null && v.stock > 0,
              ) && !p.placeholder
            ? "https://schema.org/InStock"
            : "https://schema.org/PreOrder",
      },
    };
  } else if (path === "/bag") {
    page = "fashion";
    body = bagPage(l, await record(c.env.DB, "ordering"));
    title = "Your bag · UniGlobe Fashion";
    c.header("X-Robots-Tag", "noindex");
  } else if (path === "/checkout") {
    page = "fashion";
    body = checkoutPage(
      l,
      await record(c.env.DB, "ordering"),
      c.env.TURNSTILE_SITE_KEY,
    );
    title = "Checkout · UniGlobe Fashion";
    c.header("X-Robots-Tag", "noindex");
  } else if (path.startsWith("/orders/")) {
    c.header("Cache-Control", "no-store");
    c.header("X-Robots-Tag", "noindex,nofollow");
    c.header("Referrer-Policy", "no-referrer");
    const token = path.split("/")[2];
    if (!/^[a-f0-9]{64}$/.test(token)) return c.notFound();
    const row = await c.env.DB.prepare("SELECT * FROM orders WHERE token=?")
      .bind(token)
      .first<any>();
    if (!row) return c.notFound();
    const o = {
      ...row,
      customer: JSON.parse(row.customer),
      items: JSON.parse(row.items),
    };
    const s = await record(c.env.DB, "ordering");
    body = confirmation(
      o,
      s,
      s.whatsappEnabled && s.whatsappNumber
        ? whatsappLink(s.whatsappNumber, o)
        : "",
      l,
    );
    title = `Order received · UGF-${o.id}`;
  } else if (
    ["about", "contact", "real-estate", "academy"].includes(contentId) &&
    content
  )
    body = contentPage(
      contentId,
      content,
      await record(c.env.DB, "content", "work"),
      contacts,
      l,
    );
  else
    return c.html(
      shell(
        "Page not found",
        html`<main id="main" class="wrap content-intro">
          <div class="eyebrow">404</div>
          <h1>A different direction.</h1>
          <p>This page could not be found.</p>
          <a class="button" href="/">Back to UniGlobe ↗</a>
        </main>`,
        { lang: l, branding, contacts },
      ),
      404,
    );
  // JSON-LD is inert data, escaped to prevent closing-script injection.
  return c.html(
    shell(
      title,
      html`${body}${
        structured
          ? html`<script type="application/ld+json">
              ${raw(JSON.stringify(structured).replace(/</g, "\\u003c"))}
            </script>`
          : ""
      }`,
      {
        lang: l,
        page,
        branding,
        contacts,
        footer,
        description,
        image,
        canonical: path.startsWith("/orders/")
          ? ""
          : c.env.SITE_URL +
            path +
            (l === "en" || ["/bag", "/checkout"].includes(path)
              ? ""
              : "?lang=" + l),
      },
    ),
  );
});
export default {
  fetch: app.fetch,
  scheduled: (_event: ScheduledEvent, env: Env, ctx: ExecutionContext) =>
    ctx.waitUntil(deliver(env)),
};
export { app };

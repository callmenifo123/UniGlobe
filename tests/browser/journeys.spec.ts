import { test, expect, request as playwrightRequest } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { readFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import * as OTPAuth from "otpauth";
test.describe.configure({ mode: "serial" });
let cookies: any[] = [];
let csrf = "";
let ownerId = "";
let receipt = "";
const base = "http://127.0.0.1:8788";
const password = randomBytes(20).toString("hex");
test.beforeAll(async () => {
  const api = await playwrightRequest.newContext({
    baseURL: base,
    extraHTTPHeaders: { Origin: base },
  });
  const setup = await api.get("/admin/setup");
  expect(setup.status()).toBe(200);
  const html = await setup.text();
  const secret = html.match(/name="secret"\s+value="([A-Z2-7]+)"/)![1];
  const bootstrap = readFileSync(".dev.vars", "utf8")
    .match(/^BOOTSTRAP_TOKEN=(.*)$/m)![1]
    .trim();
  const otp = new OTPAuth.TOTP({ secret: OTPAuth.Secret.fromBase32(secret) });
  const result = await api.post("/api/auth/setup", {
    data: {
      username: "browser-owner",
      password,
      secret,
      bootstrap,
      code: otp.generate(),
    },
  });
  expect(result.status()).toBe(200);
  cookies = (await api.storageState()).cookies;
  const dashboard = await api.get("/admin");
  csrf = (await dashboard.text()).match(
    /name="csrf-token" content="([a-f0-9]+)"/,
  )![1];
  await api.dispose();
});
test("public pages, official branding, mobile and four language directions", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  for (const path of [
    "/",
    "/fashion",
    "/about",
    "/contact",
    "/real-estate",
    "/academy",
  ]) {
    await page.goto(path);
    await expect(page.locator("main h1")).toBeVisible();
    await expect(page.locator(".site-header img")).toBeVisible();
  }
  await page.setViewportSize({ width: 390, height: 844 });
  for (const lang of ["en", "ar", "si", "ta"]) {
    await page.goto("/fashion?lang=" + lang);
    await expect(page.locator("html")).toHaveAttribute("lang", lang);
    await expect(page.locator("html")).toHaveAttribute(
      "dir",
      lang === "ar" ? "rtl" : "ltr",
    );
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
    ).toBe(true);
  }
  expect(errors).toEqual([]);
});
test("catalog filtering, product selection and persistent bag", async ({
  page,
}) => {
  await page.goto("/fashion/shop");
  await page.getByLabel("Search", { exact: true }).fill("Forever");
  await page.getByRole("button", { name: "Apply" }).click();
  await expect(page.locator(".product-card")).toHaveCount(1);
  await page.getByRole("link", { name: "Forever tee", exact: true }).click();
  await page.getByRole("button", { name: "Add to bag" }).click();
  await expect(page.locator("[data-bag-count]")).toHaveText("1");
  await page.goto("/bag");
  await expect(page.locator(".bag-item")).toHaveCount(1);
  await page.locator("[data-quantity]").fill("2");
  await page.locator("[data-quantity]").dispatchEvent("change");
  await expect(page.locator("[data-bag-count]")).toHaveText("2");
  await page.reload();
  await expect(page.locator("[data-quantity]")).toHaveValue("2");
  await page.getByRole("button", { name: "Remove", exact: true }).click();
  await expect(page.getByText("Your bag is currently empty.")).toBeVisible();
});
test("admin edits a product, translations and display settings without code changes", async ({
  page,
  context,
}) => {
  await context.addCookies(cookies);
  await page.goto("/admin/products");
  await page.getByRole("link", { name: "Add product +" }).click();
  await page.locator('[name="name.en"]').fill("Browser Test Tee");
  await page.locator('[name="name.ar"]').fill("قميص تجريبي");
  await page.locator('[name="slug"]').fill("browser-test-tee");
  await page.locator('[name="visible"]').check();
  await page.locator('[name="images"]').fill("/assets/product-4.webp");
  await page.getByRole("button", { name: "Save product", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Edit product" }),
  ).toBeVisible();
  await page.goto("/fashion/products/browser-test-tee?lang=ar");
  await expect(page.locator("h1")).toHaveText("قميص تجريبي");
  await page.goto("/admin/content/about");
  await page.locator('[name="title.ar"]').fill("عالم يفتح آفاقاً جديدة");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.locator(".save-status")).toHaveText("Saved successfully");
  await page.goto("/about?lang=ar");
  await expect(page.locator("h1")).toHaveText("عالم يفتح آفاقاً جديدة");
});
test("admin safely uploads an optimized image", async ({ page, context }) => {
  await context.addCookies(cookies);
  await page.goto("/admin/media");
  await page
    .locator("input[type=file]")
    .setInputFiles("UniGlobe/Product2.jpeg");
  await page.getByRole("button", { name: "Upload image" }).click();
  await expect(page.locator('.media-grid input[value^="/media/"]')).toHaveCount(
    1,
  );
  const path = await page
    .locator('.media-grid input[value^="/media/"]')
    .inputValue();
  const response = await page.request.get(path);
  expect(response.headers()["content-type"]).toBe("image/webp");
});
test("admin reuses media visually and saves branding without copying paths", async ({
  page,
  context,
}) => {
  await context.addCookies(cookies);
  await page.goto("/admin/branding");
  const logo = page.locator('input[name="holdingsLogo"]');
  await logo.locator("xpath=following-sibling::button[1]").click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.screenshot({
    path: "test-results/visual/media-picker.png",
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "UniGlobe Holdings · transparent logo" })
    .click();
  await expect(logo).toHaveValue("/assets/holdings-logo-transparent.webp");
  await expect(page.getByRole("dialog")).not.toBeVisible();
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.locator(".save-status")).toHaveText("Saved successfully");
});
test("bag localizes controls and tolerates malformed or unavailable storage", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/fashion/products/forever-tee?lang=en");
  await page.evaluate(() => localStorage.setItem("ug-bag", "[null,{}]"));
  await page.reload();
  await page.getByRole("button", { name: "Add to bag" }).click();
  await page.goto("/bag?lang=ar");
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
  await expect(
    page.getByRole("button", { name: "إزالة", exact: true }),
  ).toBeVisible();
  await expect(page.getByLabel(/الكمية/)).toHaveValue("1");
  await page.addInitScript(() => {
    Object.defineProperty(window, "localStorage", {
      get() {
        throw new DOMException("Blocked", "SecurityError");
      },
    });
  });
  await page.goto("/fashion?lang=en");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await page.locator(".language select").selectOption("ta");
  await expect(page.locator("html")).toHaveAttribute("lang", "ta");
  expect(errors).toEqual([]);
});
test("admin opens local ordering; customer completes checkout before optional WhatsApp", async ({
  page,
  context,
}) => {
  await context.addCookies(cookies);
  await page.goto("/admin/ordering");
  await page.locator('[name="enabled"]').check();
  await page.locator('[name="whatsappEnabled"]').check();
  await page.locator('[name="whatsappNumber"]').fill("94771234567");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.locator(".save-status")).toHaveText("Saved successfully");
  await context.clearCookies();
  await page.goto("/fashion/products/forever-tee");
  await page.getByRole("button", { name: "Add to bag" }).click();
  await page.goto("/checkout");
  await page.getByLabel("Full name").fill("Browser Test Customer");
  await page.getByLabel("Phone number", { exact: true }).fill("+94771234567");
  await page
    .getByLabel("Email (optional, for your receipt)")
    .fill("browser@example.test");
  await page.getByLabel("Delivery address").fill("10 Testing Street");
  await page.getByLabel("City", { exact: true }).fill("Colombo");
  await page.getByRole("button", { name: "Place order" }).click();
  await expect(page.getByText("ORDER PLACED SUCCESSFULLY")).toBeVisible();
  await expect(
    page.getByText("Your order has already been received.", { exact: false }),
  ).toBeVisible();
  const whatsapp = page.getByRole("link", { name: "Continue on WhatsApp" });
  await expect(whatsapp).toHaveAttribute(
    "href",
    /^https:\/\/wa.me\/94771234567\?text=/,
  );
  receipt = new URL(page.url()).pathname;
  await page.reload();
  await expect(page.locator(".receipt h2")).toContainText("UGF-");
  await expect(page.locator("[data-bag-count]")).toHaveText("0");
});
test("admin manages a persisted order and notification state", async ({
  page,
  context,
}) => {
  await context.addCookies(cookies);
  await page.goto("/admin/orders");
  await page.getByRole("link", { name: /UGF-/ }).first().click();
  await expect(page.getByText("Browser Test Customer")).toBeVisible();
  await page.getByLabel("Status", { exact: true }).selectOption("Processing");
  await page
    .getByLabel("Internal notes")
    .fill("Local QA: ready for customer contact.");
  await page.getByRole("button", { name: "Save order" }).click();
  await expect(page.locator(".save-status")).toHaveText("Saved successfully");
  await page.reload();
  await expect(page.getByLabel("Status", { exact: true })).toHaveValue(
    "Processing",
  );
  await expect(
    page.getByText("The order is safely recorded.", { exact: false }),
  ).toBeVisible();
  await page.goto(receipt);
  await expect(page.getByText("ORDER PLACED SUCCESSFULLY")).toBeVisible();
});
test("admin browser pages render without horizontal overflow on mobile", async ({
  page,
  context,
}) => {
  await context.addCookies(cookies);
  await page.setViewportSize({ width: 390, height: 844 });
  for (const path of [
    "/admin",
    "/admin/content",
    "/admin/products",
    "/admin/ordering",
    "/admin/users",
    "/admin/security",
  ]) {
    await page.goto(path);
    await expect(page.locator("main h1")).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
      path,
    ).toBe(true);
  }
});
test("small mobile and tablet layouts remain usable in every language", async ({
  page,
  context,
}) => {
  test.setTimeout(90000);
  for (const width of [320, 768]) {
    await page.setViewportSize({ width, height: 900 });
    for (const lang of ["en", "ar", "si", "ta"]) {
      for (const path of [
        "/",
        "/fashion/shop",
        "/fashion/products/forever-tee",
        "/bag",
        "/checkout",
      ]) {
        await page.goto(path + "?lang=" + lang);
        await expect(page.locator("main h1")).toBeVisible();
        expect(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth + 1,
          ),
          `${path} ${lang} ${width}`,
        ).toBe(true);
      }
    }
  }
  await context.addCookies(cookies);
  await page.setViewportSize({ width: 320, height: 900 });
  for (const path of [
    "/admin/products/new",
    "/admin/orders",
    "/admin/branding",
    "/admin/media",
  ]) {
    await page.goto(path);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
      path,
    ).toBe(true);
  }
});
test("key public and admin journeys meet automated WCAG AA checks", async ({
  page,
  context,
}) => {
  test.setTimeout(90000);
  await context.addCookies(cookies);
  const violations: any[] = [];
  for (const path of [
    "/",
    "/fashion",
    "/fashion/shop",
    "/fashion/products/forever-tee",
    "/bag",
    "/checkout?lang=ar",
    receipt,
    "/about",
    "/contact",
    "/real-estate",
    "/academy",
    "/admin",
    "/admin/products",
    "/admin/products/new",
    "/admin/orders",
    "/admin/branding",
  ]) {
    await page.goto(path);
    const result = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21aa"])
      .analyze();
    violations.push(
      ...result.violations.map((v) => ({
        path,
        id: v.id,
        nodes: v.nodes.map((n) => ({
          target: n.target,
          summary: n.failureSummary,
        })),
      })),
    );
  }
  expect(violations).toEqual([]);
});
test("capture local desktop, mobile and RTL views for manual visual review", async ({
  page,
  context,
}) => {
  await context.addCookies(cookies);
  await page.setViewportSize({ width: 1440, height: 1000 });
  for (const [name, path] of [
    ["holdings", "/"],
    ["fashion", "/fashion"],
    ["product", "/fashion/products/focus-lounge-set"],
    ["about", "/about"],
    ["contact", "/contact"],
    ["real-estate", "/real-estate"],
    ["academy", "/academy"],
    ["admin", "/admin"],
    ["admin-products", "/admin/products"],
    ["admin-order", "/admin/orders/1"],
  ]) {
    if (name === "admin-order") {
      await page.goto("/admin/orders");
      await page.getByRole("link", { name: /UGF-/ }).first().click();
    } else await page.goto(path);
    await expect(page.locator("main h1")).toBeVisible();
    await page.screenshot({
      path: "test-results/visual/" + name + ".png",
      fullPage: true,
    });
  }
  await page.goto("/fashion/products/focus-lounge-set?lang=en");
  await page.getByRole("button", { name: "Add to bag" }).click();
  for (const path of ["/bag", "/checkout"]) {
    await page.goto(path);
    await page.screenshot({
      path: "test-results/visual/" + path.slice(1) + ".png",
      fullPage: true,
    });
  }
  await page.goto(receipt);
  await page.screenshot({
    path: "test-results/visual/confirmation.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  for (const [name, path] of [
    ["fashion-mobile", "/fashion?lang=en"],
    ["checkout-arabic", "/checkout?lang=ar"],
    ["admin-mobile", "/admin/products"],
  ]) {
    await page.goto(path);
    await expect(page.locator("main h1")).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth + 1,
      ),
    ).toBe(true);
    await page.screenshot({
      path: "test-results/visual/" + name + ".png",
      fullPage: true,
    });
  }
});

test("separate admin completes temporary-password and QR authenticator onboarding", async ({
  page,
}) => {
  const api = await playwrightRequest.newContext({
    baseURL: base,
    extraHTTPHeaders: { Origin: base, "X-CSRF-Token": csrf },
    storageState: { cookies, origins: [] },
  });
  const username = "new-colleague";
  const created = await api.post("/api/admin/users", {
    data: {
      username,
      email: "colleague@example.test",
      displayName: "New Colleague",
    },
  });
  expect(created.status()).toBe(200);
  const { temporaryPassword } = await created.json();
  await page.goto("/admin/login");
  await page.getByLabel("Username or email").fill(username);
  await page.getByLabel("Password", { exact: true }).fill(temporaryPassword);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(
    page.getByRole("heading", { name: "Make it yours." }),
  ).toBeVisible();
  await page
    .getByLabel("New permanent password")
    .fill(randomBytes(20).toString("hex"));
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Secure your account." }),
  ).toBeVisible();
  await expect(page.locator(".auth-qr svg")).toBeVisible();
  const secret = (await page.locator(".totp-key").textContent())!.trim();
  const otp = new OTPAuth.TOTP({ secret: OTPAuth.Secret.fromBase32(secret) });
  await page
    .getByLabel("Authenticator code", { exact: true })
    .fill(otp.generate());
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Save your recovery codes" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "I have saved these securely" })
    .click();
  await expect(
    page.getByRole("heading", { name: "Good to see you, new-colleague." }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Admin users", exact: true }),
  ).toHaveCount(0);
  await page.goto("/admin/security");
  await expect(
    page.getByText("Authenticator enrolled · Required by policy"),
  ).toBeVisible();
  await api.dispose();
});

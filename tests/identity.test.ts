import { env } from "cloudflare:test";
import { describe, it, expect } from "vitest";
import { app } from "../src/index";
import { type Env } from "../src/model";
import { operationalPermissions, capabilities } from "../src/permissions";
import {
  hash,
  random,
  passwordHash,
  encrypt,
  newTotp,
  totp,
  decrypt,
} from "../src/security";
const e = env as unknown as Env;
async function call(path: string, method = "GET", data?: any, u?: any) {
  return app.request(
    "http://localhost" + path,
    {
      method,
      headers: {
        Origin: "http://localhost",
        "Content-Type": "application/json",
        ...(u ? { Cookie: "ug_admin=" + u.token, "X-CSRF-Token": u.csrf } : {}),
      },
      ...(data === undefined ? {} : { body: JSON.stringify(data) }),
    },
    e,
  );
}
async function account(perms = operationalPermissions, owner = false) {
  let id = crypto.randomUUID();
  const secret = newTotp(),
    pw = random(16);
  if (owner) {
    const o = await e.DB.prepare("SELECT owner_id FROM ownership").first<any>();
    if (o) {
      id = o.owner_id;
      await e.DB.prepare("UPDATE admins SET password_hash=?,totp=? WHERE id=?")
        .bind(await passwordHash(pw), await encrypt(secret, e.AUTH_KEY), id)
        .run();
    } else
      await e.DB.prepare(
        "INSERT INTO admins(id,username,password_hash,totp,permissions,is_main) VALUES(?,?,?,?,?,1)",
      )
        .bind(
          id,
          "owner-" + id,
          await passwordHash(pw),
          await encrypt(secret, e.AUTH_KEY),
          JSON.stringify(capabilities),
        )
        .run();
  } else
    await e.DB.prepare(
      "INSERT INTO admins(id,username,password_hash,totp,permissions) VALUES(?,?,?,?,?)",
    )
      .bind(
        id,
        "admin-" + id,
        await passwordHash(pw),
        await encrypt(secret, e.AUTH_KEY),
        JSON.stringify(perms),
      )
      .run();
  const token = random(),
    csrf = random();
  await e.DB.prepare(
    "INSERT INTO sessions(token_hash,admin_id,csrf,expires_at,created_at) VALUES(?,?,?,?,?)",
  )
    .bind(await hash(token), id, csrf, Date.now() + 3600000, Date.now())
    .run();
  return { id, token, csrf, secret, password: pw };
}
async function login(username: string, password: string, code = "") {
  const r = await call("/api/auth/login", "POST", { username, password, code });
  const token = r.headers.get("set-cookie")?.match(/ug_admin=([^;]+)/)?.[1];
  const row = token
    ? await e.DB.prepare("SELECT csrf FROM sessions WHERE token_hash=?")
        .bind(await hash(token))
        .first<any>()
    : null;
  return { r, token, csrf: row?.csrf };
}
async function create(owner: any, extra: any = {}) {
  const username = "new-" + random(4);
  const r = await call(
    "/api/admin/users",
    "POST",
    { username, email: username + "@example.test", ...extra },
    owner,
  );
  expect(r.status).toBe(200);
  return { username, ...((await r.json()) as any) };
}
describe("Owner and separate admin accounts", () => {
  it("defaults to business access, forces a different permanent password, then enrolls TOTP before dashboard access", async () => {
    const owner = await account([], true),
      created = await create(owner);
    expect(created.secret).toBeUndefined();
    let row = await e.DB.prepare("SELECT * FROM admins WHERE id=?")
      .bind(created.id)
      .first<any>();
    expect(JSON.parse(row.permissions)).toEqual(operationalPermissions);
    expect(row.totp).toBe("");
    expect(row.totp_policy).toBe("required");
    const l = await login(created.username, created.temporaryPassword);
    expect(l.r.status).toBe(200);
    expect((await call("/api/admin/products", "POST", {}, l)).status).toBe(401);
    expect(
      (
        await call(
          "/api/auth/onboarding",
          "POST",
          { password: created.temporaryPassword },
          l,
        )
      ).status,
    ).toBe(400);
    const permanent = random(20),
      changed = await call(
        "/api/auth/onboarding",
        "POST",
        { password: permanent },
        l,
      );
    expect(changed.status).toBe(200);
    const token = changed.headers
      .get("set-cookie")!
      .match(/ug_admin=([^;]+)/)![1];
    const next = await e.DB.prepare("SELECT * FROM sessions WHERE token_hash=?")
      .bind(await hash(token))
      .first<any>();
    const u = { token, csrf: next.csrf };
    expect(next.stage).toBe("totp");
    const page = await call("/admin/onboarding", "GET", undefined, u);
    const html = await page.text();
    expect(html).toContain("<svg");
    expect(html).toContain("Scan with");
    row = await e.DB.prepare(
      "SELECT pending_totp FROM sessions WHERE token_hash=?",
    )
      .bind(await hash(token))
      .first<any>();
    const secret = await decrypt(row.pending_totp, e.AUTH_KEY);
    expect(
      (await call("/api/auth/onboarding", "POST", { code: "wrong" }, u)).status,
    ).toBe(400);
    const done = await call(
      "/api/auth/onboarding",
      "POST",
      { code: totp(secret).generate() },
      u,
    );
    expect(done.status).toBe(200);
    const body = (await done.json()) as any;
    expect(body.recoveryCodes).toHaveLength(8);
    const entered = await login(
      created.username,
      permanent,
      body.recoveryCodes[0],
    );
    expect(entered.r.status).toBe(200);
    expect(
      (await login(created.username, permanent, body.recoveryCodes[0])).r
        .status,
    ).toBe(401);
    expect((await call("/admin", "GET", undefined, entered)).status).toBe(200);
  });
  it("supports optional and disabled TOTP without granting extra privileges", async () => {
    const owner = await account([], true);
    for (const totpPolicy of ["optional", "disabled"]) {
      const created = await create(owner, {
        totpPolicy,
        permissions: ["products.read"],
      });
      const l = await login(created.username, created.temporaryPassword);
      const r = await call(
        "/api/auth/onboarding",
        "POST",
        { password: random(20) },
        l,
      );
      expect(r.status).toBe(200);
      expect(((await r.json()) as any).redirect).toBe("/admin");
      const row = await e.DB.prepare(
        "SELECT must_reset,totp FROM admins WHERE id=?",
      )
        .bind(created.id)
        .first<any>();
      expect(row.must_reset).toBe(0);
      expect(row.totp).toBe("");
    }
  });
  it("denies account creation without explicit permission and prevents delegated privilege escalation", async () => {
    const op = await account();
    expect((await call("/api/admin/users", "POST", {}, op)).status).toBe(403);
    const delegate = await account(["admins.create", "products.read"]);
    expect(
      (
        await call(
          "/api/admin/users",
          "POST",
          { username: "deny-" + random(3), permissions: ["admins.write"] },
          delegate,
        )
      ).status,
    ).toBe(403);
    await create(delegate, {
      permissions: ["products.read"],
      totpPolicy: "optional",
    });
  });
  it("protects the Owner from privileged admins and direct demotion", async () => {
    const owner = await account([], true),
      admin = await account(capabilities);
    for (const [path, method, body] of [
      ["/toggle", "POST", {}],
      ["/reset", "POST", { resetTotp: true }],
      ["/permissions", "PUT", { permissions: [] }],
      [
        "/profile",
        "PUT",
        { displayName: "Hijack", email: "", totpPolicy: "disabled" },
      ],
      ["", "DELETE", {}],
    ] as const) {
      expect(
        (await call("/api/admin/users/" + owner.id + path, method, body, admin))
          .status,
      ).toBe(403);
    }
    expect((await call("/api/admin/ownership", "POST", {}, admin)).status).toBe(
      403,
    );
    await expect(
      e.DB.prepare("UPDATE admins SET is_main=0 WHERE id=?")
        .bind(owner.id)
        .run(),
    ).rejects.toThrow();
    await expect(e.DB.prepare("DELETE FROM ownership").run()).rejects.toThrow();
  });
  it("transfers ownership atomically, revokes sessions and attributes the event", async () => {
    const owner = await account([], true),
      target = await account();
    const r = await call(
      "/api/admin/ownership",
      "POST",
      {
        target: target.id,
        password: owner.password,
        code: totp(owner.secret).generate(),
        confirm: "TRANSFER OWNERSHIP",
      },
      owner,
    );
    expect(r.status).toBe(200);
    const rows = (
      await e.DB.prepare("SELECT id FROM admins WHERE is_main=1").all<any>()
    ).results;
    expect(rows).toEqual([{ id: target.id }]);
    expect(
      await e.DB.prepare("SELECT disabled,is_main FROM admins WHERE id=?")
        .bind(owner.id)
        .first<any>(),
    ).toEqual({ disabled: 0, is_main: 0 });
    expect((await call("/admin", "GET", undefined, owner)).status).toBe(302);
    expect((await call("/admin", "GET", undefined, target)).status).toBe(302);
    expect(
      await e.DB.prepare(
        "SELECT actor,target FROM audit WHERE action='ownership.transferred' ORDER BY id DESC LIMIT 1",
      ).first(),
    ).toEqual({ actor: owner.id, target: target.id });
  });
  it("suspends and resets accounts, revokes sessions and requires TOTP re-enrollment", async () => {
    const owner = await account([], true),
      target = await account();
    expect(
      (
        await call(
          "/api/admin/users/" + target.id + "/toggle",
          "POST",
          {},
          owner,
        )
      ).status,
    ).toBe(200);
    expect((await call("/api/admin/products", "POST", {}, target)).status).toBe(
      401,
    );
    await call("/api/admin/users/" + target.id + "/toggle", "POST", {}, owner);
    const reset = await call(
      "/api/admin/users/" + target.id + "/reset",
      "POST",
      { resetTotp: true },
      owner,
    );
    expect(reset.status).toBe(200);
    expect(
      ((await reset.json()) as any).temporaryPassword.length,
    ).toBeGreaterThan(20);
    const row = await e.DB.prepare(
      "SELECT must_reset,totp FROM admins WHERE id=?",
    )
      .bind(target.id)
      .first<any>();
    expect(row).toEqual({ must_reset: 1, totp: "" });
  });
  it("enforces the global policy even for optional accounts and never permits Owner TOTP disabling", async () => {
    const owner = await account([], true),
      optional = await account();
    await e.DB.prepare(
      "UPDATE admins SET totp_policy='optional',totp='' WHERE id=?",
    )
      .bind(optional.id)
      .run();
    const r = await call(
      "/api/admin/security-policy",
      "POST",
      {
        requireTotp: true,
        password: owner.password,
        code: totp(owner.secret).generate(),
      },
      owner,
    );
    expect(r.status).toBe(200);
    expect((await call("/admin", "GET", undefined, optional)).status).toBe(302);
    const name = (
      await e.DB.prepare("SELECT username FROM admins WHERE id=?")
        .bind(optional.id)
        .first<any>()
    ).username;
    const l = await login(name, optional.password);
    expect(l.r.status).toBe(200);
    expect(((await l.r.json()) as any).redirect).toBe("/admin/onboarding");
    expect(
      (
        await call(
          "/api/admin/totp/disable",
          "POST",
          { password: owner.password, code: totp(owner.secret).generate() },
          owner,
        )
      ).status,
    ).toBe(403);
    await e.DB.prepare(
      "UPDATE records SET data='{\"requireTotp\":false}' WHERE kind='security'",
    ).run();
  });
});

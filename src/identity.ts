import { Hono } from "hono";
import { html, raw } from "hono/html";
import { getCookie, setCookie, deleteCookie } from "hono/cookie";
import { z } from "zod";
import qrcode from "qrcode-generator";
import { type Env, audit, record } from "./model";
import {
  capabilities,
  operationalPermissions,
  allowed,
  canManage,
  permissionGroups,
} from "./permissions";
import {
  hash,
  random,
  passwordHash,
  passwordValid,
  encrypt,
  decrypt,
  verifyTotp,
  newTotp,
  totp,
  rate,
  session,
  equal,
} from "./security";
import { shell, authPage, field, adminLayout } from "./ui";
export const identity = new Hono<{ Bindings: Env; Variables: { user: any } }>();
const cookie = (c: any) =>
  new URL(c.req.url).protocol === "https:" ? "__Host-ug_admin" : "ug_admin";
const username = z
  .string()
  .trim()
  .min(3)
  .max(120)
  .refine((v) => !v.includes("@"), "Use a username without @");
const password = z.string().min(12).max(128);
const email = z.union([z.email().max(254), z.literal("")]).default("");
const policy = z.enum(["required", "optional", "disabled"]);
export function qr(secret: string, label = "Admin") {
  const code = qrcode(0, "M");
  const otp = totp(secret);
  otp.label = label;
  code.addData(otp.toString());
  code.make();
  return html`<div
      class="auth-qr"
      role="img"
      aria-label="Scan with your authenticator"
    >
      ${raw(code.createSvgTag({ cellSize: 4, margin: 4, scalable: true }))}
    </div>
    <code class="totp-key">${secret}</code>
    <p>
      Scan with Google Authenticator, Microsoft Authenticator, Authy or a
      compatible app. You can also enter the setup key manually.
    </p>`;
}
async function makeSession(c: any, u: any, stage = "ready") {
  const token = random(),
    now = Date.now();
  const old = getCookie(c, cookie(c));
  if (old)
    await c.env.DB.prepare("DELETE FROM sessions WHERE token_hash=?")
      .bind(await hash(old))
      .run();
  await c.env.DB.prepare(
    "INSERT INTO sessions(token_hash,admin_id,csrf,expires_at,created_at,user_agent,stage) VALUES(?,?,?,?,?,?,?)",
  )
    .bind(
      await hash(token),
      u.id,
      random(),
      now + (stage === "ready" ? 28800000 : 1200000),
      now,
      (c.req.header("User-Agent") || "").slice(0, 200),
      stage,
    )
    .run();
  setCookie(c, cookie(c), token, {
    httpOnly: true,
    secure: new URL(c.req.url).protocol === "https:",
    sameSite: "Strict",
    path: "/",
    maxAge: stage === "ready" ? 28800 : 1200,
  });
}
async function challenge(c: any) {
  const token = getCookie(c, cookie(c));
  if (!token) return null;
  return c.env.DB.prepare(
    "SELECT a.*,s.token_hash,s.csrf,s.stage,s.pending_totp,s.pending_totp_expires FROM sessions s JOIN admins a ON a.id=s.admin_id WHERE s.token_hash=? AND s.expires_at>? AND a.disabled=0",
  )
    .bind(await hash(token), Date.now())
    .first();
}
async function requiredTotp(c: any, u: any) {
  return (
    u.is_main ||
    u.totp_policy === "required" ||
    !!(await record(c.env.DB, "security"))?.requireTotp
  );
}
async function proof(
  c: any,
  u: any,
  pw: string,
  code: string,
  consume = false,
) {
  if (!(await passwordValid(pw, u.password_hash))) return false;
  if (!u.totp) return !(await requiredTotp(c, u));
  const step = verifyTotp(await decrypt(u.totp, c.env.AUTH_KEY), code);
  if (step !== null) {
    if (consume) {
      try {
        await c.env.DB.prepare(
          "INSERT INTO totp_used(admin_id,step) VALUES(?,?)",
        )
          .bind(u.id, step)
          .run();
      } catch {
        return false;
      }
    }
    return true;
  }
  if (consume && /^[a-f0-9]{16}$/.test(code)) {
    const r = await c.env.DB.prepare(
      "DELETE FROM recovery_codes WHERE admin_id=? AND code_hash=?",
    )
      .bind(u.id, await hash(code))
      .run();
    return !!r.meta.changes;
  }
  return false;
}
async function codes(c: any, id: string) {
  const values = Array.from({ length: 8 }, () => random(8));
  await c.env.DB.batch([
    c.env.DB.prepare("DELETE FROM recovery_codes WHERE admin_id=?").bind(id),
    ...(await Promise.all(
      values.map(async (v) =>
        c.env.DB.prepare(
          "INSERT INTO recovery_codes(admin_id,code_hash) VALUES(?,?)",
        ).bind(id, await hash(v)),
      ),
    )),
  ]);
  return values;
}
async function current(c: any) {
  return c.env.DB.prepare("SELECT * FROM admins WHERE id=?")
    .bind(c.get("user").id)
    .first();
}
function error(c: any, message: string, status = 400) {
  return c.json({ error: message }, status);
}
identity.get("/admin/login", (c) =>
  c.html(shell("Sign in · UniGlobe", authPage(), { admin: true })),
);
identity.get("/admin/setup", async (c) => {
  if (await c.env.DB.prepare("SELECT id FROM ownership").first())
    return c.notFound();
  if (!c.env.BOOTSTRAP_TOKEN || !c.env.AUTH_KEY)
    return error(c, "Setup is not configured", 503);
  const secret = newTotp();
  return c.html(
    shell(
      "Set up Owner",
      html`<main id="main" class="auth-page">
        <p class="eyebrow">UNIGLOBE WORKSPACE</p>
        <h1>Set up Owner</h1>
        <form id="auth-form" data-mode="setup">
          ${field("Bootstrap token", "bootstrap", "", "password", "required")}${field("Display name", "displayName")}${field("Username", "username", "", "text", "required")}${field("Email", "email", "", "email", "required")}${field("Permanent password", "password", "", "password", 'required minlength="12" autocomplete="new-password"')}${qr(secret)}<input
            type="hidden"
            name="secret"
            value="${secret}"
          />${field("Authenticator code", "code", "", "text", 'required pattern="[0-9]{6}" inputmode="numeric"')}
          <p class="form-error" role="alert"></p>
          <button class="button">Create Main Admin</button>
        </form>
      </main>`,
      { admin: true },
    ),
  );
});
identity.post("/api/auth/setup", async (c) => {
  if (
    !(await rate(
      c.env.DB,
      "setup:" + (c.req.header("CF-Connecting-IP") || "local"),
      5,
      900,
    ))
  )
    return error(c, "Too many attempts", 429);
  if (!c.env.BOOTSTRAP_TOKEN || !c.env.AUTH_KEY)
    return error(c, "Setup is not configured", 503);
  const d = z
    .object({
      username,
      password,
      email,
      displayName: z.string().max(120).default(""),
      secret: z.string().regex(/^[A-Z2-7]{32}$/),
      code: z.string(),
      bootstrap: z.string(),
    })
    .parse(await c.req.json());
  if (!equal(d.bootstrap, c.env.BOOTSTRAP_TOKEN))
    return error(c, "Setup credentials invalid", 403);
  if (verifyTotp(d.secret, d.code) === null)
    return error(c, "Authenticator code invalid");
  const id = crypto.randomUUID();
  try {
    await c.env.DB.prepare(
      "INSERT INTO admins(id,username,email,display_name,password_hash,totp,permissions,is_main) VALUES(?,?,?,?,?,?,?,1)",
    )
      .bind(
        id,
        d.username,
        d.email,
        d.displayName,
        await passwordHash(d.password),
        await encrypt(d.secret, c.env.AUTH_KEY),
        JSON.stringify(capabilities),
      )
      .run();
  } catch {
    return error(
      c,
      "Setup is already complete or account details are unavailable",
      409,
    );
  }
  await audit(c.env.DB, id, "admin.bootstrap", id);
  await makeSession(c, { id });
  return c.json({ ok: true, recoveryCodes: await codes(c, id) });
});
identity.post("/api/auth/login", async (c) => {
  const d = z
    .object({
      username: z.string().trim().min(3).max(254),
      password,
      code: z.string().max(32).default(""),
    })
    .parse(await c.req.json());
  if (
    !(await rate(
      c.env.DB,
      "login-ip:" + (c.req.header("CF-Connecting-IP") || "local"),
      30,
      900,
    )) ||
    !(await rate(
      c.env.DB,
      "login-user:" + (await hash(d.username.toLowerCase())),
      8,
      900,
    ))
  )
    return error(c, "Too many attempts. Try again in 15 minutes.", 429);
  const u = await c.env.DB.prepare(
    "SELECT * FROM admins WHERE username=? COLLATE NOCASE OR (email!='' AND email=? COLLATE NOCASE)",
  )
    .bind(d.username, d.username)
    .first<any>();
  let valid = false;
  if (u && !u.disabled) {
    valid = !u.totp
      ? await passwordValid(d.password, u.password_hash)
      : await proof(c, u, d.password, d.code, true);
    if (u.must_reset && u.temporary_expires && u.temporary_expires < Date.now())
      valid = false;
  } else await passwordHash(d.password, "00000000000000000000000000000000");
  if (!valid) {
    await audit(
      c.env.DB,
      u?.id || null,
      "auth.failed",
      "",
      await hash(d.username.toLowerCase()),
    );
    return error(
      c,
      "Username, password or authenticator code is incorrect",
      401,
    );
  }
  const stage = u.must_reset
    ? "password"
    : !u.totp && (await requiredTotp(c, u))
      ? "totp"
      : "ready";
  await makeSession(c, u, stage);
  await c.env.DB.prepare(
    "UPDATE admins SET last_login=CURRENT_TIMESTAMP WHERE id=?",
  )
    .bind(u.id)
    .run();
  await audit(c.env.DB, u.id, "auth.login", u.id, stage);
  return c.json({
    ok: true,
    redirect: stage === "ready" ? "/admin" : "/admin/onboarding",
  });
});
identity.get("/admin/onboarding", async (c) => {
  const u = await challenge(c);
  if (!u) return c.redirect("/admin/login");
  if (u.stage === "ready") return c.redirect("/admin");
  let secret = "";
  if (u.stage === "totp") {
    secret = u.pending_totp
      ? await decrypt(u.pending_totp, c.env.AUTH_KEY)
      : newTotp();
    await c.env.DB.prepare(
      "UPDATE sessions SET pending_totp=? WHERE token_hash=?",
    )
      .bind(await encrypt(secret, c.env.AUTH_KEY), u.token_hash)
      .run();
  }
  return c.html(
    shell(
      "Finish your account",
      html`<main id="main" class="auth-page">
        <p class="eyebrow">YOUR ACCOUNT · ${u.username}</p>
        <h1>
          ${u.stage === "password" ? "Make it yours." : "Secure your account."}
        </h1>
        <p>
          ${u.stage === "password" ? "Choose your own password. Your temporary password cannot be reused." : "Enroll your authenticator to unlock the workspace."}
        </p>
        <form
          class="admin-editor"
          data-api="/api/auth/onboarding"
          data-method="POST"
        >
          ${u.stage === "password" ? field("New permanent password", "password", "", "password", 'required minlength="12" autocomplete="new-password"') : html`${qr(secret, u.username)}${field("Authenticator code", "code", "", "text", 'required pattern="[0-9]{6}" inputmode="numeric"')}`}
          <p class="form-error" role="alert"></p>
          <button class="button">Continue</button>
        </form>
      </main>`,
      { admin: true, csrf: u.csrf },
    ),
  );
});
identity.post("/api/auth/onboarding", async (c) => {
  const u = await challenge(c);
  if (!u || u.stage === "ready")
    return error(c, "Onboarding session required", 401);
  if (!equal(c.req.header("X-CSRF-Token") || "", u.csrf))
    return error(c, "Invalid CSRF token", 403);
  if (!(await rate(c.env.DB, "enroll:" + u.id, 8, 600)))
    return error(c, "Try again later", 429);
  const d = await c.req.json();
  if (u.stage === "password") {
    const pw = password.parse(d.password);
    if (await passwordValid(pw, u.password_hash))
      return error(c, "Choose a different permanent password");
    // A single session wins a concurrent reset; stale onboarding sessions cannot overwrite it.
    const r = await c.env.DB.prepare(
      "UPDATE admins SET password_hash=?,must_reset=0,temporary_expires=NULL WHERE id=? AND password_hash=? AND must_reset=1",
    )
      .bind(await passwordHash(pw), u.id, u.password_hash)
      .run();
    if (!r.meta.changes) return error(c, "This reset was already used", 409);
    await c.env.DB.prepare("DELETE FROM sessions WHERE admin_id=?")
      .bind(u.id)
      .run();
    const stage = !u.totp && (await requiredTotp(c, u)) ? "totp" : "ready";
    await makeSession(c, u, stage);
    await audit(c.env.DB, u.id, "auth.password_changed", u.id);
    return c.json({
      ok: true,
      redirect: stage === "ready" ? "/admin" : "/admin/onboarding",
    });
  }
  if (
    !u.pending_totp ||
    verifyTotp(
      await decrypt(u.pending_totp, c.env.AUTH_KEY),
      String(d.code),
    ) === null
  )
    return error(c, "Authenticator code invalid");
  await c.env.DB.batch([
    c.env.DB.prepare("UPDATE admins SET totp=? WHERE id=? AND totp=''").bind(
      u.pending_totp,
      u.id,
    ),
    c.env.DB.prepare("DELETE FROM sessions WHERE admin_id=?").bind(u.id),
  ]);
  await makeSession(c, u);
  await audit(c.env.DB, u.id, "auth.totp_enabled", u.id);
  return c.json({
    ok: true,
    recoveryCodes: await codes(c, u.id),
    redirect: "/admin",
  });
});
identity.use("*", async (c, next) => {
  if (!/^\/(admin|api\/(admin|auth))(\/|$)/.test(c.req.path)) return next();
  const u = await session(c.env, getCookie(c, cookie(c)));
  if (!u)
    return c.req.path.startsWith("/api/")
      ? error(c, "Sign in required", 401)
      : c.redirect("/admin/login");
  c.set("user", u);
  if (!["GET", "HEAD"].includes(c.req.method)) {
    let token = c.req.header("X-CSRF-Token");
    if (!token && c.req.path === "/api/auth/logout")
      token = (await c.req.parseBody()).csrf as string;
    if (!token || !equal(token, u.csrf))
      return error(c, "Invalid CSRF token", 403);
  }
  await next();
});
identity.post("/api/auth/logout", async (c) => {
  await c.env.DB.prepare("DELETE FROM sessions WHERE token_hash=?")
    .bind(c.get("user").token_hash)
    .run();
  deleteCookie(c, cookie(c), { path: "/" });
  return c.redirect("/admin/login", 303);
});
identity.post("/api/admin/password", async (c) => {
  const d = z
    .object({ current: z.string(), password, code: z.string().default("") })
    .parse(await c.req.json());
  const u = await current(c);
  if (!(await rate(c.env.DB, "change-password:" + u.id, 5, 900)))
    return error(c, "Try again later", 429);
  if (!(await proof(c, u, d.current, d.code)))
    return error(c, "Current password or code is incorrect", 403);
  if (await passwordValid(d.password, u.password_hash))
    return error(c, "Choose a different password");
  await c.env.DB.batch([
    c.env.DB.prepare("UPDATE admins SET password_hash=? WHERE id=?").bind(
      await passwordHash(d.password),
      u.id,
    ),
    c.env.DB.prepare("DELETE FROM sessions WHERE admin_id=?").bind(u.id),
  ]);
  await makeSession(c, u);
  await audit(c.env.DB, u.id, "auth.password_changed", u.id);
  return c.json({ ok: true, reload: true });
});
identity.post("/api/admin/totp/start", async (c) => {
  const d = z
    .object({ password: z.string(), code: z.string().default("") })
    .parse(await c.req.json());
  const u = await current(c);
  if (!(await rate(c.env.DB, "totp-change:" + u.id, 5, 900)))
    return error(c, "Try again later", 429);
  if (u.totp_policy === "disabled" && !(await requiredTotp(c, u)))
    return error(
      c,
      "Two-factor authentication is disabled by account policy",
      403,
    );
  if (!(await proof(c, u, d.password, d.code)))
    return error(c, "Password or authenticator code is incorrect", 403);
  const secret = newTotp();
  await c.env.DB.prepare(
    "UPDATE sessions SET pending_totp=?,pending_totp_expires=? WHERE token_hash=?",
  )
    .bind(
      await encrypt(secret, c.env.AUTH_KEY),
      Date.now() + 600000,
      c.get("user").token_hash,
    )
    .run();
  return c.json({ ok: true, secret, qr: String(await qr(secret, u.username)) });
});
identity.post("/api/admin/totp/confirm", async (c) => {
  const u = await challenge(c);
  if (!(await rate(c.env.DB, "totp-confirm:" + u.id, 5, 600)))
    return error(c, "Try again later", 429);
  const d = await c.req.json();
  if (
    !u.pending_totp ||
    u.pending_totp_expires < Date.now() ||
    verifyTotp(
      await decrypt(u.pending_totp, c.env.AUTH_KEY),
      String(d.code),
    ) === null
  )
    return error(c, "Setup expired or code is incorrect");
  await c.env.DB.batch([
    c.env.DB.prepare("UPDATE admins SET totp=? WHERE id=?").bind(
      u.pending_totp,
      u.id,
    ),
    c.env.DB.prepare("DELETE FROM sessions WHERE admin_id=?").bind(u.id),
    c.env.DB.prepare("DELETE FROM totp_used WHERE admin_id=?").bind(u.id),
  ]);
  await makeSession(c, u);
  await audit(c.env.DB, u.id, "auth.totp_enabled", u.id);
  return c.json({
    ok: true,
    recoveryCodes: await codes(c, u.id),
    redirect: "/admin/security",
  });
});
identity.post("/api/admin/totp/disable", async (c) => {
  const u = await current(c),
    d = await c.req.json();
  if (await requiredTotp(c, u))
    return error(
      c,
      "Two-factor authentication is required for this account",
      403,
    );
  if (
    !(await rate(c.env.DB, "totp-disable:" + u.id, 5, 900)) ||
    !(await proof(c, u, String(d.password), String(d.code)))
  )
    return error(c, "Password or code is incorrect", 403);
  await c.env.DB.batch([
    c.env.DB.prepare("UPDATE admins SET totp='' WHERE id=?").bind(u.id),
    c.env.DB.prepare("DELETE FROM recovery_codes WHERE admin_id=?").bind(u.id),
    c.env.DB.prepare("DELETE FROM sessions WHERE admin_id=?").bind(u.id),
  ]);
  await makeSession(c, u);
  await audit(c.env.DB, u.id, "auth.totp_disabled", u.id);
  return c.json({ ok: true, reload: true });
});
identity.delete("/api/admin/sessions/:id", async (c) => {
  await c.env.DB.prepare(
    "DELETE FROM sessions WHERE token_hash=? AND admin_id=?",
  )
    .bind(c.req.param("id"), c.get("user").id)
    .run();
  return c.json({ ok: true });
});
const grants = z
  .array(z.enum(capabilities as [string, ...string[]]))
  .max(capabilities.length);
function grantable(actor: any, perms: string[]) {
  return (
    actor.is_main ||
    perms.every((p) => JSON.parse(actor.permissions).includes(p))
  );
}
identity.post("/api/admin/users", async (c) => {
  const actor = c.get("user");
  if (!allowed(actor, "admins.create"))
    return error(c, "Permission denied", 403);
  const d = z
    .object({
      username,
      email,
      displayName: z.string().max(120).default(""),
      password: z.union([password, z.literal("")]).default(""),
      permissions: grants.default(operationalPermissions),
      totpPolicy: policy.default("required"),
      disabled: z.boolean().default(false),
    })
    .parse(await c.req.json());
  if (!grantable(actor, d.permissions))
    return error(c, "You cannot grant permissions beyond your own access", 403);
  const id = crypto.randomUUID(),
    temporary = d.password || random(16);
  try {
    await c.env.DB.prepare(
      "INSERT INTO admins(id,username,email,display_name,password_hash,totp,permissions,totp_policy,disabled,must_reset,temporary_expires) VALUES(?,?,?,?,?,'',?,?,?,1,?)",
    )
      .bind(
        id,
        d.username,
        d.email,
        d.displayName,
        await passwordHash(temporary),
        JSON.stringify(d.permissions),
        d.totpPolicy,
        Number(d.disabled),
        Date.now() + 7 * 86400000,
      )
      .run();
  } catch {
    return error(c, "Username or email is already in use", 409);
  }
  await audit(c.env.DB, actor.id, "admin.created", id);
  return c.json({ ok: true, id, temporaryPassword: temporary });
});
identity.use("/api/admin/users/:id/*", async (c, next) => {
  const a = c.get("user"),
    target = await c.env.DB.prepare("SELECT * FROM admins WHERE id=?")
      .bind(c.req.param("id"))
      .first();
  if (!allowed(a, "admins.write") || !target || !canManage(a, target))
    return error(
      c,
      "This account is protected or outside your permissions",
      403,
    );
  await next();
});
identity.put("/api/admin/users/:id/permissions", async (c) => {
  const d = z.object({ permissions: grants }).parse(await c.req.json());
  if (!grantable(c.get("user"), d.permissions))
    return error(c, "You cannot grant permissions beyond your own access", 403);
  await c.env.DB.batch([
    c.env.DB.prepare("UPDATE admins SET permissions=? WHERE id=?").bind(
      JSON.stringify(d.permissions),
      c.req.param("id"),
    ),
    c.env.DB.prepare("DELETE FROM sessions WHERE admin_id=?").bind(
      c.req.param("id"),
    ),
  ]);
  await audit(
    c.env.DB,
    c.get("user").id,
    "admin.permissions_changed",
    c.req.param("id"),
    JSON.stringify(d.permissions),
  );
  return c.json({ ok: true, reload: true });
});
identity.put("/api/admin/users/:id/profile", async (c) => {
  const d = z
    .object({ displayName: z.string().max(120), email, totpPolicy: policy })
    .parse(await c.req.json());
  const u = await c.env.DB.prepare("SELECT * FROM admins WHERE id=?")
    .bind(c.req.param("id"))
    .first<any>();
  if (
    d.totpPolicy === "disabled" &&
    (await record(c.env.DB, "security"))?.requireTotp
  )
    return error(c, "Global policy requires TOTP");
  await c.env.DB.batch([
    c.env.DB.prepare(
      "UPDATE admins SET display_name=?,email=?,totp_policy=?,totp=CASE WHEN ?='disabled' THEN '' ELSE totp END WHERE id=?",
    ).bind(d.displayName, d.email, d.totpPolicy, d.totpPolicy, u.id),
    c.env.DB.prepare("DELETE FROM sessions WHERE admin_id=?").bind(u.id),
    c.env.DB.prepare(
      "DELETE FROM recovery_codes WHERE admin_id=? AND ?='disabled'",
    ).bind(u.id, d.totpPolicy),
  ]);
  await audit(
    c.env.DB,
    c.get("user").id,
    "admin.security_policy_changed",
    u.id,
    d.totpPolicy,
  );
  return c.json({ ok: true, reload: true });
});
identity.post("/api/admin/users/:id/toggle", async (c) => {
  await c.env.DB.batch([
    c.env.DB.prepare("UPDATE admins SET disabled=1-disabled WHERE id=?").bind(
      c.req.param("id"),
    ),
    c.env.DB.prepare("DELETE FROM sessions WHERE admin_id=?").bind(
      c.req.param("id"),
    ),
  ]);
  await audit(
    c.env.DB,
    c.get("user").id,
    "admin.access_changed",
    c.req.param("id"),
  );
  return c.json({ ok: true, reload: true });
});
identity.post("/api/admin/users/:id/reset", async (c) => {
  const d = z
    .object({ resetTotp: z.boolean().default(false) })
    .parse(await c.req.json());
  const pw = random(16),
    id = c.req.param("id");
  await c.env.DB.batch([
    c.env.DB.prepare(
      "UPDATE admins SET password_hash=?,must_reset=1,temporary_expires=?,totp=CASE WHEN ? THEN '' ELSE totp END WHERE id=?",
    ).bind(
      await passwordHash(pw),
      Date.now() + 7 * 86400000,
      Number(d.resetTotp),
      id,
    ),
    c.env.DB.prepare("DELETE FROM sessions WHERE admin_id=?").bind(id),
    c.env.DB.prepare("DELETE FROM recovery_codes WHERE admin_id=?").bind(id),
  ]);
  await audit(
    c.env.DB,
    c.get("user").id,
    d.resetTotp ? "admin.totp_reset" : "admin.password_reset",
    id,
  );
  return c.json({ ok: true, temporaryPassword: pw });
});
identity.delete("/api/admin/users/:id", async (c) => {
  const target = await c.env.DB.prepare("SELECT * FROM admins WHERE id=?")
    .bind(c.req.param("id"))
    .first();
  if (
    !allowed(c.get("user"), "admins.write") ||
    !target ||
    !canManage(c.get("user"), target)
  )
    return error(c, "This admin is protected", 403);
  await c.env.DB.prepare("DELETE FROM admins WHERE id=?")
    .bind(c.req.param("id"))
    .run();
  await audit(c.env.DB, c.get("user").id, "admin.deleted", c.req.param("id"));
  return c.json({ ok: true });
});
identity.post("/api/admin/ownership", async (c) => {
  const u = await current(c);
  if (!u.is_main) return error(c, "Only the Owner can transfer ownership", 403);
  if (!(await rate(c.env.DB, "transfer:" + u.id, 5, 900)))
    return error(c, "Try again later", 429);
  const d = z
    .object({
      target: z.string().uuid(),
      password: z.string(),
      code: z.string(),
      confirm: z.literal("TRANSFER OWNERSHIP"),
    })
    .parse(await c.req.json());
  if (d.target === u.id || !(await proof(c, u, d.password, d.code, true)))
    return error(c, "Password, code or target is invalid", 403);
  const target = await c.env.DB.prepare(
    "SELECT * FROM admins WHERE id=? AND disabled=0 AND must_reset=0 AND totp!=''",
  )
    .bind(d.target)
    .first<any>();
  if (!target)
    return error(
      c,
      "Choose an active admin who has completed password and authenticator enrollment",
    );
  try {
    await c.env.DB.batch([
      c.env.DB.prepare(
        "INSERT INTO ownership(id,owner_id) SELECT 2,? WHERE NOT EXISTS(SELECT 1 FROM ownership WHERE owner_id=?)",
      ).bind(u.id, u.id),
      c.env.DB.prepare(
        "UPDATE ownership SET owner_id=? WHERE id=1 AND owner_id=?",
      ).bind(target.id, u.id),
      c.env.DB.prepare(
        "UPDATE admins SET permissions=? WHERE id=? AND is_main=0",
      ).bind(JSON.stringify(operationalPermissions), u.id),
      c.env.DB.prepare("DELETE FROM sessions WHERE admin_id IN (?,?)").bind(
        u.id,
        target.id,
      ),
      c.env.DB.prepare(
        "INSERT INTO audit(actor,action,target) VALUES(?,'ownership.transferred',?)",
      ).bind(u.id, target.id),
    ]);
  } catch {
    return error(c, "Ownership transfer could not be completed", 409);
  }
  return c.json({ ok: true, redirect: "/admin/login" });
});
identity.post("/api/admin/security-policy", async (c) => {
  const u = await current(c);
  if (!u.is_main)
    return error(c, "Only the Owner can change global security policy", 403);
  const d = z
    .object({
      requireTotp: z.boolean(),
      password: z.string(),
      code: z.string(),
    })
    .parse(await c.req.json());
  if (
    !(await rate(c.env.DB, "security-policy:" + u.id, 5, 900)) ||
    !(await proof(c, u, d.password, d.code, true))
  )
    return error(c, "Password or code is incorrect", 403);
  await c.env.DB.batch([
    c.env.DB.prepare(
      "UPDATE records SET data=?,version=version+1 WHERE kind='security' AND id='main'",
    ).bind(JSON.stringify({ requireTotp: d.requireTotp })),
    c.env.DB.prepare(
      "DELETE FROM sessions WHERE admin_id IN (SELECT id FROM admins WHERE totp='')",
    ),
  ]);
  await audit(
    c.env.DB,
    u.id,
    "security.policy_changed",
    "global",
    String(d.requireTotp),
  );
  return c.json({ ok: true, reload: true });
});
export function permissionFields(selected: string[], actor: any) {
  return html`<div class="permission-groups">
    ${Object.entries(permissionGroups).map(
      ([group, items]) =>
        html`<fieldset>
          <legend>${group}</legend>
          ${Object.entries(items)
            .filter(([p]) => actor.is_main || allowed(actor, p))
            .map(
              ([p, label]) =>
                html`<label class="check"
                  ><input
                    type="checkbox"
                    name="permissions"
                    value="${p}"
                    ${raw(selected.includes(p) ? "checked" : "")}
                  />${label}</label
                >`,
            )}
        </fieldset>`,
    )}
  </div>`;
}
function policyField(value = "required") {
  return html`<label
    >Two-factor authentication<select name="totpPolicy">
      ${["required", "optional", "disabled"].map((p) => html`<option value="${p}" ${raw(p === value ? "selected" : "")}>${p === "required" ? "Required" : p === "optional" ? "Optional · admin chooses" : "Disabled"}</option>`)}
    </select></label
  >`;
}
export function identityUsers(users: any[], actor: any) {
  return html`<div class="admin-heading">
      <div>
        <p class="eyebrow">PEOPLE & ACCESS</p>
        <h1>Admin users</h1>
        <p>Individual accounts. Clear responsibilities. One protected Owner.</p>
      </div>
    </div>
    <div class="table-scroll">
      <table>
        <thead>
          <tr>
            <th>Account</th>
            <th>Status</th>
            <th>Authenticator</th>
            <th>Last login</th>
            <th>Created</th>
          </tr>
        </thead>
        <tbody>
          ${users.map(
            (u) =>
              html`<tr>
                <td>
                  <strong>${u.display_name || u.username}</strong
                  ><small>${u.username} · ${u.email || "No email"}</small
                  ><small
                    >${u.is_main ? "Owner · protected" : JSON.parse(u.permissions).length + " capabilities"}</small
                  >
                </td>
                <td>
                  ${u.disabled ? "Suspended" : u.must_reset ? "Awaiting password setup" : "Active"}
                </td>
                <td>
                  ${u.totp ? "Enrolled" : "Not enrolled"} · ${u.totp_policy}
                </td>
                <td>${u.last_login || "Not yet"}</td>
                <td>${u.created_at}</td>
              </tr>`,
          )}
        </tbody>
      </table>
    </div>
    ${users
      .filter((u) => allowed(actor, "admins.write") && canManage(actor, u))
      .map(
        (u) =>
          html`<details class="panel">
            <summary>Manage ${u.display_name || u.username}</summary>
            <form
              class="admin-editor"
              data-api="/api/admin/users/${u.id}/profile"
              data-method="PUT"
            >
              ${field("Display name", "displayName", u.display_name)}${field("Email", "email", u.email, "email")}${policyField(u.totp_policy)}
              <p class="form-error" role="alert"></p>
              <button class="button">Save account settings</button>
            </form>
            <form
              class="admin-editor"
              data-api="/api/admin/users/${u.id}/permissions"
              data-method="PUT"
              data-permissions-form
            >
              <h3>Access permissions</h3>
              ${permissionFields(JSON.parse(u.permissions), actor)}
              <p class="form-error" role="alert"></p>
              <button class="button">Save permissions & revoke sessions</button>
            </form>
            <form
              class="admin-editor"
              data-api="/api/admin/users/${u.id}/reset"
              data-method="POST"
            >
              <h3>Reset account access</h3>
              <p>
                Issue a new temporary password and revoke every session. The
                admin must choose a new permanent password.
              </p>
              <label class="check"
                ><input name="resetTotp" type="checkbox" />Also reset the
                authenticator (requires new enrollment)</label
              >
              <p class="form-error" role="alert"></p>
              <button class="button secondary-button">
                Issue temporary password
              </button>
            </form>
            <div class="check-row">
              <button
                class="text-button"
                data-action="/api/admin/users/${u.id}/toggle"
              >
                ${u.disabled ? "Reactivate" : "Suspend"}</button
              ><button
                class="text-button danger"
                data-delete="/api/admin/users/${u.id}"
                data-confirm="Delete this non-owner admin and revoke all sessions?"
              >
                Delete admin
              </button>
            </div>
          </details>`,
      )}${
      allowed(actor, "admins.create")
        ? html`<details class="panel" open>
            <summary>Create an admin</summary>
            <form id="create-admin">
              <p>
                Operational access is selected by default. Temporary passwords
                expire after seven days. The admin sets up their own password
                and authenticator; no permanent password is emailed.
              </p>
              ${field("Display name", "displayName")}${field("Username", "username", "", "text", "required")}${field("Email", "email", "", "email", "required")}${field("Temporary password (leave empty to generate securely)", "password", "", "password", 'minlength="12" autocomplete="new-password"')}${policyField()}<label
                class="check"
                ><input type="checkbox" name="disabled" />Start suspended</label
              >${permissionFields(operationalPermissions, actor)}
              <p class="form-error" role="alert"></p>
              <button class="button">Create admin</button>
              <div id="admin-created" role="status"></div>
            </form>
          </details>`
        : ""
    }`;
}
export async function identitySecurity(c: any) {
  const u = await current(c),
    rows = (
      await c.env.DB.prepare(
        "SELECT token_hash,expires_at,user_agent FROM sessions WHERE admin_id=?",
      )
        .bind(u.id)
        .all()
    ).results,
    settings = await record(c.env.DB, "security");
  const others = (
    await c.env.DB.prepare(
      "SELECT id,username FROM admins WHERE is_main=0 AND disabled=0 AND must_reset=0 AND totp!=''",
    ).all()
  ).results;
  return html`<div class="admin-heading">
      <div>
        <p class="eyebrow">ACCOUNT</p>
        <h1>Security</h1>
        <p>
          ${u.totp ? "Authenticator enrolled" : "Authenticator not enrolled"} ·
          ${(await requiredTotp(c, u)) ? "Required by policy" : "Optional"}
        </p>
      </div>
    </div>
    <section class="panel">
      <h2>Active sessions</h2>
      ${rows.map(
        (r: any) =>
          html`<div class="content-link">
            <span
              >${r.token_hash === c.get("user").token_hash ? "This session" : "Other session"}<small
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
      ${field("Current password", "current", "", "password", "required")}${field("New password", "password", "", "password", 'required minlength="12"')}${field("Authenticator code", "code")}
      <p class="form-error" role="alert"></p>
      <button class="button">Update password</button>
    </form>
    <form id="totp-start" class="panel">
      <h2>${u.totp ? "Change authenticator" : "Enroll authenticator"}</h2>
      <p>
        Your current authenticator stays active until the new one is verified.
      </p>
      ${field("Current password", "password", "", "password", "required")}${field("Current authenticator code", "code")}
      <p class="form-error" role="alert"></p>
      <button class="button">Set up authenticator</button>
    </form>
    <form id="totp-confirm" class="panel" hidden>
      <h2>Verify new authenticator</h2>
      <div id="new-totp-qr"></div>
      <code id="new-totp" class="totp-key"></code
      >${field("New authenticator code", "code", "", "text", 'required pattern="[0-9]{6}"')}
      <p class="form-error" role="alert"></p>
      <button class="button">Activate authenticator</button>
    </form>
    ${
      u.totp && !(await requiredTotp(c, u))
        ? html`<form
            class="panel admin-editor"
            data-api="/api/admin/totp/disable"
            data-method="POST"
          >
            <h2>Disable two-factor authentication</h2>
            ${field("Current password", "password", "", "password", "required")}${field("Current authenticator code", "code", "", "text", "required")}
            <p class="form-error" role="alert"></p>
            <button class="button secondary-button">
              Disable authenticator
            </button>
          </form>`
        : ""
    }${
      u.is_main
        ? html`<form
              class="panel admin-editor"
              data-api="/api/admin/security-policy"
              data-method="POST"
            >
              <h2>Workspace security policy</h2>
              <label class="check"
                ><input
                  type="checkbox"
                  name="requireTotp"
                  ${raw(settings?.requireTotp ? "checked" : "")}
                />Require TOTP for all admins</label
              >
              <p>
                Owner authentication always requires TOTP. Enabling this policy
                revokes unenrolled admin sessions and requires enrollment at
                their next login.
              </p>
              ${field("Owner password", "password", "", "password", "required")}${field("Owner authenticator code", "code", "", "text", "required")}
              <p class="form-error" role="alert"></p>
              <button class="button">Save security policy</button>
            </form>
            <details class="panel">
              <summary>Transfer ownership</summary>
              <form
                class="admin-editor"
                data-api="/api/admin/ownership"
                data-method="POST"
              >
                <p class="notice">
                  This transfers full protected ownership to the selected admin.
                  You will become a normal admin with broad business access, and
                  both accounts will be signed out. Only the new Owner can
                  transfer ownership back.
                </p>
                <label
                  >New Owner<select name="target" required>
                    <option value="">Select an enrolled admin</option>
                    ${others.map((a: any) => html`<option value="${a.id}">${a.username}</option>`)}
                  </select></label
                >${field("Owner password", "password", "", "password", "required")}${field("Owner authenticator code", "code", "", "text", "required")}${field("Type TRANSFER OWNERSHIP to confirm", "confirm", "", "text", 'required pattern="TRANSFER OWNERSHIP"')}
                <p class="form-error" role="alert"></p>
                <button class="button danger">Transfer ownership</button>
              </form>
            </details>`
        : ""
    }`;
}

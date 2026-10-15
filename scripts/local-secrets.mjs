import { existsSync, writeFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
if (!existsSync(".dev.vars")) {
  writeFileSync(
    ".dev.vars",
    `AUTH_KEY=${randomBytes(32).toString("hex")}\nBOOTSTRAP_TOKEN=${randomBytes(32).toString("hex")}\n`,
    { mode: 0o600 },
  );
  console.log(
    "Created ignored local-only secrets in .dev.vars. Values are not printed.",
  );
} else console.log("Existing .dev.vars preserved.");

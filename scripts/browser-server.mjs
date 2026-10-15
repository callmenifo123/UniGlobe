import { spawn, spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
const state = mkdtempSync(join(tmpdir(), "uniglobe-browser-"));
const migrate = spawnSync(
  process.execPath,
  [
    "scripts/wrangler.mjs",
    "d1",
    "migrations",
    "apply",
    "uniglobe-website-db",
    "--local",
    "--persist-to",
    state,
  ],
  { stdio: "inherit" },
);
if (migrate.status !== 0) process.exit(migrate.status || 1);
const server = spawn(
  process.execPath,
  [
    "scripts/wrangler.mjs",
    "dev",
    "--ip",
    "127.0.0.1",
    "--port",
    "8788",
    "--persist-to",
    state,
  ],
  { stdio: "inherit" },
);
const cleanup = () => {
  server.kill("SIGTERM");
};
process.on("SIGTERM", cleanup);
process.on("SIGINT", cleanup);
server.on("exit", (code) => {
  rmSync(state, { recursive: true, force: true });
  process.exit(code || 0);
});

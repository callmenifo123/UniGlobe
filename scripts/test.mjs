import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
const result = spawnSync(
  process.execPath,
  ["node_modules/vitest/vitest.mjs", "run", ...process.argv.slice(2)],
  {
    stdio: "inherit",
    env: {
      ...process.env,
      XDG_CONFIG_HOME:
        process.env.XDG_CONFIG_HOME || join(tmpdir(), "uniglobe-tool-config"),
      WRANGLER_SEND_METRICS: "false",
    },
  },
);
process.exit(result.status ?? 1);

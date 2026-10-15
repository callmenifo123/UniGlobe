import { existsSync } from "node:fs";
import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests/browser",
  fullyParallel: false,
  workers: 1,
  timeout: 30000,
  use: {
    baseURL: "http://127.0.0.1:8788",
    headless: true,
    trace: "off",
    launchOptions: {
      executablePath:
        process.env.CHROMIUM_PATH ||
        (existsSync("/usr/bin/chromium") ? "/usr/bin/chromium" : undefined),
      args: ["--no-sandbox"],
    },
  },
  webServer: {
    command:
      "node scripts/local-secrets.mjs && node scripts/browser-server.mjs",
    url: "http://127.0.0.1:8788",
    reuseExistingServer: false,
    timeout: 60000,
  },
  reporter: "list",
});

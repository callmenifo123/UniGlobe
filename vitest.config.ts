import { defineConfig } from 'vitest/config';
import { cloudflareTest,readD1Migrations } from '@cloudflare/vitest-plugin';
import { randomBytes } from 'node:crypto';
export default defineConfig({plugins:[cloudflareTest({wrangler:{configPath:'./wrangler.jsonc'},miniflare:{bindings:{TEST_MIGRATIONS:await readD1Migrations('./migrations'),AUTH_KEY:randomBytes(32).toString('hex'),BOOTSTRAP_TOKEN:randomBytes(32).toString('hex')},compatibilityFlags:['nodejs_compat']}})],test:{include:['tests/**/*.test.ts'],setupFiles:['./tests/setup.ts'],testTimeout:20000,hookTimeout:30000,fileParallelism:false}});

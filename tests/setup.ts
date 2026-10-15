import { env,applyD1Migrations } from 'cloudflare:test';
import { beforeAll,beforeEach } from 'vitest';
beforeAll(async()=>{await applyD1Migrations((env as any).DB,(env as any).TEST_MIGRATIONS);});
beforeEach(async()=>{const db=(env as any).DB as D1Database;await db.batch([db.prepare('DELETE FROM outbox'),db.prepare('DELETE FROM orders'),db.prepare('DELETE FROM sessions'),db.prepare('DELETE FROM rate_limits'),db.prepare('DELETE FROM totp_used')]);});

import { afterAll, beforeAll, expect, test } from 'vitest';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import type { Server } from 'node:http';
import { Pool } from 'pg';
import { createApp } from '../../src/http/app.js';
import { migrate } from '../../src/db/migrate.js';

const testURL = process.env.JANELA_TEST_DATABASE_URL;
if (!testURL || new URL(testURL).pathname !== '/janela_test' || new URL(testURL).username !== 'janela_test' || new URL(testURL).hostname !== '127.0.0.1') {
  throw new Error('Integration tests require the isolated local janela_test database and role.');
}
const schema = `jt_${randomUUID().replaceAll('-', '')}`;
const admin = new Pool({ connectionString: testURL });
const pool = new Pool({ connectionString: testURL, options: `-c search_path=${schema},public` });
let server: Server;
let address: string;
beforeAll(async () => {
  await admin.query(`CREATE SCHEMA "${schema}"`);
  server = createApp({ pool }).listen(0, '127.0.0.1');
  await once(server, 'listening');
  const info = server.address();
  if (!info || typeof info === 'string') throw new Error('HTTP server did not bind');
  address = `http://127.0.0.1:${info.port}`;
});
afterAll(async () => {
  await new Promise<void>(resolve => server?.close(() => resolve()));
  await pool.end();
  if (!/^jt_[a-f0-9]{32}$/.test(schema)) throw new Error('Unsafe cleanup schema');
  await admin.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
  await admin.end();
});

test('readiness requires migrations, works on real PostgreSQL and exposes no credentials', async () => {
  const unavailable = await fetch(`${address}/health/ready`);
  expect(unavailable.status).toBe(503);
  expect(await unavailable.json()).toEqual({ status: 'unavailable' });
  await migrate(pool);
  const ready = await fetch(`${address}/health/ready`);
  expect(ready.status).toBe(200);
  expect(await ready.json()).toEqual({ status: 'ready' });
  const role = (await pool.query('SELECT rolsuper,rolcreatedb,rolcreaterole FROM pg_roles WHERE rolname=current_user')).rows[0];
  expect(role).toEqual({ rolsuper: false, rolcreatedb: false, rolcreaterole: false });
  expect((await pool.query("SELECT has_database_privilege(current_user,'janela','CONNECT') AS allowed")).rows[0].allowed).toBe(false);
  await migrate(pool);
  expect((await pool.query('SELECT count(*)::integer AS count FROM schema_migrations')).rows[0].count).toBe(1);
});

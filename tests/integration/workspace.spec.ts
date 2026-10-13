import { afterAll, beforeAll, expect, test } from 'vitest';
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { migrate } from '../../src/db/migrate.js';
import { withWorkspace, type Scope } from '../../src/access/scope.js';
import { PostgresSessionStore } from '../../src/access/sessions.js';
import type { SessionData } from 'express-session';
import { cleanupBatch } from '../../src/access/cleanup.js';
const url = process.env.JANELA_TEST_DATABASE_URL;
if (
  !url ||
  new URL(url).pathname !== '/janela_test' ||
  new URL(url).username !== 'janela_test' ||
  new URL(url).hostname !== '127.0.0.1'
)
  throw new Error('Isolated janela_test database required');
const schema = `jt_${randomUUID().replaceAll('-', '')}`;
const admin = new Pool({ connectionString: url });
const pool = new Pool({ connectionString: url, options: `-c search_path=${schema},public` });
const visitorId = randomUUID();
const scope: Scope = { id: randomUUID(), userId: randomUUID(), kind: 'demo', visitorId };
beforeAll(async () => {
  await admin.query(`CREATE SCHEMA "${schema}"`);
  await migrate(pool);
  await pool.query('INSERT INTO visitors(id,token_hash) VALUES($1,$2)', [
    visitorId,
    'a'.repeat(64),
  ]);
  await pool.query(
    "INSERT INTO workspaces(id,kind,visitor_id,expires_at) VALUES($1,'demo',$2,clock_timestamp()+interval '24 hours')",
    [scope.id, visitorId],
  );
  await pool.query(
    'INSERT INTO users(id,workspace_id,email,name,password_hash) VALUES($1,$2,$3,$4,$5)',
    [scope.userId, scope.id, 'fixture@example.test', 'Fixture', 'disabled'],
  );
});
afterAll(async () => {
  await pool.end();
  if (!/^jt_[a-f0-9]{32}$/.test(schema)) throw new Error('Unsafe schema cleanup');
  await admin.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
  await admin.end();
});
test('workspace validates actor ownership and atomically rolls back failed work', async () => {
  await expect(
    withWorkspace(pool, { ...scope, userId: randomUUID() }, async () => 'exposed'),
  ).rejects.toMatchObject({ status: 404 });
  await expect(
    withWorkspace(pool, scope, async (client) => {
      await client.query('INSERT INTO resources(id,workspace_id,name) VALUES($1,$2,$3)', [
        randomUUID(),
        scope.id,
        'Rollback resource',
      ]);
      throw new Error('fixture failure');
    }),
  ).rejects.toThrow('fixture failure');
  expect((await pool.query('SELECT count(*)::integer AS count FROM resources')).rows[0].count).toBe(
    0,
  );
  expect(await withWorkspace(pool, scope, async () => 'available')).toBe('available');
});
test('independent stores share sessions and hide them immediately after revocation', async () => {
  const first = new PostgresSessionStore(pool);
  const second = new PostgresSessionStore(pool);
  const payload = {
    scope,
    csrf: 'fixture-csrf',
    cookie: {
      originalMaxAge: 3600000,
      expires: new Date(Date.now() + 3600000),
      httpOnly: true,
      path: '/',
    },
  } as SessionData;
  await new Promise<void>((resolve, reject) =>
    first.set('fixture-session', payload, (error) => (error ? reject(error) : resolve())),
  );
  const get = () =>
    new Promise<SessionData | null | undefined>((resolve, reject) =>
      second.get('fixture-session', (error, data) => (error ? reject(error) : resolve(data))),
    );
  expect((await get())?.scope?.id).toBe(scope.id);
  await pool.query('UPDATE workspaces SET revoked_at=clock_timestamp() WHERE id=$1', [scope.id]);
  expect(await get()).toBeNull();
  await pool.query('UPDATE workspaces SET revoked_at=NULL WHERE id=$1', [scope.id]);
  await new Promise<void>((resolve, reject) =>
    second.destroy('fixture-session', (error) => (error ? reject(error) : resolve())),
  );
  expect(await get()).toBeNull();
});
test('expiration is rechecked before commit and revoked generations are hidden', async () => {
  await expect(
    withWorkspace(pool, scope, async (client) => {
      await client.query(
        "UPDATE workspaces SET expires_at=clock_timestamp()-interval '1 second' WHERE id=$1",
        [scope.id],
      );
      await client.query('INSERT INTO resources(id,workspace_id,name) VALUES($1,$2,$3)', [
        randomUUID(),
        scope.id,
        'Expired resource',
      ]);
    }),
  ).rejects.toMatchObject({ status: 404 });
  expect((await pool.query('SELECT count(*)::integer AS count FROM resources')).rows[0].count).toBe(
    0,
  );
  await pool.query('UPDATE workspaces SET revoked_at=clock_timestamp() WHERE id=$1', [scope.id]);
  await expect(withWorkspace(pool, scope, async () => 'exposed')).rejects.toMatchObject({
    status: 404,
  });
});
test('bounded cleanup skips locked workspaces and preserves normal and active environments', async () => {
  const expired = randomUUID(),
    locked = randomUUID(),
    active = randomUUID(),
    normal = randomUUID();
  for (const id of [expired, locked, active])
    await pool.query(
      "INSERT INTO workspaces(id,kind,visitor_id,expires_at) VALUES($1,'demo',$2,clock_timestamp()+$3::interval)",
      [id, visitorId, id === active ? '24 hours' : '-1 second'],
    );
  await pool.query("INSERT INTO workspaces(id,kind) VALUES($1,'normal')", [normal]);
  await pool.query('INSERT INTO resources(id,workspace_id,name) VALUES($1,$2,$3)', [
    randomUUID(),
    expired,
    'Expired resource',
  ]);
  await pool.query(
    "INSERT INTO sessions(id,workspace_id,payload,expires_at) VALUES('expired-session',$1,'{}',clock_timestamp()+interval '1 hour')",
    [expired],
  );
  const holder = await pool.connect();
  try {
    await holder.query('BEGIN');
    await holder.query('SELECT id FROM workspaces WHERE id=$1 FOR UPDATE', [locked]);
    expect(await cleanupBatch(pool, 10)).toBeGreaterThanOrEqual(1);
    expect((await pool.query('SELECT id FROM workspaces WHERE id=$1', [expired])).rowCount).toBe(0);
    expect(
      (await pool.query('SELECT id FROM sessions WHERE id=$1', ['expired-session'])).rowCount,
    ).toBe(0);
    expect(
      (
        await pool.query('SELECT id FROM workspaces WHERE id=ANY($1::uuid[])', [
          [locked, active, normal],
        ])
      ).rowCount,
    ).toBe(3);
    await holder.query('COMMIT');
  } finally {
    holder.release();
  }
  expect(await cleanupBatch(pool, 10)).toBe(1);
  await expect(cleanupBatch(pool, 0)).rejects.toThrow('1');
  await expect(cleanupBatch(pool, 1001)).rejects.toThrow('1000');
});

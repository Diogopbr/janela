import { afterAll, beforeAll, expect, test } from 'vitest';
import { fork, type ChildProcess } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { Pool } from 'pg';
import { migrate } from '../../src/db/migrate.js';
const url = process.env.JANELA_TEST_DATABASE_URL;
if (
  !url ||
  new URL(url).pathname !== '/janela_test' ||
  new URL(url).username !== 'janela_test' ||
  new URL(url).hostname !== '127.0.0.1'
)
  throw new Error('Isolated test database required');
const schema = `jt_${randomUUID().replaceAll('-', '')}`;
const admin = new Pool({ connectionString: url });
const pool = new Pool({ connectionString: url, options: `-c search_path=${schema},public` });
const workspace = randomUUID(),
  actor = randomUUID(),
  resource = randomUUID();
const children: ChildProcess[] = [];
beforeAll(async () => {
  await admin.query(`CREATE SCHEMA "${schema}"`);
  await migrate(pool);
  await pool.query("INSERT INTO workspaces(id,kind) VALUES($1,'normal')", [workspace]);
  await pool.query(
    'INSERT INTO users(id,workspace_id,email,name,password_hash) VALUES($1,$2,$3,$4,$5)',
    [actor, workspace, 'race@example.test', 'Fixture', 'disabled'],
  );
  await pool.query('INSERT INTO resources(id,workspace_id,name) VALUES($1,$2,$3)', [
    resource,
    workspace,
    'Race fixture',
  ]);
  await pool.query(
    'CREATE TABLE reservations_unprotected (LIKE reservations INCLUDING DEFAULTS INCLUDING CONSTRAINTS)',
  );
});
afterAll(async () => {
  for (const child of children) {
    if (child.exitCode === null) {
      child.kill();
      await new Promise<void>((resolve) => child.once('exit', () => resolve()));
    }
  }
  await pool.end();
  if (!/^jt_[a-f0-9]{32}$/.test(schema)) throw new Error('Unsafe cleanup');
  await admin.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
  await admin.end();
});
type Message = { event: string; pid?: number; code?: string };
function worker() {
  const child = fork(fileURLToPath(new URL('../workers/exclusion.ts', import.meta.url)), [], {
    execArgv: ['--import', 'tsx'],
    env: { ...process.env, JANELA_TEST_SCHEMA: schema },
    stdio: ['ignore', 'ignore', 'ignore', 'ipc'],
  });
  children.push(child);
  const queued: Message[] = [];
  const pending: Array<{
    event: string;
    resolve: (message: Message) => void;
    reject: (error: Error) => void;
    timer: ReturnType<typeof setTimeout>;
  }> = [];
  child.on('message', (raw: unknown) => {
    const message = raw as Message;
    const index = pending.findIndex((item) => item.event === message.event);
    if (index < 0) {
      queued.push(message);
      return;
    }
    const item = pending.splice(index, 1)[0]!;
    clearTimeout(item.timer);
    item.resolve(message);
  });
  child.on('exit', () => {
    for (const item of pending) {
      clearTimeout(item.timer);
      item.reject(new Error('Database worker exited before expected IPC message'));
    }
  });
  return {
    child,
    next: (event: string) =>
      new Promise<Message>((resolve, reject) => {
        const index = queued.findIndex((message) => message.event === event);
        if (index >= 0) {
          resolve(queued.splice(index, 1)[0]!);
          return;
        }
        const timer = setTimeout(() => reject(new Error(`Worker IPC timeout: ${event}`)), 10000);
        pending.push({ event, resolve, reject, timer });
      }),
  };
}
function values() {
  return [
    randomUUID(),
    workspace,
    resource,
    actor,
    '2026-10-14T12:00:00Z',
    '2026-10-14T13:00:00Z',
    'Concurrent fixture',
  ];
}
test('independent processes block on the exclusion constraint and only one insertion survives', async () => {
  const first = worker(),
    second = worker();
  const firstReady = await first.next('ready');
  const secondReady = await second.next('ready');
  first.child.send({ action: 'insert', table: 'reservations', values: values() });
  await first.next('inserted');
  second.child.send({ action: 'insert', table: 'reservations', values: values() });
  await second.next('attempting');
  let blocked: number[] = [];
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    blocked = (await pool.query('SELECT pg_blocking_pids($1) AS blockers', [secondReady.pid]))
      .rows[0].blockers;
    if (blocked.length) break;
  }
  expect(blocked).toContain(firstReady.pid);
  first.child.send({ action: 'commit' });
  await first.next('committed');
  expect((await second.next('error')).code).toBe('23P01');
  expect(
    (await pool.query('SELECT count(*)::integer AS count FROM reservations')).rows[0].count,
  ).toBe(1);
  first.child.send({ action: 'close' });
  second.child.send({ action: 'close' });
});
test('negative control without exclusion accepts both overlapping inserts before either commits', async () => {
  const first = worker(),
    second = worker();
  await first.next('ready');
  await second.next('ready');
  first.child.send({ action: 'insert', table: 'reservations_unprotected', values: values() });
  await first.next('inserted');
  second.child.send({ action: 'insert', table: 'reservations_unprotected', values: values() });
  await second.next('inserted');
  first.child.send({ action: 'commit' });
  await first.next('committed');
  second.child.send({ action: 'commit' });
  await second.next('committed');
  expect(
    (
      await pool.query(
        `SELECT count(*)::integer AS count FROM reservations_unprotected a JOIN reservations_unprotected b ON a.id<b.id AND a.workspace_id=b.workspace_id AND a.resource_id=b.resource_id AND tstzrange(a.starts_at,a.ends_at,'[)') && tstzrange(b.starts_at,b.ends_at,'[)')`,
      )
    ).rows[0].count,
  ).toBe(1);
  first.child.send({ action: 'close' });
  second.child.send({ action: 'close' });
});

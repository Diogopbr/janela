import { beforeAll, afterAll, expect, test } from 'vitest';
import { randomUUID } from 'node:crypto';
import { fork, type ChildProcess } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { Pool } from 'pg';
import { Temporal } from '@js-temporal/polyfill';
import { migrate } from '../../src/db/migrate.js';
import { ReservationService } from '../../src/reservations/service.js';
import type { Scope } from '../../src/access/scope.js';
import { DemoService } from '../../src/access/demo.js';
const url = process.env.JANELA_TEST_DATABASE_URL;
if (
  !url ||
  new URL(url).pathname !== '/janela_test' ||
  new URL(url).username !== 'janela_test' ||
  new URL(url).hostname !== '127.0.0.1'
)
  throw new Error('Isolated database required');
const schema = `jt_${randomUUID().replaceAll('-', '')}`;
const admin = new Pool({ connectionString: url }),
  pool = new Pool({ connectionString: url, options: `-c search_path=${schema},public` });
const scope: Scope = { id: randomUUID(), userId: randomUUID(), kind: 'normal', visitorId: null };
const resourceId = randomUUID(),
  service = new ReservationService(pool),
  children: ChildProcess[] = [];
let day: string;
beforeAll(async () => {
  await admin.query(`CREATE SCHEMA "${schema}"`);
  await migrate(pool);
  await pool.query("INSERT INTO workspaces(id,kind) VALUES($1,'normal')", [scope.id]);
  await pool.query(
    'INSERT INTO users(id,workspace_id,email,name,password_hash) VALUES($1,$2,$3,$4,$5)',
    [scope.userId, scope.id, 'changes@example.test', 'Fixture', 'disabled'],
  );
  await pool.query('INSERT INTO resources(id,workspace_id,name) VALUES($1,$2,$3)', [
    resourceId,
    scope.id,
    'Change fixture',
  ]);
  const now = (await pool.query('SELECT clock_timestamp() AS now')).rows[0].now as Date;
  let date = Temporal.Instant.from(now.toISOString())
    .toZonedDateTimeISO('America/Sao_Paulo')
    .toPlainDate()
    .add({ days: 1 });
  while (date.dayOfWeek > 5) date = date.add({ days: 1 });
  day = date.toString();
});
afterAll(async () => {
  for (const child of children)
    if (child.exitCode === null && child.signalCode === null) {
      child.kill();
      await new Promise<void>((resolve) => child.once('exit', () => resolve()));
    }
  await pool.end();
  if (!/^jt_[a-f0-9]{32}$/.test(schema)) throw new Error('Unsafe cleanup');
  await admin.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
  await admin.end();
});
type Message = { event: string; pid?: number; status?: number; code?: string };
function worker() {
  const child = fork(fileURLToPath(new URL('../workers/change.ts', import.meta.url)), [], {
    execArgv: ['--import', 'tsx'],
    env: { ...process.env, JANELA_TEST_SCHEMA: schema },
    stdio: ['ignore', 'ignore', 'ignore', 'ipc'],
  });
  children.push(child);
  const waits = new Map<string, (message: Message) => void>(),
    messages = new Map<string, Message>();
  child.on('message', (raw: unknown) => {
    const message = raw as Message;
    const resolve = waits.get(message.event);
    if (resolve) resolve(message);
    else messages.set(message.event, message);
  });
  return {
    child,
    next: (event: string) =>
      new Promise<Message>((resolve, reject) => {
        const cached = messages.get(event);
        if (cached) {
          resolve(cached);
          return;
        }
        const timer = setTimeout(() => reject(new Error(`Worker timeout: ${event}`)), 10000);
        waits.set(event, (message) => {
          clearTimeout(timer);
          resolve(message);
        });
      }),
  };
}
function input(start: string, end: string) {
  return {
    resourceId,
    startsAt: `${day}T${start}:00-03:00`,
    endsAt: `${day}T${end}:00-03:00`,
    purpose: 'Change fixture',
    idempotencyKey: randomUUID(),
  };
}
async function observeBlocked(pids: number[], holder: number) {
  const deadline = Date.now() + 5000;
  let last: unknown;
  while (Date.now() < deadline) {
    const rows = (
      await pool.query(
        'SELECT pid,pg_blocking_pids(pid) AS blockers FROM unnest($1::integer[]) AS pid',
        [pids],
      )
    ).rows;
    last = rows;
    const reachesHolder = (pid: number, seen = new Set<number>()): boolean => {
      if (pid === holder) return true;
      if (seen.has(pid)) return false;
      seen.add(pid);
      const row = rows.find((item) => item.pid === pid);
      return (
        row?.blockers.some((blocker: number) => reachesHolder(blocker, new Set(seen))) ?? false
      );
    };
    if (rows.length === pids.length && pids.every((pid) => reachesHolder(pid))) return;
  }
  throw new Error(
    `Expected independent processes were not observed blocked: ${JSON.stringify({ holder, last })}`,
  );
}
for (const secondAction of ['reschedule', 'cancel'] as const)
  test(`two independent ${secondAction} contenders leave one version and one event winner`, async () => {
    const resource = randomUUID();
    await pool.query('INSERT INTO resources(id,workspace_id,name) VALUES($1,$2,$3)', [
      resource,
      scope.id,
      `Race ${secondAction}`,
    ]);
    const created = await service.create(scope, {
      ...input('09:00', '10:00'),
      resourceId: resource,
    });
    const holder = await pool.connect();
    try {
      await holder.query('BEGIN');
      const holderPid = (await holder.query('SELECT pg_backend_pid() AS pid')).rows[0].pid;
      await holder.query('SELECT id FROM reservations WHERE id=$1 FOR UPDATE', [
        created.reservation.id,
      ]);
      const first = worker(),
        second = worker();
      const a = await first.next('ready'),
        b = await second.next('ready');
      const edit = {
        ...input('10:00', '11:00'),
        resourceId: resource,
        reason: 'Concurrent fixture',
        expectedVersion: 1,
      };
      first.child.send({ action: 'reschedule', scope, id: created.reservation.id, input: edit });
      second.child.send({
        action: secondAction,
        scope,
        id: created.reservation.id,
        input:
          secondAction === 'cancel'
            ? { reason: 'Concurrent cancellation', expectedVersion: 1 }
            : { ...edit, ...input('11:00', '12:00'), resourceId: resource },
      });
      await observeBlocked([a.pid!, b.pid!], holderPid);
      await holder.query('COMMIT');
      const results = [await first.next('result'), await second.next('result')];
      expect(results).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ status: 200 }),
          expect.objectContaining({ status: 409 }),
        ]),
      );
      expect(results.find((result) => result.status === 409)?.code).toBe('VERSION_CONFLICT');
      expect(
        (await pool.query('SELECT version FROM reservations WHERE id=$1', [created.reservation.id]))
          .rows[0].version,
      ).toBe(2);
      expect(
        (
          await pool.query(
            'SELECT count(*)::integer AS count FROM reservation_events WHERE reservation_id=$1',
            [created.reservation.id],
          )
        ).rows[0].count,
      ).toBe(2);
    } finally {
      await holder.query('ROLLBACK');
      holder.release();
    }
  });
test('a failure after event insertion rolls back both schedule and history', async () => {
  const created = await service.create(scope, input('14:00', '15:00'));
  await pool.query(
    `CREATE FUNCTION fixture_fail_event() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.reason='Injected failure' THEN RAISE EXCEPTION 'Injected event failure'; END IF; RETURN NEW; END; $$`,
  );
  await pool.query(
    'CREATE TRIGGER fixture_fail_event AFTER INSERT ON reservation_events FOR EACH ROW EXECUTE FUNCTION fixture_fail_event()',
  );
  await expect(
    service.reschedule(scope, created.reservation.id, {
      ...input('15:00', '16:00'),
      reason: 'Injected failure',
      expectedVersion: 1,
    }),
  ).rejects.toThrow('Injected event failure');
  const current = (
    await pool.query('SELECT starts_at,version FROM reservations WHERE id=$1', [
      created.reservation.id,
    ])
  ).rows[0];
  expect(current.starts_at.toISOString()).toBe(created.reservation.startsAt);
  expect(current.version).toBe(1);
  expect(
    (
      await pool.query(
        'SELECT count(*)::integer AS count FROM reservation_events WHERE reservation_id=$1',
        [created.reservation.id],
      )
    ).rows[0].count,
  ).toBe(1);
});
test('reschedule versus creation has one interval winner under an observed exclusion wait', async () => {
  const resource = randomUUID();
  await pool.query('INSERT INTO resources(id,workspace_id,name) VALUES($1,$2,$3)', [
    resource,
    scope.id,
    'Reschedule versus creation',
  ]);
  const created = await service.create(scope, { ...input('09:00', '10:00'), resourceId: resource });
  const holder = await pool.connect();
  try {
    await holder.query('BEGIN');
    const holderPid = (await holder.query('SELECT pg_backend_pid() AS pid')).rows[0].pid;
    const target = { ...input('11:00', '12:00'), resourceId: resource };
    await holder.query(
      'INSERT INTO reservations(id,workspace_id,resource_id,actor_id,starts_at,ends_at,purpose) VALUES($1,$2,$3,$4,$5,$6,$7)',
      [
        randomUUID(),
        scope.id,
        resource,
        scope.userId,
        target.startsAt,
        target.endsAt,
        'Uncommitted barrier',
      ],
    );
    const first = worker(),
      second = worker();
    const a = await first.next('ready'),
      b = await second.next('ready');
    first.child.send({
      action: 'reschedule',
      scope,
      id: created.reservation.id,
      input: { ...target, reason: 'Concurrent reschedule', expectedVersion: 1 },
    });
    second.child.send({ action: 'create', scope, input: target });
    await observeBlocked([a.pid!, b.pid!], holderPid);
    await holder.query('ROLLBACK');
    const results = [await first.next('result'), await second.next('result')];
    expect(results).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ status: 200 }),
        expect.objectContaining({ status: 409 }),
      ]),
    );
    expect(results.find((result) => result.status === 409)?.code).toBe('RESERVATION_CONFLICT');
    expect(
      (
        await pool.query(
          'SELECT count(*)::integer AS count FROM reservations WHERE resource_id=$1 AND starts_at=$2 AND status=$3',
          [resource, target.startsAt, 'confirmed'],
        )
      ).rows[0].count,
    ).toBe(1);
    expect(
      (
        await pool.query(
          'SELECT count(*)::integer AS count FROM reservation_events e JOIN reservations r ON r.id=e.reservation_id WHERE r.resource_id=$1',
          [resource],
        )
      ).rows[0].count,
    ).toBe(2);
  } finally {
    await holder.query('ROLLBACK');
    holder.release();
  }
});
test('expiration during an observed reservation wait prevents the transaction from committing', async () => {
  const demo = await new DemoService(pool).start(
    randomUUID().replaceAll('-', '') + randomUUID().replaceAll('-', ''),
    'expiry-race',
  );
  const resource = (
    await pool.query("SELECT id FROM resources WHERE workspace_id=$1 AND name='Kit Áudio 01'", [
      demo.scope.id,
    ])
  ).rows[0].id;
  const created = await service.create(demo.scope, {
    ...input('12:00', '13:00'),
    resourceId: resource,
  });
  const holder = await pool.connect();
  try {
    await holder.query('BEGIN');
    const holderPid = (await holder.query('SELECT pg_backend_pid() AS pid')).rows[0].pid;
    await holder.query('SELECT id FROM reservations WHERE id=$1 FOR UPDATE', [
      created.reservation.id,
    ]);
    await pool.query(
      "UPDATE workspaces SET expires_at=clock_timestamp()+interval '2 seconds' WHERE id=$1",
      [demo.scope.id],
    );
    const contender = worker();
    const ready = await contender.next('ready');
    contender.child.send({
      action: 'cancel',
      scope: demo.scope,
      id: created.reservation.id,
      input: { reason: 'Expires while waiting', expectedVersion: 1 },
    });
    await observeBlocked([ready.pid!], holderPid);
    const deadline = Date.now() + 5000;
    let expired = false;
    while (Date.now() < deadline) {
      expired = (
        await pool.query(
          'SELECT expires_at<=clock_timestamp() AS expired FROM workspaces WHERE id=$1',
          [demo.scope.id],
        )
      ).rows[0].expired;
      if (expired) break;
    }
    expect(expired).toBe(true);
    await holder.query('COMMIT');
    expect((await contender.next('result')).status).toBe(404);
    expect(
      (
        await pool.query('SELECT status,version FROM reservations WHERE id=$1', [
          created.reservation.id,
        ])
      ).rows[0],
    ).toEqual({ status: 'confirmed', version: 1 });
    expect(
      (
        await pool.query(
          'SELECT count(*)::integer AS count FROM reservation_events WHERE reservation_id=$1',
          [created.reservation.id],
        )
      ).rows[0].count,
    ).toBe(1);
  } finally {
    await holder.query('ROLLBACK');
    holder.release();
  }
});
test('revocation committed while a workspace lock is awaited rejects the old generation', async () => {
  const demo = await new DemoService(pool).start(
    randomUUID().replaceAll('-', '') + randomUUID().replaceAll('-', ''),
    'revocation-race',
  );
  const resource = (
    await pool.query("SELECT id FROM resources WHERE workspace_id=$1 AND name='Kit Áudio 01'", [
      demo.scope.id,
    ])
  ).rows[0].id;
  const created = await service.create(demo.scope, {
    ...input('12:00', '13:00'),
    resourceId: resource,
  });
  const holder = await pool.connect();
  try {
    await holder.query('BEGIN');
    const holderPid = (await holder.query('SELECT pg_backend_pid() AS pid')).rows[0].pid;
    await holder.query('SELECT id FROM workspaces WHERE id=$1 FOR UPDATE', [demo.scope.id]);
    const contender = worker();
    const ready = await contender.next('ready');
    contender.child.send({
      action: 'cancel',
      scope: demo.scope,
      id: created.reservation.id,
      input: { reason: 'Old generation', expectedVersion: 1 },
    });
    await observeBlocked([ready.pid!], holderPid);
    await holder.query('UPDATE workspaces SET revoked_at=clock_timestamp() WHERE id=$1', [
      demo.scope.id,
    ]);
    await holder.query('COMMIT');
    expect((await contender.next('result')).status).toBe(404);
    expect(
      (await pool.query('SELECT version FROM reservations WHERE id=$1', [created.reservation.id]))
        .rows[0].version,
    ).toBe(1);
  } finally {
    await holder.query('ROLLBACK');
    holder.release();
  }
});
test('a real reset waits for an active mutation then revokes the entire old generation', async () => {
  const token = randomUUID().replaceAll('-', '') + randomUUID().replaceAll('-', '');
  const demo = await new DemoService(pool).start(token, 'actual-reset-race');
  const resource = (
    await pool.query("SELECT id FROM resources WHERE workspace_id=$1 AND name='Kit Áudio 01'", [
      demo.scope.id,
    ])
  ).rows[0].id;
  const created = await service.create(demo.scope, {
    ...input('12:00', '13:00'),
    resourceId: resource,
  });
  const holder = await pool.connect();
  try {
    await holder.query('BEGIN');
    const holderPid = (await holder.query('SELECT pg_backend_pid() AS pid')).rows[0].pid;
    await holder.query('SELECT id FROM reservations WHERE id=$1 FOR UPDATE', [
      created.reservation.id,
    ]);
    const mutation = worker();
    const mutationReady = await mutation.next('ready');
    mutation.child.send({
      action: 'cancel',
      scope: demo.scope,
      id: created.reservation.id,
      input: { reason: 'Mutation before reset', expectedVersion: 1 },
    });
    await observeBlocked([mutationReady.pid!], holderPid);
    const reset = worker();
    const resetReady = await reset.next('ready');
    reset.child.send({ action: 'reset', scope: demo.scope, token, ip: 'actual-reset-race' });
    await observeBlocked([mutationReady.pid!, resetReady.pid!], holderPid);
    await holder.query('COMMIT');
    expect((await mutation.next('result')).status).toBe(200);
    expect((await reset.next('result')).status).toBe(200);
    expect(
      (
        await pool.query('SELECT revoked_at IS NOT NULL AS revoked FROM workspaces WHERE id=$1', [
          demo.scope.id,
        ])
      ).rows[0].revoked,
    ).toBe(true);
    expect(
      (
        await pool.query(
          'SELECT max(e.created_at)<=w.revoked_at AS ordered FROM reservation_events e JOIN workspaces w ON w.id=e.workspace_id WHERE e.reservation_id=$1 GROUP BY w.revoked_at',
          [created.reservation.id],
        )
      ).rows[0].ordered,
    ).toBe(true);
    await expect(
      service.cancel(demo.scope, created.reservation.id, {
        reason: 'Stale draft',
        expectedVersion: 2,
      }),
    ).rejects.toMatchObject({ status: 404 });
  } finally {
    await holder.query('ROLLBACK');
    holder.release();
  }
});

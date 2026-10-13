import { afterAll, beforeAll, expect, test } from 'vitest';
import { randomUUID, createHash } from 'node:crypto';
import { Pool } from 'pg';
import { Temporal } from '@js-temporal/polyfill';
import { migrate } from '../../src/db/migrate.js';
import { ReservationService, type ReservationInput } from '../../src/reservations/service.js';
import type { Scope } from '../../src/access/scope.js';
import { DemoService } from '../../src/access/demo.js';
import { cleanupBatch } from '../../src/access/cleanup.js';
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
const scope: Scope = { id: randomUUID(), userId: randomUUID(), kind: 'normal', visitorId: null };
const resourceId = randomUUID();
const service = new ReservationService(pool);
let date: string;
beforeAll(async () => {
  await admin.query(`CREATE SCHEMA "${schema}"`);
  await migrate(pool);
  await pool.query("INSERT INTO workspaces(id,kind) VALUES($1,'normal')", [scope.id]);
  await pool.query(
    'INSERT INTO users(id,workspace_id,email,name,password_hash) VALUES($1,$2,$3,$4,$5)',
    [scope.userId, scope.id, 'fixture@example.test', 'Fixture', 'disabled'],
  );
  await pool.query('INSERT INTO resources(id,workspace_id,name) VALUES($1,$2,$3)', [
    resourceId,
    scope.id,
    'Sala fictícia',
  ]);
  const now = (await pool.query('SELECT clock_timestamp() AS now')).rows[0].now as Date;
  let day = Temporal.Instant.from(now.toISOString())
    .toZonedDateTimeISO('America/Sao_Paulo')
    .toPlainDate()
    .add({ days: 1 });
  while (day.dayOfWeek > 5) day = day.add({ days: 1 });
  date = day.toString();
});
afterAll(async () => {
  await pool.end();
  if (!/^jt_[a-f0-9]{32}$/.test(schema)) throw new Error('Unsafe cleanup');
  await admin.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
  await admin.end();
});
function input(start: string, end: string): ReservationInput {
  return {
    resourceId,
    startsAt: `${date}T${start}:00-03:00`,
    endsAt: `${date}T${end}:00-03:00`,
    purpose: 'Reunião fictícia',
    idempotencyKey: randomUUID(),
  };
}
test('creation persists one event, identical retries replay and changed commands conflict', async () => {
  const command = input('09:00', '10:00');
  const first = await service.create(scope, command);
  expect(first.replayed).toBe(false);
  expect(first.reservation.status).toBe('confirmed');
  const repeated = await service.create(scope, command);
  expect(repeated.replayed).toBe(true);
  expect(repeated.reservation.id).toBe(first.reservation.id);
  expect(
    (
      await pool.query(
        'SELECT count(*)::integer AS count FROM reservation_events WHERE reservation_id=$1',
        [first.reservation.id],
      )
    ).rows[0].count,
  ).toBe(1);
  await expect(
    service.create(scope, { ...command, purpose: 'Outro propósito' }),
  ).rejects.toMatchObject({ status: 409 });
});
test('PostgreSQL accepts adjacency, refuses overlap and preserves winner on rollback', async () => {
  const adjacent = await service.create(scope, input('10:00', '11:00'));
  expect(adjacent.reservation.id).toBeTruthy();
  await expect(service.create(scope, input('09:30', '10:30'))).rejects.toMatchObject({
    status: 409,
    code: 'RESERVATION_CONFLICT',
  });
  expect(
    (await pool.query('SELECT count(*)::integer AS count FROM reservations')).rows[0].count,
  ).toBe(2);
  expect(
    (await pool.query('SELECT count(*)::integer AS count FROM reservation_commands')).rows[0].count,
  ).toBe(2);
});
test('foreign resources and invalid purpose cannot create reservations', async () => {
  await expect(
    service.create(scope, { ...input('12:00', '13:00'), resourceId: randomUUID() }),
  ).rejects.toMatchObject({ status: 404 });
  for (const purpose of ['   ', 'ab', 'a'.repeat(121), 'Reunião\nquebrada', '\u200b\u200b\u200b'])
    await expect(
      service.create(scope, { ...input('12:00', '13:00'), purpose }),
    ).rejects.toMatchObject({ status: 422 });
  expect(
    (await pool.query('SELECT count(*)::integer AS count FROM reservations')).rows[0].count,
  ).toBe(2);
});
test('demo quota includes all four examples and cancelled reservations, then cleanup cascades history', async () => {
  const demo = await new DemoService(pool).start('b'.repeat(64), 'fixture-quota-ip');
  const kit = (
    await pool.query("SELECT id FROM resources WHERE workspace_id=$1 AND name='Kit Áudio 01'", [
      demo.scope.id,
    ])
  ).rows[0].id;
  expect(
    (
      await pool.query(
        'SELECT count(*)::integer AS count FROM reservations WHERE workspace_id=$1',
        [demo.scope.id],
      )
    ).rows[0].count,
  ).toBe(4);
  let day = Temporal.PlainDate.from(date);
  for (let count = 0; count < 16; count++) {
    while (day.dayOfWeek > 5) day = day.add({ days: 1 });
    await service.create(demo.scope, {
      resourceId: kit,
      startsAt: `${day}T09:00:00-03:00`,
      endsAt: `${day}T09:15:00-03:00`,
      purpose: 'Quota fictícia',
      idempotencyKey: randomUUID(),
    });
    day = day.add({ days: 1 });
  }
  await pool.query(
    "UPDATE reservations SET status='cancelled' WHERE id=(SELECT id FROM reservations WHERE workspace_id=$1 ORDER BY created_at LIMIT 1)",
    [demo.scope.id],
  );
  while (day.dayOfWeek > 5) day = day.add({ days: 1 });
  await expect(
    service.create(demo.scope, {
      resourceId: kit,
      startsAt: `${day}T09:00:00-03:00`,
      endsAt: `${day}T09:15:00-03:00`,
      purpose: 'Quota recusada',
      idempotencyKey: randomUUID(),
    }),
  ).rejects.toMatchObject({ status: 409, code: 'DEMO_QUOTA' });
  expect(
    (
      await pool.query(
        'SELECT count(*)::integer AS count FROM reservations WHERE workspace_id=$1',
        [demo.scope.id],
      )
    ).rows[0].count,
  ).toBe(20);
  await expect(
    pool.query("UPDATE reservation_events SET action='cancelled' WHERE workspace_id=$1", [
      demo.scope.id,
    ]),
  ).rejects.toMatchObject({ code: '23514' });
  await expect(
    pool.query('DELETE FROM reservation_events WHERE workspace_id=$1', [demo.scope.id]),
  ).rejects.toMatchObject({ code: '23514' });
  await pool.query('UPDATE workspaces SET revoked_at=clock_timestamp() WHERE id=$1', [
    demo.scope.id,
  ]);
  expect(await cleanupBatch(pool, 10)).toBe(1);
  expect(
    (
      await pool.query(
        'SELECT count(*)::integer AS count FROM reservation_events WHERE workspace_id=$1',
        [demo.scope.id],
      )
    ).rows[0].count,
  ).toBe(0);
});
test('a persisted idempotent command can replay after its booking time has passed', async () => {
  const command = {
    resourceId,
    startsAt: '2026-01-05T09:00:00-03:00',
    endsAt: '2026-01-05T10:00:00-03:00',
    purpose: 'Reserva passada fictícia',
    idempotencyKey: randomUUID(),
  };
  const id = randomUUID();
  const normalized = {
    resourceId,
    startsAt: '2026-01-05T12:00:00Z',
    endsAt: '2026-01-05T13:00:00Z',
    purpose: command.purpose,
  };
  await pool.query(
    'INSERT INTO reservations(id,workspace_id,resource_id,actor_id,starts_at,ends_at,purpose) VALUES($1,$2,$3,$4,$5,$6,$7)',
    [
      id,
      scope.id,
      resourceId,
      scope.userId,
      normalized.startsAt,
      normalized.endsAt,
      command.purpose,
    ],
  );
  await pool.query(
    'INSERT INTO reservation_commands(workspace_id,key,hash,reservation_id) VALUES($1,$2,$3,$4)',
    [
      scope.id,
      command.idempotencyKey,
      createHash('sha256').update(JSON.stringify(normalized)).digest('hex'),
      id,
    ],
  );
  const replay = await service.create(scope, command);
  expect(replay.replayed).toBe(true);
  expect(replay.reservation.id).toBe(id);
  await expect(
    service.create(scope, {
      ...command,
      startsAt: '2026-01-05T10:00:00-02:00',
      endsAt: '2026-01-05T11:00:00-02:00',
    }),
  ).rejects.toMatchObject({ status: 422, code: 'INVALID_OFFSET' });
});
test('reschedule is versioned, conflicting changes roll back and cancellation is terminal', async () => {
  const created = await service.create(scope, input('14:00', '15:00'));
  const id = created.reservation.id;
  const edit = { ...input('15:00', '16:00'), reason: 'Ajuste fictício', expectedVersion: 1 };
  await expect(
    service.reschedule(scope, id, { ...edit, expectedVersion: 2 }),
  ).rejects.toMatchObject({ status: 409, code: 'VERSION_CONFLICT' });
  await expect(
    service.reschedule(scope, id, { ...edit, ...input('14:00', '15:00') }),
  ).rejects.toMatchObject({ status: 422, code: 'NO_CHANGE' });
  await expect(
    service.reschedule(scope, id, { ...edit, ...input('09:00', '10:00') }),
  ).rejects.toMatchObject({ status: 409, code: 'RESERVATION_CONFLICT' });
  const unchanged = (
    await pool.query('SELECT starts_at,version FROM reservations WHERE id=$1', [id])
  ).rows[0];
  expect(unchanged.starts_at.toISOString()).toBe(created.reservation.startsAt);
  expect(unchanged.version).toBe(1);
  expect(
    (
      await pool.query(
        'SELECT count(*)::integer AS count FROM reservation_events WHERE reservation_id=$1',
        [id],
      )
    ).rows[0].count,
  ).toBe(1);
  const changed = await service.reschedule(scope, id, edit);
  expect(changed.version).toBe(2);
  expect(changed.events).toHaveLength(2);
  expect(changed.events[1]?.action).toBe('rescheduled');
  await expect(
    service.cancel(scope, id, { reason: 'Desistência fictícia', expectedVersion: 1 }),
  ).rejects.toMatchObject({ status: 409 });
  await expect(
    service.cancel(scope, id, { reason: '  ', expectedVersion: 2 }),
  ).rejects.toMatchObject({ status: 422 });
  const cancelled = await service.cancel(scope, id, {
    reason: 'Desistência fictícia',
    expectedVersion: 2,
  });
  expect(cancelled.status).toBe('cancelled');
  expect(cancelled.version).toBe(3);
  expect(cancelled.events).toHaveLength(3);
  await expect(
    service.reschedule(scope, id, { ...edit, expectedVersion: 3 }),
  ).rejects.toMatchObject({ status: 409, code: 'RESERVATION_CLOSED' });
  await expect(
    service.cancel(scope, id, { reason: 'Outra desistência', expectedVersion: 3 }),
  ).rejects.toMatchObject({ status: 409, code: 'RESERVATION_CLOSED' });
  const replacement = await service.create(scope, input('15:00', '16:00'));
  expect(replacement.reservation.status).toBe('confirmed');
  const past = (
    await pool.query(
      'SELECT id FROM reservations WHERE starts_at<clock_timestamp() AND workspace_id=$1 LIMIT 1',
      [scope.id],
    )
  ).rows[0];
  await expect(
    service.cancel(scope, past.id, { reason: 'Passado fictício', expectedVersion: 1 }),
  ).rejects.toMatchObject({ status: 409, code: 'RESERVATION_PAST' });
});

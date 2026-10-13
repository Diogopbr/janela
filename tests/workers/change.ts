import { Pool } from 'pg';
import {
  ReservationService,
  type ReservationInput,
  type RescheduleInput,
  type CancelInput,
} from '../../src/reservations/service.js';
import type { Scope } from '../../src/access/scope.js';
import { DemoService } from '../../src/access/demo.js';
const url = process.env.JANELA_TEST_DATABASE_URL,
  schema = process.env.JANELA_TEST_SCHEMA;
if (
  !url ||
  new URL(url).pathname !== '/janela_test' ||
  new URL(url).username !== 'janela_test' ||
  new URL(url).hostname !== '127.0.0.1' ||
  !schema ||
  !/^jt_[a-f0-9]{32}$/.test(schema)
)
  throw new Error('Unsafe worker database');
const pool = new Pool({
  connectionString: url,
  max: 1,
  options: `-c search_path=${schema},public`,
});
const pid = (await pool.query('SELECT pg_backend_pid() AS pid')).rows[0].pid;
process.send?.({ event: 'ready', pid });
process.once('message', (raw: unknown) => {
  void (async () => {
    const command = raw as {
      action: 'create' | 'reschedule' | 'cancel' | 'reset';
      scope: Scope;
      id: string;
      input: ReservationInput & RescheduleInput & CancelInput;
      token: string;
      ip: string;
    };
    if (command.action === 'reset') {
      const result = await new DemoService(pool).reset(command.scope, command.token, command.ip);
      process.send?.({ event: 'result', status: 200, workspaceId: result.scope.id });
      return;
    }
    const service = new ReservationService(pool);
    const reservation =
      command.action === 'create'
        ? (await service.create(command.scope, command.input)).reservation
        : command.action === 'reschedule'
          ? await service.reschedule(command.scope, command.id, command.input)
          : await service.cancel(command.scope, command.id, command.input);
    process.send?.({
      event: 'result',
      status: 200,
      version: reservation.version,
      reservationStatus: reservation.status,
    });
  })()
    .catch((error: unknown) => {
      const details = error as { status?: number; code?: string };
      process.send?.({
        event: 'result',
        status: details.status ?? 500,
        code: details.code ?? 'WORKER_ERROR',
      });
    })
    .finally(async () => {
      await pool.end();
      process.disconnect();
    });
});

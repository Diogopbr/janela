import { Client } from 'pg';
const url = process.env.JANELA_TEST_DATABASE_URL;
const schema = process.env.JANELA_TEST_SCHEMA;
if (
  !url ||
  new URL(url).pathname !== '/janela_test' ||
  new URL(url).username !== 'janela_test' ||
  new URL(url).hostname !== '127.0.0.1' ||
  !schema ||
  !/^jt_[a-f0-9]{32}$/.test(schema)
)
  throw new Error('Unsafe worker database');
const client = new Client({ connectionString: url, options: `-c search_path=${schema},public` });
await client.connect();
const pid = (await client.query('SELECT pg_backend_pid() AS pid')).rows[0].pid;
process.send?.({ event: 'ready', pid });
process.on('message', (message: unknown) => {
  void (async () => {
    const input = message as { action: string; table?: string; values?: unknown[] };
    if (input.action === 'insert') {
      if (!['reservations', 'reservations_unprotected'].includes(input.table ?? ''))
        throw new Error('Unsafe table');
      await client.query('BEGIN');
      process.send?.({ event: 'attempting', pid });
      await client.query(
        `INSERT INTO ${input.table}(id,workspace_id,resource_id,actor_id,starts_at,ends_at,purpose) VALUES($1,$2,$3,$4,$5,$6,$7)`,
        input.values,
      );
      process.send?.({ event: 'inserted', pid });
    } else if (input.action === 'commit') {
      await client.query('COMMIT');
      process.send?.({ event: 'committed', pid });
    } else if (input.action === 'close') {
      await client.query('ROLLBACK');
      await client.end();
      process.disconnect();
    }
  })().catch(async (error: unknown) => {
    await client.query('ROLLBACK');
    process.send?.({
      event: 'error',
      code:
        typeof error === 'object' && error !== null && 'code' in error
          ? String(error.code)
          : 'WORKER_ERROR',
    });
  });
});

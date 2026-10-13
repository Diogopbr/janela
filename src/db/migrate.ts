import type { Pool } from 'pg';
import { readFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
export async function migrate(pool: Pool): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      "SELECT pg_advisory_xact_lock(hashtextextended(current_database() || ':' || current_schema() || ':migrations',0))",
    );
    await client.query(
      'CREATE TABLE IF NOT EXISTS schema_migrations (version text PRIMARY KEY, hash text NOT NULL, applied_at timestamptz NOT NULL DEFAULT clock_timestamp())',
    );
    const directory = resolve('database/migrations');
    for (const version of (await readdir(directory))
      .filter((name) => /^\d{3}_[a-z_]+\.sql$/.test(name))
      .sort()) {
      const sql = await readFile(resolve(directory, version), 'utf8');
      const hash = createHash('sha256').update(sql).digest('hex');
      const existing = await client.query('SELECT hash FROM schema_migrations WHERE version=$1', [
        version,
      ]);
      if (existing.rowCount) {
        if (existing.rows[0].hash !== hash)
          throw new Error(`Applied migration changed: ${version}`);
        continue;
      }
      await client.query(sql);
      await client.query('INSERT INTO schema_migrations(version,hash) VALUES($1,$2)', [
        version,
        hash,
      ]);
    }
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

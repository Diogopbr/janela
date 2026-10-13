import type { PoolClient } from 'pg';
import { HttpError } from '../http/errors.js';
export async function consumeLimit(client: PoolClient, key: string, seconds: number, maximum: number): Promise<void> {
  const result = await client.query(`INSERT INTO rate_limits(key,bucket,hits,expires_at)
    SELECT $1,to_timestamp(floor(extract(epoch FROM clock_timestamp())/$2)*$2),1,
      to_timestamp((floor(extract(epoch FROM clock_timestamp())/$2)+1)*$2)
    ON CONFLICT(key,bucket) DO UPDATE SET hits=rate_limits.hits+1
    RETURNING hits, greatest(1,ceil(extract(epoch FROM expires_at-clock_timestamp())))::integer AS retry`,[key,seconds]);
  if (result.rows[0].hits>maximum) throw new HttpError(429,'RATE_LIMIT','Limite temporário atingido. Tente novamente em instantes.',result.rows[0].retry);
}
export async function lockKey(client: PoolClient, key: string): Promise<void> {
  await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[key]);
}

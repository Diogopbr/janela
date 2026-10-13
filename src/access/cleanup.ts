import type { Pool, PoolClient } from 'pg';
async function collect(client:PoolClient,limit:number):Promise<number> {
  const deleted=await client.query(`WITH expired AS (
    SELECT id FROM workspaces WHERE kind='demo' AND (revoked_at IS NOT NULL OR expires_at<=clock_timestamp())
    ORDER BY expires_at,id LIMIT $1 FOR UPDATE SKIP LOCKED
  ) DELETE FROM workspaces w USING expired e WHERE w.id=e.id RETURNING w.id`,[limit]);
  await client.query(`DELETE FROM sessions WHERE id IN (SELECT id FROM sessions WHERE expires_at<=clock_timestamp() ORDER BY expires_at LIMIT $1 FOR UPDATE SKIP LOCKED)`,[limit]);
  await client.query(`DELETE FROM rate_limits WHERE (key,bucket) IN (SELECT key,bucket FROM rate_limits WHERE expires_at<=clock_timestamp() ORDER BY expires_at LIMIT $1 FOR UPDATE SKIP LOCKED)`,[limit]);
  return deleted.rowCount??0;
}
export async function cleanupBatch(pool:Pool,limit:number):Promise<number> {
  if(!Number.isInteger(limit)||limit<1||limit>1000) throw new Error('Cleanup batch must be between 1 and 1000');
  const client=await pool.connect();
  try {await client.query('BEGIN');const count=await collect(client,limit);await client.query('COMMIT');return count;}
  catch(error){await client.query('ROLLBACK');throw error;}
  finally{client.release();}
}
export async function opportunisticCleanup(pool:Pool):Promise<void> {
  const client=await pool.connect();
  try {
    await client.query('BEGIN');
    const due=await client.query(`SELECT id FROM maintenance WHERE last_cleanup_at IS NULL OR last_cleanup_at<clock_timestamp()-interval '1 minute' FOR UPDATE SKIP LOCKED`);
    if(due.rowCount){await collect(client,10);await client.query('UPDATE maintenance SET last_cleanup_at=clock_timestamp() WHERE id=true');}
    await client.query('COMMIT');
  } catch(error){await client.query('ROLLBACK');throw error;}
  finally{client.release();}
}

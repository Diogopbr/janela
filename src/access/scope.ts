import type { Pool, PoolClient } from 'pg';
import { HttpError } from '../http/errors.js';
export type Scope = Readonly<{
  id: string;
  userId: string;
  kind: 'demo' | 'normal';
  visitorId: string | null;
}>;
export async function withWorkspace<T>(
  pool: Pool,
  scope: Scope,
  work: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  const validate = async (): Promise<void> => {
    const active = await client.query(
      `SELECT 1 FROM workspaces w
      JOIN users u ON u.workspace_id=w.id AND u.id=$2
      WHERE w.id=$1 AND w.kind=$3 AND w.visitor_id IS NOT DISTINCT FROM $4::uuid
      AND w.revoked_at IS NULL AND (w.expires_at IS NULL OR w.expires_at>clock_timestamp())`,
      [scope.id, scope.userId, scope.kind, scope.visitorId],
    );
    if (!active.rowCount)
      throw new HttpError(404, 'NOT_FOUND', 'Ambiente não encontrado ou encerrado.');
  };
  try {
    await client.query('BEGIN');
    await validate();
    const locked = await client.query('SELECT id FROM workspaces WHERE id=$1 FOR SHARE', [
      scope.id,
    ]);
    if (!locked.rowCount)
      throw new HttpError(404, 'NOT_FOUND', 'Ambiente não encontrado ou encerrado.');
    await validate();
    const result = await work(client);
    await validate();
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

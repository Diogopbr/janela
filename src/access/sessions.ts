import session, { type SessionData } from 'express-session';
import type { Pool } from 'pg';
import type { Scope } from './scope.js';
declare module 'express-session' {
  interface SessionData {
    scope?: Scope;
    csrf?: string;
  }
}
export class PostgresSessionStore extends session.Store {
  constructor(private readonly pool: Pool) {
    super();
  }
  override get(
    sid: string,
    callback: (error?: unknown, session?: SessionData | null) => void,
  ): void {
    void this.pool
      .query(
        `SELECT s.payload FROM sessions s LEFT JOIN workspaces w ON w.id=s.workspace_id
      WHERE s.id=$1 AND s.expires_at>clock_timestamp()
      AND (s.workspace_id IS NULL OR (w.revoked_at IS NULL AND (w.expires_at IS NULL OR w.expires_at>clock_timestamp())))`,
        [sid],
      )
      .then(
        (result) => callback(null, (result.rows[0]?.payload as SessionData | undefined) ?? null),
        callback,
      );
  }
  override set(sid: string, data: SessionData, callback?: (error?: unknown) => void): void {
    const expires = data.cookie.expires
      ? new Date(data.cookie.expires)
      : new Date(Date.now() + 3600000);
    void this.pool
      .query(
        `INSERT INTO sessions(id,workspace_id,payload,expires_at)
      SELECT $1,$2::uuid,$3::jsonb,$4::timestamptz
      WHERE $2::uuid IS NULL OR EXISTS(SELECT 1 FROM workspaces WHERE id=$2::uuid AND revoked_at IS NULL AND (expires_at IS NULL OR expires_at>clock_timestamp()))
      ON CONFLICT(id) DO UPDATE SET workspace_id=EXCLUDED.workspace_id,payload=EXCLUDED.payload,expires_at=EXCLUDED.expires_at`,
        [sid, data.scope?.id ?? null, JSON.stringify(data), expires],
      )
      .then(
        () => callback?.(),
        (error) => callback?.(error),
      );
  }
  override destroy(sid: string, callback?: (error?: unknown) => void): void {
    void this.pool.query('DELETE FROM sessions WHERE id=$1', [sid]).then(
      () => callback?.(),
      (error) => callback?.(error),
    );
  }
  override touch(sid: string, data: SessionData, callback?: (error?: unknown) => void): void {
    const expires = data.cookie.expires
      ? new Date(data.cookie.expires)
      : new Date(Date.now() + 3600000);
    void this.pool.query('UPDATE sessions SET expires_at=$2 WHERE id=$1', [sid, expires]).then(
      () => callback?.(),
      (error) => callback?.(error),
    );
  }
}

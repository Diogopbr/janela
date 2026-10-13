import type { PoolClient } from 'pg';
import { HttpError } from '../http/errors.js';
export interface ReservationProjection {
  id: string;
  resourceId: string;
  resourceName: string;
  timeZone: string;
  startsAt: string;
  endsAt: string;
  purpose: string;
  status: 'confirmed' | 'cancelled';
  version: number;
  createdAt: string;
  events: Array<{
    id: string;
    action: string;
    actor: string;
    createdAt: string;
    reason: string | null;
    before: unknown;
    after: unknown;
  }>;
}
export async function reservationProjection(
  client: PoolClient,
  workspaceId: string,
  id: string,
): Promise<ReservationProjection> {
  const result = await client.query(
    `SELECT r.*,s.name AS resource_name,s.timezone FROM reservations r
    JOIN resources s ON s.id=r.resource_id AND s.workspace_id=r.workspace_id WHERE r.workspace_id=$1 AND r.id=$2`,
    [workspaceId, id],
  );
  const row = result.rows[0];
  if (!row) throw new HttpError(404, 'NOT_FOUND', 'Reserva não encontrada.');
  const events = await client.query(
    `SELECT e.*,u.name AS actor FROM reservation_events e JOIN users u ON u.id=e.actor_id AND u.workspace_id=e.workspace_id
    WHERE e.workspace_id=$1 AND e.reservation_id=$2 ORDER BY e.created_at,e.id`,
    [workspaceId, id],
  );
  return {
    id: row.id,
    resourceId: row.resource_id,
    resourceName: row.resource_name,
    timeZone: row.timezone,
    startsAt: row.starts_at.toISOString(),
    endsAt: row.ends_at.toISOString(),
    purpose: row.purpose,
    status: row.status,
    version: row.version,
    createdAt: row.created_at.toISOString(),
    events: events.rows.map((event) => ({
      id: event.id,
      action: event.action,
      actor: event.actor,
      createdAt: event.created_at.toISOString(),
      reason: event.reason,
      before: event.before_snapshot,
      after: event.after_snapshot,
    })),
  };
}

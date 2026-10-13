import { Router } from 'express';
import type { Pool } from 'pg';
import { Temporal } from '@js-temporal/polyfill';
import { requiredScope } from '../http/scope.js';
import { withWorkspace } from '../access/scope.js';
import { consumeLimit } from '../access/limits.js';
import { HttpError } from '../http/errors.js';
import { ReservationService, uuidPattern, type ReservationInput } from './service.js';
import { reservationProjection } from './projection.js';
export function reservationRoutes(pool: Pool): Router {
  const router = Router();
  const service = new ReservationService(pool);
  router.post('/reservations', async (request, response) => {
    const scope = requiredScope(request);
    const input: unknown = request.body;
    const keys = ['resourceId', 'startsAt', 'endsAt', 'purpose', 'idempotencyKey'];
    if (!input || typeof input !== 'object' || Array.isArray(input))
      throw new HttpError(422, 'INVALID_INPUT', 'Informe os dados da reserva.');
    const fields = input as Record<string, unknown>;
    if (
      Object.keys(fields).some((key) => !keys.includes(key)) ||
      keys.some((key) => typeof fields[key] !== 'string')
    )
      throw new HttpError(422, 'INVALID_INPUT', 'Dados de reserva inválidos.');
    await withWorkspace(pool, scope, async () => undefined);
    if (scope.kind === 'demo') {
      const client = await pool.connect();
      try {
        await consumeLimit(client, `mutation:visitor:${scope.visitorId}`, 60, 30);
      } finally {
        client.release();
      }
    }
    const result = await service.create(scope, fields as unknown as ReservationInput);
    response.status(result.replayed ? 200 : 201).json(result);
  });
  router.get('/reservations/:id', async (request, response) => {
    const id = request.params.id;
    if (typeof id !== 'string' || !uuidPattern.test(id))
      throw new HttpError(404, 'NOT_FOUND', 'Reserva não encontrada.');
    const scope = requiredScope(request);
    response.json({
      reservation: await withWorkspace(pool, scope, (client) =>
        reservationProjection(client, scope.id, id),
      ),
    });
  });
  router.get('/availability', async (request, response) => {
    const scope = requiredScope(request);
    const resourceId = request.query.resourceId,
      date = request.query.date;
    if (
      typeof resourceId !== 'string' ||
      !uuidPattern.test(resourceId) ||
      typeof date !== 'string' ||
      !/^\d{4}-\d{2}-\d{2}$/.test(date)
    )
      throw new HttpError(422, 'INVALID_INPUT', 'Selecione um recurso e uma data.');
    let day: Temporal.PlainDate;
    try {
      day = Temporal.PlainDate.from(date, { overflow: 'reject' });
    } catch {
      throw new HttpError(422, 'INVALID_INPUT', 'Data inválida.');
    }
    const result = await withWorkspace(pool, scope, async (client) => {
      const resource = (
        await client.query(
          'SELECT id,name,timezone AS "timeZone" FROM resources WHERE workspace_id=$1 AND id=$2',
          [scope.id, resourceId],
        )
      ).rows[0];
      if (!resource) throw new HttpError(404, 'NOT_FOUND', 'Recurso não encontrado.');
      const start = day.toZonedDateTime(resource.timeZone).toInstant().toString();
      const end = day.add({ days: 1 }).toZonedDateTime(resource.timeZone).toInstant().toString();
      const reservations = (
        await client.query(
          `SELECT id,resource_id AS "resourceId",starts_at AS "startsAt",ends_at AS "endsAt",purpose,status,version FROM reservations
        WHERE workspace_id=$1 AND resource_id=$2 AND status='confirmed' AND starts_at<$4::timestamptz AND ends_at>$3::timestamptz ORDER BY starts_at,id`,
          [scope.id, resourceId, start, end],
        )
      ).rows;
      const now = (await client.query('SELECT clock_timestamp() AS now')).rows[0].now as Date;
      return {
        resource,
        date,
        timeZone: resource.timeZone,
        serverNow: now.toISOString(),
        reservations,
      };
    });
    response.json(result);
  });
  return router;
}

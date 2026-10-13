import type { Pool, PoolClient } from 'pg';
import type { Scope } from '../access/scope.js';
import { withWorkspace } from '../access/scope.js';
import { HttpError } from '../http/errors.js';
import { randomUUID, createHash } from 'node:crypto';
import { validateTimes, normalizeTimes } from './time.js';
import { lockKey } from '../access/limits.js';
import { reservationProjection, type ReservationProjection } from './projection.js';
export interface ReservationInput {
  resourceId: string;
  startsAt: string;
  endsAt: string;
  purpose: string;
  idempotencyKey: string;
}
export const uuidPattern = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
export function validateText(value: string, maximum: number): string {
  const text = value.trim();
  if (
    [...text].length < 3 ||
    [...text].length > maximum ||
    /[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/u.test(value)
  )
    throw new HttpError(
      422,
      'INVALID_INPUT',
      `Informe um texto de 3 a ${maximum} caracteres, sem controles ou quebras de linha.`,
    );
  return text;
}
export class ReservationService {
  constructor(private readonly pool: Pool) {}
  async create(
    scope: Scope,
    input: ReservationInput,
  ): Promise<{ reservation: ReservationProjection; replayed: boolean }> {
    try {
      return await withWorkspace(this.pool, scope, (client) =>
        this.createInTransaction(client, scope, input),
      );
    } catch (error) {
      if (
        typeof error === 'object' &&
        error !== null &&
        'code' in error &&
        error.code === '23P01'
      ) {
        const conflicts = await withWorkspace(
          this.pool,
          scope,
          async (client) =>
            (
              await client.query(
                `SELECT id,starts_at AS "startsAt",ends_at AS "endsAt",purpose FROM reservations
          WHERE workspace_id=$1 AND resource_id=$2 AND status='confirmed' AND tstzrange(starts_at,ends_at,'[)') && tstzrange($3::timestamptz,$4::timestamptz,'[)') ORDER BY starts_at`,
                [scope.id, input.resourceId, input.startsAt, input.endsAt],
              )
            ).rows,
        );
        throw new HttpError(
          409,
          'RESERVATION_CONFLICT',
          'O recurso já está reservado nesse intervalo. Escolha outro horário.',
          undefined,
          { conflicts },
        );
      }
      throw error;
    }
  }
  // Used by the administrative demo seed inside its existing atomic transaction.
  async createInTransaction(
    client: PoolClient,
    scope: Scope,
    input: ReservationInput,
  ): Promise<{ reservation: ReservationProjection; replayed: boolean }> {
    if (!uuidPattern.test(input.resourceId) || !uuidPattern.test(input.idempotencyKey))
      throw new HttpError(422, 'INVALID_INPUT', 'Recurso ou chave de confirmação inválidos.');
    const purpose = validateText(input.purpose, 120);
    const resource = (
      await client.query('SELECT timezone FROM resources WHERE workspace_id=$1 AND id=$2', [
        scope.id,
        input.resourceId,
      ])
    ).rows[0];
    if (!resource) throw new HttpError(404, 'NOT_FOUND', 'Recurso não encontrado.');
    const normalized = {
      resourceId: input.resourceId.toLowerCase(),
      ...normalizeTimes(input, resource.timezone),
      purpose,
    };
    const hash = createHash('sha256').update(JSON.stringify(normalized)).digest('hex');
    const claimed = await client.query(
      'INSERT INTO reservation_commands(workspace_id,key,hash) VALUES($1,$2,$3) ON CONFLICT(workspace_id,key) DO NOTHING RETURNING key',
      [scope.id, input.idempotencyKey, hash],
    );
    if (!claimed.rowCount) {
      const previous = (
        await client.query(
          'SELECT hash,reservation_id FROM reservation_commands WHERE workspace_id=$1 AND key=$2',
          [scope.id, input.idempotencyKey],
        )
      ).rows[0];
      if (previous.hash !== hash)
        throw new HttpError(
          409,
          'IDEMPOTENCY_CONFLICT',
          'Esta chave já foi usada para outra confirmação.',
        );
      return {
        reservation: await reservationProjection(client, scope.id, previous.reservation_id),
        replayed: true,
      };
    }
    if (scope.kind === 'demo') {
      await lockKey(client, `quota:workspace:${scope.id}`);
      const count = (
        await client.query(
          'SELECT count(*)::integer AS count FROM reservations WHERE workspace_id=$1',
          [scope.id],
        )
      ).rows[0].count;
      if (count >= 20)
        throw new HttpError(
          409,
          'DEMO_QUOTA',
          'Este ambiente atingiu o limite de 20 reservas. Reinicie a demonstração para experimentar novamente.',
        );
    }
    const clock = (await client.query('SELECT clock_timestamp() AS now')).rows[0].now as Date;
    const times = validateTimes(input, resource.timezone, clock.toISOString());
    const id = randomUUID();
    await client.query(
      'INSERT INTO reservations(id,workspace_id,resource_id,actor_id,starts_at,ends_at,purpose) VALUES($1,$2,$3,$4,$5,$6,$7)',
      [id, scope.id, input.resourceId, scope.userId, times.startsAt, times.endsAt, purpose],
    );
    const snapshot = {
      id,
      resourceId: normalized.resourceId,
      ...times,
      purpose,
      status: 'confirmed',
      version: 1,
    };
    await client.query(
      "INSERT INTO reservation_events(id,workspace_id,reservation_id,actor_id,action,after_snapshot) VALUES($1,$2,$3,$4,'created',$5::jsonb)",
      [randomUUID(), scope.id, id, scope.userId, JSON.stringify(snapshot)],
    );
    await client.query(
      'UPDATE reservation_commands SET reservation_id=$3 WHERE workspace_id=$1 AND key=$2',
      [scope.id, input.idempotencyKey, id],
    );
    const beforeCommit = (await client.query('SELECT clock_timestamp() AS now')).rows[0]
      .now as Date;
    validateTimes(input, resource.timezone, beforeCommit.toISOString());
    return { reservation: await reservationProjection(client, scope.id, id), replayed: false };
  }
}

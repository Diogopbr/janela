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
export interface RescheduleInput {
  resourceId: string;
  startsAt: string;
  endsAt: string;
  purpose: string;
  reason: string;
  expectedVersion: number;
}
export interface CancelInput {
  reason: string;
  expectedVersion: number;
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
  private async transaction<T>(scope: Scope, work: (client: PoolClient) => Promise<T>): Promise<T> {
    for (let attempt = 0; ; attempt++) {
      try {
        return await withWorkspace(this.pool, scope, work);
      } catch (error) {
        const transient =
          typeof error === 'object' &&
          error !== null &&
          'code' in error &&
          ['40P01', '40001'].includes(String(error.code));
        if (!transient || attempt >= 2) throw error;
      }
    }
  }
  private async lockReservation(
    client: PoolClient,
    scope: Scope,
    id: string,
    expectedVersion: number,
  ): Promise<ReservationProjection> {
    if (!uuidPattern.test(id)) throw new HttpError(404, 'NOT_FOUND', 'Reserva não encontrada.');
    const locked = await client.query(
      'SELECT id FROM reservations WHERE workspace_id=$1 AND id=$2 FOR UPDATE',
      [scope.id, id],
    );
    if (!locked.rowCount) throw new HttpError(404, 'NOT_FOUND', 'Reserva não encontrada.');
    const current = await reservationProjection(client, scope.id, id);
    if (current.version !== expectedVersion)
      throw new HttpError(
        409,
        'VERSION_CONFLICT',
        'A reserva foi alterada. Confira o estado atual antes de tentar novamente.',
        undefined,
        { current },
      );
    if (current.status === 'cancelled')
      throw new HttpError(
        409,
        'RESERVATION_CLOSED',
        'Uma reserva cancelada não pode ser alterada.',
      );
    const now = (await client.query('SELECT clock_timestamp() AS now')).rows[0].now as Date;
    if (new Date(current.startsAt).getTime() <= now.getTime())
      throw new HttpError(409, 'RESERVATION_PAST', 'Reservas passadas são somente leitura.');
    return current;
  }
  private snapshot(reservation: ReservationProjection) {
    return {
      id: reservation.id,
      resourceId: reservation.resourceId,
      startsAt: reservation.startsAt,
      endsAt: reservation.endsAt,
      purpose: reservation.purpose,
      status: reservation.status,
      version: reservation.version,
    };
  }
  private async event(
    client: PoolClient,
    scope: Scope,
    before: ReservationProjection,
    action: 'rescheduled' | 'cancelled',
    reason: string,
  ): Promise<void> {
    const after = await reservationProjection(client, scope.id, before.id);
    await client.query(
      'INSERT INTO reservation_events(id,workspace_id,reservation_id,actor_id,action,reason,before_snapshot,after_snapshot) VALUES($1,$2,$3,$4,$5,$6,$7::jsonb,$8::jsonb)',
      [
        randomUUID(),
        scope.id,
        before.id,
        scope.userId,
        action,
        reason,
        JSON.stringify(this.snapshot(before)),
        JSON.stringify(this.snapshot(after)),
      ],
    );
  }
  async reschedule(
    scope: Scope,
    id: string,
    input: RescheduleInput,
  ): Promise<ReservationProjection> {
    const reason = validateText(input.reason, 500),
      purpose = validateText(input.purpose, 120);
    if (!uuidPattern.test(input.resourceId))
      throw new HttpError(422, 'INVALID_INPUT', 'Recurso inválido.');
    try {
      return await this.transaction(scope, async (client) => {
        const current = await this.lockReservation(client, scope, id, input.expectedVersion);
        const resource = (
          await client.query('SELECT timezone FROM resources WHERE workspace_id=$1 AND id=$2', [
            scope.id,
            input.resourceId,
          ])
        ).rows[0];
        if (!resource) throw new HttpError(404, 'NOT_FOUND', 'Recurso não encontrado.');
        const now = (await client.query('SELECT clock_timestamp() AS now')).rows[0].now as Date;
        const times = validateTimes(input, resource.timezone, now.toISOString());
        if (
          current.resourceId === input.resourceId.toLowerCase() &&
          new Date(current.startsAt).getTime() === new Date(times.startsAt).getTime() &&
          new Date(current.endsAt).getTime() === new Date(times.endsAt).getTime()
        )
          throw new HttpError(
            422,
            'NO_CHANGE',
            'Escolha outro recurso ou intervalo para remarcar.',
          );
        await client.query(
          'UPDATE reservations SET resource_id=$3,starts_at=$4,ends_at=$5,purpose=$6,version=version+1 WHERE workspace_id=$1 AND id=$2',
          [scope.id, id, input.resourceId, times.startsAt, times.endsAt, purpose],
        );
        await this.event(client, scope, current, 'rescheduled', reason);
        const clock = (await client.query('SELECT clock_timestamp() AS now')).rows[0].now as Date;
        if (new Date(current.startsAt).getTime() <= clock.getTime())
          throw new HttpError(409, 'RESERVATION_PAST', 'Reservas passadas são somente leitura.');
        validateTimes(input, resource.timezone, clock.toISOString());
        return reservationProjection(client, scope.id, id);
      });
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
                `SELECT id,starts_at AS "startsAt",ends_at AS "endsAt",purpose FROM reservations WHERE workspace_id=$1 AND resource_id=$2 AND id<>$3 AND status='confirmed' AND tstzrange(starts_at,ends_at,'[)') && tstzrange($4::timestamptz,$5::timestamptz,'[)') ORDER BY starts_at`,
                [scope.id, input.resourceId, id, input.startsAt, input.endsAt],
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
  async cancel(scope: Scope, id: string, input: CancelInput): Promise<ReservationProjection> {
    const reason = validateText(input.reason, 500);
    return this.transaction(scope, async (client) => {
      const current = await this.lockReservation(client, scope, id, input.expectedVersion);
      await client.query(
        "UPDATE reservations SET status='cancelled',version=version+1 WHERE workspace_id=$1 AND id=$2",
        [scope.id, id],
      );
      await this.event(client, scope, current, 'cancelled', reason);
      const now = (await client.query('SELECT clock_timestamp() AS now')).rows[0].now as Date;
      if (new Date(current.startsAt).getTime() <= now.getTime())
        throw new HttpError(409, 'RESERVATION_PAST', 'Reservas passadas são somente leitura.');
      return reservationProjection(client, scope.id, id);
    });
  }
  async create(
    scope: Scope,
    input: ReservationInput,
  ): Promise<{ reservation: ReservationProjection; replayed: boolean }> {
    try {
      return await this.transaction(scope, (client) =>
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

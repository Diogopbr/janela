import { randomUUID } from 'node:crypto';
import type { PoolClient } from 'pg';
import type { Scope } from '../access/scope.js';
import { Temporal } from '@js-temporal/polyfill';
import type { ReservationService } from '../reservations/service.js';
export async function seedResources(client: PoolClient, scope: Scope): Promise<void> {
  for (const name of ['Sala Alameda', 'Sala Brisa', 'Projetor 01', 'Kit Áudio 01']) {
    await client.query('INSERT INTO resources(id,workspace_id,name) VALUES($1,$2,$3)', [
      randomUUID(),
      scope.id,
      name,
    ]);
  }
}
export async function seedReservations(
  client: PoolClient,
  scope: Scope,
  service: ReservationService,
): Promise<void> {
  const now = (await client.query('SELECT clock_timestamp() AS now')).rows[0].now as Date;
  let day = Temporal.Instant.from(now.toISOString())
    .toZonedDateTimeISO('America/Sao_Paulo')
    .toPlainDate()
    .add({ days: 1 });
  while (day.dayOfWeek > 5) day = day.add({ days: 1 });
  const resources = (
    await client.query('SELECT id,name FROM resources WHERE workspace_id=$1', [scope.id])
  ).rows;
  const examples = [
    ['Sala Alameda', '09:00', '10:00', 'Planejamento fictício'],
    ['Sala Alameda', '10:00', '11:00', 'Entrevista fictícia'],
    ['Sala Brisa', '14:00', '15:00', 'Revisão fictícia'],
    ['Projetor 01', '15:00', '16:00', 'Apresentação fictícia'],
  ];
  for (const [name, start, end, purpose] of examples) {
    const resource = resources.find((item) => item.name === name);
    if (!resource || !purpose) throw new Error('Demo resource missing');
    await service.createInTransaction(client, scope, {
      resourceId: resource.id,
      startsAt: `${day}T${start}:00-03:00`,
      endsAt: `${day}T${end}:00-03:00`,
      purpose,
      idempotencyKey: randomUUID(),
    });
  }
}

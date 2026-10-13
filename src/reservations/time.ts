import { Temporal } from '@js-temporal/polyfill';
import { HttpError } from '../http/errors.js';
const invalid = (message: string, code = 'INVALID_TIME') => new HttpError(422, code, message);
function resolveLocal(value: string, timeZone: string): Temporal.ZonedDateTime {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/.test(value))
    throw invalid('Informe data e horário com offset explícito.');
  let plain: Temporal.PlainDateTime;
  let instant: Temporal.Instant;
  try {
    plain = Temporal.PlainDateTime.from(value, { overflow: 'reject' });
    instant = Temporal.Instant.from(value);
  } catch {
    throw invalid('Data ou horário inválido.');
  }
  let local: Temporal.ZonedDateTime;
  try {
    local = plain.toZonedDateTime(timeZone, { disambiguation: 'reject' });
  } catch {
    throw invalid(
      'Esse horário local não existe ou é ambíguo na zona do recurso.',
      'INVALID_LOCAL_TIME',
    );
  }
  if (local.epochNanoseconds !== instant.epochNanoseconds)
    throw invalid('O offset informado não corresponde à zona do recurso.', 'INVALID_OFFSET');
  return local;
}
export function normalizeTimes(
  input: { startsAt: string; endsAt: string },
  timeZone: string,
): { startsAt: string; endsAt: string } {
  return {
    startsAt: resolveLocal(input.startsAt, timeZone).toInstant().toString(),
    endsAt: resolveLocal(input.endsAt, timeZone).toInstant().toString(),
  };
}
export function validateTimes(
  input: { startsAt: string; endsAt: string },
  timeZone: string,
  serverNow: string,
): { startsAt: string; endsAt: string } {
  const start = resolveLocal(input.startsAt, timeZone),
    end = resolveLocal(input.endsAt, timeZone);
  for (const value of [start, end])
    if (
      value.minute % 15 ||
      value.second ||
      value.millisecond ||
      value.microsecond ||
      value.nanosecond
    )
      throw invalid('Use horários em passos de 15 minutos.');
  const duration = end.epochNanoseconds - start.epochNanoseconds;
  const minute = 60_000_000_000n;
  if (duration < 15n * minute || duration > 240n * minute)
    throw invalid('A duração deve ser entre 15 minutos e 4 horas.');
  if (
    !start.toPlainDate().equals(end.toPlainDate()) ||
    start.dayOfWeek > 5 ||
    start.hour < 9 ||
    end.hour > 18 ||
    (end.hour === 18 && end.minute !== 0)
  )
    throw invalid('Reserve no mesmo dia útil, entre 9h e 18h.');
  const now = Temporal.Instant.from(serverNow);
  const horizon = start.epochNanoseconds - now.epochNanoseconds;
  if (horizon < 5n * minute || horizon > 30n * 24n * 60n * minute)
    throw invalid('O início deve estar entre 5 minutos e 30 dias a partir de agora.');
  return { startsAt: start.toInstant().toString(), endsAt: end.toInstant().toString() };
}

import { Temporal } from '@js-temporal/polyfill';
export function nextBusinessDay(timeZone = 'America/Sao_Paulo'): string {
  let day = Temporal.Now.zonedDateTimeISO(timeZone).toPlainDate().add({ days: 1 });
  while (day.dayOfWeek > 5) day = day.add({ days: 1 });
  return day.toString();
}
export function localTime(instant: string, timeZone: string): string {
  return Temporal.Instant.from(instant)
    .toZonedDateTimeISO(timeZone)
    .toPlainTime()
    .toString({ smallestUnit: 'minute' });
}
export function offsetTime(date: string, time: string, timeZone: string): string {
  const zoned = Temporal.PlainDateTime.from(`${date}T${time}:00`).toZonedDateTime(timeZone, {
    disambiguation: 'reject',
  });
  return `${zoned.toPlainDateTime().toString({ smallestUnit: 'second' })}${zoned.offset}`;
}
export function displayDay(date: string): string {
  return Temporal.PlainDate.from(date).toLocaleString('pt-BR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });
}
export function shiftDay(date: string, days: number): string {
  return Temporal.PlainDate.from(date).add({ days }).toString();
}

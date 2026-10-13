import { expect, test } from 'vitest';
import { validateTimes } from '../../src/reservations/time.js';
const now = '2026-10-13T11:00:00Z';
const zone = 'America/Sao_Paulo';
const input = (start: string, end: string) => ({
  startsAt: `2026-10-14T${start}:00-03:00`,
  endsAt: `2026-10-14T${end}:00-03:00`,
});
test('business times resolve to UTC and accept 15-minute and four-hour durations', () => {
  expect(validateTimes(input('09:00', '09:15'), zone, now)).toEqual({
    startsAt: '2026-10-14T12:00:00Z',
    endsAt: '2026-10-14T12:15:00Z',
  });
  expect(validateTimes(input('14:00', '18:00'), zone, now).endsAt).toBe('2026-10-14T21:00:00Z');
});
test('invalid precision, interval, day, opening hours and booking horizon are rejected', () => {
  for (const candidate of [
    input('09:00', '09:14'),
    input('09:00', '13:15'),
    input('09:01', '10:00'),
    input('08:45', '10:00'),
    input('17:00', '18:15'),
    input('11:00', '10:00'),
    { startsAt: '2026-10-17T10:00:00-03:00', endsAt: '2026-10-17T11:00:00-03:00' },
    { startsAt: '2026-10-14T10:00:01-03:00', endsAt: '2026-10-14T11:00:00-03:00' },
    { startsAt: '2026-10-14T10:00:00.001-03:00', endsAt: '2026-10-14T11:00:00-03:00' },
    { startsAt: '2026-10-14T17:00:00-03:00', endsAt: '2026-10-15T10:00:00-03:00' },
  ]) {
    expect(() => validateTimes(candidate, zone, now)).toThrow();
  }
  expect(() => validateTimes(input('09:00', '10:00'), zone, '2026-10-14T11:56:00Z')).toThrow();
  expect(() => validateTimes(input('09:00', '10:00'), zone, '2026-09-01T11:00:00Z')).toThrow();
});
test('offset must match the resource zone and local calendar must be explicit', () => {
  expect(() =>
    validateTimes(
      { startsAt: '2026-10-14T09:00:00-02:00', endsAt: '2026-10-14T10:00:00-02:00' },
      zone,
      now,
    ),
  ).toThrow();
  expect(() =>
    validateTimes({ startsAt: '2026-10-14T09:00:00', endsAt: '2026-10-14T10:00:00' }, zone, now),
  ).toThrow();
  expect(() =>
    validateTimes(
      { startsAt: '2026-02-30T09:00:00-03:00', endsAt: '2026-02-30T10:00:00-03:00' },
      zone,
      now,
    ),
  ).toThrow();
});
test('nonexistent and ambiguous local times are refused rather than silently shifted', () => {
  for (const startsAt of ['2026-03-08T02:30:00-05:00', '2026-11-01T01:30:00-04:00']) {
    expect(() =>
      validateTimes(
        { startsAt, endsAt: startsAt.replace('30:00', '45:00') },
        'America/New_York',
        '2026-03-01T00:00:00Z',
      ),
    ).toThrowError(expect.objectContaining({ code: 'INVALID_LOCAL_TIME' }));
  }
});

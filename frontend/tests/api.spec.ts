import { afterEach, expect, test, vi } from 'vitest';
import { apiFetch } from '../src/api';
afterEach(() => vi.unstubAllGlobals());
test('a mutation sends the draft generation captured before refreshing CSRF', async () => {
  const request = vi
    .fn()
    .mockResolvedValueOnce(new Response(JSON.stringify({ token: 'fresh-token' }), { status: 200 }))
    .mockResolvedValueOnce(
      new Response(JSON.stringify({ reservation: { id: 'fixture' } }), { status: 201 }),
    );
  vi.stubGlobal('fetch', request);
  const result = await apiFetch<{ reservation: { id: string } }>(
    '/reservations',
    { method: 'POST', body: JSON.stringify({ purpose: 'Fixture' }) },
    'old-generation',
  );
  expect(result.reservation.id).toBe('fixture');
  expect(request).toHaveBeenCalledTimes(2);
  const headers = new Headers(request.mock.calls[1]?.[1].headers);
  expect(headers.get('X-Janela-Workspace')).toBe('old-generation');
  expect(headers.get('X-CSRF-Token')).toBe('fresh-token');
});
test('structured conflicts retain useful detail and never repeat a mutation automatically', async () => {
  const request = vi
    .fn()
    .mockResolvedValueOnce(new Response(JSON.stringify({ token: 'fresh-token' }), { status: 200 }))
    .mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          error: {
            code: 'RESERVATION_CONFLICT',
            message: 'Horário ocupado',
            conflicts: [{ id: 'winner' }],
          },
        }),
        { status: 409 },
      ),
    );
  vi.stubGlobal('fetch', request);
  await expect(
    apiFetch('/reservations', { method: 'POST', body: '{}' }, 'generation'),
  ).rejects.toMatchObject({
    status: 409,
    code: 'RESERVATION_CONFLICT',
    conflicts: [{ id: 'winner' }],
  });
  expect(request).toHaveBeenCalledTimes(2);
});
test('HTML gateway errors become a recoverable message without exposing raw response text', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue(new Response('<html>proxy failure</html>', { status: 502 })),
  );
  await expect(apiFetch('/auth')).rejects.toMatchObject({ status: 502, code: 'UNAVAILABLE' });
});

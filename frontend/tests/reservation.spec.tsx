import { afterEach, expect, test, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { Reservation } from '../src/pages/Reservation';
import { useQuery } from '../src/useQuery';
import { apiFetch, ApiError } from '../src/api';
vi.mock('../src/useQuery', () => ({ useQuery: vi.fn() }));
vi.mock('../src/api', async () => {
  const actual = await vi.importActual('../src/api');
  return { ...actual, apiFetch: vi.fn() };
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});
const workspace = {
  id: 'workspace',
  userId: 'user',
  kind: 'demo' as const,
  visitorId: 'visitor',
  expiresAt: '2026-10-14T13:00:00Z',
};
function renderDetail() {
  render(
    <MemoryRouter initialEntries={['/reservas/fixture']}>
      <Routes>
        <Route path="/reservas/:id" element={<Reservation workspace={workspace} />} />
      </Routes>
    </MemoryRouter>,
  );
}
const resourceList = [
  { id: 'origin', name: 'Sala Alameda', timeZone: 'America/Sao_Paulo' },
  { id: 'destination', name: 'Sala Brisa', timeZone: 'America/Sao_Paulo' },
];
const fixture = {
  id: 'fixture',
  resourceId: 'destination',
  resourceName: 'Sala Brisa',
  timeZone: 'America/Sao_Paulo',
  startsAt: '2026-10-15T12:00:00Z',
  endsAt: '2026-10-15T13:00:00Z',
  purpose: 'Reserva fictícia',
  status: 'confirmed' as const,
  version: 2,
  createdAt: '2026-10-13T12:00:00Z',
  events: [],
};
test('history distinguishes a different day and resource even when both clock times match', () => {
  const before = {
    id: 'fixture',
    resourceId: 'origin',
    startsAt: '2026-10-14T12:00:00Z',
    endsAt: '2026-10-14T13:00:00Z',
    purpose: 'Reserva fictícia',
    status: 'confirmed',
    version: 1,
  };
  const after = {
    ...before,
    resourceId: 'destination',
    startsAt: fixture.startsAt,
    endsAt: fixture.endsAt,
    version: 2,
  };
  const reservation = {
    ...fixture,
    events: [
      {
        id: 'event',
        actor: 'Visitante',
        action: 'rescheduled',
        createdAt: '2026-10-13T13:00:00Z',
        reason: 'Troca fictícia',
        before,
        after,
      },
    ],
  };
  vi.mocked(useQuery).mockImplementation(
    (path) =>
      ({
        data:
          path === '/resources'
            ? { resources: resourceList }
            : { reservation, serverNow: '2026-10-13T13:00:00Z' },
        loading: false,
        error: null,
        reload: vi.fn(),
      }) as ReturnType<typeof useQuery>,
  );
  renderDetail();
  expect(screen.getByText(/^Antes:/).textContent).toContain('Sala Alameda');
  expect(screen.getByText(/^Antes:/).textContent).toContain('14/10/2026');
  expect(screen.getByText(/^Registrado:/).textContent).toContain('Sala Brisa');
  expect(screen.getByText(/^Registrado:/).textContent).toContain('15/10/2026');
});
test('stale cancellation offers explicit current-state recovery and keeps the reason', async () => {
  const reload = vi.fn();
  const old = { ...fixture, version: 1 };
  vi.mocked(useQuery).mockImplementation(
    (path) =>
      ({
        data:
          path === '/resources'
            ? { resources: resourceList }
            : { reservation: old, serverNow: '2026-10-13T13:00:00Z' },
        loading: false,
        error: null,
        reload,
      }) as ReturnType<typeof useQuery>,
  );
  vi.mocked(apiFetch).mockRejectedValue(
    new ApiError(409, 'VERSION_CONFLICT', 'A reserva mudou.', undefined, fixture),
  );
  renderDetail();
  const user = userEvent.setup();
  await user.click(screen.getByRole('button', { name: 'Cancelar reserva' }));
  await user.type(screen.getByLabelText('Motivo do cancelamento'), 'Motivo preservado');
  await user.click(screen.getByRole('button', { name: 'Confirmar cancelamento' }));
  await screen.findByRole('alert');
  expect((screen.getByLabelText('Motivo do cancelamento') as HTMLTextAreaElement).value).toBe(
    'Motivo preservado',
  );
  await user.click(screen.getByRole('button', { name: 'Carregar estado atual' }));
  expect(reload).toHaveBeenCalledOnce();
  expect((screen.getByLabelText('Motivo do cancelamento') as HTMLTextAreaElement).value).toBe(
    'Motivo preservado',
  );
});
test('a cancelled reservation exposes its history without reactivation or mutation controls', () => {
  const reservation = {
    id: 'fixture',
    resourceId: 'resource',
    resourceName: 'Sala fictícia',
    timeZone: 'America/Sao_Paulo',
    startsAt: '2026-10-14T12:00:00Z',
    endsAt: '2026-10-14T13:00:00Z',
    purpose: 'Reserva fictícia',
    status: 'cancelled',
    version: 3,
    createdAt: '2026-10-13T12:00:00Z',
    events: [],
  };
  vi.mocked(useQuery).mockImplementation(
    (path) =>
      ({
        data:
          path === '/resources'
            ? { resources: [] }
            : { reservation, serverNow: '2026-10-13T13:00:00Z' },
        loading: false,
        error: null,
        reload: vi.fn(),
      }) as ReturnType<typeof useQuery>,
  );
  render(
    <MemoryRouter initialEntries={['/reservas/fixture']}>
      <Routes>
        <Route
          path="/reservas/:id"
          element={
            <Reservation
              workspace={{
                id: 'workspace',
                userId: 'user',
                kind: 'demo',
                visitorId: 'visitor',
                expiresAt: '2026-10-14T13:00:00Z',
              }}
            />
          }
        />
      </Routes>
    </MemoryRouter>,
  );
  expect(screen.getByRole('heading', { name: 'Histórico da reserva' })).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Remarcar' })).toBeNull();
  expect(screen.queryByRole('button', { name: 'Cancelar reserva' })).toBeNull();
  expect(screen.queryByRole('button', { name: /Reativar/ })).toBeNull();
});

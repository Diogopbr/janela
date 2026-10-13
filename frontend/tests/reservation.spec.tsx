import { afterEach, expect, test, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { Reservation } from '../src/pages/Reservation';
import { useQuery } from '../src/useQuery';
vi.mock('../src/useQuery', () => ({ useQuery: vi.fn() }));
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
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

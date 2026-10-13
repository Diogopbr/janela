import { afterEach, expect, test, vi } from 'vitest';
import { cleanup, render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ReservationForm } from '../src/components/ReservationForm';
import { apiFetch, ApiError } from '../src/api';
vi.mock('../src/api', async () => {
  const actual = await vi.importActual('../src/api');
  return { ...actual, apiFetch: vi.fn() };
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});
test('direct time edits publish the same interval to the agenda selection', () => {
  const changed = vi.fn();
  const props = {
    resource: { id: 'resource', name: 'Sala fictícia', timeZone: 'America/Sao_Paulo' },
    date: '2026-10-14',
    workspaceId: 'workspace',
    onSaved: vi.fn(),
    onReload: vi.fn(),
    onIntervalChange: changed,
  };
  render(<ReservationForm {...props} />);
  fireEvent.change(screen.getByLabelText('Início'), { target: { value: '11:00' } });
  fireEvent.change(screen.getByLabelText('Fim'), { target: { value: '12:00' } });
  expect(changed).toHaveBeenLastCalledWith({ start: '11:00', end: '12:00' });
});
test('a conflict keeps the draft and offers explicit availability refresh', async () => {
  vi.mocked(apiFetch).mockRejectedValue(
    new ApiError(409, 'RESERVATION_CONFLICT', 'Horário ocupado. Escolha outro intervalo.'),
  );
  const reload = vi.fn();
  const saved = vi.fn();
  render(
    <ReservationForm
      resource={{ id: 'fixture-resource', name: 'Sala fictícia', timeZone: 'America/Sao_Paulo' }}
      date="2026-10-14"
      workspaceId="original-generation"
      onSaved={saved}
      onReload={reload}
    />,
  );
  const user = userEvent.setup();
  await user.type(screen.getByLabelText('Finalidade'), 'Planejamento fictício');
  await user.click(screen.getByRole('button', { name: 'Confirmar reserva' }));
  expect((await screen.findByRole('alert')).textContent).toContain('Horário ocupado');
  expect((screen.getByLabelText('Finalidade') as HTMLInputElement).value).toBe(
    'Planejamento fictício',
  );
  await user.click(screen.getByRole('button', { name: 'Atualizar agenda' }));
  expect(reload).toHaveBeenCalledOnce();
  expect(saved).not.toHaveBeenCalled();
  expect(vi.mocked(apiFetch).mock.calls[0]?.[2]).toBe('original-generation');
});
test('a generation change never silently moves an existing draft into the new workspace', async () => {
  vi.mocked(apiFetch).mockRejectedValue(new ApiError(404, 'NOT_FOUND', 'Ambiente encerrado.'));
  const props = {
    resource: { id: 'fixture-resource', name: 'Sala fictícia', timeZone: 'America/Sao_Paulo' },
    date: '2026-10-14',
    workspaceId: 'old-generation',
    onSaved: vi.fn(),
    onReload: vi.fn(),
  };
  const view = render(<ReservationForm {...props} />);
  const user = userEvent.setup();
  await user.type(screen.getByLabelText('Finalidade'), 'Rascunho preservado');
  view.rerender(<ReservationForm {...props} workspaceId="new-generation" />);
  await user.click(screen.getByRole('button', { name: 'Confirmar reserva' }));
  await screen.findByRole('alert');
  expect(vi.mocked(apiFetch).mock.calls[0]?.[2]).toBe('old-generation');
  expect((screen.getByLabelText('Finalidade') as HTMLInputElement).value).toBe(
    'Rascunho preservado',
  );
});
test('an obsolete version preserves edits until the user explicitly adopts the current version', async () => {
  const reservation = {
    id: 'fixture',
    resourceId: 'resource',
    resourceName: 'Sala fictícia',
    timeZone: 'America/Sao_Paulo',
    startsAt: '2026-10-14T12:00:00Z',
    endsAt: '2026-10-14T13:00:00Z',
    purpose: 'Finalidade original',
    status: 'confirmed' as const,
    version: 1,
    createdAt: '2026-10-13T12:00:00Z',
    events: [],
  };
  vi.mocked(apiFetch).mockRejectedValue(
    new ApiError(409, 'VERSION_CONFLICT', 'A reserva mudou.', undefined, {
      ...reservation,
      version: 2,
    }),
  );
  render(
    <ReservationForm
      resource={{ id: 'resource', name: 'Sala fictícia', timeZone: 'America/Sao_Paulo' }}
      date="2026-10-14"
      workspaceId="generation"
      reservation={reservation}
      onSaved={vi.fn()}
      onReload={vi.fn()}
    />,
  );
  const user = userEvent.setup();
  await user.clear(screen.getByLabelText('Finalidade'));
  await user.type(screen.getByLabelText('Finalidade'), 'Finalidade editada');
  await user.type(screen.getByLabelText('Motivo da remarcação'), 'Motivo fictício');
  await user.click(screen.getByRole('button', { name: 'Salvar remarcação' }));
  await screen.findByRole('alert');
  expect((screen.getByLabelText('Finalidade') as HTMLInputElement).value).toBe(
    'Finalidade editada',
  );
  await user.click(screen.getByRole('button', { name: /Usar versão atual/ }));
  await user.click(screen.getByRole('button', { name: 'Salvar remarcação' }));
  expect(JSON.parse(String(vi.mocked(apiFetch).mock.calls[1]?.[1]?.body)).expectedVersion).toBe(2);
});

import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Temporal } from '@js-temporal/polyfill';
import { useQuery } from '../useQuery';
import { apiFetch, ApiError } from '../api';
import { localTime } from '../dates';
import type { Workspace } from '../types';
import type { ReservationProjection } from '../../../src/reservations/projection';
import { ReservationForm, type Resource } from '../components/ReservationForm';
export function Reservation(props: { workspace: Workspace }) {
  const { id } = useParams();
  const query = useQuery<{ reservation: ReservationProjection; serverNow: string }>(
    id ? `/reservations/${id}` : null,
    props.workspace.id,
  );
  const resources = useQuery<{ resources: Resource[] }>('/resources', props.workspace.id);
  const [editing, setEditing] = useState(false),
    [cancelling, setCancelling] = useState(false),
    [reason, setReason] = useState(''),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const reservation = query.data?.reservation;
  if (query.loading && !query.data)
    return (
      <main className="detail-page">
        <p role="status">Carregando reserva…</p>
      </main>
    );
  if (query.error || !reservation)
    return (
      <main className="detail-page">
        <Link to="/agenda">Voltar à agenda</Link>
        <div role="alert" className="form-error">
          <p>{query.error?.message ?? 'Reserva não encontrada.'}</p>
          <button type="button" onClick={query.reload}>
            Tentar novamente
          </button>
        </div>
      </main>
    );
  const date = Temporal.Instant.from(reservation.startsAt)
    .toZonedDateTimeISO(reservation.timeZone)
    .toPlainDate()
    .toString();
  const writable =
    reservation.status === 'confirmed' &&
    Date.parse(reservation.startsAt) > Date.parse(query.data!.serverNow);
  async function cancel() {
    setBusy(true);
    setError('');
    try {
      await apiFetch(
        `/reservations/${reservation!.id}/cancel`,
        { method: 'POST', body: JSON.stringify({ reason, expectedVersion: reservation!.version }) },
        props.workspace.id,
      );
      setCancelling(false);
      query.reload();
    } catch (caught) {
      setError(
        caught instanceof ApiError
          ? caught.message
          : 'Não foi possível cancelar. Seu motivo foi preservado.',
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="detail-page">
      <Link className="back-link" to="/agenda">
        Voltar à agenda
      </Link>
      <div className="page-title">
        <div>
          <h1>{reservation.purpose}</h1>
          <p>
            {reservation.resourceName} · {date.split('-').reverse().join('/')} ·{' '}
            {localTime(reservation.startsAt, reservation.timeZone)}–
            {localTime(reservation.endsAt, reservation.timeZone)}
          </p>
        </div>
        <span
          className={`status-label ${reservation.status === 'cancelled' ? 'is-cancelled' : ''}`}
        >
          {reservation.status === 'confirmed' ? 'Confirmada' : 'Cancelada'} · versão{' '}
          {reservation.version}
        </span>
      </div>
      <p>Horário de Brasília · {reservation.timeZone}</p>
      {!writable && (
        <p className="readonly-note">
          {reservation.status === 'cancelled'
            ? 'Reserva cancelada. O intervalo foi liberado; uma nova reserva exige outra confirmação.'
            : 'O início já passou. Esta reserva permanece disponível somente para consulta.'}
        </p>
      )}
      {writable && (
        <div className="detail-actions">
          <button
            type="button"
            className="button-secondary"
            onClick={() => {
              setEditing(!editing);
              setCancelling(false);
            }}
          >
            Remarcar
          </button>
          <button
            type="button"
            className="button-danger"
            onClick={() => {
              setCancelling(!cancelling);
              setEditing(false);
            }}
          >
            Cancelar reserva
          </button>
        </div>
      )}
      {editing && writable && (
        <div className="detail-editor">
          <ReservationForm
            key={reservation.id}
            resource={{
              id: reservation.resourceId,
              name: reservation.resourceName,
              timeZone: reservation.timeZone,
            }}
            resources={resources.data?.resources}
            date={date}
            workspaceId={props.workspace.id}
            reservation={reservation}
            onSaved={() => {
              setEditing(false);
              query.reload();
            }}
            onReload={query.reload}
          />
        </div>
      )}
      {cancelling && writable && (
        <form
          className="cancel-form"
          onSubmit={(event) => {
            event.preventDefault();
            void cancel();
          }}
        >
          <h2>Cancelar este intervalo</h2>
          <p>O histórico será mantido. No ambiente demo, cancelar não repõe a quota de reservas.</p>
          <label>
            Motivo do cancelamento
            <textarea
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              minLength={3}
              maxLength={500}
              rows={3}
              required
            />
          </label>
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          <button className="button-danger" disabled={busy}>
            {busy ? 'Cancelando…' : 'Confirmar cancelamento'}
          </button>
        </form>
      )}
      <section className="history">
        <h2>Histórico da reserva</h2>
        <ol>
          {reservation.events.map((event) => (
            <li key={event.id}>
              <div>
                <strong>
                  {event.action === 'created'
                    ? 'Reserva criada'
                    : event.action === 'rescheduled'
                      ? 'Reserva remarcada'
                      : 'Reserva cancelada'}
                </strong>
                <time dateTime={event.createdAt}>
                  {new Intl.DateTimeFormat('pt-BR', {
                    dateStyle: 'short',
                    timeStyle: 'short',
                    timeZone: reservation.timeZone,
                  }).format(new Date(event.createdAt))}
                </time>
              </div>
              <p>
                {event.actor}
                {event.reason ? ` · ${event.reason}` : ''}
              </p>
              {event.before && typeof event.before === 'object' && 'startsAt' in event.before && (
                <p>
                  Antes: {localTime(String(event.before.startsAt), reservation.timeZone)}–
                  {localTime(
                    String((event.before as { endsAt: string }).endsAt),
                    reservation.timeZone,
                  )}
                  .
                </p>
              )}
              {event.after && typeof event.after === 'object' && 'startsAt' in event.after && (
                <p>
                  Registrado: {localTime(String(event.after.startsAt), reservation.timeZone)}–
                  {localTime(
                    String((event.after as { endsAt: string }).endsAt),
                    reservation.timeZone,
                  )}{' '}
                  ·{' '}
                  {(event.after as { status: string }).status === 'cancelled'
                    ? 'cancelada'
                    : 'confirmada'}
                  .
                </p>
              )}
            </li>
          ))}
        </ol>
      </section>
    </main>
  );
}

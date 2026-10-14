import { useState, useRef, useEffect } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Temporal } from '@js-temporal/polyfill';
import { useQuery } from '../useQuery';
import { apiFetch, ApiError } from '../api';
import { localTime } from '../dates';
import type { Workspace } from '../types';
import type {
  ReservationProjection,
  ReservationSnapshot,
} from '../../../src/reservations/projection';
import { ReservationForm, type Resource } from '../components/ReservationForm';
function snapshotText(
  snapshot: ReservationSnapshot,
  resources: Resource[],
  fallbackTimeZone: string,
): string {
  const resource = resources.find((item) => item.id === snapshot.resourceId);
  const zone = resource?.timeZone ?? fallbackTimeZone;
  const date = Temporal.Instant.from(snapshot.startsAt)
    .toZonedDateTimeISO(zone)
    .toPlainDate()
    .toString()
    .split('-')
    .reverse()
    .join('/');
  return `${resource?.name ?? 'Recurso não disponível'} · ${date} · ${localTime(snapshot.startsAt, zone)}–${localTime(snapshot.endsAt, zone)} · ${zone} · ${snapshot.status === 'cancelled' ? 'cancelada' : 'confirmada'}`;
}
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
    [error, setError] = useState<ApiError | null>(null);
  const errorFocus = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (error) errorFocus.current?.focus();
  }, [error]);
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
    setError(null);
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
          ? caught
          : new ApiError(0, 'UNAVAILABLE', 'Não foi possível cancelar. Seu motivo foi preservado.'),
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
            <div className="form-error" role="alert" ref={errorFocus} tabIndex={-1}>
              <p>{error.message}</p>
              <p>Seu motivo foi preservado.</p>
              {error.current && (
                <p>
                  Estado atual: {error.current.resourceName} ·{' '}
                  {Temporal.Instant.from(error.current.startsAt)
                    .toZonedDateTimeISO(error.current.timeZone)
                    .toPlainDate()
                    .toString()
                    .split('-')
                    .reverse()
                    .join('/')}{' '}
                  · {localTime(error.current.startsAt, error.current.timeZone)}–
                  {localTime(error.current.endsAt, error.current.timeZone)} ·{' '}
                  {error.current.status === 'cancelled' ? 'cancelada' : 'confirmada'} · versão{' '}
                  {error.current.version}.
                </p>
              )}
              {error.status === 409 && (
                <button
                  type="button"
                  className="button-secondary"
                  onClick={() => {
                    query.reload();
                    setError(null);
                  }}
                >
                  Carregar estado atual
                </button>
              )}
            </div>
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
                  Antes:{' '}
                  {snapshotText(
                    event.before,
                    resources.data?.resources ?? [],
                    reservation.timeZone,
                  )}
                  .
                </p>
              )}
              {event.after && typeof event.after === 'object' && 'startsAt' in event.after && (
                <p>
                  Registrado:{' '}
                  {snapshotText(event.after, resources.data?.resources ?? [], reservation.timeZone)}
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

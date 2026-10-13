import { useEffect, useRef, useState, type FormEvent } from 'react';
import { apiFetch, ApiError } from '../api';
import { offsetTime, localTime } from '../dates';
import type { ReservationProjection } from '../../../src/reservations/projection';
export interface Resource {
  id: string;
  name: string;
  timeZone: string;
}
export function ReservationForm(props: {
  resource: Resource;
  resources?: Resource[];
  date: string;
  workspaceId: string;
  onSaved: () => void;
  onReload: () => void;
  onIntervalChange?: (selection: { start: string; end: string }) => void;
  selection?: { start: string; end: string };
  reservation?: ReservationProjection;
}) {
  const existing = props.reservation;
  const [start, setStart] = useState(
    existing
      ? localTime(existing.startsAt, props.resource.timeZone)
      : (props.selection?.start ?? '09:00'),
  );
  const [end, setEnd] = useState(
    existing
      ? localTime(existing.endsAt, props.resource.timeZone)
      : (props.selection?.end ?? '10:00'),
  );
  const [purpose, setPurpose] = useState(existing?.purpose ?? '');
  const [reason, setReason] = useState('');
  const [bookingDate, setBookingDate] = useState(props.date),
    [resourceId, setResourceId] = useState(props.resource.id);
  const selectedResource =
    props.resources?.find((item) => item.id === resourceId) ?? props.resource;
  const [version, setVersion] = useState(existing?.version ?? 1);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState<ApiError | null>(null),
    [success, setSuccess] = useState('');
  const generation = useRef(props.workspaceId),
    command = useRef({ fingerprint: '', key: crypto.randomUUID() });
  const alert = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!existing && props.selection) {
      setStart(props.selection.start);
      setEnd(props.selection.end);
    }
  }, [props.selection, existing]);
  useEffect(() => {
    if (!existing) {
      setBookingDate(props.date);
      setResourceId(props.resource.id);
    }
  }, [existing, props.date, props.resource.id]);
  useEffect(() => {
    if (error) alert.current?.focus();
  }, [error]);
  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setSuccess('');
    try {
      const values = {
        resourceId: selectedResource.id,
        startsAt: offsetTime(bookingDate, start, selectedResource.timeZone),
        endsAt: offsetTime(bookingDate, end, selectedResource.timeZone),
        purpose,
      };
      const fingerprint = JSON.stringify(values);
      if (command.current.fingerprint !== fingerprint)
        command.current = { fingerprint, key: crypto.randomUUID() };
      await apiFetch(
        existing ? `/reservations/${existing.id}` : '/reservations',
        {
          method: existing ? 'PATCH' : 'POST',
          body: JSON.stringify(
            existing
              ? { ...values, reason, expectedVersion: version }
              : { ...values, idempotencyKey: command.current.key },
          ),
        },
        generation.current,
      );
      setSuccess(existing ? 'Reserva remarcada.' : 'Reserva confirmada.');
      props.onSaved();
    } catch (caught) {
      setError(
        caught instanceof ApiError
          ? caught
          : new ApiError(422, 'INVALID_LOCAL_TIME', 'Confira o dia e os horários selecionados.'),
      );
    } finally {
      setBusy(false);
    }
  }
  const minutes = (time: string) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3));
  const duration = minutes(end) - minutes(start);
  return (
    <form onSubmit={submit} className="reservation-form">
      <h2>{existing ? 'Remarcar reserva' : 'Nova reserva'}</h2>
      <p className="form-resource">{props.resource.name}</p>
      {existing && (
        <>
          <label>
            Recurso da remarcação
            <select
              aria-label="Recurso da remarcação"
              value={selectedResource.id}
              onChange={(event) => setResourceId(event.target.value)}
            >
              {(props.resources ?? [props.resource]).map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Dia da remarcação
            <input
              type="date"
              value={bookingDate}
              onChange={(event) => setBookingDate(event.target.value)}
              required
            />
          </label>
        </>
      )}
      <div className="time-fields">
        <label>
          Início
          <input
            type="time"
            value={start}
            onChange={(event) => {
              setStart(event.target.value);
              props.onIntervalChange?.({ start: event.target.value, end });
            }}
            min="09:00"
            max="17:45"
            step="900"
            required
          />
        </label>
        <label>
          Fim
          <input
            type="time"
            value={end}
            onChange={(event) => {
              setEnd(event.target.value);
              props.onIntervalChange?.({ start, end: event.target.value });
            }}
            min="09:15"
            max="18:00"
            step="900"
            required
          />
        </label>
      </div>
      <label>
        Finalidade
        <input
          value={purpose}
          onChange={(event) => setPurpose(event.target.value)}
          minLength={3}
          maxLength={120}
          required
          placeholder="Ex.: planejamento da equipe"
        />
      </label>
      {existing && (
        <label>
          Motivo da remarcação
          <textarea
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            minLength={3}
            maxLength={500}
            required
            rows={3}
          />
        </label>
      )}
      <div className="reservation-summary">
        <span>
          {bookingDate.split('-').reverse().join('/')} · {start}–{end}
        </span>
        <strong>{duration > 0 ? `${duration} minutos` : 'Confira o intervalo'}</strong>
        <span>
          {selectedResource.name} · Horário de Brasília · {selectedResource.timeZone}
        </span>
      </div>
      {error && (
        <div className="form-error" role="alert" tabIndex={-1} ref={alert}>
          <p>{error.message}</p>
          <p>Seu formulário foi preservado.</p>
          {error.status === 409 && (
            <button type="button" className="button-secondary" onClick={props.onReload}>
              Atualizar agenda
            </button>
          )}
          {error.current && (
            <button
              type="button"
              className="button-secondary"
              onClick={() => {
                setVersion(error.current!.version);
                setError(null);
              }}
            >
              Usar versão atual ({error.current.version}) mantendo o rascunho
            </button>
          )}
          {error.status === 404 && (
            <p>
              Este ambiente foi encerrado ou mudou em outra aba. Volte à entrada para iniciar uma
              nova demonstração.
            </p>
          )}
        </div>
      )}
      <p role="status" className="success-message">
        {success}
      </p>
      <button className="button-primary" disabled={busy || duration < 15 || duration > 240}>
        {busy ? 'Salvando…' : existing ? 'Salvar remarcação' : 'Confirmar reserva'}
      </button>
      <p className="form-help">
        Dias úteis, 9h às 18h. Até 4 horas por reserva. Sem calendário de feriados.
      </p>
    </form>
  );
}

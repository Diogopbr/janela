import type { Availability } from '../types';
import { localTime } from '../dates';
export function DaySchedule(props: {
  availability: Availability;
  onSelect: (start: string, end: string) => void;
  onOpen: (id: string) => void;
  selection?: { start: string; end: string };
}) {
  const minutes = (instant: string) => {
    const time = localTime(instant, props.availability.timeZone);
    return Number(time.slice(0, 2)) * 60 + Number(time.slice(3));
  };
  const time = (value: number) =>
    `${Math.floor(value / 60)
      .toString()
      .padStart(2, '0')}:${(value % 60).toString().padStart(2, '0')}`;
  return (
    <section className="day-schedule" aria-label="Agenda do recurso">
      <div className="schedule-heading">
        <h2>Horários do dia</h2>
        <span>Brasília · intervalos de 15 min</span>
      </div>
      <div className="schedule-grid">
        <div className="hour-scale" aria-hidden="true">
          {Array.from({ length: 10 }, (_, index) => (
            <span key={index} style={{ top: `${(index / 9) * 100}%` }}>{`${9 + index}:00`}</span>
          ))}
        </div>
        <div className="schedule-track">
          {Array.from({ length: 36 }, (_, index) => {
            const start = 540 + index * 15,
              end = Math.min(1080, start + 60);
            const occupied = props.availability.reservations.some(
              (item) => minutes(item.startsAt) < start + 15 && minutes(item.endsAt) > start,
            );
            return (
              <button
                type="button"
                key={start}
                className={`schedule-slot${props.selection && time(start) >= props.selection.start && time(start) < props.selection.end ? ' is-selected' : ''}`}
                aria-label={`Selecionar ${time(start)} até ${time(end)}`}
                disabled={occupied}
                onClick={() => props.onSelect(time(start), time(end))}
              />
            );
          })}
          {props.availability.reservations.map((item) => (
            <button
              type="button"
              className={`booking-block${minutes(item.endsAt) - minutes(item.startsAt) <= 15 ? ' is-short' : minutes(item.endsAt) - minutes(item.startsAt) <= 30 ? ' is-medium' : ''}`}
              aria-label={`${localTime(item.startsAt, props.availability.timeZone)} até ${localTime(item.endsAt, props.availability.timeZone)}, ${item.purpose}, confirmada. Ver histórico.`}
              key={item.id}
              style={{
                top: `${((minutes(item.startsAt) - 540) / 540) * 100}%`,
                height: `${((minutes(item.endsAt) - minutes(item.startsAt)) / 540) * 100}%`,
              }}
              onClick={() => props.onOpen(item.id)}
            >
              <strong>
                {localTime(item.startsAt, props.availability.timeZone)}–
                {localTime(item.endsAt, props.availability.timeZone)}
              </strong>
              {minutes(item.endsAt) - minutes(item.startsAt) > 15 && <span>{item.purpose}</span>}
              {minutes(item.endsAt) - minutes(item.startsAt) > 30 && (
                <span className="booking-state">Confirmada</span>
              )}
            </button>
          ))}
        </div>
      </div>
      <div className="schedule-list">
        <h3>Reservas confirmadas</h3>
        {props.availability.reservations.length === 0 ? (
          <p>Nenhuma reserva neste dia. Escolha o intervalo no formulário para confirmar.</p>
        ) : (
          props.availability.reservations.map((item) => (
            <button
              type="button"
              className="booking-row"
              key={item.id}
              onClick={() => props.onOpen(item.id)}
            >
              <span>
                {localTime(item.startsAt, props.availability.timeZone)}–
                {localTime(item.endsAt, props.availability.timeZone)}
              </span>
              <strong>{item.purpose}</strong>
              <span>Confirmada · ver histórico</span>
            </button>
          ))
        )}
      </div>
    </section>
  );
}

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { Workspace, Availability } from '../types';
import { useQuery } from '../useQuery';
import { nextBusinessDay, displayDay, shiftDay } from '../dates';
import { ReservationForm, type Resource } from '../components/ReservationForm';
import { DaySchedule } from '../components/DaySchedule';
export function Agenda(props: { workspace: Workspace }) {
  const navigate = useNavigate();
  const [date, setDate] = useState(() => nextBusinessDay());
  const [chosen, setChosen] = useState(''),
    [selection, setSelection] = useState<{ start: string; end: string }>();
  const [includeCancelled, setIncludeCancelled] = useState(false);
  const resources = useQuery<{ resources: Resource[] }>('/resources', props.workspace.id);
  const resource =
    resources.data?.resources.find((item) => item.id === chosen) ??
    resources.data?.resources.find((item) => item.name === 'Sala Alameda') ??
    resources.data?.resources[0];
  const agenda = useQuery<Availability>(
    resource
      ? `/availability?resourceId=${resource.id}&date=${date}&includeCancelled=${includeCancelled}`
      : null,
    props.workspace.id,
  );
  return (
    <main className="agenda-page">
      <div className="page-title">
        <div>
          <h1>{displayDay(date)}</h1>
          <p>
            {props.workspace.kind === 'demo'
              ? 'Seu ambiente privado · dados fictícios'
              : 'Agenda de recursos'}
          </p>
        </div>
        <span className="timezone-label">America/Sao_Paulo</span>
      </div>
      <div className="agenda-toolbar">
        <label>
          Recurso
          <select
            aria-label="Recurso"
            value={resource?.id ?? ''}
            onChange={(event) => {
              setChosen(event.target.value);
              setSelection(undefined);
            }}
            disabled={resources.loading}
          >
            {resources.data?.resources.map((item) => (
              <option value={item.id} key={item.id}>
                {item.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Dia
          <input
            type="date"
            value={date}
            onChange={(event) => {
              if (event.target.value) {
                setDate(event.target.value);
                setSelection(undefined);
              }
            }}
          />
        </label>
        <div className="day-navigation">
          <button
            type="button"
            className="button-secondary"
            onClick={() => {
              setDate(shiftDay(date, -1));
              setSelection(undefined);
            }}
          >
            Dia anterior
          </button>
          <button
            type="button"
            className="button-secondary"
            onClick={() => {
              setDate(shiftDay(date, 1));
              setSelection(undefined);
            }}
          >
            Próximo dia
          </button>
        </div>
      </div>
      {(resources.error || agenda.error) && (
        <div role="alert" className="form-error">
          <p>{resources.error?.message ?? agenda.error?.message}</p>
          <button
            type="button"
            onClick={() => {
              resources.reload();
              agenda.reload();
            }}
          >
            Tentar novamente
          </button>
        </div>
      )}
      <label className="history-toggle">
        <input
          type="checkbox"
          checked={includeCancelled}
          onChange={(event) => setIncludeCancelled(event.target.checked)}
        />
        Mostrar reservas canceladas
      </label>
      <div className="agenda-workspace">
        <div>
          {agenda.loading || resources.loading ? (
            <div className="loading-agenda" role="status">
              Carregando horários…
            </div>
          ) : (
            agenda.data && (
              <DaySchedule
                availability={agenda.data}
                selection={selection}
                onSelect={(start, end) => setSelection({ start, end })}
                onOpen={(id) => navigate(`/reservas/${id}`)}
              />
            )
          )}
        </div>
        {resource && (
          <aside className="editor-region">
            <ReservationForm
              resource={resource}
              date={date}
              workspaceId={props.workspace.id}
              selection={selection}
              onSaved={agenda.reload}
              onIntervalChange={setSelection}
              onReload={agenda.reload}
            />
          </aside>
        )}
      </div>
      <p className="agenda-note">
        A consulta mostra disponibilidade atual. O horário só é seu depois da confirmação.{' '}
        {props.workspace.kind === 'demo' &&
          'Demonstração limitada a 20 reservas, incluindo os quatro exemplos.'}
      </p>
    </main>
  );
}

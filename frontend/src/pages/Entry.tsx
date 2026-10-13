import { useState, type FormEvent } from 'react';
import { apiFetch } from '../api';
import type { Auth } from '../types';
export function Entry(props: { auth: Auth; onEntered: () => void }) {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [email, setEmail] = useState(''),
    [password, setPassword] = useState('');
  async function enter(login = false) {
    setBusy(true);
    setError('');
    try {
      await apiFetch(login ? '/login' : '/demo/start', {
        method: 'POST',
        body: JSON.stringify(login ? { email, password } : {}),
      });
      props.onEntered();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Não foi possível iniciar.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="entry-page">
      <section className="entry-copy">
        <h1>
          Um recurso.
          <br />
          Um horário.
          <br />
          Uma confirmação.
        </h1>
        <p>
          Organize salas e equipamentos sem colocar duas reservas no mesmo intervalo. Se alguém
          confirmar antes, seu formulário continua aqui.
        </p>
        <button
          className="button-primary"
          disabled={busy || !props.auth.demoEnabled}
          onClick={() => void enter()}
        >
          {busy ? 'Preparando seu ambiente…' : 'Experimentar a agenda'}
        </button>
        <p className="entry-limit">Ambiente privado por 24 horas. Sem cadastro. Dados fictícios.</p>
        {error && (
          <p role="alert" className="form-error">
            {error}
          </p>
        )}
      </section>
      <section className="entry-example" aria-label="Exemplo fictício de conflito">
        <h2>Sala Alameda</h2>
        <p>Exemplo fictício · próximo dia útil</p>
        <div className="example-hours">
          <span>9h</span>
          <span>10h</span>
          <span>11h</span>
          <span>12h</span>
        </div>
        <div className="example-booking">
          <strong>9h–10h</strong>
          <span>Planejamento da equipe</span>
        </div>
        <div className="example-conflict">
          <strong>9h30–10h30</strong>
          <span>Este intervalo já tem uma reserva.</span>
        </div>
        <div className="example-available">
          <strong>11h–12h</strong>
          <span>Um intervalo livre para tentar.</span>
        </div>
        <p>
          Horários adjacentes podem coexistir. Horários sobrepostos recebem conflito e uma opção de
          recuperação.
        </p>
      </section>
      {props.auth.loginEnabled && (
        <form
          className="normal-login"
          onSubmit={(event: FormEvent) => {
            event.preventDefault();
            void enter(true);
          }}
        >
          <h2>Acessar instalação</h2>
          <label>
            E-mail
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              autoComplete="username"
              required
            />
          </label>
          <label>
            Senha
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="current-password"
              required
            />
          </label>
          <button className="button-secondary" disabled={busy}>
            Entrar
          </button>
        </form>
      )}
    </main>
  );
}

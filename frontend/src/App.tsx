import { useState } from 'react';
import { Link, Navigate, Route, Routes, useNavigate } from 'react-router-dom';
import { useQuery } from './useQuery';
import type { Auth } from './types';
import { apiFetch } from './api';
import { Agenda } from './pages/Agenda';
import { Entry } from './pages/Entry';
import { Reservation } from './pages/Reservation';
import { ResetDialog } from './components/ResetDialog';
export function App() {
  const auth = useQuery<Auth>('/auth');
  const navigate = useNavigate();
  const [resetOpen, setResetOpen] = useState(false);
  const workspace = auth.data?.workspace;
  const entered = () => {
    auth.reload();
    navigate('/agenda');
  };
  return (
    <>
      <a className="skip-link" href="#content">
        Pular para o conteúdo
      </a>
      <header className="app-header">
        <Link className="wordmark" to={workspace ? '/agenda' : '/'}>
          janela
          <span aria-hidden="true" className="brand-aperture" />
        </Link>
        <nav aria-label="Navegação principal">
          {workspace && (
            <>
              <Link to="/agenda">Agenda</Link>
              {workspace.kind === 'demo' ? (
                <button type="button" onClick={() => setResetOpen(true)}>
                  Reiniciar demo
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() =>
                    void apiFetch('/logout', { method: 'POST', body: '{}' }, workspace.id).then(
                      () => {
                        auth.reload();
                        navigate('/');
                      },
                    )
                  }
                >
                  Sair
                </button>
              )}
            </>
          )}
          <a href="https://github.com/Diogopbr" target="_blank" rel="noreferrer">
            Diogo Pereira
          </a>
        </nav>
      </header>
      <div id="content" tabIndex={-1}>
        {auth.loading ? (
          <main className="connection-state">
            <h1>Janela</h1>
            <p role="status">Conectando à sua agenda…</p>
          </main>
        ) : auth.error ? (
          <main className="connection-state">
            <h1>Não foi possível abrir a agenda.</h1>
            <p role="alert">{auth.error.message}</p>
            <button className="button-primary" onClick={auth.reload}>
              Tentar novamente
            </button>
          </main>
        ) : (
          auth.data && (
            <Routes>
              <Route
                path="/"
                element={
                  workspace ? (
                    <Navigate to="/agenda" replace />
                  ) : (
                    <Entry auth={auth.data} onEntered={entered} />
                  )
                }
              />
              <Route path="/entrar" element={<Entry auth={auth.data} onEntered={entered} />} />
              <Route
                path="/agenda"
                element={
                  workspace ? (
                    <Agenda key={workspace.id} workspace={workspace} />
                  ) : (
                    <Navigate to="/" replace />
                  )
                }
              />
              <Route
                path="/reservas/:id"
                element={
                  workspace ? (
                    <Reservation key={location.pathname + workspace.id} workspace={workspace} />
                  ) : (
                    <Navigate to="/" replace />
                  )
                }
              />
              <Route
                path="*"
                element={
                  <main className="connection-state">
                    <h1>Página não encontrada.</h1>
                    <Link to="/">Voltar à entrada</Link>
                  </main>
                }
              />
            </Routes>
          )
        )}
      </div>
      <footer className="app-footer">
        <span>Janela · projeto de portfólio</span>
        <span>Reservas de recursos · sem pagamentos ou notificações</span>
      </footer>
      <ResetDialog
        open={resetOpen}
        onClose={() => setResetOpen(false)}
        onReset={async () => {
          await apiFetch('/demo/reset', { method: 'POST', body: '{}' }, workspace?.id);
          auth.reload();
          navigate('/agenda');
        }}
      />
    </>
  );
}

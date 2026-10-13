import { useEffect, useRef, useState } from 'react';
export function ResetDialog(props: {
  open: boolean;
  onClose: () => void;
  onReset: () => Promise<void>;
}) {
  const dialog = useRef<HTMLDialogElement>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  useEffect(() => {
    if (props.open) {
      setError('');
      dialog.current?.showModal();
    } else dialog.current?.close();
  }, [props.open]);
  return (
    <dialog
      ref={dialog}
      className="reset-dialog"
      aria-labelledby="reset-title"
      onKeyDown={(event) => {
        if (event.key !== 'Tab') return;
        const controls =
          dialog.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)');
        if (!controls?.length) {
          event.preventDefault();
          return;
        }
        const first = controls[0]!,
          last = controls[controls.length - 1]!;
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }}
      onCancel={(event) => {
        if (busy) event.preventDefault();
        else props.onClose();
      }}
      onClose={props.onClose}
    >
      <h2 id="reset-title">Reiniciar sua demonstração?</h2>
      <p>
        O ambiente atual será encerrado e outro será criado com quatro exemplos. Reservas e
        rascunhos da geração anterior não serão transportados.
      </p>
      <p>Essa ação mantém os limites de uso do visitante.</p>
      {error && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}
      <div className="dialog-actions">
        <button
          type="button"
          autoFocus
          className="button-secondary"
          disabled={busy}
          onClick={props.onClose}
        >
          Manter ambiente
        </button>
        <button
          type="button"
          className="button-danger"
          disabled={busy}
          onClick={() => {
            setBusy(true);
            void props
              .onReset()
              .then(props.onClose)
              .catch((caught) =>
                setError(caught instanceof Error ? caught.message : 'Não foi possível reiniciar.'),
              )
              .finally(() => setBusy(false));
          }}
        >
          {busy ? 'Reiniciando…' : 'Reiniciar demonstração'}
        </button>
      </div>
    </dialog>
  );
}

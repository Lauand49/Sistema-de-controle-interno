'use client';

import React, { useEffect, useId, useRef, useState } from 'react';
import { toast } from 'sonner';
import { OctagonX } from 'lucide-react';
import { isLeadMinerApiError, leadMinerApi, type RunProgress } from '@/lib/leads/client-api';
import { MSG_CANCEL, cancelledLabel } from '@/lib/leads/run-cancel';
import { Button } from '@/components/ui/Button';

const FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]), [tabindex]:not([tabindex="-1"])';

export interface StopRunButtonProps {
  runId: string;
  /** Ex.: "Vila Mariana, São Paulo/SP" (aparece no diálogo). */
  title?: string;
  /** Recebe o progresso devolvido pelo servidor (status `CANCELADA`). */
  onStopped?: (progress: RunProgress) => void;
  /** Versão compacta para linhas de tabela. */
  compact?: boolean;
  className?: string;
}

/**
 * Botão "Parar" de uma mineração em andamento (T1), com confirmação. Uma requisição por vez;
 * o servidor é idempotente e devolve 409 se a mineração já terminou (o aviso é mostrado em toast).
 */
export const StopRunButton: React.FC<StopRunButtonProps> = ({ runId, title, onStopped, compact, className = '' }) => {
  const uid = useId();
  const titleId = `${uid}-title`;
  const descId = `${uid}-desc`;
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const dialogRef = useRef<HTMLDivElement>(null);
  const keepRef = useRef<HTMLButtonElement>(null);
  const openerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    // Foco inicial no botão seguro ("Manter"), não no destrutivo.
    const t = setTimeout(() => keepRef.current?.focus(), 0);
    return () => {
      clearTimeout(t);
      openerRef.current?.focus?.();
    };
  }, [open]);

  const confirm = async () => {
    if (busyRef.current) return; // cliques repetidos: uma só requisição
    busyRef.current = true;
    setBusy(true);
    try {
      const progress = await leadMinerApi.cancelRun(runId);
      setOpen(false);
      toast.success(MSG_CANCEL.sucesso, { description: cancelledLabel(progress) });
      onStopped?.(progress);
    } catch (e) {
      setOpen(false);
      if (isLeadMinerApiError(e) && e.status === 409) {
        toast.info(MSG_CANCEL.jaTerminou);
      } else {
        toast.error(MSG_CANCEL.erro, { description: e instanceof Error ? e.message : undefined });
      }
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Escape' && !busy) {
      e.stopPropagation();
      setOpen(false);
      return;
    }
    if (e.key === 'Tab' && dialogRef.current) {
      const items = Array.from(dialogRef.current.querySelectorAll<HTMLElement>(FOCUSABLE));
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
  };

  return (
    <>
      <Button
        ref={openerRef}
        variant="danger"
        size="sm"
        icon={OctagonX}
        onClick={() => setOpen(true)}
        aria-label={title ? `Parar mineração ${title}` : 'Parar mineração'}
        className={className}
      >
        Parar
      </Button>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div
            ref={dialogRef}
            role="alertdialog"
            aria-modal="true"
            aria-labelledby={titleId}
            aria-describedby={descId}
            onKeyDown={onKeyDown}
            className="w-full max-w-md space-y-4 rounded-card border border-border bg-surface-raised p-6 shadow-overlay"
          >
            <h2 id={titleId} className="text-lg font-bold text-fg">
              {MSG_CANCEL.confirmarTitulo}
            </h2>
            {title && <p className="text-sm font-semibold text-fg">{title}</p>}
            <p id={descId} className="text-sm text-fg-muted">
              {MSG_CANCEL.confirmarTexto}
            </p>
            <div className="flex justify-end gap-2">
              <Button ref={keepRef} variant="secondary" size="sm" onClick={() => setOpen(false)} disabled={busy}>
                Continuar minerando
              </Button>
              <Button variant="danger" size="sm" icon={OctagonX} onClick={() => void confirm()} loading={busy}>
                Parar mineração
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default StopRunButton;

'use client';

import React, { useEffect, useId, useRef, useState } from 'react';
import { Loader2, UserPlus, X } from 'lucide-react';
import type { Assignee } from '@/lib/leads/client-api';

interface AssignDialogProps {
  open: boolean;
  count: number;
  /** `null` enquanto carrega. */
  assignees: Assignee[] | null;
  loadError?: string | null;
  busy: boolean;
  onCancel: () => void;
  onConfirm: (assignee: Assignee) => void;
}

const FOCUSABLE = 'button:not([disabled]), select:not([disabled]), [href], input:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** Diálogo modal para escolher o Responsável das empresas selecionadas (Req. 16.1). */
export const AssignDialog: React.FC<AssignDialogProps> = ({
  open,
  count,
  assignees,
  loadError,
  busy,
  onCancel,
  onConfirm,
}) => {
  const uid = useId();
  const titleId = `${uid}-title`;
  const selectId = `${uid}-select`;
  const [assigneeId, setAssigneeId] = useState('');
  const dialogRef = useRef<HTMLDivElement>(null);
  const selectRef = useRef<HTMLSelectElement>(null);

  useEffect(() => {
    if (!open) return;
    setAssigneeId('');
    const previous = document.activeElement as HTMLElement | null;
    const t = setTimeout(() => selectRef.current?.focus() ?? dialogRef.current?.focus(), 0);
    return () => {
      clearTimeout(t);
      previous?.focus?.();
    };
  }, [open]);

  if (!open) return null;

  const chosen = assignees?.find((a) => a.id === assigneeId) ?? null;

  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Escape' && !busy) {
      e.stopPropagation();
      onCancel();
      return;
    }
    // Mantém o foco dentro do diálogo.
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
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        onKeyDown={onKeyDown}
        className="w-full max-w-md space-y-5 rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-2xl focus:outline-none"
      >
        <div className="flex items-start justify-between gap-4">
          <h2 id={titleId} className="text-lg font-bold text-white">
            Atribuir {count} {count === 1 ? 'empresa' : 'empresas'}
          </h2>
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            aria-label="Fechar"
            className="rounded-lg p-1 text-slate-400 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-500"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>

        {loadError ? (
          <p role="alert" className="text-sm text-red-400">
            {loadError}
          </p>
        ) : assignees === null ? (
          <p role="status" className="flex items-center gap-2 text-sm text-slate-400">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            Carregando responsáveis…
          </p>
        ) : (
          <div>
            <label htmlFor={selectId} className="mb-1 block text-xs font-semibold text-slate-400">
              Responsável
            </label>
            <select
              ref={selectRef}
              id={selectId}
              value={assigneeId}
              onChange={(e) => setAssigneeId(e.target.value)}
              disabled={busy}
              className="w-full rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-sm text-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-500"
            >
              <option value="">Selecione um responsável</option>
              {assignees.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.title ? `${a.name} — ${a.title}` : a.name}
                </option>
              ))}
            </select>
            {assignees.length === 0 && (
              <p className="mt-2 text-xs text-amber-300">Nenhum usuário disponível para ser responsável.</p>
            )}
          </div>
        )}

        <p className="text-xs text-slate-500">
          O responsável substitui o atual e também é aplicado aos leads de triagem vinculados.
        </p>

        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="rounded-xl border border-slate-800 bg-slate-900 px-4 py-2 text-xs font-bold text-slate-200 hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-500 disabled:opacity-40"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={() => chosen && onConfirm(chosen)}
            disabled={!chosen || busy}
            className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 px-4 py-2 text-xs font-bold text-white hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-500 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {busy ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <UserPlus className="h-4 w-4" aria-hidden="true" />
            )}
            Atribuir
          </button>
        </div>
      </div>
    </div>
  );
};

export default AssignDialog;

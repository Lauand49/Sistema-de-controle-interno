'use client';

import React from 'react';
import { Download, Loader2, Send, UserPlus, X } from 'lucide-react';
import { BULK_LIMIT_MESSAGE, isSelectionValid } from './ranking-helpers';

export type BulkAction = 'triage' | 'assign' | 'export';

interface BulkActionsBarProps {
  count: number;
  /** Mostra "Atribuir" só para Atribuidor (Req. 12.8, 16.6). */
  canAssign: boolean;
  busy: BulkAction | null;
  onTriage: () => void;
  onAssign: () => void;
  onExport: () => void;
  onClearSelection: () => void;
}

const BTN =
  'inline-flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-bold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-500 disabled:cursor-not-allowed disabled:opacity-40';
const PRIMARY = `${BTN} bg-gradient-to-r from-purple-600 to-indigo-600 text-white hover:opacity-90`;
const SECONDARY = `${BTN} border border-slate-800 bg-slate-900 text-slate-200 hover:bg-slate-800`;

function Icon({ busy, icon: I }: { busy: boolean; icon: React.ComponentType<{ className?: string }> }) {
  return busy ? (
    <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
  ) : (
    <I className="h-4 w-4" aria-hidden="true" />
  );
}

/**
 * Ações em lote (Req. 12.5, 15.7, 17.1): triagem e atribuição exigem de 1 a 200 empresas;
 * exportar sem seleção usa os filtros ativos.
 */
export const BulkActionsBar: React.FC<BulkActionsBarProps> = ({
  count,
  canAssign,
  busy,
  onTriage,
  onAssign,
  onExport,
  onClearSelection,
}) => {
  const valid = isSelectionValid(count);
  const anyBusy = busy !== null;
  const exportDisabled = anyBusy || (count > 0 && !valid);

  return (
    <section
      aria-label="Ações em lote"
      className="flex flex-col gap-3 rounded-2xl border border-slate-800 bg-slate-900/60 p-4 md:flex-row md:items-center md:justify-between"
    >
      <div className="text-xs" aria-live="polite">
        <p className="font-semibold text-slate-200">
          {count === 0 ? 'Nenhuma empresa selecionada' : `${count} ${count === 1 ? 'empresa selecionada' : 'empresas selecionadas'}`}
        </p>
        <p className={valid ? 'text-slate-400' : 'text-amber-300'}>{BULK_LIMIT_MESSAGE}</p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {count > 0 && (
          <button type="button" onClick={onClearSelection} disabled={anyBusy} className={SECONDARY}>
            <X className="h-4 w-4" aria-hidden="true" />
            Limpar seleção
          </button>
        )}
        <button type="button" onClick={onTriage} disabled={!valid || anyBusy} className={PRIMARY}>
          <Icon busy={busy === 'triage'} icon={Send} />
          Enviar para triagem
        </button>
        {canAssign && (
          <button type="button" onClick={onAssign} disabled={!valid || anyBusy} className={SECONDARY}>
            <Icon busy={busy === 'assign'} icon={UserPlus} />
            Atribuir
          </button>
        )}
        <button type="button" onClick={onExport} disabled={exportDisabled} className={SECONDARY}>
          <Icon busy={busy === 'export'} icon={Download} />
          {count > 0 ? 'Exportar CSV (selecionadas)' : 'Exportar CSV (filtradas)'}
        </button>
      </div>
    </section>
  );
};

export default BulkActionsBar;

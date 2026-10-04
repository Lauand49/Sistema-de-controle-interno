'use client';

import React, { useEffect, useState } from 'react';
import { History, Loader2, X } from 'lucide-react';
import { leadMinerApi, type RunDetail } from '@/lib/leads/client-api';
import { FailedNichesNote } from './FailedNichesNote';
import { NoAiNote } from './NoAiNote';
import { formatDate } from './ranking-helpers';

interface RunFilterBannerProps {
  runId: string;
  onClear: () => void;
  /**
   * T3: detalhe já carregado (e atualizado) pela tela. Quando informado, o banner não consulta a API
   * por conta própria; `undefined` mantém o comportamento anterior.
   */
  run?: RunDetail | null;
  error?: string | null;
}

/**
 * Cabeçalho da Tela_Ranking filtrada por uma mineração (`?runId=`): bairro/cidade/UF e os
 * nichos que falharam (Req. 2.16).
 */
export const RunFilterBanner: React.FC<RunFilterBannerProps> = ({ runId, onClear, run: externalRun, error: externalError }) => {
  const controlled = externalRun !== undefined;
  const [ownRun, setRun] = useState<RunDetail | null>(null);
  const [ownError, setError] = useState<string | null>(null);
  const run = controlled ? externalRun : ownRun;
  const error = controlled ? externalError ?? null : ownError;

  useEffect(() => {
    if (controlled) return undefined;
    const ctrl = new AbortController();
    setRun(null);
    setError(null);
    leadMinerApi
      .getRun(runId, { signal: ctrl.signal })
      .then(setRun)
      .catch((e: unknown) => {
        if (ctrl.signal.aborted) return;
        setError(e instanceof Error ? e.message : 'Não foi possível carregar a mineração.');
      });
    return () => ctrl.abort();
  }, [runId, controlled]);

  return (
    <section
      aria-label="Filtro por mineração"
      className="flex flex-col gap-2 rounded-2xl border border-purple-800/60 bg-purple-950/30 p-4 md:flex-row md:items-start md:justify-between"
    >
      <div className="space-y-1 text-sm">
        <p className="flex items-center gap-2 font-semibold text-purple-200">
          <History className="h-4 w-4" aria-hidden="true" />
          {run ? (
            <span>
              Filtrado pela mineração de {run.bairro}, {run.cidade}/{run.uf} ({formatDate(run.createdAt)})
            </span>
          ) : error ? (
            <span>Filtrado por mineração</span>
          ) : (
            <span className="inline-flex items-center gap-2">
              Carregando mineração…
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
            </span>
          )}
        </p>
        {error && (
          <p role="alert" className="text-xs text-red-400">
            {error}
          </p>
        )}
        {run && <FailedNichesNote nichosFalhos={run.nichosFalhos} />}
        {run && <NoAiNote iaDisabledReason={run.iaDisabledReason} />}
      </div>
      <button
        type="button"
        onClick={onClear}
        className="inline-flex items-center gap-1 self-start rounded-xl border border-slate-800 bg-slate-900 px-3 py-1.5 text-xs font-semibold text-slate-200 hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-500"
      >
        <X className="h-4 w-4" aria-hidden="true" />
        Remover filtro da mineração
      </button>
    </section>
  );
};

export default RunFilterBanner;

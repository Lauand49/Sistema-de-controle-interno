'use client';

/**
 * Card de progresso de uma mineração (Req. 8.6, 10.7, 10.9, 10.11, 10.12).
 * Barra gradiente com `processados/total`, etapa, novos/existentes, avisos de nichos falhos e
 * de execução sem IA, erro e link para o ranking condicionado por `canOpenRanking`.
 */
import React from 'react';
import Link from 'next/link';
import { AlertCircle, ArrowRight, Ban, CheckCircle2, Loader2, WifiOff, X } from 'lucide-react';
import type { MiningStatus, RunProgress } from '@/lib/leads/client-api';
import { cancelledLabel } from '@/lib/leads/run-cancel';
import { StopRunButton } from './StopRunButton';
import { canOpenRanking } from '@/lib/leads/filters';
import { rankingHref, type RunDriverState } from '@/hooks/lead-miner/runState';
import { FailedNichesNote } from './FailedNichesNote';
import { NoAiNote } from './NoAiNote';

export const STAGE_LABEL: Record<MiningStatus, string> = {
  PENDENTE: 'Buscando no OpenStreetMap',
  EM_ANDAMENTO: 'Analisando empresas',
  CONCLUIDA: 'Concluída',
  ERRO: 'Erro',
  CANCELADA: 'Cancelada',
};

export const RECONNECTING_TEXT = 'Reconectando…';

export function progressPercent(processados: number, total: number): number {
  if (total <= 0) return 0;
  return Math.max(0, Math.min(100, Math.round((processados / total) * 100)));
}

export interface RunProgressCardProps {
  run: RunDriverState;
  /** Ex.: "Vila Mariana, São Paulo/SP". */
  title?: string;
  onDismiss?: (runId: string) => void;
  /** Quando informado, mostra "Parar" enquanto a mineração está ativa (T1). */
  onStopped?: (progress: RunProgress) => void;
  className?: string;
}

export const RunProgressCard: React.FC<RunProgressCardProps> = ({ run, title, onDismiss, onStopped, className = '' }) => {
  const p = run.progress;
  const status: MiningStatus | null = p?.status ?? null;
  const active = !run.done && (status === null || status === 'PENDENTE' || status === 'EM_ANDAMENTO');
  const processados = p?.processados ?? 0;
  const total = p?.total ?? 0;
  const percent = progressPercent(processados, total);
  const indeterminate = active && (status === null || status === 'PENDENTE');
  const cancelled = status === 'CANCELADA';
  const stage = status ? (cancelled && p ? cancelledLabel(p) : STAGE_LABEL[status]) : 'Carregando…';
  const showLink = !!p && !active && canOpenRanking({ status: p.status, processados: p.processados });
  // T3: já há empresas encontradas (gravadas na descoberta): dá para acompanhar os resultados ao vivo.
  const showLiveLink = !!p && active && p.novos + p.existentes > 0;
  const barColor = run.error ? 'bg-red-500/70' : 'bg-gradient-to-r from-purple-600 to-indigo-600';

  return (
    <section
      className={`rounded-2xl border border-slate-800 bg-slate-900/60 p-4 text-slate-200 ${className}`}
      aria-label={title ? `Mineração ${title}` : 'Progresso da mineração'}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          {title && <h3 className="truncate text-sm font-semibold text-white">{title}</h3>}
          <div aria-live="polite" className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-400">
            <span className="flex items-center gap-1.5">
              {active ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin text-purple-400" aria-hidden="true" />
              ) : cancelled ? (
                <Ban className="h-3.5 w-3.5 text-amber-400" aria-hidden="true" />
              ) : run.error ? (
                <AlertCircle className="h-3.5 w-3.5 text-red-400" aria-hidden="true" />
              ) : (
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" aria-hidden="true" />
              )}
              <span>{stage}</span>
            </span>
            <span>
              {processados}/{total} processadas
            </span>
            {run.reconnecting && (
              <span className="flex items-center gap-1 text-amber-300">
                <WifiOff className="h-3.5 w-3.5" aria-hidden="true" />
                {RECONNECTING_TEXT}
              </span>
            )}
          </div>
        </div>
        {active && p && onStopped && (
          <StopRunButton runId={run.runId} title={title} onStopped={onStopped} className="shrink-0" />
        )}
        {onDismiss && !active && (
          <button
            type="button"
            onClick={() => onDismiss(run.runId)}
            aria-label="Fechar"
            className="rounded-lg p-1 text-slate-400 hover:bg-slate-800 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-500"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        )}
      </div>

      <div
        className="mt-3 h-2 w-full overflow-hidden rounded-full bg-slate-800"
        role="progressbar"
        aria-label="Progresso da mineração"
        aria-valuemin={0}
        aria-valuemax={total > 0 ? total : undefined}
        aria-valuenow={indeterminate ? undefined : processados}
        aria-valuetext={indeterminate ? stage : `${processados} de ${total}`}
      >
        <div
          className={`h-full rounded-full transition-[width] duration-500 ${barColor} ${indeterminate ? 'w-1/3 animate-pulse' : ''}`}
          style={indeterminate ? undefined : { width: `${run.done && !run.error && total === 0 ? 100 : percent}%` }}
        />
      </div>

      <dl className="mt-3 flex gap-4 text-xs">
        <div className="flex gap-1">
          <dt className="text-slate-400">Novas:</dt>
          <dd className="font-medium text-white">{p?.novos ?? 0}</dd>
        </div>
        <div className="flex gap-1">
          <dt className="text-slate-400">Já existentes:</dt>
          <dd className="font-medium text-white">{p?.existentes ?? 0}</dd>
        </div>
      </dl>

      <div className="mt-2 space-y-1">
        <FailedNichesNote nichosFalhos={p?.nichosFalhos} />
        <NoAiNote iaDisabledReason={p?.iaDisabledReason} />
      </div>

      {run.error && (
        <p role="alert" className="mt-3 flex items-start gap-1.5 text-sm text-red-300">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <span>{run.error}</span>
        </p>
      )}

      {showLiveLink && (
        <Link
          href={rankingHref(run.runId)}
          className="mt-3 inline-flex items-center gap-1.5 rounded-lg text-sm font-medium text-purple-300 hover:text-purple-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-500"
        >
          Ver resultados ao vivo
          <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </Link>
      )}
      {showLink && (
        <Link
          href={rankingHref(run.runId)}
          className="mt-3 inline-flex items-center gap-1.5 rounded-lg text-sm font-medium text-purple-300 hover:text-purple-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-500"
        >
          Ver ranking desta mineração
          <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </Link>
      )}
    </section>
  );
};

export default RunProgressCard;

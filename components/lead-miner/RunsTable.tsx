'use client';
/**
 * Tabela do histórico de minerações (Req. 11.1, 11.5, 11.9, 2.15, 7.11).
 * O local vira link para o ranking filtrado somente quando `canOpenRanking`; em `ERRO` com
 * `processados = 0` a linha é apenas texto, sem link nem ação.
 */
import React from 'react';
import Link from 'next/link';
import { AlertCircle, ArrowRight } from 'lucide-react';
import type { MiningStatus, RunListItem, RunProgress } from '@/lib/leads/client-api';
import type { Person } from '@/lib/permissions';
import { canCancelRun, cancelledLabel, isCancellableStatus } from '@/lib/leads/run-cancel';
import { StopRunButton } from './StopRunButton';
import { canOpenRanking } from '@/lib/leads/filters';
import { rankingHref } from '@/hooks/lead-miner/runState';
import { FailedNichesNote } from './FailedNichesNote';
import { NoAiNote } from './NoAiNote';
import { GoogleUnusedNote } from './GoogleUnusedNote';
import { sourceSummary } from './enrichment-helpers';
import { RUN_STATUS_LABEL, formatRunDateTime, runLocation } from './runs-helpers';

const STATUS_BADGE: Record<MiningStatus, string> = {
  PENDENTE: 'border-slate-700 bg-slate-800 text-slate-300',
  EM_ANDAMENTO: 'border-purple-700/60 bg-purple-950/70 text-purple-300',
  CONCLUIDA: 'border-emerald-700/60 bg-emerald-950/70 text-emerald-300',
  ERRO: 'border-red-700/60 bg-red-950/70 text-red-300',
  CANCELADA: 'border-amber-700/60 bg-amber-950/60 text-amber-300',
};

const TH = 'px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-400';
const TD = 'px-3 py-3 align-top text-sm text-slate-200';

export interface RunsTableProps {
  items: RunListItem[];
  busy?: boolean;
  /** Usuário da sessão: define em quais linhas o botão "Parar" aparece (T1). */
  actor?: Person | null;
  /** Chamado após parar uma mineração (a página recarrega a lista). */
  onStopped?: (progress: RunProgress) => void;
}

export const RunsTable: React.FC<RunsTableProps> = ({ items, busy, actor, onStopped }) => (
  <div className="overflow-x-auto rounded-2xl border border-slate-800 bg-slate-900/60">
    <table className="min-w-[720px] w-full divide-y divide-slate-800" aria-busy={busy || undefined}>
      <caption className="sr-only">
        Histórico de minerações de todos os autores, da mais recente para a mais antiga
      </caption>
      <thead className="bg-slate-900">
        <tr>
          <th scope="col" className={TH}>Local</th>
          <th scope="col" className={TH}>Criada em</th>
          <th scope="col" className={TH}>Autor</th>
          <th scope="col" className={TH}>Fonte</th>
          <th scope="col" className={TH}>Status</th>
          <th scope="col" className={`${TH} text-right`}>Total</th>
          <th scope="col" className={`${TH} text-right`}>Novas</th>
          <th scope="col" className={TH}>Avisos</th>
          <th scope="col" className={TH}>Ações</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-slate-800">
        {items.map((r) => {
          const location = runLocation(r);
          const openable = canOpenRanking({ status: r.status, processados: r.processados });
          return (
            <tr key={r.id} className={openable ? 'hover:bg-slate-800/40' : undefined}>
              <th scope="row" className={`${TD} text-left font-semibold`}>
                {openable ? (
                  <Link
                    href={rankingHref(r.id)}
                    className="inline-flex items-center gap-1.5 rounded text-white hover:text-purple-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-500"
                    aria-label={`Abrir ranking da mineração ${location}`}
                  >
                    {location}
                    <ArrowRight className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                  </Link>
                ) : (
                  <span className="text-slate-300">{location}</span>
                )}
              </th>
              <td className={`${TD} whitespace-nowrap`}>{formatRunDateTime(r.createdAt)}</td>
              <td className={TD}>{r.createdBy.name || '—'}</td>
              <td className={TD}>{sourceSummary(r.fonteSolicitada, r.fonte)}</td>
              <td className={TD}>
                <span className={`inline-block whitespace-nowrap rounded-full border px-2 py-0.5 text-xs font-semibold ${STATUS_BADGE[r.status]}`}>
                  {r.status === 'CANCELADA' ? cancelledLabel(r) : (RUN_STATUS_LABEL[r.status] ?? r.status)}
                </span>
                {r.status === 'EM_ANDAMENTO' && (
                  <span className="mt-1 block text-xs text-slate-400">
                    {r.processados}/{r.total}
                  </span>
                )}
              </td>
              <td className={`${TD} text-right tabular-nums`}>{r.total}</td>
              <td className={`${TD} text-right tabular-nums`}>{r.novos}</td>
              <td className={`${TD} space-y-1`}>
                {r.status === 'ERRO' && r.errorMessage && (
                  <p className="flex items-start gap-1.5 text-xs text-red-400">
                    <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                    <span>{r.errorMessage}</span>
                  </p>
                )}
                <FailedNichesNote nichosFalhos={r.nichosFalhos} />
                <GoogleUnusedNote motivo={r.googleMotivo} />
                <NoAiNote iaDisabledReason={r.iaDisabledReason} />
              </td>
              <td className={TD}>
                {isCancellableStatus(r.status) && canCancelRun(actor, { createdById: r.createdBy.id }) ? (
                  <StopRunButton runId={r.id} title={location} compact onStopped={onStopped} />
                ) : null}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  </div>
);

export default RunsTable;

/**
 * Estado exibido por mineração acompanhada no navegador e avisos de término (Req. 10.8, 10.9).
 */
import { toast } from 'sonner';
import type { RunProgress } from '@/lib/leads/client-api';
import { cancelledLabel } from '@/lib/leads/run-cancel';
import type { DriveResult } from './driveRun';

export interface RunDriverState {
  runId: string;
  /** Último progresso conhecido (null até a primeira resposta). */
  progress: RunProgress | null;
  /** Falha de rede: aguardando para tentar de novo ("Reconectando…"). */
  reconnecting: boolean;
  /** Mensagem de erro a exibir (`errorMessage` da mineração em `ERRO` ou erro definitivo da API). */
  error: string | null;
  /** O laço terminou (concluída, erro ou falha definitiva). */
  done: boolean;
}

export function initialRunState(runId: string, progress: RunProgress | null = null): RunDriverState {
  return { runId, progress, reconnecting: false, error: null, done: false };
}

export function rankingHref(runId: string): string {
  return `/tools/lead-miner/leads?runId=${encodeURIComponent(runId)}`;
}

export const DEFAULT_RUN_ERROR = 'A mineração terminou com erro.';

/** Aplica o resultado final do laço ao estado exibido. */
export function applyDriveResult(state: RunDriverState, result: DriveResult): RunDriverState {
  if (result.kind === 'aborted') return { ...state, reconnecting: false };
  if (result.kind === 'failed') {
    return { ...state, progress: result.progress ?? state.progress, reconnecting: false, error: result.message, done: true };
  }
  const p = result.progress;
  return {
    ...state,
    progress: p,
    reconnecting: false,
    error: p.status === 'ERRO' ? p.errorMessage || DEFAULT_RUN_ERROR : null,
    done: true,
  };
}

/**
 * Toast de término. Só dispara quando a mineração foi vista ativa neste acompanhamento,
 * para não repetir avisos de minerações que já tinham terminado.
 */
export function notifyRunOutcome(result: DriveResult, openRanking: (href: string) => void): void {
  if (result.kind === 'aborted') return;
  if (result.kind === 'failed') {
    toast.error('Não foi possível acompanhar a mineração', { description: result.message });
    return;
  }
  const p = result.progress;
  if (p.status === 'CONCLUIDA') {
    const n = p.processados;
    toast.success('Mineração concluída', {
      description: `${n} ${n === 1 ? 'empresa processada' : 'empresas processadas'}.`,
      action: { label: 'Ver ranking', onClick: () => openRanking(rankingHref(p.id)) },
      duration: 10_000,
    });
  } else if (p.status === 'ERRO') {
    toast.error('A mineração terminou com erro', { description: p.errorMessage || DEFAULT_RUN_ERROR });
  } else if (p.status === 'CANCELADA') {
    // Parada por outra pessoa/aba (quem clica em "Parar" já recebe o próprio toast).
    toast.info('Mineração cancelada', { description: cancelledLabel(p) });
  }
}

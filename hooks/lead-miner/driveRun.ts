/**
 * Laço de execução de UMA mineração no navegador, sem React (testável com API e relógio falsos).
 *
 * Enquanto `PENDENTE` chama `discover`; enquanto `EM_ANDAMENTO` chama `batch`. Cada chamada é
 * aguardada antes da próxima: nunca há duas requisições em curso para a mesma mineração
 * (Req. 8.15). Falha de rede (ou 5xx transitório) espera `RETRY_DELAY_MS` e tenta de novo, sem
 * alterar nada no servidor. Termina em `CONCLUIDA`/`ERRO`, em erro definitivo (4xx) ou no abort.
 */
import type { RunProgress } from '@/lib/leads/client-api';
import { isLeadMinerApiError } from '@/lib/leads/client-api';

export const RETRY_DELAY_MS = 5_000;
/** Pausa quando a resposta não trouxe avanço (ex.: outra aba segura o lease da descoberta). */
export const IDLE_DELAY_MS = 1_500;

export interface RunDriverApi {
  discover(id: string, opts: { signal: AbortSignal }): Promise<RunProgress>;
  batch(id: string, opts: { signal: AbortSignal }): Promise<RunProgress>;
}

export type DriveResult =
  | { kind: 'finished'; progress: RunProgress }
  | { kind: 'failed'; message: string; progress: RunProgress | null }
  | { kind: 'aborted'; progress: RunProgress | null };

export interface DriveRunOptions {
  api: RunDriverApi;
  signal: AbortSignal;
  /** Progresso já conhecido (ex.: vindo de `/runs/active` ou do `POST /runs`). */
  initial?: RunProgress | null;
  onProgress?: (p: RunProgress) => void;
  onReconnecting?: (reconnecting: boolean) => void;
  /** Espera cancelável; padrão usa `setTimeout`. */
  sleep?: (ms: number, signal: AbortSignal) => Promise<void>;
}

export function isActiveStatus(status: RunProgress['status']): boolean {
  return status === 'PENDENTE' || status === 'EM_ANDAMENTO';
}

/** Espera `ms` ou até o abort (resolve em ambos os casos). */
export function abortableSleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal.aborted) return resolve();
    const t = setTimeout(done, ms);
    function done() {
      clearTimeout(t);
      signal.removeEventListener('abort', done);
      resolve();
    }
    signal.addEventListener('abort', done, { once: true });
  });
}

function isAbort(e: unknown): boolean {
  return typeof e === 'object' && e !== null && (e as { name?: string }).name === 'AbortError';
}

/** Falha de rede (status 0) ou erro 5xx: vale tentar de novo. */
function isRetryable(e: unknown): boolean {
  if (isLeadMinerApiError(e)) return e.status === 0 || e.status >= 500;
  return !isAbort(e); // erro inesperado do fetch/JSON: trata como rede instável
}

function sameProgress(a: RunProgress | null, b: RunProgress): boolean {
  return !!a && a.status === b.status && a.processados === b.processados && a.total === b.total;
}

export async function driveRun(runId: string, opts: DriveRunOptions): Promise<DriveResult> {
  const { api, signal, onProgress, onReconnecting } = opts;
  const sleep = opts.sleep ?? abortableSleep;
  let progress: RunProgress | null = opts.initial ?? null;
  let reconnecting = false;
  const setReconnecting = (v: boolean) => {
    if (v !== reconnecting) {
      reconnecting = v;
      onReconnecting?.(v);
    }
  };

  while (!signal.aborted) {
    if (progress && !isActiveStatus(progress.status)) {
      setReconnecting(false);
      return { kind: 'finished', progress };
    }
    // Sem status conhecido, `discover` só devolve o progresso atual quando não está `PENDENTE`.
    const call = progress?.status === 'EM_ANDAMENTO' ? api.batch : api.discover;
    let next: RunProgress;
    try {
      next = await call.call(api, runId, { signal });
    } catch (e) {
      if (signal.aborted || isAbort(e)) break;
      if (isRetryable(e)) {
        setReconnecting(true);
        await sleep(RETRY_DELAY_MS, signal);
        continue;
      }
      setReconnecting(false);
      const message = e instanceof Error ? e.message : 'Não foi possível continuar a mineração.';
      return { kind: 'failed', message, progress };
    }
    if (signal.aborted) break;
    setReconnecting(false);
    const stalled = sameProgress(progress, next);
    progress = next;
    onProgress?.(next);
    if (stalled && isActiveStatus(next.status)) await sleep(IDLE_DELAY_MS, signal);
  }
  return { kind: 'aborted', progress };
}

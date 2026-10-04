/**
 * Cancelamento de mineração (T1), lado servidor.
 *
 * A mineração é dirigida pelo navegador em passos curtos (`discover`/`batch`), então "parar"
 * precisa valer entre requisições diferentes. O estado de verdade é o status `CANCELADA` no banco;
 * dois mecanismos o propagam para o que já está em curso:
 *  1. registro de `AbortController` por processo (`abortRunLocally`): interrompe na hora o lote
 *     que roda na MESMA instância em que chegou o pedido de cancelamento;
 *  2. vigia por polling (`watchRunCancellation`): cobre lotes rodando em OUTRA instância.
 * Nada que já foi gravado é apagado: cancelar só muda o status (e `total`/`finishedAt`).
 */
import { Prisma, type PrismaClient } from '@prisma/client';
import { ApiError, forbidden, notFound } from '@/lib/api-error';
import { audit } from '@/lib/audit';
import type { Person } from '@/lib/permissions';
import { CANCELLABLE_STATUSES, MSG_CANCEL, canCancelRun, isCancellableStatus } from './run-cancel';

/** Intervalo do vigia entre leituras do status no banco. */
export const CANCEL_POLL_MS = 1500;

export const MSG_RUN_NOT_FOUND = 'Mineração não encontrada.';

// ---------------------------------------------------------------------------
// Registro de AbortController por processo (sobrevive ao hot reload)
// ---------------------------------------------------------------------------

const globalForAborts = globalThis as unknown as { __leadMinerRunAborts?: Map<string, Set<AbortController>> };
const registry: Map<string, Set<AbortController>> = (globalForAborts.__leadMinerRunAborts ??= new Map());

/** Registra um controlador para a execução em curso de `runId`; `dispose` o retira. */
export function registerRunAbort(runId: string): { controller: AbortController; dispose: () => void } {
  const controller = new AbortController();
  let set = registry.get(runId);
  if (!set) {
    set = new Set();
    registry.set(runId, set);
  }
  set.add(controller);
  return {
    controller,
    dispose: () => {
      const s = registry.get(runId);
      if (!s) return;
      s.delete(controller);
      if (s.size === 0) registry.delete(runId);
    },
  };
}

/** Aborta as execuções de `runId` registradas neste processo; devolve quantas abortou. */
export function abortRunLocally(runId: string): number {
  const set = registry.get(runId);
  if (!set) return 0;
  let n = 0;
  for (const c of Array.from(set)) {
    if (!c.signal.aborted) {
      c.abort();
      n++;
    }
  }
  return n;
}

// ---------------------------------------------------------------------------
// Leitura do status
// ---------------------------------------------------------------------------

/** true se a mineração está `CANCELADA`. Falha de leitura conta como "não cancelada". */
export async function isRunCancelled(db: PrismaClient, runId: string): Promise<boolean> {
  try {
    const row = await db.miningRun.findUnique({ where: { id: runId }, select: { status: true } });
    return row?.status === 'CANCELADA';
  } catch {
    return false;
  }
}

/**
 * Vigia o status no banco e aborta `controller` ao ver `CANCELADA` (cobre outra instância).
 * Melhor esforço: erro de leitura só adia a próxima tentativa. Devolve a função que o encerra.
 */
export function watchRunCancellation(
  db: PrismaClient,
  runId: string,
  controller: AbortController,
  pollMs: number = CANCEL_POLL_MS,
): () => void {
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const schedule = () => {
    if (stopped || controller.signal.aborted) return;
    timer = setTimeout(tick, pollMs);
    (timer as { unref?: () => void }).unref?.();
  };
  const tick = async () => {
    if (stopped || controller.signal.aborted) return;
    if (await isRunCancelled(db, runId)) {
      controller.abort();
      return;
    }
    schedule();
  };

  schedule();
  return () => {
    stopped = true;
    if (timer) clearTimeout(timer);
  };
}

// ---------------------------------------------------------------------------
// Cancelamento
// ---------------------------------------------------------------------------

export interface CancelRunResult {
  /** false quando a mineração já estava `CANCELADA` (idempotência). */
  changed: boolean;
}

/**
 * Para a mineração `runId`.
 * - 404 se não existe; 403 sem permissão (`canCancelRun`);
 * - já `CANCELADA` → sucesso sem alterar nada (idempotente);
 * - `CONCLUIDA`/`ERRO` → 409;
 * - `PENDENTE`/`EM_ANDAMENTO` → `CANCELADA` numa transação com auditoria. `total` passa a ser o
 *   nº de empresas já vinculadas (durante a descoberta ele ainda é 0), para "N de M processados".
 * Nenhuma empresa, análise ou vínculo é apagado.
 */
export async function cancelRun(db: PrismaClient, runId: string, actor: Person): Promise<CancelRunResult> {
  const run = await db.miningRun.findUnique({
    where: { id: runId },
    select: { id: true, status: true, createdById: true },
  });
  if (!run) throw notFound(MSG_RUN_NOT_FOUND);
  if (!canCancelRun(actor, run)) throw forbidden(MSG_CANCEL.semPermissao);

  if (run.status === 'CANCELADA') return { changed: false };
  if (!isCancellableStatus(run.status)) throw new ApiError(409, MSG_CANCEL.jaTerminou);

  const changed = await db.$transaction(async (tx) => {
    const linked = await tx.miningRunCompany.count({ where: { runId } });
    // Condicional ao status: duas requisições simultâneas → só uma altera; a outra vê count = 0.
    const r = await tx.miningRun.updateMany({
      where: { id: runId, status: { in: [...CANCELLABLE_STATUSES] } },
      data: {
        status: 'CANCELADA',
        total: linked,
        finishedAt: new Date(),
        lockedUntil: null,
        googleCursor: Prisma.DbNull,
      },
    });
    if (r.count === 0) return false;
    await audit(tx, {
      actorId: actor.id,
      action: 'LEAD_MINER_RUN_CANCELLED',
      before: { runId, status: run.status },
      after: { runId, status: 'CANCELADA', total: linked },
    });
    return true;
  });

  if (!changed) {
    // Perdeu a corrida: outro cancelou (idempotente) ou a mineração terminou nesse meio-tempo.
    const now = await db.miningRun.findUnique({ where: { id: runId }, select: { status: true } });
    if (now?.status === 'CANCELADA') return { changed: false };
    throw new ApiError(409, MSG_CANCEL.jaTerminou);
  }

  // Interrompe, nesta instância, o que estiver em curso para esta mineração.
  abortRunLocally(runId);
  return { changed: true };
}

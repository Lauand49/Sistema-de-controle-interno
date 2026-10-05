/**
 * P3 — avaliação automática dos leads "Sem contato", disparada PELO SERVIDOR no momento em que a
 * mineração está `CONCLUIDA` (na requisição de lote que a concluiu).
 *
 * - Única vez: `claimAutoEvaluation` faz um `UPDATE … WHERE "avaliacaoIniciadaEm" IS NULL` atômico;
 *   só a requisição que ganha a marca avalia. Lotes concorrentes e repetições não reavaliam.
 * - Idempotente por lead: só entram leads sem `avaliacaoResumo`/`avaliadoEm` (ver `evaluateRunAuto`),
 *   com o teto de `EVALUATION_AUTO_CAP` (30) por mineração.
 * - Respeita `GEMINI_MONTHLY_LIMIT` e cai em regras ("sem IA") sem chave/cota, como o botão "Avaliar".
 * - Melhor esforço: nunca lança e nunca afeta a resposta do lote. Sem tempo até o prazo da função, os
 *   leads ficam SEM avaliação (não são gravados por regras) e o botão "Avaliar" cobre o resto.
 */
import type { PrismaClient } from '@prisma/client';
import type { EvaluationDeps } from './evaluation';
import { evaluateRunAuto, type EvaluationSummary } from './evaluation-store';

/** Prazo máximo (ms após o início da requisição) para a avaliação automática; `maxDuration` é 60 s. */
export const AUTO_EVALUATION_BUDGET_MS = 57_000;

type Db = Pick<PrismaClient, 'company' | 'miningRun' | '$queryRaw'>;

/** Ganha (ou não) o direito de avaliar esta mineração. `true` apenas para o primeiro chamador. */
export async function claimAutoEvaluation(db: Pick<PrismaClient, '$queryRaw'>, runId: string): Promise<boolean> {
  const rows = await db.$queryRaw<Array<{ id: string }>>`
    UPDATE "MiningRun" SET "avaliacaoIniciadaEm" = now()
    WHERE id = ${runId} AND status = 'CONCLUIDA'::"MiningStatus" AND "avaliacaoIniciadaEm" IS NULL
    RETURNING id`;
  return rows.length > 0;
}

export type AutoEvaluationOutcome =
  | { triggered: false; reason: 'NAO_CONCLUIDA' | 'JA_DISPARADA' | 'ERRO' }
  | { triggered: true; summary: EvaluationSummary | null };

/**
 * Chame quando a resposta do lote mostrar `CONCLUIDA`. `startedAt`/`budgetMs` definem o prazo
 * (padrão: `AUTO_EVALUATION_BUDGET_MS` a partir de agora). Nunca lança.
 */
export async function triggerAutoEvaluation(
  db: Db,
  runId: string,
  status: string,
  deps: EvaluationDeps,
  opts: { startedAt?: number; budgetMs?: number } = {},
): Promise<AutoEvaluationOutcome> {
  if (status !== 'CONCLUIDA') return { triggered: false, reason: 'NAO_CONCLUIDA' };
  try {
    if (!(await claimAutoEvaluation(db, runId))) return { triggered: false, reason: 'JA_DISPARADA' };
    const startedAt = opts.startedAt ?? deps.now().getTime();
    const deadline = startedAt + (opts.budgetMs ?? AUTO_EVALUATION_BUDGET_MS);
    const summary = await evaluateRunAuto(db, runId, { ...deps, deadline });
    return { triggered: true, summary };
  } catch (e) {
    // Inclui banco sem a migração 20261019 (coluna ausente): a mineração segue intacta.
    console.error('[lead-miner] falha na avaliação automática', runId, e instanceof Error ? e.message : 'erro');
    return { triggered: false, reason: 'ERRO' };
  }
}

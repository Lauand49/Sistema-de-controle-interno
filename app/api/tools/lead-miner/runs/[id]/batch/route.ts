/**
 * POST /api/tools/lead-miner/runs/[id]/batch — Processa um Lote de empresas dentro de `BATCH_BUDGET_MS`.
 * Só o autor da mineração pode acioná-la; 403 antes de qualquer efeito (Req. 8.3, 8.4, 8.11, 8.12, 18.1).
 * Quando o lote deixa a mineração `CONCLUIDA`, dispara a avaliação automática dos leads sem contato (P3).
 */
import { NextResponse } from 'next/server';
import { withAuth, forbidden, notFound } from '@/lib/api';
import { prisma } from '@/lib/prisma';
import { requireNegocios } from '@/lib/leads/route-helpers';
import { BATCH_BUDGET_MS } from '@/lib/leads/config';
import { runBatch, MSG_PIPELINE } from '@/lib/leads/pipeline';
import { getEvaluationDeps, getPipelineDeps } from '@/lib/leads/deps';
import { triggerAutoEvaluation } from '@/lib/leads/auto-evaluation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const NOT_AUTHOR_MESSAGE = 'Apenas o autor da mineração pode executá-la.';

export const POST = withAuth<{ id: string }>(async (_req, { params, actor }) => {
  requireNegocios(actor);
  const t0 = Date.now();
  const run = await prisma.miningRun.findUnique({
    where: { id: params.id },
    select: { createdById: true },
  });
  if (!run) throw notFound(MSG_PIPELINE.mineracaoNaoEncontrada);
  if (run.createdById !== actor.id) throw forbidden(NOT_AUTHOR_MESSAGE);

  const progress = await runBatch(params.id, getPipelineDeps(), t0 + BATCH_BUDGET_MS);
  // P3: ao ver a mineração CONCLUIDA, o servidor dispara (uma única vez, melhor esforço) a avaliação
  // automática dos leads sem contato. Não lança e não altera a resposta do lote.
  await triggerAutoEvaluation(prisma, params.id, progress.status, getEvaluationDeps(), { startedAt: t0 }).catch(
    () => undefined,
  );
  return NextResponse.json(progress);
});

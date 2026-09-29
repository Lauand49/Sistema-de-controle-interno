/**
 * GET /api/tools/lead-miner/runs/[id] — Progresso e dados da mineração (qualquer autor);
 * usado pelos cards de progresso e pelo cabeçalho da Tela_Ranking filtrada por `runId`. 404 se não existir.
 */
import { NextResponse } from 'next/server';
import { notFound, withAuth } from '@/lib/api';
import { prisma } from '@/lib/prisma';
import { requireNegocios } from '@/lib/leads/route-helpers';
import { getRunProgress, MSG_PIPELINE } from '@/lib/leads/pipeline';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = withAuth<{ id: string }>(async (_req, { params, actor }) => {
  requireNegocios(actor);
  const run = await prisma.miningRun.findUnique({
    where: { id: params.id },
    select: {
      bairro: true,
      cidade: true,
      uf: true,
      fonte: true,
      iaEnabled: true,
      createdAt: true,
      finishedAt: true,
      createdBy: { select: { id: true, name: true } },
    },
  });
  if (!run) throw notFound(MSG_PIPELINE.mineracaoNaoEncontrada);
  const progress = await getRunProgress(params.id, prisma);
  return NextResponse.json({ ...progress, ...run });
});

/**
 * GET /api/tools/lead-miner/runs/active — Minerações `PENDENTE`/`EM_ANDAMENTO` do autor da
 * sessão, mais recentes primeiro, para retomada automática pelo navegador (Req. 8.6).
 */
import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/api';
import { prisma } from '@/lib/prisma';
import { requireNegocios } from '@/lib/leads/route-helpers';
import { toRunProgress, type RunProgress } from '@/lib/leads/pipeline';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = withAuth(async (_req, { actor }) => {
  requireNegocios(actor);
  const runs = await prisma.miningRun.findMany({
    where: { createdById: actor.id, status: { in: ['PENDENTE', 'EM_ANDAMENTO'] } },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
  });

  const counts = new Map<string, { novos: number; existentes: number }>();
  if (runs.length > 0) {
    const groups = await prisma.miningRunCompany.groupBy({
      by: ['runId', 'isNew'],
      where: { runId: { in: runs.map((r) => r.id) } },
      _count: { _all: true },
    });
    for (const g of groups) {
      const c = counts.get(g.runId) ?? { novos: 0, existentes: 0 };
      if (g.isNew) c.novos += g._count._all;
      else c.existentes += g._count._all;
      counts.set(g.runId, c);
    }
  }

  const result: RunProgress[] = runs.map((r) =>
    toRunProgress(r, counts.get(r.id) ?? { novos: 0, existentes: 0 }),
  );
  return NextResponse.json({ runs: result });
});

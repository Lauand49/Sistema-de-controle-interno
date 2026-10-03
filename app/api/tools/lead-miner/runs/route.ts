/**
 * /api/tools/lead-miner/runs
 * - POST: cria uma mineração em `PENDENTE` (Req. 8.1, 8.10, 18.4, 18.5, 18.7, 18.12).
 *   201 `RunProgress`; 400 `{ error, fields }`; 409 `{ error, runId }`.
 * - GET: histórico de minerações de todos os autores (Req. 11.1–11.4, 11.8), 20 por página,
 *   busca por bairro/cidade/autor ignorando maiúsculas, acentos e espaços nas extremidades.
 */
import { NextResponse } from 'next/server';
import type { Prisma } from '@prisma/client';
import { ApiError, withAuth } from '@/lib/api';
import { prisma } from '@/lib/prisma';
import { INVALID_BODY_MESSAGE, parseQuery, requireNegocios } from '@/lib/leads/route-helpers';
import { createRun, toRunProgress } from '@/lib/leads/pipeline';
import { getPipelineDeps } from '@/lib/leads/deps';
import { RUNS_PAGE_SIZE } from '@/lib/leads/config';
import { matchesRunSearch, runsListSchema, startOfDay, startOfNextDay } from '@/lib/leads/filters';
import { normalizeText } from '@/lib/leads/text';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const POST = withAuth(async (req, { actor }) => {
  requireNegocios(actor);
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    throw new ApiError(400, INVALID_BODY_MESSAGE, { fields: { _: INVALID_BODY_MESSAGE } });
  }
  // `createRun` valida o corpo (400 com `fields`) e usa sempre `actor.id` como autor.
  const progress = await createRun(actor.id, body, getPipelineDeps());
  return NextResponse.json(progress, { status: 201 });
});

export const GET = withAuth(async (req, { actor }) => {
  requireNegocios(actor);
  const query = parseQuery(runsListSchema, req.url);

  const and: Prisma.MiningRunWhereInput[] = [];
  if (query.uf) and.push({ uf: query.uf });
  if (query.status) and.push({ status: query.status });
  if (query.fonte) and.push({ fonte: query.fonte });
  if (query.from) and.push({ createdAt: { gte: startOfDay(query.from) } });
  if (query.to) and.push({ createdAt: { lt: startOfNextDay(query.to) } });

  if (query.q) {
    const term = normalizeText(query.q);
    if (term !== '') {
      // bairroNorm/cidadeNorm já estão normalizados; o nome do autor é casado em memória
      // (base de usuários pequena) com a mesma regra de `matchesRunSearch`.
      const users = await prisma.user.findMany({ select: { id: true, name: true } });
      const authorIds = users
        .filter((u) => matchesRunSearch({ bairro: '', cidade: '' }, u.name ?? '', term))
        .map((u) => u.id);
      const or: Prisma.MiningRunWhereInput[] = [
        { bairroNorm: { contains: term, mode: 'insensitive' } },
        { cidadeNorm: { contains: term, mode: 'insensitive' } },
      ];
      if (authorIds.length > 0) or.push({ createdById: { in: authorIds } });
      and.push({ OR: or });
    }
  }
  const where: Prisma.MiningRunWhereInput = and.length > 0 ? { AND: and } : {};

  const [total, runs] = await Promise.all([
    prisma.miningRun.count({ where }),
    prisma.miningRun.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      skip: (query.page - 1) * RUNS_PAGE_SIZE,
      take: RUNS_PAGE_SIZE,
      include: { createdBy: { select: { id: true, name: true } } },
    }),
  ]);

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

  const items = runs.map((r) => ({
    ...toRunProgress(r, counts.get(r.id) ?? { novos: 0, existentes: 0 }),
    bairro: r.bairro,
    cidade: r.cidade,
    uf: r.uf,
    fonte: r.fonte,
    iaEnabled: r.iaEnabled,
    createdAt: r.createdAt,
    finishedAt: r.finishedAt,
    createdBy: { id: r.createdBy.id, name: r.createdBy.name },
  }));

  return NextResponse.json({
    items,
    page: query.page,
    total,
    totalPages: Math.max(1, Math.ceil(total / RUNS_PAGE_SIZE)),
  });
});

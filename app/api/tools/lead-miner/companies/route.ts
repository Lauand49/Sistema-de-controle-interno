/**
 * GET /api/tools/lead-miner/companies — ranking paginado de empresas (Req. 12.1–12.4, 13.1,
 * 13.2, 18.9). Página de `RANKING_PAGE_SIZE`, ordem única `RANKING_ORDER`.
 */
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { withAuth } from '@/lib/api';
import { requireNegocios, parseQuery } from '@/lib/leads/route-helpers';
import { buildCompanyWhere, companyListSchema, RANKING_ORDER } from '@/lib/leads/filters';
import { RANKING_PAGE_SIZE } from '@/lib/leads/config';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const LIST_SELECT = {
  id: true,
  nome: true,
  nicho: true,
  bairro: true,
  cidade: true,
  uf: true,
  telefone: true,
  website: true,
  categoria: true,
  scoreFinal: true,
  prioridade: true,
  hasSite: true,
  isHttps: true,
  fonte: true,
  lastAnalyzedAt: true,
  latitude: true,
  longitude: true,
  assignedUser: { select: { id: true, name: true } },
  prospectLead: { select: { id: true, status: true } },
} as const;

export const GET = withAuth(async (req, { actor }) => {
  requireNegocios(actor);
  const { page, ...filters } = parseQuery(companyListSchema, req.url);
  const where = buildCompanyWhere(filters);

  const [items, total] = await prisma.$transaction([
    prisma.company.findMany({
      where,
      orderBy: RANKING_ORDER,
      skip: (page - 1) * RANKING_PAGE_SIZE,
      take: RANKING_PAGE_SIZE,
      select: LIST_SELECT,
    }),
    prisma.company.count({ where }),
  ]);

  return NextResponse.json({
    items,
    total,
    page,
    pageSize: RANKING_PAGE_SIZE,
    totalPages: Math.ceil(total / RANKING_PAGE_SIZE),
  });
});

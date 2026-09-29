/**
 * GET /api/tools/lead-miner/companies/map — pontos do mapa (Req. 13.1, 13.2, 18.9).
 * Só empresas com coordenadas válidas, na ordem do ranking, até `MAP_MAX`; `total` conta
 * todas as válidas que atendem aos filtros e `shown` a quantidade devolvida.
 */
import { NextResponse } from 'next/server';
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { withAuth } from '@/lib/api';
import { requireNegocios, parseQuery } from '@/lib/leads/route-helpers';
import {
  buildCompanyWhere,
  companyFiltersSchema,
  RANKING_ORDER,
  selectMapPoints,
} from '@/lib/leads/filters';
import { MAP_MAX } from '@/lib/leads/config';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Coordenadas não nulas e dentro dos limites geográficos (NaN fica fora do intervalo). */
const VALID_COORDS: Prisma.CompanyWhereInput = {
  latitude: { not: null, gte: -90, lte: 90 },
  longitude: { not: null, gte: -180, lte: 180 },
};

export const GET = withAuth(async (req, { actor }) => {
  requireNegocios(actor);
  const filters = parseQuery(companyFiltersSchema, req.url);
  const where: Prisma.CompanyWhereInput = { AND: [buildCompanyWhere(filters), VALID_COORDS] };

  const [rows, total] = await prisma.$transaction([
    prisma.company.findMany({
      where,
      orderBy: RANKING_ORDER,
      take: MAP_MAX,
      select: {
        id: true,
        nome: true,
        latitude: true,
        longitude: true,
        categoria: true,
        scoreFinal: true,
        prioridade: true,
      },
    }),
    prisma.company.count({ where }),
  ]);

  const { points, shown } = selectMapPoints(rows, MAP_MAX);
  return NextResponse.json({ points, shown, total });
});

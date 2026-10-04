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

/** Sem coordenadas próprias válidas (NaN/nulo/fora de faixa fica incluído aqui). */
const NO_OWN_COORDS: Prisma.CompanyWhereInput = {
  OR: [
    { latitude: null },
    { longitude: null },
    { latitude: { lt: -90 } },
    { latitude: { gt: 90 } },
    { longitude: { lt: -180 } },
    { longitude: { gt: 180 } },
  ],
};

export const GET = withAuth(async (req, { actor }) => {
  requireNegocios(actor);
  const filters = parseQuery(companyFiltersSchema, req.url);
  const now = new Date();
  const base = buildCompanyWhere(filters, now);
  const where: Prisma.CompanyWhereInput = { AND: [base, VALID_COORDS] };

  const [rows, total, semCoordsProprias] = await prisma.$transaction([
    prisma.company.findMany({
      where,
      orderBy: RANKING_ORDER,
      take: MAP_MAX,
      select: {
        id: true,
        nomeExibicao: true,
        latitude: true,
        longitude: true,
        categoria: true,
        scoreFinal: true,
        prioridade: true,
      },
    }),
    prisma.company.count({ where }),
    // Empresas filtradas sem coordenadas próprias, mas com Cache_Google válido com coordenadas:
    // o Mapa não as posiciona por não usar Conteudo_Google (aviso do Req. 6.5).
    prisma.company.count({
      where: {
        AND: [
          base,
          NO_OWN_COORDS,
          {
            googleCache: {
              expiraEm: { gt: now },
              latitude: { not: null },
              longitude: { not: null },
            },
          },
        ],
      },
    }),
  ]);

  const { points, shown } = selectMapPoints(rows, MAP_MAX);
  return NextResponse.json({ points, shown, total, semCoordsProprias });
});

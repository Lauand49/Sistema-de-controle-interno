/**
 * GET /api/tools/lead-miner/companies/[id] — Ficha da empresa (`CompanyDetail` v2, Req. 6, 11, 15,
 * 16, 17). Faz uma purga oportunista do Cache_Google e, quando a Empresa tem Place_ID e o cache
 * está ausente/expirado, atualiza o Cache_Google antes de montar a resposta (Req. 6.2, 6.8–6.10).
 * A resposta nunca inclui o objeto de cache cru; Conteudo_Google expirado não aparece.
 */
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { withAuth, notFound } from '@/lib/api';
import { requireNegocios } from '@/lib/leads/route-helpers';
import { getPipelineDeps } from '@/lib/leads/deps';
import { isCacheValid } from '@/lib/leads/display';
import { purgeExpiredGoogleCache, refreshGoogleCache, type RefreshOutcome } from '@/lib/leads/google-cache';
import { loadCompanyDetail, type GoogleNotice } from '@/lib/leads/company-detail';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Params = { id: string };

/** Aviso exibido na ficha a partir do desfecho do refresh (Req. 6.9, 6.10). */
function noticeFrom(refresh: RefreshOutcome | null): GoogleNotice {
  if (refresh === 'UNAVAILABLE' || refresh === 'FAILED') return 'INDISPONIVEL';
  if (refresh === 'NOT_FOUND') return 'NAO_ENCONTRADO';
  return null;
}

export const GET = withAuth<Params>(async (_req, { params, actor }) => {
  requireNegocios(actor);
  const now = new Date();

  try {
    await purgeExpiredGoogleCache(prisma, now);
  } catch (e) {
    console.error('[lead-miner] falha na purga do Cache_Google', e);
  }

  // Atualiza o Cache_Google se há Place_ID e o cache está ausente/expirado (Req. 6.8).
  let refresh: RefreshOutcome | null = null;
  const base = await prisma.company.findUnique({
    where: { id: params.id },
    select: { id: true, googlePlaceId: true, googleCache: { select: { expiraEm: true } } },
  });
  if (!base) throw notFound('Empresa não encontrada.');
  if (base.googlePlaceId && !isCacheValid(base.googleCache, now)) {
    try {
      refresh = await refreshGoogleCache(prisma, params.id, getPipelineDeps().google);
    } catch (e) {
      console.error('[lead-miner] falha ao atualizar o Cache_Google', params.id, e);
      refresh = 'FAILED';
    }
  }

  const detail = await loadCompanyDetail(prisma, params.id, new Date(), noticeFrom(refresh));
  if (!detail) throw notFound('Empresa não encontrada.');
  return NextResponse.json(detail);
});

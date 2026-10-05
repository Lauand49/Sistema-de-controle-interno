/**
 * POST /api/tools/lead-miner/companies/[id]/reanalyze — Reanalisa a Empresa sob demanda (Req. 16).
 *
 * Lease atômico (`reanalyzeCompany`): duas requisições simultâneas → só uma reanalisa; a outra
 * recebe 409. Analise com menos de 10 min → 409 `RECENTE`. Falha interna → 500 genérico, sem
 * alterar a Analise nem o snapshot anteriores. Em sucesso devolve o `CompanyDetail` v2.
 */
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { withAuth, ApiError, notFound } from '@/lib/api';
import { requireNegocios } from '@/lib/leads/route-helpers';
import { getPipelineDeps } from '@/lib/leads/deps';
import { reanalyzeCompany, MSG_REANALYSIS } from '@/lib/leads/reanalysis';
import { loadCompanyDetail, type GoogleNotice } from '@/lib/leads/company-detail';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/** Orçamento da rota: deixa folga para a gravação dentro dos 60 s do serverless (Req. 16.2). */
const DEADLINE_MS = 55_000;

const CONFLICT_MESSAGE = {
  RECENTE: MSG_REANALYSIS.recente,
  EM_CURSO: MSG_REANALYSIS.emCurso,
} as const;

/** Mapeia o desfecho do refresh do Cache_Google para o aviso exibido na ficha (Req. 6.9, 6.10). */
function noticeFrom(refresh: string | null): GoogleNotice {
  if (refresh === 'UNAVAILABLE' || refresh === 'FAILED') return 'INDISPONIVEL';
  if (refresh === 'NOT_FOUND') return 'NAO_ENCONTRADO';
  return null;
}

type Params = { id: string };

export const POST = withAuth<Params>(async (_req, { params, actor }) => {
  requireNegocios(actor);

  const deps = getPipelineDeps();
  const deadline = Date.now() + DEADLINE_MS;

  let result;
  try {
    result = await reanalyzeCompany(params.id, deps, deadline);
  } catch (e) {
    if (e instanceof ApiError) throw e; // 404 (Empresa inexistente) sobe como está
    console.error('[lead-miner] falha na reanálise', params.id, e);
    throw new ApiError(500, 'A reanálise não foi concluída. Tente novamente.');
  }

  if (!result.ok) {
    throw new ApiError(409, CONFLICT_MESSAGE[result.reason], { reason: result.reason });
  }

  const company = await loadCompanyDetail(prisma, params.id, new Date(), noticeFrom(result.googleRefresh));
  if (!company) throw notFound(MSG_REANALYSIS.naoEncontrada);

  return NextResponse.json({
    analysisId: result.analysisId,
    semWebsite: result.semWebsite,
    googleRefresh: result.googleRefresh,
    company,
  });
});

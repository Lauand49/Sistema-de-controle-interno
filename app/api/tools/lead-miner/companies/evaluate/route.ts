/**
 * POST /api/tools/lead-miner/companies/evaluate — Botão "Avaliar" da aba "Sem contato" (T5).
 *
 * Corpo: `{ ids: string[] }` (1 a 30 empresas). O servidor só avalia quem realmente está em
 * "Sem contato" e ainda não tem avaliação (ou só a de regras); os demais são ignorados. Gemini em
 * lotes de 10 (cota `GEMINI_MONTHLY_LIMIT`), com regras determinísticas rotuladas "sem IA" quando
 * não há chave/cota/resposta válida.
 */
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { withAuth } from '@/lib/api';
import { prisma } from '@/lib/prisma';
import { requireNegocios, parseBody } from '@/lib/leads/route-helpers';
import { evaluateIdsSchema } from '@/lib/leads/filters';
import { getEvaluationDeps } from '@/lib/leads/deps';
import { evaluateCompanyIds } from '@/lib/leads/evaluation-store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const BUDGET_MS = 50_000;
const bodySchema = z.object({ ids: evaluateIdsSchema });

export const POST = withAuth(async (req, { actor }) => {
  requireNegocios(actor);
  const { ids } = await parseBody(bodySchema, req);
  const deps = getEvaluationDeps();
  const summary = await evaluateCompanyIds(prisma, ids, { ...deps, deadline: deps.now().getTime() + BUDGET_MS });
  return NextResponse.json(summary);
});

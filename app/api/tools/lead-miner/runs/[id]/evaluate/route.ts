/**
 * POST /api/tools/lead-miner/runs/[id]/evaluate — Avaliação dos leads "Sem contato" de uma mineração
 * concluída (T5), sob demanda/retentativa. A avaliação AUTOMÁTICA já é disparada pelo servidor na
 * requisição de lote que conclui a mineração (`lib/leads/auto-evaluation.ts`, P3); esta rota não
 * depende dessa marca e é idempotente (não reavalia quem já tem avaliação; teto de 30 por mineração).
 *
 * - avalia até `EVALUATION_AUTO_CAP` (30) leads sem contato por mineração, em lotes de 10 no Gemini;
 *   o restante fica para o botão "Avaliar";
 * - sem chave/cota/erro da IA, usa regras determinísticas (rotuladas "sem IA");
 * - 404 se a mineração não existe; 409 se ainda não terminou (`CONCLUIDA`).
 * Uma falha aqui nunca afeta a mineração: a resposta é só informativa.
 */
import { NextResponse } from 'next/server';
import { withAuth, ApiError, notFound } from '@/lib/api';
import { prisma } from '@/lib/prisma';
import { requireNegocios } from '@/lib/leads/route-helpers';
import { getEvaluationDeps } from '@/lib/leads/deps';
import { evaluateRunAuto, RunNotFinishedError } from '@/lib/leads/evaluation-store';
import { MSG_PIPELINE } from '@/lib/leads/pipeline';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/** Deixa margem para gravar e responder antes do limite da função. */
const BUDGET_MS = 50_000;

export const POST = withAuth<{ id: string }>(async (_req, { params, actor }) => {
  requireNegocios(actor);
  const deps = getEvaluationDeps();
  try {
    const summary = await evaluateRunAuto(prisma, params.id, { ...deps, deadline: deps.now().getTime() + BUDGET_MS });
    if (summary === null) throw notFound(MSG_PIPELINE.mineracaoNaoEncontrada);
    return NextResponse.json(summary);
  } catch (e) {
    if (e instanceof RunNotFinishedError) throw new ApiError(409, e.message);
    throw e;
  }
});

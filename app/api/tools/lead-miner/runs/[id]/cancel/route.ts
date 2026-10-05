/**
 * POST /api/tools/lead-miner/runs/[id]/cancel — Para uma mineração (T1).
 *
 * Permissão (no servidor): quem iniciou a mineração, gerência de Negócios e Presidência/Vice
 * (`canCancelRun`, que compõe helpers de `lib/permissions.ts`).
 * - 200 `RunProgress` (`CANCELADA`); repetir o pedido também devolve 200 (idempotente);
 * - 403 sem permissão; 404 inexistente; 409 se a mineração já terminou (`CONCLUIDA`/`ERRO`).
 * Empresas e análises já salvas permanecem; nada é apagado.
 */
import { NextResponse } from 'next/server';
import { withAuth } from '@/lib/api';
import { prisma } from '@/lib/prisma';
import { requireNegocios } from '@/lib/leads/route-helpers';
import { cancelRun } from '@/lib/leads/cancel';
import { getRunProgress } from '@/lib/leads/pipeline';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const POST = withAuth<{ id: string }>(async (_req, { params, actor }) => {
  requireNegocios(actor);
  await cancelRun(prisma, params.id, actor);
  return NextResponse.json(await getRunProgress(params.id, prisma));
});

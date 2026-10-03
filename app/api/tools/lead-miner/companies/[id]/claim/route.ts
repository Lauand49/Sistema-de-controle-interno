/**
 * POST /api/tools/lead-miner/companies/[id]/claim — "Assumir lead" (Req. 14.9, 14.10, 16.3,
 * 16.4, 16.5, 18.4, 18.8, 18.11).
 *
 * O `updateMany ... WHERE assignedTo IS NULL` é atômico no Postgres: com duas requisições
 * simultâneas, a segunda espera o lock da linha, reavalia o filtro e afeta 0 linhas. Nesse caso
 * a transação não grava nada e a rota responde 409 com o responsável atual.
 */
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { withAuth, ApiError, forbidden, notFound } from '@/lib/api';
import { audit } from '@/lib/audit';
import { canChangeLeadAssignee } from '@/lib/permissions';
import { requireNegocios } from '@/lib/leads/route-helpers';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Params = { id: string };

export const POST = withAuth<Params>(async (_req, { params, actor }) => {
  requireNegocios(actor);

  const company = await prisma.company.findUnique({
    where: { id: params.id },
    select: { id: true },
  });
  if (!company) throw notFound('Empresa não encontrada.');

  if (!canChangeLeadAssignee(actor, null, actor.id)) {
    throw forbidden('Você não tem permissão para assumir este lead.');
  }

  const claimed = await prisma.$transaction(async (tx) => {
    const { count } = await tx.company.updateMany({
      where: { id: company.id, assignedTo: null },
      data: { assignedTo: actor.id },
    });
    if (count === 0) return false;

    await tx.prospectLead.updateMany({
      where: { companyId: company.id },
      data: { assignedTo: actor.id },
    });
    await audit(tx, {
      actorId: actor.id,
      action: 'LEAD_MINER_CLAIMED',
      before: { companyId: company.id, assignedTo: null },
      after: { companyId: company.id, assignedTo: actor.id },
    });
    return true;
  });

  if (!claimed) {
    const current = await prisma.company.findUnique({
      where: { id: company.id },
      select: { assignedUser: { select: { id: true, name: true } } },
    });
    if (!current) throw notFound('Empresa não encontrada.');
    throw new ApiError(409, 'Este lead já foi assumido.', {
      assignedTo: current.assignedUser ?? null,
    });
  }

  return NextResponse.json({ assignedTo: { id: actor.id, name: actor.name } });
});

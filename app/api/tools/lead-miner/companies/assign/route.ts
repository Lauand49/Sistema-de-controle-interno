/**
 * POST /api/tools/lead-miner/companies/assign — atribui um responsável a 1–200 empresas
 * (Req. 16.1, 16.2, 16.5, 16.7, 16.8, 18.4, 18.8, 18.11).
 *
 * Todas as checagens (permissão, destino, ids existentes, `canChangeLeadAssignee` por empresa)
 * rodam antes da transação: uma rejeição não grava nada, nem `AuditLog`. Na transação,
 * atualiza `Company.assignedTo` e o `ProspectLead` vinculado; empresas cujo responsável muda
 * geram um `AuditLog` `LEAD_MINER_ASSIGNED`. Qualquer falha desfaz todas as alterações.
 */
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { withAuth, assert, badRequest, forbidden } from '@/lib/api';
import { audit } from '@/lib/audit';
import { canAssignLeads, canBeLeadAssignee, canChangeLeadAssignee } from '@/lib/permissions';
import { requireNegocios, parseBody } from '@/lib/leads/route-helpers';
import { bulkIdsSchema } from '@/lib/leads/filters';
import { findUserDTO } from '@/lib/users';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const INVALID_ASSIGNEE = 'Este usuário não pode ser responsável por leads.';
const MISSING_COMPANY = 'A seleção contém empresa inexistente.';

const bodySchema = z.object({
  ids: bulkIdsSchema,
  assigneeId: z
    .string({ required_error: INVALID_ASSIGNEE, invalid_type_error: INVALID_ASSIGNEE })
    .trim()
    .min(1, INVALID_ASSIGNEE),
});

export const POST = withAuth(async (req, { actor }) => {
  requireNegocios(actor);
  assert(canAssignLeads(actor), 'Você não tem permissão para atribuir leads.');
  const { ids, assigneeId } = await parseBody(bodySchema, req);

  const assignee = await findUserDTO(assigneeId);
  if (!assignee || !canBeLeadAssignee(assignee)) throw badRequest(INVALID_ASSIGNEE);

  const companies = await prisma.company.findMany({
    where: { id: { in: ids } },
    select: { id: true, assignedTo: true },
  });
  if (companies.length !== ids.length) throw badRequest(MISSING_COMPANY);
  for (const c of companies) {
    if (!canChangeLeadAssignee(actor, c.assignedTo, assignee.id)) {
      throw forbidden('Você não tem permissão para alterar o responsável destes leads.');
    }
  }

  await prisma.$transaction(async (tx) => {
    // Relê dentro da transação para registrar o responsável anterior real.
    const current = await tx.company.findMany({
      where: { id: { in: ids } },
      select: { id: true, assignedTo: true },
    });
    if (current.length !== ids.length) throw badRequest(MISSING_COMPANY);

    const updated = await tx.company.updateMany({
      where: { id: { in: ids } },
      data: { assignedTo: assignee.id },
    });
    if (updated.count !== ids.length) throw badRequest(MISSING_COMPANY);

    await tx.prospectLead.updateMany({
      where: { companyId: { in: ids } },
      data: { assignedTo: assignee.id },
    });

    for (const c of current) {
      if (c.assignedTo === assignee.id) continue;
      await audit(tx, {
        actorId: actor.id,
        action: 'LEAD_MINER_ASSIGNED',
        before: { companyId: c.id, assignedTo: c.assignedTo },
        after: { companyId: c.id, assignedTo: assignee.id },
      });
    }
  });

  return NextResponse.json({
    updated: ids.length,
    assignee: { id: assignee.id, name: assignee.name },
  });
});

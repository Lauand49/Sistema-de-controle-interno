/**
 * POST /api/tools/lead-miner/companies/triage — envia empresas mineradas para a Triagem
 * (Req. 15.1, 15.3, 15.4, 15.5, 15.6, 15.9, 15.10, 15.11, 15.12, 18.8).
 *
 * Tudo numa transação: carrega as empresas, monta os leads com `buildTriageLead` e insere com
 * `createManyAndReturn({ skipDuplicates: true })`. O índice único de `ProspectLead.companyId`
 * garante no máximo um lead por empresa, inclusive com envios simultâneos (ON CONFLICT DO
 * NOTHING). Empresas que já têm lead e ids inexistentes contam como ignorados. Cada lead criado
 * gera um `AuditLog` `LEAD_MINER_SENT_TO_TRIAGE`; qualquer erro desfaz tudo.
 */
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { withAuth } from '@/lib/api';
import { audit } from '@/lib/audit';
import { requireNegocios, parseBody } from '@/lib/leads/route-helpers';
import { bulkIdsSchema } from '@/lib/leads/filters';
import { buildTriageLead } from '@/lib/leads/triage';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const bodySchema = z.object({ ids: bulkIdsSchema });

export const POST = withAuth(async (req, { actor }) => {
  requireNegocios(actor);
  const { ids } = await parseBody(bodySchema, req);

  const created = await prisma.$transaction(async (tx) => {
    const companies = await tx.company.findMany({
      where: { id: { in: ids } },
      select: {
        id: true,
        nomeExibicao: true,
        nicho: true,
        telefone: true,
        website: true,
        categoria: true,
        assignedTo: true,
        googleCache: { select: { placeId: true } },
      },
    });
    if (companies.length === 0) return 0;

    const leads = await tx.prospectLead.createManyAndReturn({
      data: companies.map((c) =>
        buildTriageLead({
          id: c.id,
          nomeExibicao: c.nomeExibicao,
          nicho: c.nicho,
          telefone: c.telefone,
          website: c.website,
          categoria: c.categoria as import('@/lib/leads/types').CategoryCode | null,
          assignedTo: c.assignedTo,
          googlePlaceId: c.googleCache?.placeId ?? null,
        }),
      ),
      skipDuplicates: true,
      select: { id: true, companyId: true },
    });

    for (const lead of leads) {
      await audit(tx, {
        actorId: actor.id,
        action: 'LEAD_MINER_SENT_TO_TRIAGE',
        after: { companyId: lead.companyId, prospectLeadId: lead.id },
      });
    }
    return leads.length;
  });

  return NextResponse.json({ created, ignored: ids.length - created });
});

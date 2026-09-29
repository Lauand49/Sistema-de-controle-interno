import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { withAuth, ApiError, assert, badRequest, notFound } from '@/lib/api';
import { canEditLead, canEditUnit } from '@/lib/permissions';
import { assertLeadAssigneeChange } from '@/lib/leads/guards';
import { findSalesPipe } from '@/lib/units';

export const POST = withAuth<{ id: string }>(async (request, { params, actor }) => {
  let body: any = {};
  try {
    body = await request.json();
  } catch {
    body = {};
  }
  const { meetingDate } = body;

  const lead = await prisma.prospectLead.findUnique({ where: { id: params.id } });
  if (!lead) throw notFound('Lead não encontrado.');
  assert(canEditLead(actor, lead), 'Este lead pertence a outro responsável.');
  assert(canEditUnit(actor, 'NEGOCIOS'), 'Apenas Negócios ou a Presidência pode converter leads.');

  if (lead.status === 'CONVERTED_TO_PIPE' && lead.pipeCardId) {
    throw new ApiError(400, 'Este lead já foi convertido em um card do funil.', { cardId: lead.pipeCardId });
  }

  const assigneeId: string | null = body.assigneeId || lead.assignedTo || null;
  await assertLeadAssigneeChange(actor, lead.assignedTo, assigneeId);

  // Funil de Vendas de Negócios → primeira fase ("Reunião marcada")
  const pipe = await findSalesPipe();
  if (!pipe || pipe.phases.length === 0) throw badRequest('Funil de vendas de Negócios não encontrado.');
  const firstPhase = pipe.phases[0];

  const lastCard = await prisma.card.findFirst({
    where: { phaseId: firstPhase.id },
    orderBy: { order: 'desc' },
  });

  const fComp = firstPhase.fields.find((f) => f.name === 'company_name');
  const fDate = firstPhase.fields.find((f) => f.name === 'meeting_date');
  const fContact = firstPhase.fields.find((f) => f.name === 'contact_person');

  const valueCreates: Array<{ fieldId: string; value: string }> = [];
  if (fComp) valueCreates.push({ fieldId: fComp.id, value: lead.companyName });
  if (fDate) {
    valueCreates.push({
      fieldId: fDate.id,
      value: meetingDate || new Date().toISOString().split('T')[0],
    });
  }
  if (fContact) {
    valueCreates.push({
      fieldId: fContact.id,
      value: [lead.contactName, lead.contactInfo].filter(Boolean).join(' - ') || 'Decisor a qualificar',
    });
  }

  const createdCard = await prisma.card.create({
    data: {
      title: `Projeto - ${lead.companyName}`,
      description: `Lead importado da planilha. Plano: ${lead.actionPlan}${lead.notes ? ` | Obs: ${lead.notes}` : ''}`,
      phaseId: firstPhase.id,
      assigneeId,
      order: lastCard ? lastCard.order + 1 : 0,
      values: { create: valueCreates },
      activities: {
        create: {
          type: 'CARD_CREATED',
          description: `Card criado na fase "${firstPhase.name}" através da conversão de lead na Planilha de Triagem SciTec.`,
          userId: actor.id,
          metadata: JSON.stringify({
            source: 'LEAD_SHEET',
            leadId: lead.id,
            companyName: lead.companyName,
            segment: lead.segment,
          }),
        },
      },
    },
    include: {
      phase: true,
      assignee: true,
      values: { include: { field: true } },
      activities: true,
    },
  });

  const updatedLead = await prisma.prospectLead.update({
    where: { id: params.id },
    data: { status: 'CONVERTED_TO_PIPE', pipeCardId: createdCard.id, assignedTo: assigneeId },
  });

  return NextResponse.json({
    success: true,
    card: createdCard,
    lead: updatedLead,
    message: `Lead "${lead.companyName}" convertido com sucesso para a fase "${firstPhase.name}"!`,
  });
});

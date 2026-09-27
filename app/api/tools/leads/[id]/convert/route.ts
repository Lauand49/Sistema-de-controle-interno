import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    let body: any = {};
    try {
      body = await request.json();
    } catch {
      body = {};
    }

    const { assigneeId, meetingDate, initialValue } = body;

    const lead = await prisma.prospectLead.findUnique({
      where: { id: params.id },
    });

    if (!lead) {
      return NextResponse.json({ error: 'Lead não encontrado.' }, { status: 404 });
    }

    if (lead.status === 'CONVERTED_TO_PIPE' && lead.pipeCardId) {
      return NextResponse.json(
        { error: 'Este lead já foi convertido em um card do funil.', cardId: lead.pipeCardId },
        { status: 400 }
      );
    }

    if (assigneeId) {
      const targetUser = await prisma.user.findUnique({
        where: { id: assigneeId },
      });
      if (
        !targetUser ||
        (targetUser.primaryDept?.toUpperCase() !== 'NEGOCIOS' &&
          targetUser.role?.toUpperCase() !== 'PRESIDENTE')
      ) {
        return NextResponse.json(
          { error: 'Cards de leads só podem ser atribuídos a consultores da Diretoria de Negócios.' },
          { status: 400 }
        );
      }
    }

    // Get pipe and initial phase (Reunião marcada)
    const pipe = await prisma.pipe.findFirst({
      include: {
        phases: {
          orderBy: { order: 'asc' },
          include: { fields: true },
        },
      },
    });

    if (!pipe || pipe.phases.length === 0) {
      return NextResponse.json({ error: 'Funil de vendas não encontrado.' }, { status: 500 });
    }

    const firstPhase = pipe.phases[0];

    // Find last card order
    const lastCard = await prisma.card.findFirst({
      where: { phaseId: firstPhase.id },
      orderBy: { order: 'desc' },
    });
    const newOrder = lastCard ? lastCard.order + 1 : 0;

    // Field value mappings for Reunião marcada phase
    const fComp = firstPhase.fields.find((f) => f.name === 'company_name');
    const fDate = firstPhase.fields.find((f) => f.name === 'meeting_date');
    const fContact = firstPhase.fields.find((f) => f.name === 'contact_person');

    const valueCreates = [];

    if (fComp) {
      valueCreates.push({ fieldId: fComp.id, value: lead.companyName });
    }

    if (fDate) {
      const chosenDate = meetingDate || new Date().toISOString().split('T')[0];
      valueCreates.push({ fieldId: fDate.id, value: chosenDate });
    }

    if (fContact) {
      const contactVal = [lead.contactName, lead.contactInfo].filter(Boolean).join(' - ') || 'Decisor a qualificar';
      valueCreates.push({
        fieldId: fContact.id,
        value: contactVal,
      });
    }

    const createdCard = await prisma.card.create({
      data: {
        title: `Projeto - ${lead.companyName}`,
        description: `Lead importado da planilha. Plano: ${lead.actionPlan}${
          lead.notes ? ` | Obs: ${lead.notes}` : ''
        }`,
        phaseId: firstPhase.id,
        assigneeId: assigneeId || null,
        order: newOrder,
        values: {
          create: valueCreates,
        },
        activities: {
          create: {
            type: 'CARD_CREATED',
            description: `Card criado na fase "${firstPhase.name}" através da conversão de lead na Planilha de Triagem SciTec.`,
            userId: assigneeId || null,
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

    // Update ProspectLead status & pipeCardId
    const updatedLead = await prisma.prospectLead.update({
      where: { id: params.id },
      data: {
        status: 'CONVERTED_TO_PIPE',
        pipeCardId: createdCard.id,
        assignedTo: assigneeId || lead.assignedTo || null,
      },
    });

    return NextResponse.json({
      success: true,
      card: createdCard,
      lead: updatedLead,
      message: `Lead "${lead.companyName}" convertido com sucesso para a fase "${firstPhase.name}"!`,
    });
  } catch (error: any) {
    console.error('Error converting lead to card:', error);
    return NextResponse.json({ error: 'Erro ao converter lead em card.' }, { status: 500 });
  }
}

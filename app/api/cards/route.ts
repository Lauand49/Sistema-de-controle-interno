import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { createCardSchema } from '@/lib/validations';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const validated = createCardSchema.parse(body);

    // Get max order in the phase
    const lastCard = await prisma.card.findFirst({
      where: { phaseId: validated.phaseId },
      orderBy: { order: 'desc' },
    });
    const newOrder = lastCard ? lastCard.order + 1 : 0;

    const phase = await prisma.phase.findUnique({
      where: { id: validated.phaseId },
    });

    const card = await prisma.card.create({
      data: {
        title: validated.title,
        description: validated.description,
        phaseId: validated.phaseId,
        assigneeId: validated.assigneeId || null,
        order: newOrder,
        activities: {
          create: {
            type: 'CARD_CREATED',
            description: `Card "${validated.title}" criado na fase ${phase?.name || 'Prospecção'}.`,
            userId: validated.assigneeId || null,
          },
        },
      },
      include: {
        phase: true,
        assignee: true,
        values: { include: { field: true } },
        activities: { orderBy: { createdAt: 'desc' }, include: { user: true } },
      },
    });

    // Save field values if provided
    if (validated.fieldValues && Object.keys(validated.fieldValues).length > 0) {
      for (const [fieldId, val] of Object.entries(validated.fieldValues)) {
        if (val !== undefined && val !== null) {
          await prisma.cardFieldValue.upsert({
            where: {
              cardId_fieldId: {
                cardId: card.id,
                fieldId,
              },
            },
            create: {
              cardId: card.id,
              fieldId,
              value: String(val),
            },
            update: {
              value: String(val),
            },
          });
        }
      }
    }

    const updatedCard = await prisma.card.findUnique({
      where: { id: card.id },
      include: {
        phase: true,
        assignee: true,
        values: { include: { field: true } },
        activities: { orderBy: { createdAt: 'desc' }, include: { user: true } },
      },
    });

    return NextResponse.json(updatedCard, { status: 201 });
  } catch (error: any) {
    if (error.name === 'ZodError') {
      return NextResponse.json(
        { error: 'Dados inválidos.', details: error.errors },
        { status: 400 }
      );
    }
    console.error('Error creating card:', error);
    return NextResponse.json({ error: 'Erro ao criar o card.' }, { status: 500 });
  }
}

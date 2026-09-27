import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { updateCardSchema } from '@/lib/validations';

export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const card = await prisma.card.findUnique({
      where: { id: params.id },
      include: {
        phase: {
          include: {
            fields: { orderBy: { order: 'asc' } },
          },
        },
        assignee: true,
        values: { include: { field: true } },
        activities: {
          orderBy: { createdAt: 'desc' },
          include: { user: true },
        },
      },
    });

    if (!card) {
      return NextResponse.json({ error: 'Card não encontrado.' }, { status: 404 });
    }

    return NextResponse.json(card);
  } catch (error: any) {
    console.error('Error fetching card:', error);
    return NextResponse.json({ error: 'Erro ao buscar o card.' }, { status: 500 });
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const body = await request.json();
    const validated = updateCardSchema.parse(body);

    const existingCard = await prisma.card.findUnique({
      where: { id: params.id },
      include: { values: true },
    });

    if (!existingCard) {
      return NextResponse.json({ error: 'Card não encontrado.' }, { status: 404 });
    }

    // Update basic card properties
    await prisma.card.update({
      where: { id: params.id },
      data: {
        ...(validated.title ? { title: validated.title } : {}),
        ...(validated.description !== undefined ? { description: validated.description } : {}),
        ...(validated.assigneeId !== undefined ? { assigneeId: validated.assigneeId } : {}),
      },
    });

    // Update field values
    if (validated.fieldValues && Object.keys(validated.fieldValues).length > 0) {
      let updatedFieldNames: string[] = [];

      for (const [fieldId, val] of Object.entries(validated.fieldValues)) {
        if (val !== undefined && val !== null) {
          await prisma.cardFieldValue.upsert({
            where: {
              cardId_fieldId: {
                cardId: params.id,
                fieldId,
              },
            },
            create: {
              cardId: params.id,
              fieldId,
              value: String(val),
            },
            update: {
              value: String(val),
            },
          });

          const f = await prisma.field.findUnique({ where: { id: fieldId } });
          if (f) updatedFieldNames.push(f.label);
        }
      }

      if (updatedFieldNames.length > 0) {
        await prisma.cardActivity.create({
          data: {
            cardId: params.id,
            type: 'FIELD_UPDATED',
            description: `Campos atualizados: ${updatedFieldNames.join(', ')}.`,
          },
        });
      }
    }

    const updatedCard = await prisma.card.findUnique({
      where: { id: params.id },
      include: {
        phase: {
          include: { fields: { orderBy: { order: 'asc' } } },
        },
        assignee: true,
        values: { include: { field: true } },
        activities: { orderBy: { createdAt: 'desc' }, include: { user: true } },
      },
    });

    return NextResponse.json(updatedCard);
  } catch (error: any) {
    if (error.name === 'ZodError') {
      return NextResponse.json(
        { error: 'Dados inválidos.', details: error.errors },
        { status: 400 }
      );
    }
    console.error('Error updating card:', error);
    return NextResponse.json({ error: 'Erro ao atualizar o card.' }, { status: 500 });
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    await prisma.card.delete({
      where: { id: params.id },
    });

    return NextResponse.json({ success: true, message: 'Card excluído com sucesso.' });
  } catch (error: any) {
    console.error('Error deleting card:', error);
    return NextResponse.json({ error: 'Erro ao excluir o card.' }, { status: 500 });
  }
}

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function PATCH(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const body = await request.json();
    const { status, handlerId, priority, title, description, dueDate } = body;

    const existing = await prisma.crossDeptRequest.findUnique({
      where: { id: params.id },
    });

    if (!existing) {
      return NextResponse.json({ error: 'Solicitação não encontrada.' }, { status: 404 });
    }

    const updateData: any = {};
    if (status !== undefined) updateData.status = String(status).toUpperCase();
    if (handlerId !== undefined) updateData.handlerId = handlerId || null;
    if (priority !== undefined) updateData.priority = String(priority).toUpperCase();
    if (title !== undefined) updateData.title = String(title);
    if (description !== undefined) updateData.description = String(description);
    if (dueDate !== undefined) updateData.dueDate = dueDate ? new Date(dueDate) : null;

    const updated = await prisma.crossDeptRequest.update({
      where: { id: params.id },
      data: updateData,
      include: {
        requester: true,
        handler: true,
      },
    });

    // If marked as COMPLETED and linked to a Card, log activity on that Card
    if (status === 'COMPLETED' && updated.linkedCardId) {
      try {
        await prisma.cardActivity.create({
          data: {
            cardId: updated.linkedCardId,
            userId: updated.handlerId || null,
            type: 'COMMENT',
            description: `Demanda intersetorial "${updated.title}" foi marcada como CONCLUÍDA.`,
            metadata: JSON.stringify({
              requestId: updated.id,
              status: 'COMPLETED',
            }),
          },
        });
      } catch (err) {
        console.error('Error recording activity on linked card:', err);
      }
    }

    return NextResponse.json(updated);
  } catch (error: any) {
    console.error('Error updating cross dept request:', error);
    return NextResponse.json({ error: 'Erro ao atualizar solicitação.' }, { status: 500 });
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    await prisma.crossDeptRequest.delete({
      where: { id: params.id },
    });

    return NextResponse.json({ success: true, message: 'Solicitação excluída com sucesso.' });
  } catch (error: any) {
    console.error('Error deleting cross dept request:', error);
    return NextResponse.json({ error: 'Erro ao excluir solicitação.' }, { status: 500 });
  }
}

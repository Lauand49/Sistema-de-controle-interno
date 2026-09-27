import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function PATCH(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const body = await request.json();

    const existingLead = await prisma.prospectLead.findUnique({
      where: { id: params.id },
    });

    if (!existingLead) {
      return NextResponse.json({ error: 'Lead não encontrado.' }, { status: 404 });
    }

    if (body.assignedTo) {
      const targetUser = await prisma.user.findUnique({
        where: { id: body.assignedTo },
      });
      if (
        !targetUser ||
        (targetUser.primaryDept?.toUpperCase() !== 'NEGOCIOS' &&
          targetUser.role?.toUpperCase() !== 'PRESIDENTE')
      ) {
        return NextResponse.json(
          { error: 'Leads só podem ser atribuídos a membros da Diretoria de Negócios.' },
          { status: 400 }
        );
      }
    }

    const updatedLead = await prisma.prospectLead.update({
      where: { id: params.id },
      data: {
        ...(body.companyName ? { companyName: body.companyName } : {}),
        ...(body.contactName !== undefined ? { contactName: body.contactName } : {}),
        ...(body.contactInfo !== undefined ? { contactInfo: body.contactInfo } : {}),
        ...(body.actionPlan !== undefined ? { actionPlan: body.actionPlan } : {}),
        ...(body.notes !== undefined ? { notes: body.notes } : {}),
        ...(body.segment !== undefined ? { segment: body.segment } : {}),
        ...(body.status ? { status: body.status } : {}),
        ...(body.assignedTo !== undefined ? { assignedTo: body.assignedTo } : {}),
      },
      include: {
        assignedUser: true,
      },
    });

    return NextResponse.json(updatedLead);
  } catch (error: any) {
    console.error('Error updating prospect lead:', error);
    return NextResponse.json({ error: 'Erro ao atualizar o lead.' }, { status: 500 });
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    await prisma.prospectLead.delete({
      where: { id: params.id },
    });

    return NextResponse.json({ success: true, message: 'Lead excluído.' });
  } catch (error: any) {
    console.error('Error deleting prospect lead:', error);
    return NextResponse.json({ error: 'Erro ao excluir o lead.' }, { status: 500 });
  }
}

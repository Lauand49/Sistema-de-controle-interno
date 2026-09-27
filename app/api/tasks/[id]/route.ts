import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { z } from 'zod';

const updateTaskSchema = z.object({
  title: z.string().min(1).optional(),
  description: z.string().optional().nullable(),
  status: z.enum(['TODO', 'IN_PROGRESS', 'DONE', 'CANCELLED']).optional(),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'URGENT']).optional(),
  dueDate: z.string().optional().nullable(),
  assigneeId: z.string().optional().nullable(),
  leadId: z.string().optional().nullable(),
  cardId: z.string().optional().nullable(),
});

export async function PATCH(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const body = await request.json();
    const validated = updateTaskSchema.parse(body);

    const dataToUpdate: any = {};
    if (validated.title !== undefined) dataToUpdate.title = validated.title;
    if (validated.description !== undefined) dataToUpdate.description = validated.description;
    if (validated.status !== undefined) dataToUpdate.status = validated.status;
    if (validated.priority !== undefined) dataToUpdate.priority = validated.priority;
    if (validated.dueDate !== undefined) {
      dataToUpdate.dueDate = validated.dueDate ? new Date(validated.dueDate) : null;
    }
    if (validated.assigneeId !== undefined) dataToUpdate.assigneeId = validated.assigneeId;
    if (validated.leadId !== undefined) dataToUpdate.leadId = validated.leadId;
    if (validated.cardId !== undefined) dataToUpdate.cardId = validated.cardId;

    const updatedTask = await prisma.task.update({
      where: { id: params.id },
      data: dataToUpdate,
      include: {
        assignee: true,
      },
    });

    return NextResponse.json(updatedTask);
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: error.errors[0].message }, { status: 400 });
    }
    console.error('Error updating task:', error);
    return NextResponse.json({ error: 'Erro ao atualizar tarefa.' }, { status: 500 });
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    await prisma.task.delete({
      where: { id: params.id },
    });

    return NextResponse.json({ success: true, message: 'Tarefa excluída com sucesso.' });
  } catch (error: any) {
    console.error('Error deleting task:', error);
    return NextResponse.json({ error: 'Erro ao excluir tarefa.' }, { status: 500 });
  }
}

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { withAuth, assert, notFound } from '@/lib/api';
import { canEditTask } from '@/lib/permissions';
import { assertActiveUser, serializeTask } from '@/lib/units';
import { completedAtUpdate } from '@/lib/task-completion';

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

type Params = { id: string };

async function loadTask(id: string) {
  const task = await prisma.task.findUnique({
    where: { id },
    select: { assigneeId: true, status: true, unit: { select: { code: true } } },
  });
  if (!task) throw notFound('Tarefa não encontrada.');
  return { assigneeId: task.assigneeId, status: task.status, unitCode: task.unit?.code ?? null };
}

export const PATCH = withAuth<Params>(async (request, { params, actor }) => {
  const validated = updateTaskSchema.parse(await request.json());
  const current = await loadTask(params.id);
  assert(canEditTask(actor, current), 'Você não pode editar esta tarefa.');
  if (validated.assigneeId) await assertActiveUser(validated.assigneeId);

  const data: Record<string, unknown> = {};
  if (validated.title !== undefined) data.title = validated.title;
  if (validated.description !== undefined) data.description = validated.description;
  if (validated.status !== undefined) data.status = validated.status;
  const completedAt = completedAtUpdate(current.status, validated.status, new Date());
  if (completedAt !== undefined) data.completedAt = completedAt;
  if (validated.priority !== undefined) data.priority = validated.priority;
  if (validated.dueDate !== undefined) {
    data.dueDate = validated.dueDate ? new Date(validated.dueDate) : null;
  }
  if (validated.assigneeId !== undefined) data.assigneeId = validated.assigneeId;
  if (validated.leadId !== undefined) data.leadId = validated.leadId;
  if (validated.cardId !== undefined) data.cardId = validated.cardId;

  const task = await prisma.task.update({
    where: { id: params.id },
    data,
    include: { assignee: true, unit: { select: { code: true } } },
  });
  return NextResponse.json(serializeTask(task));
});

export const DELETE = withAuth<Params>(async (_req, { params, actor }) => {
  const current = await loadTask(params.id);
  assert(canEditTask(actor, current), 'Você não pode excluir esta tarefa.');
  await prisma.task.delete({ where: { id: params.id } });
  return NextResponse.json({ success: true, message: 'Tarefa excluída com sucesso.' });
});

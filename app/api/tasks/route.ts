import { NextResponse } from 'next/server';
import type { Prisma } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { withAuth, assert, type Actor } from '@/lib/api';
import {
  canEditUnit,
  canViewUnit,
  isDepartmentManager,
  isGlobal,
  visibleUnitCodes,
} from '@/lib/permissions';
import { assertActiveUser, getUnitByCode, serializeTask } from '@/lib/units';
import { completedAtUpdate } from '@/lib/task-completion';

const createTaskSchema = z.object({
  title: z.string().min(1, 'Título é obrigatório'),
  description: z.string().optional().nullable(),
  status: z.enum(['TODO', 'IN_PROGRESS', 'DONE', 'CANCELLED']).default('TODO'),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'URGENT']).default('MEDIUM'),
  dueDate: z.string().optional().nullable(),
  /** Código da unidade (departamento/setor). Vazio ou 'GLOBAL' = tarefa geral. */
  department: z.string().optional().nullable(),
  assigneeId: z.string().optional().nullable(),
  leadId: z.string().optional().nullable(),
  cardId: z.string().optional().nullable(),
});

const taskInclude = {
  assignee: true,
  unit: { select: { code: true } },
} satisfies Prisma.TaskInclude;

/** Tarefas que o ator pode ver (null = todas). */
function visibilityFilter(actor: Actor) {
  if (isGlobal(actor)) return null;
  const or: Prisma.TaskWhereInput[] = [{ assigneeId: actor.id }];
  const units = visibleUnitCodes(actor) || [];
  if (units.length > 0) or.push({ unit: { code: { in: units } } });
  // Gerente de Departamento acompanha o progresso de todos do seu departamento
  if (isDepartmentManager(actor) && actor.departmentCode) {
    or.push({ assignee: { department: { code: actor.departmentCode } } });
  }
  return { OR: or } satisfies Prisma.TaskWhereInput;
}

export const GET = withAuth(async (request, { actor }) => {
  const { searchParams } = new URL(request.url);
  const assigneeId = searchParams.get('assigneeId');
  const status = searchParams.get('status');
  const department = searchParams.get('department')?.toUpperCase();
  const query = searchParams.get('q');

  const and: Prisma.TaskWhereInput[] = [];
  const visibility = visibilityFilter(actor);
  if (visibility) and.push(visibility);

  if (department && department !== 'ALL') {
    if (department === 'GLOBAL') {
      and.push({ unitId: null });
    } else {
      assert(canViewUnit(actor, department), 'Você não tem acesso às tarefas desta unidade.');
      and.push({ unit: { code: department } });
    }
  }
  if (assigneeId && assigneeId !== 'ALL') and.push({ assigneeId });
  if (status && status !== 'ALL') and.push({ status });
  if (query) {
    and.push({
      OR: [
        { title: { contains: query, mode: 'insensitive' } },
        { description: { contains: query, mode: 'insensitive' } },
      ],
    });
  }

  const tasks = await prisma.task.findMany({
    where: { AND: and },
    include: taskInclude,
    orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
  });
  return NextResponse.json(tasks.map(serializeTask));
});

export const POST = withAuth(async (request, { actor }) => {
  const validated = createTaskSchema.parse(await request.json());

  const code = validated.department?.toUpperCase();
  let unitId: string | null = null;
  if (code && code !== 'GLOBAL') {
    const unit = await getUnitByCode(code);
    assert(canEditUnit(actor, unit.code), 'Você só pode criar tarefas nas unidades das quais participa.');
    unitId = unit.id;
  }
  // Tarefa geral sem responsável ficaria invisível: atribui ao próprio autor.
  const assigneeId = validated.assigneeId || (unitId ? null : actor.id);
  if (assigneeId) await assertActiveUser(assigneeId);

  const task = await prisma.task.create({
    data: {
      title: validated.title,
      description: validated.description,
      status: validated.status,
      completedAt: completedAtUpdate(null, validated.status, new Date()),
      priority: validated.priority,
      dueDate: validated.dueDate ? new Date(validated.dueDate) : null,
      unitId,
      assigneeId,
      leadId: validated.leadId || null,
      cardId: validated.cardId || null,
    },
    include: taskInclude,
  });

  return NextResponse.json(serializeTask(task), { status: 201 });
});

import { NextResponse } from 'next/server';
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { withAuth, badRequest } from '@/lib/api';
import { canViewUnit, isDepartmentCode, isGlobal } from '@/lib/permissions';

export const dynamic = 'force-dynamic';

const PRIORITIES = ['LOW', 'MEDIUM', 'HIGH', 'URGENT'];

export const GET = withAuth(async (request, { actor }) => {
  const { searchParams } = new URL(request.url);
  const toDept = searchParams.get('toDept');
  const fromDept = searchParams.get('fromDept');
  const status = searchParams.get('status');
  const requesterId = searchParams.get('requesterId');
  const handlerId = searchParams.get('handlerId');

  const and: Prisma.CrossDeptRequestWhereInput[] = [];

  // Visibilidade: Presidência vê tudo; demais veem o que envolve seu departamento ou a si.
  if (!isGlobal(actor)) {
    const or: Prisma.CrossDeptRequestWhereInput[] = [
      { requesterId: actor.id },
      { handlerId: actor.id },
    ];
    if (actor.departmentCode) {
      or.push({ fromDept: actor.departmentCode }, { toDept: actor.departmentCode });
    }
    and.push({ OR: or });
  }

  if (toDept && toDept !== 'ALL') and.push({ toDept: toDept.toUpperCase() });
  if (fromDept && fromDept !== 'ALL') and.push({ fromDept: fromDept.toUpperCase() });
  if (status && status !== 'ALL') and.push({ status: status.toUpperCase() });
  if (requesterId) and.push({ requesterId });
  if (handlerId) and.push({ handlerId });

  const requests = await prisma.crossDeptRequest.findMany({
    where: { AND: and },
    include: { requester: true, handler: true },
    orderBy: { createdAt: 'desc' },
  });
  return NextResponse.json(requests);
});

export const POST = withAuth(async (request, { actor }) => {
  const body = await request.json();
  const { title, description, priority = 'MEDIUM', handlerId, dueDate, linkedCardId, createTargetCard = true } = body;
  const toDept = String(body.toDept || '').toUpperCase();

  if (!title || !description || !toDept) {
    throw badRequest('Título, descrição e departamento de destino são obrigatórios.');
  }
  if (!isDepartmentCode(toDept)) throw badRequest('Departamento de destino inválido.');

  // A origem é sempre o departamento de quem solicita (Presidência = GLOBAL).
  const fromDept = isGlobal(actor) ? 'GLOBAL' : actor.departmentCode;
  if (!fromDept) throw badRequest('Você não está vinculado a um departamento.');

  const normalizedPriority = String(priority).toUpperCase();
  if (!PRIORITIES.includes(normalizedPriority)) throw badRequest('Prioridade inválida.');

  if (handlerId) {
    const handler = await prisma.user.findUnique({
      where: { id: handlerId },
      select: { status: true, globalRole: true, department: { select: { code: true } } },
    });
    if (!handler || handler.status !== 'ATIVO' || (!handler.globalRole && handler.department?.code !== toDept)) {
      throw badRequest('O responsável deve ser um membro ativo do departamento de destino.');
    }
  }

  // O card vinculado precisa ser de uma unidade que o solicitante enxerga (senão a conclusão da solicitação
  // escreveria um comentário em card alheio). Inexistente e sem acesso recebem a mesma resposta.
  if (linkedCardId) {
    const linked = await prisma.card.findUnique({
      where: { id: String(linkedCardId) },
      select: { phase: { select: { pipe: { select: { unit: { select: { code: true } } } } } } },
    });
    if (!linked || !canViewUnit(actor, linked.phase.pipe.unit.code)) {
      throw badRequest('Card vinculado inválido ou sem acesso.');
    }
  }

  let targetCardId: string | null = linkedCardId || null;

  // Automação: cria card no primeiro funil do departamento destino.
  if (createTargetCard && !targetCardId) {
    const targetPipe = await prisma.pipe.findFirst({
      where: { unit: { code: toDept } },
      include: { phases: { orderBy: { order: 'asc' } } },
      orderBy: { createdAt: 'asc' },
    });

    if (targetPipe && targetPipe.phases.length > 0) {
      const firstPhase = targetPipe.phases[0];
      const lastCard = await prisma.card.findFirst({
        where: { phaseId: firstPhase.id },
        orderBy: { order: 'desc' },
      });

      const newCard = await prisma.card.create({
        data: {
          title: `[Solicitação] ${title}`,
          description: `${description}\n\nOrigem: ${fromDept} | Solicitante: ${actor.name}`,
          phaseId: firstPhase.id,
          assigneeId: handlerId || null,
          order: lastCard ? lastCard.order + 1 : 0,
          activities: {
            create: {
              type: 'CARD_CREATED',
              description: `Card gerado automaticamente pela Central de Solicitações a partir de ${fromDept}.`,
              userId: actor.id,
              metadata: JSON.stringify({
                fromDept,
                toDept,
                priority: normalizedPriority,
                source: 'CROSS_DEPT_REQUEST',
              }),
            },
          },
        },
      });
      targetCardId = newCard.id;
    }
  }

  const created = await prisma.crossDeptRequest.create({
    data: {
      title: String(title),
      description: String(description),
      fromDept,
      toDept,
      priority: normalizedPriority,
      requesterId: actor.id,
      handlerId: handlerId || null,
      dueDate: dueDate ? new Date(dueDate) : null,
      linkedCardId: targetCardId,
      status: 'PENDING',
    },
    include: { requester: true, handler: true },
  });

  return NextResponse.json(created, { status: 201 });
});

import { NextResponse } from 'next/server';
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { withAuth, assert } from '@/lib/api';
import { canViewPendingUsers, isDepartmentManager, isGlobal } from '@/lib/permissions';
import { forViewer, toUserDTO, userHierarchyInclude } from '@/lib/users';

export const dynamic = 'force-dynamic';

/**
 * Lista usuários.
 * ?status=ATIVO (padrão) | PENDENTE | INATIVO | ALL
 *  - ATIVO: qualquer membro ativo (diretório e seletores de responsável)
 *  - PENDENTE: Presidência e Gerentes de Departamento (fila de aprovação)
 *  - INATIVO: Presidência (todos) e Gerente de Departamento (do seu departamento)
 *
 * Usuários são criados no primeiro login Google; não há cadastro manual.
 */
export const GET = withAuth(async (request, { actor }) => {
  const status = (new URL(request.url).searchParams.get('status') || 'ATIVO').toUpperCase();

  const allowed: Prisma.UserWhereInput[] = [];
  const wants = (s: string) => status === 'ALL' || status === s;

  if (wants('ATIVO')) allowed.push({ status: 'ATIVO' });
  if (wants('PENDENTE') && canViewPendingUsers(actor)) allowed.push({ status: 'PENDENTE' });
  if (wants('INATIVO')) {
    if (isGlobal(actor)) allowed.push({ status: 'INATIVO' });
    else if (isDepartmentManager(actor)) {
      allowed.push({ status: 'INATIVO', department: { code: actor.departmentCode! } });
    }
  }
  assert(allowed.length > 0, 'Você não pode listar usuários com este status.');

  const users = await prisma.user.findMany({
    where: { OR: allowed },
    include: {
      ...userHierarchyInclude,
      _count: { select: { assignedCards: true, assignedLeads: true, assignedTasks: true } },
    },
    orderBy: { name: 'asc' },
  });

  return NextResponse.json(users.map((u) => forViewer(actor, toUserDTO(u))));
});

/**
 * GET /api/tools/lead-miner/assignees — usuários que podem ser responsáveis por leads
 * (Req. 16.1, 16.2, 16.6, 18.4). Só Atribuidores (`canAssignLeads`) acessam; lista usuários
 * ATIVOS que satisfazem `canBeLeadAssignee`, ordenados por nome.
 */
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { withAuth, assert } from '@/lib/api';
import { canAssignLeads, canBeLeadAssignee } from '@/lib/permissions';
import { requireNegocios } from '@/lib/leads/route-helpers';
import { toUserDTO, userHierarchyInclude } from '@/lib/users';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = withAuth(async (_req, { actor }) => {
  requireNegocios(actor);
  assert(canAssignLeads(actor), 'Você não tem permissão para atribuir leads.');

  const users = await prisma.user.findMany({
    where: { status: 'ATIVO' },
    include: userHierarchyInclude,
  });

  const assignees = users
    .map(toUserDTO)
    .filter((u) => canBeLeadAssignee(u))
    .map((u) => ({ id: u.id, name: u.name, title: u.title }))
    .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR', { sensitivity: 'base' }));

  return NextResponse.json(assignees);
});

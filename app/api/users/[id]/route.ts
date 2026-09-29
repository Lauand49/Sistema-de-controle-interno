import { NextResponse } from 'next/server';
import type { Prisma } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { withAuth, assert, notFound } from '@/lib/api';
import { canEditProfile, canViewPendingUsers, isGlobal, progressScope } from '@/lib/permissions';
import { findUserDTO } from '@/lib/users';

type Params = { id: string };

const profileSchema = z.object({
  name: z.string().trim().min(2, 'O nome deve ter pelo menos 2 caracteres').optional(),
  avatar: z.string().url('URL de avatar inválida').optional().nullable().or(z.literal('')),
  /** Título exibido. Apenas a Presidência altera. */
  cargo: z.string().trim().max(80).optional().nullable(),
});

/**
 * Perfil + progresso individual, conforme o escopo da matriz:
 * Presidência/próprio/Gerente do depto → tudo; Gerente de Setor → só itens do(s) setor(es).
 */
export const GET = withAuth<Params>(async (_req, { params, actor }) => {
  const target = await findUserDTO(params.id);
  if (!target) throw notFound('Membro não encontrado.');
  if (target.status === 'PENDENTE') {
    assert(canViewPendingUsers(actor) || actor.id === target.id);
  }

  const scope = progressScope(actor, target);
  if (!scope) return NextResponse.json({ ...target, progressScope: null });

  const unitFilter = scope === 'ALL' ? undefined : { code: { in: scope } };

  const cardWhere: Prisma.CardWhereInput = { assigneeId: target.id };
  if (unitFilter) cardWhere.phase = { pipe: { unit: unitFilter } };
  const taskWhere: Prisma.TaskWhereInput = { assigneeId: target.id };
  if (unitFilter) taskWhere.unit = unitFilter;

  const [assignedCards, assignedTasks, assignedLeads] = await Promise.all([
    prisma.card.findMany({ where: cardWhere, include: { phase: true }, orderBy: { updatedAt: 'desc' } }),
    prisma.task.findMany({ where: taskWhere, orderBy: { updatedAt: 'desc' } }),
    scope === 'ALL'
      ? prisma.prospectLead.findMany({ where: { assignedTo: target.id }, orderBy: { updatedAt: 'desc' } })
      : Promise.resolve([]),
  ]);

  return NextResponse.json({
    ...target,
    progressScope: scope,
    assignedCards,
    assignedTasks,
    assignedLeads,
    _count: {
      assignedCards: assignedCards.length,
      assignedTasks: assignedTasks.length,
      assignedLeads: assignedLeads.length,
    },
  });
});

/** Dados básicos do perfil. Cargos e vínculos: /api/users/[id]/hierarchy e /api/units. */
export const PATCH = withAuth<Params>(async (request, { params, actor }) => {
  const data = profileSchema.parse(await request.json());
  const target = await findUserDTO(params.id);
  if (!target) throw notFound('Membro não encontrado.');
  assert(canEditProfile(actor, target), 'Você só pode editar o seu próprio perfil.');
  if (data.cargo !== undefined) {
    assert(isGlobal(actor), 'Apenas a Presidência altera o título exibido.');
  }

  await prisma.user.update({
    where: { id: params.id },
    data: {
      ...(data.name !== undefined ? { name: data.name } : {}),
      ...(data.avatar !== undefined ? { avatar: data.avatar || null } : {}),
      ...(data.cargo !== undefined ? { cargo: data.cargo || null } : {}),
    },
  });
  return NextResponse.json(await findUserDTO(params.id));
});

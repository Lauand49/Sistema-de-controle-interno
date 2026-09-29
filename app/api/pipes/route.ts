import { NextResponse } from 'next/server';
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { withAuth, assert, badRequest } from '@/lib/api';
import { canEditUnit, canViewUnit, visibleUnitCodes } from '@/lib/permissions';
import { getUnitByCode, serializePipe } from '@/lib/units';

export const dynamic = 'force-dynamic';

const pipeListInclude = {
  unit: { select: { code: true } },
  phases: {
    orderBy: { order: 'asc' },
    include: {
      fields: { orderBy: { order: 'asc' } },
      cards: {
        orderBy: { order: 'asc' },
        include: {
          assignee: true,
          values: { include: { field: true } },
          activities: { orderBy: { createdAt: 'desc' }, include: { user: true } },
        },
      },
    },
  },
} satisfies Prisma.PipeInclude;

export const GET = withAuth(async (request, { actor }) => {
  const department = new URL(request.url).searchParams.get('department')?.toUpperCase();

  const where: Prisma.PipeWhereInput = {};
  if (department && department !== 'ALL' && department !== 'GLOBAL') {
    assert(canViewUnit(actor, department), 'Você não tem acesso aos funis desta unidade.');
    where.unit = { code: department };
  } else {
    const visible = visibleUnitCodes(actor);
    if (visible) where.unit = { code: { in: visible } };
  }

  const pipes = await prisma.pipe.findMany({
    where,
    include: pipeListInclude,
    orderBy: { createdAt: 'asc' },
  });
  return NextResponse.json(pipes.map(serializePipe));
});

export const POST = withAuth(async (request, { actor }) => {
  const body = await request.json();
  const { name, description, department = 'GENTE', icon = 'Users', phases } = body;

  if (!name || typeof name !== 'string' || !name.trim()) {
    throw badRequest('Nome do funil é obrigatório.');
  }

  const unit = await getUnitByCode(department);
  assert(canEditUnit(actor, unit.code), 'Você só pode criar funis nas unidades das quais participa.');

  const defaultPhases = [
    { name: 'Entrada / Backlog', order: 0, color: '#3b82f6', isFinal: false },
    { name: 'Em Andamento', order: 1, color: '#8b5cf6', isFinal: false },
    { name: 'Revisão / Validação', order: 2, color: '#f59e0b', isFinal: false },
    { name: 'Concluído', order: 3, color: '#10b981', isFinal: true },
  ];

  const phasesToCreate =
    Array.isArray(phases) && phases.length > 0
      ? phases.map((p: any, idx: number) => ({
        name: String(p.name || `Fase ${idx + 1}`),
        order: p.order !== undefined ? Number(p.order) : idx,
        color: p.color || '#7c3aed',
        isFinal: Boolean(p.isFinal),
      }))
      : defaultPhases;

  const createdPipe = await prisma.pipe.create({
    data: {
      name: name.trim(),
      description: description ? String(description).trim() : null,
      unitId: unit.id,
      icon: icon || 'Kanban',
      phases: { create: phasesToCreate },
    },
    include: {
      unit: { select: { code: true } },
      phases: {
        orderBy: { order: 'asc' },
        include: {
          fields: { orderBy: { order: 'asc' } },
          cards: { orderBy: { order: 'asc' } },
        },
      },
    },
  });

  return NextResponse.json(serializePipe(createdPipe), { status: 201 });
});

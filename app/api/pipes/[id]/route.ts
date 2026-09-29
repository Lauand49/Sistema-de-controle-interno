import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { withAuth, assert, notFound } from '@/lib/api';
import { canViewUnit } from '@/lib/permissions';
import { serializePipe } from '@/lib/units';

export const GET = withAuth<{ id: string }>(async (_req, { params, actor }) => {
  const pipe = await prisma.pipe.findUnique({
    where: { id: params.id },
    include: {
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
    },
  });

  if (!pipe) throw notFound('Pipe não encontrado.');
  assert(canViewUnit(actor, pipe.unit.code), 'Você não tem acesso a este funil.');
  return NextResponse.json(serializePipe(pipe));
});

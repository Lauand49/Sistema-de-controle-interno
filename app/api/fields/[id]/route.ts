import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { withAuth, assert, notFound } from '@/lib/api';
import { canEditUnit } from '@/lib/permissions';

export const DELETE = withAuth<{ id: string }>(async (_req, { params, actor }) => {
  const field = await prisma.field.findUnique({
    where: { id: params.id },
    select: { phase: { select: { pipe: { select: { unit: { select: { code: true } } } } } } },
  });
  if (!field) throw notFound('Campo não encontrado.');
  assert(canEditUnit(actor, field.phase.pipe.unit.code), 'Você não participa da unidade deste funil.');

  await prisma.field.delete({ where: { id: params.id } });
  return NextResponse.json({ success: true, message: 'Campo excluído.' });
});

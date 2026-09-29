import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { updateCardSchema } from '@/lib/validations';
import { withAuth, assert, notFound } from '@/lib/api';
import { canEditUnit, canViewUnit } from '@/lib/permissions';
import { assertActiveUser } from '@/lib/units';
import { cardFullInclude, upsertCardFieldValues } from '@/lib/cards';

type Params = { id: string };

async function loadCard(id: string) {
  const card = await prisma.card.findUnique({
    where: { id },
    include: { phase: { select: { pipeId: true, pipe: { select: { unit: { select: { code: true } } } } } } },
  });
  if (!card) throw notFound('Card não encontrado.');
  return { card, unitCode: card.phase.pipe.unit.code, pipeId: card.phase.pipeId };
}

export const GET = withAuth<Params>(async (_req, { params, actor }) => {
  const { unitCode } = await loadCard(params.id);
  assert(canViewUnit(actor, unitCode));
  const card = await prisma.card.findUnique({ where: { id: params.id }, include: cardFullInclude });
  return NextResponse.json(card);
});

export const PATCH = withAuth<Params>(async (request, { params, actor }) => {
  const validated = updateCardSchema.parse(await request.json());
  const { unitCode, pipeId } = await loadCard(params.id);
  assert(canEditUnit(actor, unitCode), 'Você não participa da unidade deste funil.');
  if (validated.assigneeId) await assertActiveUser(validated.assigneeId);

  await prisma.card.update({
    where: { id: params.id },
    data: {
      ...(validated.title ? { title: validated.title } : {}),
      ...(validated.description !== undefined ? { description: validated.description } : {}),
      ...(validated.assigneeId !== undefined ? { assigneeId: validated.assigneeId } : {}),
    },
  });

  const updatedLabels = await upsertCardFieldValues(params.id, pipeId, validated.fieldValues);
  if (updatedLabels.length > 0) {
    await prisma.cardActivity.create({
      data: {
        cardId: params.id,
        userId: actor.id,
        type: 'FIELD_UPDATED',
        description: `Campos atualizados: ${updatedLabels.join(', ')}.`,
      },
    });
  }

  const card = await prisma.card.findUnique({ where: { id: params.id }, include: cardFullInclude });
  return NextResponse.json(card);
});

export const DELETE = withAuth<Params>(async (_req, { params, actor }) => {
  const { unitCode } = await loadCard(params.id);
  assert(canEditUnit(actor, unitCode), 'Você não participa da unidade deste funil.');
  await prisma.card.delete({ where: { id: params.id } });
  return NextResponse.json({ success: true, message: 'Card excluído com sucesso.' });
});

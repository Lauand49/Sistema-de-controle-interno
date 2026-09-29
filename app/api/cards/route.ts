import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { createCardSchema } from '@/lib/validations';
import { withAuth, assert } from '@/lib/api';
import { canEditUnit } from '@/lib/permissions';
import { assertActiveUser, phaseContext } from '@/lib/units';
import { cardFullInclude, upsertCardFieldValues } from '@/lib/cards';

export const POST = withAuth(async (request, { actor }) => {
  const validated = createCardSchema.parse(await request.json());

  const { phase, unitCode } = await phaseContext(validated.phaseId);
  assert(canEditUnit(actor, unitCode), 'Você não participa da unidade deste funil.');
  if (validated.assigneeId) await assertActiveUser(validated.assigneeId);

  const lastCard = await prisma.card.findFirst({
    where: { phaseId: phase.id },
    orderBy: { order: 'desc' },
  });

  const card = await prisma.card.create({
    data: {
      title: validated.title,
      description: validated.description,
      phaseId: phase.id,
      assigneeId: validated.assigneeId || null,
      order: lastCard ? lastCard.order + 1 : 0,
      activities: {
        create: {
          type: 'CARD_CREATED',
          description: `Card "${validated.title}" criado na fase ${phase.name}.`,
          userId: actor.id,
        },
      },
    },
  });

  await upsertCardFieldValues(card.id, phase.pipeId, validated.fieldValues);

  const full = await prisma.card.findUnique({ where: { id: card.id }, include: cardFullInclude });
  return NextResponse.json(full, { status: 201 });
});

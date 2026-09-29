import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { moveCardSchema, validatePhaseGate } from '@/lib/validations';
import { withAuth, assert, badRequest, notFound } from '@/lib/api';
import { canEditUnit } from '@/lib/permissions';
import { cardFullInclude, upsertCardFieldValues } from '@/lib/cards';

export const PATCH = withAuth<{ id: string }>(async (request, { params, actor }) => {
  const validated = moveCardSchema.parse(await request.json());

  const card = await prisma.card.findUnique({
    where: { id: params.id },
    include: {
      phase: {
        include: {
          fields: { orderBy: { order: 'asc' } },
          pipe: { select: { unit: { select: { code: true } } } },
        },
      },
      values: { include: { field: true } },
    },
  });
  if (!card) throw notFound('Card não encontrado.');
  assert(canEditUnit(actor, card.phase.pipe.unit.code), 'Você não participa da unidade deste funil.');

  const targetPhase = await prisma.phase.findUnique({
    where: { id: validated.targetPhaseId },
    include: { fields: { orderBy: { order: 'asc' } } },
  });
  if (!targetPhase) throw notFound('Fase destino não encontrada.');
  if (targetPhase.pipeId !== card.phase.pipeId) {
    throw badRequest('A fase destino pertence a outro funil.');
  }

  const sourcePhase = card.phase;

  // Valores atuais do card + valores enviados agora
  const currentValuesMap = new Map<string, string | null | undefined>();
  for (const valObj of card.values) {
    currentValuesMap.set(valObj.fieldId, valObj.value);
  }
  if (validated.fieldValues) {
    for (const [fId, value] of Object.entries(validated.fieldValues)) {
      if (value !== undefined && value !== null) currentValuesMap.set(fId, String(value));
    }
  }

  // PHASE GATE
  let transitionRequiredFields: typeof sourcePhase.fields = [];

  if (targetPhase.order > sourcePhase.order) {
    const isReuniaoToDiag =
      (sourcePhase.order === 0 || sourcePhase.name.toLowerCase().includes('reunião')) &&
      targetPhase.name.toLowerCase().includes('diagnóstico');

    if (isReuniaoToDiag) {
      // Reunião marcada → Diagnóstico: apenas a data da reunião
      transitionRequiredFields = sourcePhase.fields.filter(
        (f) => f.name === 'meeting_date' || f.type === 'DATE'
      );
    } else if (targetPhase.name.toLowerCase().includes('perdido')) {
      // Perdido: exige os campos de motivo da perda
      transitionRequiredFields = targetPhase.fields.filter((f) => f.required);
    } else {
      // Exige os campos obrigatórios da fase que está sendo concluída
      transitionRequiredFields = sourcePhase.fields.filter((f) => f.required);
      // Fase final (Fechado/Ganho): exige também os campos de fechamento
      if (targetPhase.isFinal) {
        transitionRequiredFields = [
          ...transitionRequiredFields,
          ...targetPhase.fields.filter((f) => f.required),
        ];
      }
    }
  }

  const { isValid, missingFields } = validatePhaseGate(transitionRequiredFields, currentValuesMap);

  if (!isValid) {
    return NextResponse.json(
      {
        error: 'PHASE_GATE_VALIDATION_FAILED',
        message: `Para avançar para a fase "${targetPhase.name}", preencha as pendências desta transição.`,
        missingFields,
        transitionRequiredFields,
        sourcePhaseName: sourcePhase.name,
        targetPhaseId: targetPhase.id,
        targetPhaseName: targetPhase.name,
        currentPhaseId: card.phaseId,
      },
      { status: 422 }
    );
  }

  await upsertCardFieldValues(card.id, card.phase.pipeId, validated.fieldValues);

  const isPhaseChanged = card.phaseId !== validated.targetPhaseId;

  await prisma.card.update({
    where: { id: params.id },
    data: {
      phaseId: validated.targetPhaseId,
      order: validated.newOrder !== undefined ? validated.newOrder : card.order,
    },
  });

  if (isPhaseChanged) {
    await prisma.cardActivity.create({
      data: {
        cardId: card.id,
        userId: actor.id,
        type: 'PHASE_CHANGE',
        description: `Card movido de "${sourcePhase.name}" para "${targetPhase.name}".`,
        metadata: JSON.stringify({
          fromPhaseId: card.phaseId,
          fromPhaseName: sourcePhase.name,
          toPhaseId: targetPhase.id,
          toPhaseName: targetPhase.name,
        }),
      },
    });
  }

  const full = await prisma.card.findUnique({ where: { id: card.id }, include: cardFullInclude });
  return NextResponse.json(full);
});

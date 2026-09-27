import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { moveCardSchema, validatePhaseGate } from '@/lib/validations';

export async function PATCH(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const body = await request.json();
    const validated = moveCardSchema.parse(body);

    const card = await prisma.card.findUnique({
      where: { id: params.id },
      include: {
        phase: {
          include: {
            fields: { orderBy: { order: 'asc' } },
          },
        },
        values: {
          include: { field: true },
        },
      },
    });

    if (!card) {
      return NextResponse.json({ error: 'Card não encontrado.' }, { status: 404 });
    }

    const targetPhase = await prisma.phase.findUnique({
      where: { id: validated.targetPhaseId },
      include: {
        fields: {
          orderBy: { order: 'asc' },
        },
      },
    });

    if (!targetPhase) {
      return NextResponse.json({ error: 'Fase destino não encontrada.' }, { status: 404 });
    }

    const sourcePhase = card.phase;

    // Map existing card field values
    const currentValuesMap = new Map<string, string | null | undefined>();
    for (const valObj of card.values) {
      currentValuesMap.set(valObj.fieldId, valObj.value);
    }

    // Merge with any incoming fieldValues payload
    if (validated.fieldValues) {
      for (const [fId, value] of Object.entries(validated.fieldValues)) {
        if (value !== undefined && value !== null) {
          currentValuesMap.set(fId, String(value));
        }
      }
    }

    // PHASE GATE TRANSITION VALIDATION
    let transitionRequiredFields: typeof sourcePhase.fields = [];

    if (targetPhase.order > sourcePhase.order) {
      const isReuniaoToDiag =
        (sourcePhase.order === 0 || sourcePhase.name.toLowerCase().includes('reunião')) &&
        targetPhase.name.toLowerCase().includes('diagnóstico');

      if (isReuniaoToDiag) {
        // Regra do usuário: "para passar de reuniao marcada para diagnostico, somente a data da reunião diagnotica deve aparecer"
        transitionRequiredFields = sourcePhase.fields.filter(
          (f) => f.name === 'meeting_date' || f.type === 'DATE'
        );
      } else if (targetPhase.name.toLowerCase().includes('perdido')) {
        // Transição para perdido: exige os campos de motivo da perda
        transitionRequiredFields = targetPhase.fields.filter((f) => f.required);
      } else {
        // Regra do usuário: "para passar de diagnostico para proposta deve preencher coisas sobre o diagnostico"
        // Exige os campos da fase que está sendo concluída
        transitionRequiredFields = sourcePhase.fields.filter((f) => f.required);

        // Se a fase destino for final (ex: Fechado/Ganho), exige também os campos de fechamento
        if (targetPhase.isFinal) {
          transitionRequiredFields = [
            ...transitionRequiredFields,
            ...targetPhase.fields.filter((f) => f.required),
          ];
        }
      }
    }

    const { isValid, missingFields } = validatePhaseGate(
      transitionRequiredFields,
      currentValuesMap
    );

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

    // Save any newly provided field values
    if (validated.fieldValues && Object.keys(validated.fieldValues).length > 0) {
      for (const [fieldId, val] of Object.entries(validated.fieldValues)) {
        if (val !== undefined && val !== null) {
          await prisma.cardFieldValue.upsert({
            where: {
              cardId_fieldId: {
                cardId: card.id,
                fieldId,
              },
            },
            create: {
              cardId: card.id,
              fieldId,
              value: String(val),
            },
            update: {
              value: String(val),
            },
          });
        }
      }
    }

    const sourcePhaseName = card.phase.name;
    const isPhaseChanged = card.phaseId !== validated.targetPhaseId;

    // Update Card phase and order
    const updatedCard = await prisma.card.update({
      where: { id: params.id },
      data: {
        phaseId: validated.targetPhaseId,
        order: validated.newOrder !== undefined ? validated.newOrder : card.order,
      },
    });

    // Record CardActivity audit entry if phase changed
    if (isPhaseChanged) {
      await prisma.cardActivity.create({
        data: {
          cardId: card.id,
          userId: validated.userId || null,
          type: 'PHASE_CHANGE',
          description: `Card movido de "${sourcePhaseName}" para "${targetPhase.name}".`,
          metadata: JSON.stringify({
            fromPhaseId: card.phaseId,
            fromPhaseName: sourcePhaseName,
            toPhaseId: targetPhase.id,
            toPhaseName: targetPhase.name,
          }),
        },
      });
    }

    const fullUpdatedCard = await prisma.card.findUnique({
      where: { id: card.id },
      include: {
        phase: {
          include: { fields: { orderBy: { order: 'asc' } } },
        },
        assignee: true,
        values: { include: { field: true } },
        activities: {
          orderBy: { createdAt: 'desc' },
          include: { user: true },
        },
      },
    });

    return NextResponse.json(fullUpdatedCard);
  } catch (error: any) {
    if (error.name === 'ZodError') {
      return NextResponse.json(
        { error: 'Dados inválidos para transição.', details: error.errors },
        { status: 400 }
      );
    }
    console.error('Error moving card:', error);
    return NextResponse.json({ error: 'Erro ao movimentar o card.' }, { status: 500 });
  }
}

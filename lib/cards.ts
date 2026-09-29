import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { badRequest } from '@/lib/api';

export const cardFullInclude = {
  phase: { include: { fields: { orderBy: { order: 'asc' } } } },
  assignee: true,
  values: { include: { field: true } },
  activities: { orderBy: { createdAt: 'desc' }, include: { user: true } },
} satisfies Prisma.CardInclude;

/**
 * Grava valores de campos de um card, garantindo que cada campo pertence ao mesmo funil
 * do card (impede escrever em campos de outros funis/unidades).
 * Retorna os rótulos dos campos atualizados.
 */
export async function upsertCardFieldValues(
  cardId: string,
  pipeId: string,
  fieldValues: Record<string, unknown> | undefined
): Promise<string[]> {
  if (!fieldValues) return [];
  const entries = Object.entries(fieldValues).filter(([, v]) => v !== undefined && v !== null);
  if (entries.length === 0) return [];

  const fields = await prisma.field.findMany({
    where: { id: { in: entries.map(([id]) => id) }, phase: { pipeId } },
    select: { id: true, label: true },
  });
  const allowed = new Map(fields.map((f) => [f.id, f.label]));
  if (allowed.size !== entries.length) {
    throw badRequest('Um ou mais campos não pertencem a este funil.');
  }

  for (const [fieldId, val] of entries) {
    await prisma.cardFieldValue.upsert({
      where: { cardId_fieldId: { cardId, fieldId } },
      create: { cardId, fieldId, value: String(val) },
      update: { value: String(val) },
    });
  }
  return entries.map(([id]) => allowed.get(id)!);
}

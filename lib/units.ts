/**
 * Helpers de servidor para unidades (departamentos e setores) e para descobrir
 * a qual unidade pertence um funil, fase ou card.
 */
import { prisma } from '@/lib/prisma';
import { badRequest, notFound } from '@/lib/api';
import { isUnitCode, type UnitCode } from '@/lib/permissions';

export async function getUnitByCode(code: string | null | undefined) {
  const normalized = String(code || '').toUpperCase();
  if (!isUnitCode(normalized)) throw badRequest(`Unidade inválida: ${code}`);
  const unit = await prisma.unit.findUnique({ where: { code: normalized } });
  if (!unit) throw notFound('Unidade não encontrada.');
  return unit;
}

/** Unidade (código) dona do funil ao qual a fase pertence. */
export async function phaseContext(phaseId: string) {
  const phase = await prisma.phase.findUnique({
    where: { id: phaseId },
    include: { pipe: { include: { unit: { select: { code: true } } } } },
  });
  if (!phase) throw notFound('Fase não encontrada.');
  return { phase, unitCode: phase.pipe.unit.code as UnitCode };
}

/** Unidade (código) dona do card. */
export async function cardUnitCode(cardId: string): Promise<UnitCode> {
  const card = await prisma.card.findUnique({
    where: { id: cardId },
    select: { phase: { select: { pipe: { select: { unit: { select: { code: true } } } } } } },
  });
  if (!card) throw notFound('Card não encontrado.');
  return card.phase.pipe.unit.code as UnitCode;
}

/**
 * Funil principal de vendas de Negócios (destino da conversão de leads e da precificação).
 * Preferência: nome contendo "Vendas"; senão o primeiro funil de Negócios.
 */
export async function findSalesPipe() {
  const include = {
    phases: { orderBy: { order: 'asc' as const }, include: { fields: true } },
  };
  const byName = await prisma.pipe.findFirst({
    where: { unit: { code: 'NEGOCIOS' }, name: { contains: 'Vendas', mode: 'insensitive' } },
    include,
    orderBy: { createdAt: 'asc' },
  });
  if (byName) return byName;
  return prisma.pipe.findFirst({
    where: { unit: { code: 'NEGOCIOS' } },
    include,
    orderBy: { createdAt: 'asc' },
  });
}

/** Adiciona `department` (código da unidade) ao funil, como a interface espera. */
export function serializePipe<T extends { unit: { code: string } }>(pipe: T) {
  const { unit, ...rest } = pipe;
  return { ...rest, department: unit.code };
}

/** Adiciona `department` (código da unidade ou 'GLOBAL') à tarefa. */
export function serializeTask<T extends { unit: { code: string } | null }>(task: T) {
  const { unit, ...rest } = task;
  return { ...rest, department: unit?.code ?? 'GLOBAL' };
}

/** Garante que o usuário existe e está ATIVO (para atribuições). */
export async function assertActiveUser(userId: string, message = 'Responsável inválido ou inativo.') {
  const u = await prisma.user.findUnique({ where: { id: userId }, select: { status: true } });
  if (!u || u.status !== 'ATIVO') throw badRequest(message);
}

/** Regras de servidor compartilhadas pelas rotas de leads. */
import { assert, badRequest } from '@/lib/api';
import type { User as Actor } from '@/types';
import { canBeLeadAssignee, canChangeLeadAssignee } from '@/lib/permissions';
import { findUserDTO } from '@/lib/users';

export const LEAD_STATUSES = ['RAW', 'PENDING', 'IN_PROGRESS', 'CONVERTED_TO_PIPE', 'DISCARDED'] as const;

export function parseLeadStatus(value: unknown): string {
  const s = String(value || '').toUpperCase();
  if (!(LEAD_STATUSES as readonly string[]).includes(s)) throw badRequest('Status de lead inválido.');
  return s;
}

/** Valida troca de responsável: regra de quem pode atribuir + elegibilidade do novo responsável. */
export async function assertLeadAssigneeChange(
  actor: Actor,
  current: string | null,
  next: string | null
) {
  assert(
    canChangeLeadAssignee(actor, current, next),
    'Você só pode assumir leads sem responsável ou liberar os seus.'
  );
  if (next && next !== current) {
    const target = await findUserDTO(next);
    if (!canBeLeadAssignee(target)) {
      throw badRequest('Leads só podem ser atribuídos a membros ativos de Negócios ou à Presidência.');
    }
  }
}

/**
 * Regras puras e isomórficas do cancelamento de mineração (T1): quem pode parar, quais status
 * admitem parada e o texto "Cancelada (N de M processados)". Sem Prisma, sem React, sem rede.
 *
 * A permissão COMPÕE helpers já existentes de `lib/permissions.ts` (a fonte única das
 * permissões); nada novo foi acrescentado lá:
 *  - quem iniciou a mineração;
 *  - gerência de Negócios e Presidência/Vice (`canAssignLeads`).
 */
import { canAssignLeads, canUseNegociosTools, type Person } from '@/lib/permissions';

/** Status em que a mineração ainda pode ser parada (descoberta ou análise em curso). */
export const CANCELLABLE_STATUSES = ['PENDENTE', 'EM_ANDAMENTO'] as const;

export function isCancellableStatus(status: string): boolean {
  return (CANCELLABLE_STATUSES as readonly string[]).includes(status);
}

export const MSG_CANCEL = {
  semPermissao: 'Você não tem permissão para parar esta mineração.',
  jaTerminou: 'A mineração já terminou e não pode ser cancelada.',
  confirmarTitulo: 'Parar esta mineração?',
  confirmarTexto:
    'As empresas já encontradas e analisadas continuam salvas. As que ainda não foram analisadas ficam sem análise.',
  sucesso: 'Mineração cancelada',
  erro: 'Não foi possível parar a mineração',
} as const;

/**
 * Quem pode parar uma mineração: quem a iniciou, a gerência de Negócios e a Presidência/Vice.
 * Sempre exige acesso às ferramentas de Negócios (mesmo portão das demais rotas do minerador).
 */
export function canCancelRun(actor: Person | null | undefined, run: { createdById: string }): boolean {
  if (!actor || !canUseNegociosTools(actor)) return false;
  return run.createdById === actor.id || canAssignLeads(actor);
}

/** "Cancelada (N de M processados)" (T1). */
export function cancelledLabel(run: { processados: number; total: number }): string {
  return `Cancelada (${run.processados} de ${run.total} processados)`;
}

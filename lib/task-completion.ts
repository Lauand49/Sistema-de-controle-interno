/**
 * Data_Conclusao (`Task.completedAt`) — função pura usada pela API_Tarefas.
 * Req. 3.8, 3.9.
 */

const DONE = 'DONE';

/**
 * Valor a gravar em completedAt.
 * - criação (prev = null): DONE → now; outro → null
 * - edição: entra em DONE vindo de outro status → now; sai de DONE → null;
 *   status ausente ou igual ao anterior → undefined (não altera)
 */
export function completedAtUpdate(
  prev: string | null,
  next: string | undefined,
  now: Date
): Date | null | undefined {
  if (prev === null) return next === DONE ? now : null;
  if (next === undefined || next === prev) return undefined;
  if (next === DONE) return now;
  if (prev === DONE) return null;
  return undefined;
}

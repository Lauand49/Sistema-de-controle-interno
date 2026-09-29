/** Chamadas da tela de gestão de pessoas. Lança Error com a mensagem do servidor. */

export class TeamApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public data: any
  ) {
    super(message);
  }
}

async function call<T = any>(url: string, method: string, body?: unknown): Promise<T> {
  const res = await fetch(url, {
    method,
    headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new TeamApiError(res.status, data.error || 'Erro ao processar a solicitação.', data);
  return data as T;
}

export type HierarchyAction =
  | { action: 'APPROVE'; departmentCode: string }
  | { action: 'SET_DEPARTMENT'; departmentCode: string }
  | { action: 'SET_VICE' }
  | { action: 'REMOVE_VICE'; departmentCode: string }
  | { action: 'DEACTIVATE' }
  | { action: 'REACTIVATE'; departmentCode?: string };

export const teamApi = {
  hierarchy: (userId: string, input: HierarchyAction) =>
    call<{ user: any; pendingWork?: { cards: number; tasks: number; leads: number } }>(
      `/api/users/${userId}/hierarchy`,
      'POST',
      input
    ),
  addSectorMember: (code: string, userId: string) => call(`/api/units/${code}/members`, 'POST', { userId }),
  removeSectorMember: (code: string, userId: string) => call(`/api/units/${code}/members/${userId}`, 'DELETE'),
  setManager: (code: string, userId: string, confirmReplace = false) =>
    call(`/api/units/${code}/manager`, 'PUT', { userId, confirmReplace }),
  removeManager: (code: string) => call(`/api/units/${code}/manager`, 'DELETE'),
};

/**
 * Nomeia gerente pedindo confirmação se já houver um (o servidor responde 409).
 * Retorna false se o usuário cancelar.
 */
export async function setManagerWithConfirm(code: string, userId: string): Promise<boolean> {
  try {
    await teamApi.setManager(code, userId);
    return true;
  } catch (err) {
    if (err instanceof TeamApiError && err.status === 409 && err.data?.requiresConfirmation) {
      const name = err.data.currentManager?.name || 'o gerente atual';
      if (!window.confirm(`${name} será rebaixado(a). Confirmar a substituição?`)) return false;
      await teamApi.setManager(code, userId, true);
      return true;
    }
    throw err;
  }
}

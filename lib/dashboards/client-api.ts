/**
 * Cliente da API_Paineis para as telas (isomórfico: sem imports de Node, Prisma ou `server-only`).
 *
 * A API é a decisão final de permissão; aqui só montamos URLs e tipamos as respostas.
 */
import type { HubDTO, MemberDashboardDTO, UnitDashboardDTO } from './types';
import type { Periodo } from './period';

export const dashboardUrls = {
  hub: (): string => '/api/dashboards',
  unit: (code: string, periodo: Periodo): string =>
    `/api/dashboards/units/${encodeURIComponent(code)}?periodo=${encodeURIComponent(periodo)}`,
  member: (userId: string, periodo: Periodo): string =>
    `/api/dashboards/members/${encodeURIComponent(userId)}?periodo=${encodeURIComponent(periodo)}`,
};

/** Rotas das telas (links internos). */
export const dashboardPages = {
  hub: '/paineis',
  unit: (code: string): string => `/paineis/unidades/${encodeURIComponent(code)}`,
  member: (userId: string): string => `/paineis/membros/${encodeURIComponent(userId)}`,
};

/** Resultado de uma leitura: dados, acesso negado (403), inexistente (404) ou outro erro. */
export type DashboardFetchResult<T> =
  | { kind: 'ok'; data: T }
  | { kind: 'denied' }
  | { kind: 'notFound' }
  | { kind: 'error'; status: number; message: string };

export const DEFAULT_ERROR_MESSAGE = 'Não foi possível carregar o painel.';

/**
 * GET sem cache. Erros de rede viram `kind: 'error'` (status 0); o cancelamento
 * (`AbortError`) é relançado para o chamador ignorar.
 */
export async function fetchDashboard<T>(url: string, signal?: AbortSignal): Promise<DashboardFetchResult<T>> {
  let res: Response;
  try {
    res = await fetch(url, { cache: 'no-store', signal });
  } catch (err) {
    if (isAbortError(err)) throw err;
    return { kind: 'error', status: 0, message: 'Falha de conexão ao carregar o painel.' };
  }
  if (res.status === 403) return { kind: 'denied' };
  if (res.status === 404) return { kind: 'notFound' };
  const body: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    const serverMessage =
      body && typeof body === 'object' && typeof (body as { error?: unknown }).error === 'string'
        ? (body as { error: string }).error
        : '';
    return { kind: 'error', status: res.status, message: serverMessage || DEFAULT_ERROR_MESSAGE };
  }
  if (body === null) return { kind: 'error', status: res.status, message: DEFAULT_ERROR_MESSAGE };
  return { kind: 'ok', data: body as T };
}

export function isAbortError(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    'name' in err &&
    (err as { name?: unknown }).name === 'AbortError'
  );
}

export const dashboardApi = {
  hub: (signal?: AbortSignal) => fetchDashboard<HubDTO>(dashboardUrls.hub(), signal),
  unit: (code: string, periodo: Periodo, signal?: AbortSignal) =>
    fetchDashboard<UnitDashboardDTO>(dashboardUrls.unit(code, periodo), signal),
  member: (userId: string, periodo: Periodo, signal?: AbortSignal) =>
    fetchDashboard<MemberDashboardDTO>(dashboardUrls.member(userId, periodo), signal),
};

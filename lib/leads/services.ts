/**
 * Estado dos Servicos_Externos para a Tela_Minerar e para `createRun` (Req. 2.1, 2.2, 2.6, 2.7).
 *
 * - `serviceState`: puro — disponível = chave (quando exigida) e uso do mês < limite.
 * - `serviceStatus`: lê o uso do mês via `UsageGate.count` (só exibição, Req. 19.3).
 *
 * Nenhuma chave passa por este módulo: `deps.ts` informa apenas se cada uma existe.
 */
import type { ExternalProvider } from './types';
import { monthKey, type UsageGate } from './usage';

export interface ServiceState {
  available: boolean;
  motivo: 'SEM_CHAVE' | 'COTA_ESGOTADA' | null;
  usados: number;
  limite: number;
}

export interface ServicesStatus {
  places: ServiceState;
  /** `semChave`: PageSpeed funciona sem chave, com cota reduzida do Google (Req. 2.7). */
  pagespeed: ServiceState & { semChave: boolean };
  gemini: ServiceState;
}

/** Disponível = chave (quando exigida) e count(mês) < limite. Falta de chave tem precedência. Puro. */
export function serviceState(input: {
  requiresKey: boolean;
  hasKey: boolean;
  count: number;
  limit: number;
}): ServiceState {
  const usados = Number.isFinite(input.count) && input.count > 0 ? Math.floor(input.count) : 0;
  const limite = Number.isFinite(input.limit) && input.limit > 0 ? Math.floor(input.limit) : 0;
  let motivo: ServiceState['motivo'] = null;
  if (input.requiresKey && !input.hasKey) motivo = 'SEM_CHAVE';
  else if (usados >= limite) motivo = 'COTA_ESGOTADA';
  return { available: motivo === null, motivo, usados, limite };
}

export interface ServiceStatusDeps {
  usage: UsageGate;
  now: () => Date;
  keys: { places: boolean; pagespeed: boolean; gemini: boolean };
  limits: Record<ExternalProvider, number>;
}

/** Estado de Places, PageSpeed e Gemini no mês corrente. */
export async function serviceStatus(deps: ServiceStatusDeps): Promise<ServicesStatus> {
  const month = monthKey(deps.now());
  const [places, pagespeed, gemini] = await Promise.all([
    deps.usage.count('places', month),
    deps.usage.count('pagespeed', month),
    deps.usage.count('gemini', month),
  ]);
  return {
    places: serviceState({ requiresKey: true, hasKey: deps.keys.places, count: places, limit: deps.limits.places }),
    pagespeed: {
      ...serviceState({ requiresKey: false, hasKey: deps.keys.pagespeed, count: pagespeed, limit: deps.limits.pagespeed }),
      semChave: !deps.keys.pagespeed,
    },
    gemini: serviceState({ requiresKey: true, hasKey: deps.keys.gemini, count: gemini, limit: deps.limits.gemini }),
  };
}

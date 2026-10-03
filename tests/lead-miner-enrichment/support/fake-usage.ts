/**
 * `UsageGate` em memória com o contrato da Etapa 3 (design: `usage.ts`, Req. 2.4, 2.5, 19.3):
 * `reserve` incrementa só se `count < limite` (limite < 1 → recusa, como o `prismaUsageGate`)
 * e `count` devolve as chamadas reservadas no mês (0 sem linha).
 */
import type { UsageGate, UsageProvider } from '@/lib/leads/usage';

/** Aliases mantidos para os testes que já os importam. */
export type EnrichmentUsageProvider = UsageProvider;
export type EnrichmentUsageGate = UsageGate;

export interface ReserveCall {
  provider: EnrichmentUsageProvider;
  month: string;
  limit: number;
  granted: boolean;
}

export interface MemoryUsageGate extends EnrichmentUsageGate {
  /** Contagem por chave `provider:month`. */
  counts: Map<string, number>;
  /** Todas as chamadas a `reserve`, na ordem (inclusive as recusadas). */
  reserveCalls: ReserveCall[];
  /** Leitura síncrona para asserções. */
  peek(provider: EnrichmentUsageProvider, month: string): number;
}

export type UsageCounts = Partial<Record<`${EnrichmentUsageProvider}:${string}`, number>>;

/**
 * @param initial contagens iniciais, ex.: `{ 'places:2025-05': 999 }`.
 * @param log     recebe `reserve:<provider>:ok` / `reserve:<provider>:negada`, para verificar
 *                a ordem "reserva → envia" junto com os logs dos clientes falsos.
 */
export function memoryUsageGate(initial: UsageCounts = {}, log: string[] = []): MemoryUsageGate {
  const counts = new Map<string, number>(
    Object.entries(initial).filter((e): e is [string, number] => typeof e[1] === 'number'),
  );
  const reserveCalls: ReserveCall[] = [];
  const key = (provider: EnrichmentUsageProvider, month: string) => `${provider}:${month}`;
  return {
    counts,
    reserveCalls,
    peek: (provider, month) => counts.get(key(provider, month)) ?? 0,
    async count(provider, month) {
      return counts.get(key(provider, month)) ?? 0;
    },
    async reserve(provider, month, limit) {
      const current = counts.get(key(provider, month)) ?? 0;
      const granted = Number.isFinite(limit) && limit >= 1 && current < Math.floor(limit);
      if (granted) counts.set(key(provider, month), current + 1);
      reserveCalls.push({ provider, month, limit, granted });
      log.push(`reserve:${provider}:${granted ? 'ok' : 'negada'}`);
      return granted;
    },
  };
}

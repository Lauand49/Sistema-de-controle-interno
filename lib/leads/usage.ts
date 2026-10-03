/**
 * Contador mensal de uso de APIs externas do Minerador de Leads (Req. 7.4, 7.6).
 *
 * - `monthKey`: chave "AAAA-MM" do mês corrente no fuso do servidor.
 * - `UsageGate`: contrato de reserva de cota; `ai.ts` reutiliza esta interface.
 * - `prismaUsageGate`: reserva atômica em uma única instrução SQL sobre a tabela "ApiUsage";
 *   `count` lê o contador do mês (só exibição, Req. 19.3).
 */
import type { PrismaClient } from '@prisma/client';

/** Provedores com cota mensal controlada (Req. 2.4). */
export type UsageProvider = 'gemini' | 'places' | 'pagespeed';

export interface UsageGate {
  /** Reserva 1 chamada no mês se count < limite. Retorna false sem incrementar se esgotado. */
  reserve(provider: UsageProvider, month: string, limit: number): Promise<boolean>;
  /** Chamadas reservadas no mês (0 se não há linha). Usado só para exibição (Req. 19.3). */
  count(provider: UsageProvider, month: string): Promise<number>;
}

/** "AAAA-MM" no fuso local do servidor. */
export function monthKey(d: Date): string {
  const year = String(d.getFullYear()).padStart(4, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}

/**
 * Gate baseado em Postgres. O `INSERT … ON CONFLICT … WHERE count < limite` incrementa
 * atomicamente; nenhuma linha retornada significa cota esgotada. A consulta é
 * parametrizada via template tag do `$queryRaw`.
 */
export function prismaUsageGate(db: Pick<PrismaClient, '$queryRaw'>): UsageGate {
  return {
    async reserve(provider, month, limit) {
      // Com limite < 1 a inserção inicial ultrapassaria a cota: trata como esgotada.
      if (!Number.isFinite(limit) || limit < 1) return false;
      const max = Math.floor(limit);
      const rows = await db.$queryRaw<Array<{ count: number }>>`
        INSERT INTO "ApiUsage" (id, provider, month, count)
        VALUES (gen_random_uuid()::text, ${provider}, ${month}, 1)
        ON CONFLICT (provider, month) DO UPDATE SET count = "ApiUsage".count + 1
          WHERE "ApiUsage".count < ${max}
        RETURNING count`;
      return rows.length > 0;
    },
    async count(provider, month) {
      const rows = await db.$queryRaw<Array<{ count: number }>>`
        SELECT count FROM "ApiUsage" WHERE provider = ${provider} AND month = ${month} LIMIT 1`;
      return rows.length > 0 ? Number(rows[0].count) : 0;
    },
  };
}

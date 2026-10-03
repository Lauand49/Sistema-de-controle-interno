/**
 * Prisma falso em memória só com a superfície usada por `lib/leads/google-cache.ts`:
 * `googlePlaceCache.upsert|deleteMany`, `company.findUnique|findMany|update`,
 * `$queryRaw` (DELETE … RETURNING "companyId" da purga) e `$transaction(fn)`.
 *
 * `$transaction` tira um instantâneo e o restaura se `fn` lançar, para que a atomicidade
 * possa ser observada. O cliente de transação não expõe `$transaction` (como o Prisma).
 */
import type { Db } from '@/lib/leads/google-cache';

export interface FakeCompany {
  id: string;
  nome: string;
  cnpjNomeFantasia: string | null;
  nomeExibicao: string;
  googlePlaceId: string | null;
}

export type FakeCacheRow = Record<string, unknown> & { companyId: string; nome: string; expiraEm: Date };

export interface FakePrismaCache {
  db: Db;
  companies: Map<string, FakeCompany>;
  caches: Map<string, FakeCacheRow>;
  /** Nº de transações abertas pelo cliente raiz. */
  txCount: () => number;
  /** SQL bruto recebido por `$queryRaw` (fragmentos unidos por `?`) e seus valores. */
  rawCalls: Array<{ sql: string; values: unknown[] }>;
}

const clone = <T>(m: Map<string, T>): Map<string, T> =>
  new Map([...m].map(([k, v]) => [k, { ...v }]));

export function fakePrismaCache(
  companies: FakeCompany[] = [],
  caches: FakeCacheRow[] = [],
): FakePrismaCache {
  let companyMap = new Map(companies.map((c) => [c.id, { ...c }]));
  let cacheMap = new Map(caches.map((c) => [c.companyId, { ...c }]));
  let txs = 0;
  const rawCalls: FakePrismaCache['rawCalls'] = [];

  const withCache = (c: FakeCompany) => {
    const cache = cacheMap.get(c.id);
    return { ...c, googleCache: cache ? { ...cache } : null };
  };

  const tx = {
    googlePlaceCache: {
      async upsert(args: {
        where: { companyId: string };
        create: FakeCacheRow;
        update: Record<string, unknown>;
      }) {
        const id = args.where.companyId;
        const prev = cacheMap.get(id);
        const row = (prev ? { ...prev, ...args.update } : { ...args.create }) as FakeCacheRow;
        cacheMap.set(id, row);
        return { ...row };
      },
      async deleteMany(args: { where: { companyId: string } }) {
        const had = cacheMap.delete(args.where.companyId);
        return { count: had ? 1 : 0 };
      },
    },
    company: {
      async findUnique(args: { where: { id: string } }) {
        const c = companyMap.get(args.where.id);
        return c ? withCache(c) : null;
      },
      async findMany(args: { where: { id: { in: string[] } } }) {
        const ids = new Set(args.where.id.in);
        return [...companyMap.values()].filter((c) => ids.has(c.id)).map(withCache);
      },
      async update(args: { where: { id: string }; data: Partial<FakeCompany> }) {
        const c = companyMap.get(args.where.id);
        if (!c) throw new Error(`company ${args.where.id} não existe`);
        Object.assign(c, args.data);
        return { ...c };
      },
    },
    async $queryRaw(strings: TemplateStringsArray, ...values: unknown[]) {
      const sql = strings.join('?').replace(/\s+/g, ' ').trim();
      rawCalls.push({ sql, values });
      if (!/^DELETE FROM "GooglePlaceCache" WHERE "expiraEm" <= \? RETURNING "companyId"$/.test(sql)) {
        throw new Error(`SQL não suportado pelo fake: ${sql}`);
      }
      const now = values[0] as Date;
      const out: Array<{ companyId: string }> = [];
      for (const [id, row] of [...cacheMap]) {
        if (row.expiraEm.getTime() <= now.getTime()) {
          cacheMap.delete(id);
          out.push({ companyId: id });
        }
      }
      return out;
    },
  };

  const root = {
    ...tx,
    async $transaction<T>(fn: (t: typeof tx) => Promise<T>): Promise<T> {
      txs++;
      const snapC = clone(companyMap);
      const snapG = clone(cacheMap);
      try {
        return await fn(tx);
      } catch (e) {
        companyMap = snapC;
        cacheMap = snapG;
        throw e;
      }
    },
  };

  return {
    db: root as unknown as Db,
    get companies() {
      return companyMap;
    },
    get caches() {
      return cacheMap;
    },
    txCount: () => txs,
    rawCalls,
  };
}

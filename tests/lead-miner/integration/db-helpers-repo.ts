/**
 * Helpers dos testes de integração do repositório/pipeline (Postgres real, sem rede externa).
 *
 * - Só são usados com `RUN_DB_TESTS=1`; o banco vem de `DATABASE_URL_TEST` (ou `DATABASE_URL`).
 * - Toda linha criada usa um prefixo único (`prefix`) para permitir a limpeza sem afetar dados reais.
 * - OSM, site e IA são falsos: nenhuma chamada sai da máquina. O Prisma usa o engine nativo
 *   (biblioteca Rust), que não passa pelo `net.Socket` bloqueado em `tests/setup/no-network.ts`.
 */
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { PrismaClient } from '@prisma/client';
import { NICHES } from '@/lib/leads/config';
import type { PipelineDeps } from '@/lib/leads/pipeline';
import { OVERPASS_URL, type OverpassElement } from '@/lib/leads/sources/osm';

export const RUN_DB_TESTS = process.env.RUN_DB_TESTS === '1';
const ROOT = path.resolve(__dirname, '../../..');

/** URL do banco de teste; carrega `.env` se nada estiver no ambiente. */
export function testDatabaseUrl(): string {
  if (!process.env.DATABASE_URL_TEST && !process.env.DATABASE_URL) {
    try {
      process.loadEnvFile(path.join(ROOT, '.env'));
    } catch {
      /* sem .env */
    }
  }
  const url = process.env.DATABASE_URL_TEST ?? process.env.DATABASE_URL;
  if (!url) throw new Error('Defina DATABASE_URL_TEST (ou DATABASE_URL) para os testes de integração');
  return url;
}

/** Aplica as migrações pendentes (idempotente) no banco de teste. */
export function migrateDeploy(url: string): void {
  execFileSync('npx', ['prisma', 'migrate', 'deploy'], {
    cwd: ROOT,
    env: { ...process.env, DATABASE_URL: url },
    stdio: 'pipe',
  });
}

export function newPrisma(url: string): PrismaClient {
  return new PrismaClient({ datasources: { db: { url } } });
}

/** Prefixo único por arquivo de teste (nomes, e-mails, bairros). */
export function uniquePrefix(tag: string): string {
  return `LMINT${tag}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

let osmCounter = 0;
const OSM_BASE = Date.now() * 1000;
/** osmId numérico único (evita colidir com dados reais e entre execuções). */
export function nextOsmNumber(): number {
  return OSM_BASE + ++osmCounter;
}

/** Elementos Overpass com nomes únicos `${prefix} ${label} ${i}` e sem site (sem rede no Analisador). */
export function elements(prefix: string, label: string, n: number): OverpassElement[] {
  return Array.from({ length: n }, (_, i) => ({
    type: 'node' as const,
    id: nextOsmNumber(),
    tags: { name: `${prefix} ${label} ${i}` },
  }));
}

/** Resposta do Overpass por nicho: lista de elementos ou `Error` (nicho falho). */
export type NicheScript = Record<string, OverpassElement[] | Error>;

function nicheFromOverpassBody(body: string | undefined): string | null {
  const query = new URLSearchParams(body ?? '').get('data') ?? '';
  for (const n of NICHES) {
    const t = n.tags[0];
    if (t && query.includes(`["${t.key}"="${t.value}"]`)) return n.id;
  }
  return null;
}

const failing = (what: string) => () => {
  throw new Error(`${what} não deveria ser chamado no teste de integração`);
};

/** `PipelineDeps` com o Prisma real e OSM/site/IA falsos. */
export function makeDeps(db: PrismaClient, script: NicheScript): PipelineDeps {
  return {
    db,
    osm: {
      http: {
        async getJson(url, init) {
          if (url.startsWith(OVERPASS_URL)) {
            const nicheId = nicheFromOverpassBody(init.body);
            const answer = nicheId ? script[nicheId] : undefined;
            if (answer === undefined || answer instanceof Error) throw answer ?? new Error('nicho sem roteiro');
            return { elements: answer };
          }
          // Nominatim: uma relation qualquer (a área só é repassada ao Overpass falso).
          return [{ osm_type: 'relation', osm_id: 1, boundingbox: ['0', '1', '0', '1'] }];
        },
      },
      limiter: { schedule: (fn) => fn() },
      sleep: async () => undefined,
    },
    site: {
      resolver: { resolveAll: failing('resolver') as never },
      transport: { request: failing('transport') as never },
      now: () => 0,
    },
    ai: { client: null, usage: { reserve: failing('usage') as never, count: failing('usage') as never }, limit: 0, now: () => new Date(0) },
    // Serviços da Etapa 3 (ainda sem uso no pipeline da Etapa 1).
    google: { http: null, usage: { reserve: failing('usage') as never, count: failing('usage') as never }, limit: 0, now: () => new Date(0), sleep: async () => undefined },
    pagespeed: { http: { run: failing('pagespeed') as never }, usage: { reserve: failing('usage') as never, count: failing('usage') as never }, limit: 0, now: () => new Date(0), hasKey: false },
    cnpj: { http: { getCnpj: failing('brasilapi') as never }, limiter: { schedule: (fn) => fn() }, sleep: async () => undefined, now: () => new Date(0) },
    now: () => 0,
    newToken: () => randomUUID(),
  };
}

/** Cria o usuário autor das minerações do teste. */
export async function createTestUser(db: PrismaClient, prefix: string): Promise<string> {
  const user = await db.user.create({
    data: { name: `${prefix} Autor`, email: `${prefix.toLowerCase()}@lead-miner.test`, status: 'ATIVO' },
    select: { id: true },
  });
  return user.id;
}

/** Remove Empresas (cascata em aliases, análises e vínculos), minerações e o usuário do teste. */
export async function cleanup(db: PrismaClient, prefix: string, userId: string | null): Promise<void> {
  await db.company.deleteMany({ where: { nome: { startsWith: prefix } } });
  if (userId) {
    await db.miningRun.deleteMany({ where: { createdById: userId } });
    await db.user.deleteMany({ where: { id: userId } });
  }
}

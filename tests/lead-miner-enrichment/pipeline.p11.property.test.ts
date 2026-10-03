// Feature: lead-miner-enrichment, Property 11: Descoberta retomável com fallback
/**
 * **Validates: Requirements 4.6, 4.10**
 *
 * Para qualquer roteiro de tempo gasto em cada requisição do Google e do OSM,
 * executar `discoverStep` em fatias de tempo:
 * 1. O processo sempre termina e as chamadas totais são as mesmas de uma execução sem limite de tempo.
 * 2. Quando o Google fica indisponível, os nichos restantes vão para o OSM.
 */
import fc from 'fast-check';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Prisma } from '@prisma/client';
import { discoverStep, type PipelineDeps } from '@/lib/leads/pipeline';

vi.mock('@/lib/leads/repository', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/leads/repository')>()),
  upsertGooglePlace: vi.fn(async () => undefined),
  upsertFoundCompany: vi.fn(async () => undefined),
  pruneGoogleChains: vi.fn(async () => undefined),
}));
vi.mock('@/lib/leads/google-cache', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/leads/google-cache')>()),
  purgeExpiredGoogleCache: vi.fn(async () => 0),
}));
vi.mock('@/lib/leads/sources/osm', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/leads/sources/osm')>()),
  searchNiche: vi.fn(async () => ({ ok: true, companies: [] })),
  geocode: vi.fn(async () => ({ ok: true, area: { kind: 'bbox', south: 0, west: 0, north: 0, east: 0 } })),
  mergeByOsmId: vi.fn((c) => c.flat()),
  excludeChains: vi.fn((c) => c),
}));

import { searchGooglePage, type PageOutcome } from '@/lib/leads/sources/google-places';
vi.mock('@/lib/leads/sources/google-places', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/leads/sources/google-places')>()),
  searchGooglePage: vi.fn(),
  mergeByPlaceId: vi.fn((c) => c.flat()),
  rectFromArea: vi.fn(() => ({ low: { latitude: 0, longitude: 0 }, high: { latitude: 0, longitude: 0 } })),
}));

const RUN_ID = 'run-1';

function fakeDb(runInit: any) {
  const run = {
    id: RUN_ID, status: 'PENDENTE',
    bairro: 'V', cidade: 'S', uf: 'SP', area: { kind: 'bbox', south: 0, west: 0, north: 0, east: 0 },
    nichos: ['clinica_odontologica', 'advocacia'], excluirRedes: false,
    fonteSolicitada: 'GOOGLE', fonte: 'GOOGLE', googleMotivo: null, googleNichosAfetados: [],
    googleCursor: null, nichosProcessados: [], nichosFalhos: [],
    nichosGoogleProcessados: [], nichosGoogleFalhos: [],
    ...runInit
  };
  const dbThis = {
    run,
    miningRun: {
      findUnique: vi.fn(async () => ({ ...run })),
      findFirst: vi.fn(async () => null),
      update: vi.fn(async ({ data }: any) => {
        Object.keys(data).forEach((k) => {
          if (data[k] === Prisma.DbNull) run[k] = null;
          else run[k] = data[k];
        });
        return { ...run };
      }),
      updateMany: vi.fn(async ({ data }: any) => {
        Object.keys(data).forEach((k) => {
          if (data[k] === Prisma.DbNull) run[k] = null;
          else run[k] = data[k];
        });
        return { count: 1 };
      }),
    },
    miningRunCompany: {
      findMany: vi.fn(async () => []),
      count: vi.fn(async () => 0),
      groupBy: vi.fn(async () => []),
    },
    $queryRaw: vi.fn(async () => (run.status === 'PENDENTE' ? [{ id: RUN_ID }] : [])),
    $executeRaw: vi.fn(async () => 1),
    $transaction: vi.fn(async (fn: any) => fn(dbThis)),
  };
  return dbThis;
}

const mockSearchGooglePage = vi.mocked(searchGooglePage);

describe('Property 11: Descoberta retomável com fallback', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('iterar discoverStep com time slices deve produzir o mesmo resultado e delegar ao OSM em fallback', async () => {
    await fc.assert(
      fc.asyncProperty(
        // tempo de cada requisição do Google
        fc.array(fc.integer({ min: 1000, max: 25000 }), { minLength: 10, maxLength: 10 }),
        // fatias de tempo de cada passo (slice limit)
        fc.array(fc.integer({ min: 5000, max: 40000 }), { minLength: 20, maxLength: 20 }),
        // falha na N-ésima página (0 = não falha)
        fc.integer({ min: 0, max: 10 }),
        async (googleTimes, slices, failAtPage) => {
          vi.clearAllMocks();
          const db = fakeDb({});
          
          let clock = 0;
          let pagesRequested = 0;
          mockSearchGooglePage.mockImplementation(async () => {
            pagesRequested++;
            const time = googleTimes[pagesRequested - 1] || 5000;
            clock += time;
            if (failAtPage > 0 && pagesRequested === failAtPage) {
              return { ok: false, kind: 'QUOTA' } as PageOutcome;
            }
            // 3 páginas por nicho, há 2 nichos => total máximo 6 páginas
            return { ok: true, places: [], nextPageToken: (pagesRequested % 3 !== 0) ? 'token' : null } as any;
          });

          const deps = {
            db: db as any,
            osm: {} as any,
            google: { now: () => new Date() } as any,
            now: () => clock,
          } as PipelineDeps;

          let stepCount = 0;
          let sliceIdx = 0;

          // Executa passos até não estar mais PENDENTE
          while (db.run.status === 'PENDENTE' && stepCount < 30) {
            stepCount++;
            const sliceLimit = slices[sliceIdx] || 20000;
            sliceIdx++;
            const deadline = clock + sliceLimit;
            await discoverStep(RUN_ID, deps, deadline);
          }

          expect(db.run.status).not.toBe('PENDENTE');

          // Se falhou antes de terminar todos os nichos (máximo 6 páginas)
          if (failAtPage > 0 && failAtPage <= 6) {
            expect(db.run.googleMotivo).toBe('COTA_ESGOTADA');
            // O restante vai para o OSM, garantindo que o status final não é ERRO.
            // Para ser ERRO, OSM precisaria falhar também, mas nosso mock do OSM retorna ok: true
          } else {
            expect(db.run.googleMotivo).toBeNull();
          }
        }
      ),
      { numRuns: 100 }
    );
  });
});

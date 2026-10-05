/**
 * Testes unitários do pipeline com dependências falsas (sem rede e sem banco).
 * O repositório é substituído por `vi.mock` e o Prisma por um objeto mínimo.
 * Requisitos: 7.7, 7.9, 8.4, 8.9.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { ApiError } from '@/lib/api-error';
import type { ClaimedItemV2 } from '@/lib/leads/repository';

vi.mock('@/lib/leads/repository', () => ({
  claimBatch: vi.fn(),
  releaseClaims: vi.fn(async () => undefined),
  persistAnalysis: vi.fn(async () => 'OK'),
  persistFailure: vi.fn(async () => 'OK'),
  upsertFoundCompany: vi.fn(async () => undefined),
}));

import * as repo from '@/lib/leads/repository';
import { createRun, PER_COMPANY_MARGIN_MS, runBatch, type PipelineDeps } from '@/lib/leads/pipeline';
import { buildRunParamsKey } from '@/lib/leads/filters';

const claimBatch = vi.mocked(repo.claimBatch);
const releaseClaims = vi.mocked(repo.releaseClaims);
const persistAnalysis = vi.mocked(repo.persistAnalysis);
const persistFailure = vi.mocked(repo.persistFailure);

const RUN_ID = 'run-1';

function runRow(overrides: Record<string, unknown> = {}) {
  return {
    id: RUN_ID,
    status: 'EM_ANDAMENTO',
    processados: 0,
    total: 3,
    errorMessage: null,
    nichosFalhos: [],
    iaDisabledReason: null,
    iaEnabled: false,
    ...overrides,
  };
}

/** Prisma falso mínimo; `create` ecoa o `data` recebido como linha criada. */
function fakeDb(opts: { run?: Record<string, unknown>; activeRunId?: string | null } = {}) {
  const db = {
    miningRun: {
      findUnique: vi.fn(async () => runRow(opts.run)),
      findFirst: vi.fn(async () => (opts.activeRunId ? { id: opts.activeRunId } : null)),
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({
        id: 'new-run',
        processados: 0,
        total: 0,
        errorMessage: null,
        nichosFalhos: [],
        ...data,
      })),
      updateMany: vi.fn(async () => ({ count: 1 })),
      update: vi.fn(async () => ({})),
    },
    miningRunCompany: {
      groupBy: vi.fn(async () => []),
      count: vi.fn(async () => 0),
      findMany: vi.fn(async () => []),
    },
    $queryRaw: vi.fn(async () => []),
    $executeRaw: vi.fn(async () => 0),
    $transaction: vi.fn(async (fn: (tx: unknown) => unknown) => fn(db)),
  };
  return db;
}

function makeDeps(db: ReturnType<typeof fakeDb>, nowMs = 0): PipelineDeps {
  const unused = () => {
    throw new Error('dependência não deveria ser chamada');
  };
  return {
    db: db as unknown as PrismaClient,
    osm: { http: { getJson: unused }, limiter: { acquire: unused }, sleep: async () => undefined } as never,
    site: {
      resolver: { resolveAll: async () => unused() },
      transport: { request: unused },
      now: () => nowMs,
    } as never,
    ai: { client: null, usage: {} as never, limit: 0, now: () => new Date(0) },
    google: { http: null, usage: {} as never, limit: 0, now: () => new Date(0), sleep: async () => undefined },
    pagespeed: { http: { run: unused }, usage: {} as never, limit: 0, now: () => new Date(0), hasKey: false },
    cnpj: { http: { getCnpj: unused }, limiter: { schedule: unused }, sleep: async () => undefined, now: () => new Date(0) } as never,
    now: () => nowMs,
    newToken: () => 'tok-1',
  };
}

function item(id: string, nicho = 'clinica_odontologica'): ClaimedItemV2 {
  return {
    id,
    runId: RUN_ID,
    companyId: `c-${id}`,
    nicho,
    nome: `Empresa ${id}`,
    bairro: 'Centro',
    cidade: 'Santos',
    website: null,
    // Campos da Etapa 3 (devolvidos por `claimBatch`): empresa só do OSM, sem CNPJ nem cache do Google.
    googlePlaceId: null,
    uf: 'SP',
    instagramOsm: null,
    whatsappOsm: null,
    cnpj: null,
    cnpjOrigem: null,
    cnpjCandidatos: [],
    cnpjDadosCnpj: null,
    cnpjConsultadoEm: null,
    cnpjAi: null,
    cacheNome: null,
    cacheWebsite: null,
  };
}

const validInput = {
  bairro: 'Centro',
  cidade: 'Santos',
  uf: 'SP',
  nichos: ['clinica_odontologica'],
  excluirRedes: false,
  iaEnabled: true,
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('runBatch', () => {
  it('não inicia empresa com menos de 32 s até o deadline e libera os claims (Req. 8.4)', async () => {
    // Etapa 3: a margem depende dos serviços habilitados; 32 s é o caso da Etapa 1 (só IA).
    const db = fakeDb({ run: { iaEnabled: true } });
    const items = [item('a'), item('b'), item('c')];
    claimBatch.mockResolvedValueOnce(items);
    const now = 1_000_000;
    const deps = makeDeps(db, now);

    await runBatch(RUN_ID, deps, now + PER_COMPANY_MARGIN_MS - 1);

    expect(persistAnalysis).not.toHaveBeenCalled();
    expect(persistFailure).not.toHaveBeenCalled();
    expect(releaseClaims).toHaveBeenCalledTimes(1);
    expect(releaseClaims).toHaveBeenCalledWith(db, 'tok-1', ['a', 'b', 'c']);
    expect(db.miningRun.updateMany).not.toHaveBeenCalled(); // sem ERRO
  });

  it('falha na análise de um item grava a falha dele e os demais seguem (Req. 8.9)', async () => {
    const db = fakeDb();
    const items = [item('a'), item('ruim', 'nicho_inexistente'), item('c')];
    claimBatch.mockResolvedValueOnce(items);
    const deps = makeDeps(db, 0);

    const progress = await runBatch(RUN_ID, deps, 10 * 60_000);

    expect(persistFailure).toHaveBeenCalledTimes(1);
    expect(persistFailure.mock.calls[0][1]).toMatchObject({ id: 'ruim' });
    expect(persistFailure.mock.calls[0][3]).toContain('nicho_inexistente');
    const analyzed = persistAnalysis.mock.calls.map((c) => c[1].id).sort();
    expect(analyzed).toEqual(['a', 'c']);
    expect(releaseClaims).toHaveBeenCalledWith(db, 'tok-1', []);
    expect(db.miningRun.updateMany).not.toHaveBeenCalled();
    expect(progress.status).toBe('EM_ANDAMENTO');
  });
});

describe('createRun', () => {
  it('IA pedida sem cliente grava iaEnabled=false e SEM_CHAVE (Req. 7.7, 7.9)', async () => {
    const db = fakeDb();
    const progress = await createRun('user-1', validInput, makeDeps(db));

    expect(db.miningRun.create).toHaveBeenCalledTimes(1);
    const data = db.miningRun.create.mock.calls[0][0].data;
    expect(data.iaEnabled).toBe(false);
    expect(data.iaDisabledReason).toBe('SEM_CHAVE');
    expect(data.status).toBe('PENDENTE');
    expect(progress.iaDisabledReason).toBe('SEM_CHAVE');
  });

  it('409 com runId quando já há run ativa do mesmo autor e paramsKey; autor vem de actorId', async () => {
    const db = fakeDb({ activeRunId: 'run-ativa' });
    const input = { ...validInput, createdById: 'intruso' };

    const err = await createRun('user-1', input, makeDeps(db)).catch((e: unknown) => e);

    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).status).toBe(409);
    expect((err as ApiError).extra).toEqual({ runId: 'run-ativa' });
    expect(db.miningRun.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ createdById: 'user-1', paramsKey: buildRunParamsKey(validInput) }),
      }),
    );
    expect(db.miningRun.create).not.toHaveBeenCalled();
  });

  it('ignora createdById do input ao criar', async () => {
    const db = fakeDb();
    await createRun('user-1', { ...validInput, createdById: 'intruso' }, makeDeps(db));
    expect(db.miningRun.create.mock.calls[0][0].data.createdById).toBe('user-1');
  });
});

/**
 * T1 — a pipeline respeita o cancelamento: entre itens, no meio de uma análise (AbortSignal, sem
 * gravar resultado parcial) e na descoberta. Itens concluídos antes do cancelamento permanecem.
 * Offline: repositório, análise e fontes são substituídos.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import type { ClaimedItemV2 } from '@/lib/leads/repository';

vi.mock('@/lib/leads/repository', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/leads/repository')>()),
  claimBatch: vi.fn(),
  releaseClaims: vi.fn(async () => undefined),
  persistAnalysis: vi.fn(async () => 'OK'),
  persistFailure: vi.fn(async () => 'OK'),
  upsertFoundCompany: vi.fn(async () => undefined),
  upsertGooglePlace: vi.fn(async () => undefined),
}));
vi.mock('@/lib/leads/analysis', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/leads/analysis')>()),
  analyzeCompany: vi.fn(),
}));
vi.mock('@/lib/leads/google-cache', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/leads/google-cache')>()),
  purgeExpiredGoogleCache: vi.fn(async () => 0),
}));
vi.mock('@/lib/leads/sources/osm', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/leads/sources/osm')>()),
  searchNiche: vi.fn(),
  geocode: vi.fn(),
}));

import * as repo from '@/lib/leads/repository';
import * as analysis from '@/lib/leads/analysis';
import * as osm from '@/lib/leads/sources/osm';
import { abortRunLocally } from '@/lib/leads/cancel';
import { discoverStep, runBatch, type PipelineDeps } from '@/lib/leads/pipeline';

const claimBatch = vi.mocked(repo.claimBatch);
const releaseClaims = vi.mocked(repo.releaseClaims);
const persistAnalysis = vi.mocked(repo.persistAnalysis);
const persistFailure = vi.mocked(repo.persistFailure);
const upsertFoundCompany = vi.mocked(repo.upsertFoundCompany);
const analyzeCompany = vi.mocked(analysis.analyzeCompany);
const searchNiche = vi.mocked(osm.searchNiche);

const RUN_ID = 'run-1';
const A = 'clinica_odontologica';

/** Resultado de análise mínimo: o repositório é falso, então o conteúdo não importa. */
const FAKE_DATA = { versaoScore: 2 } as unknown as Awaited<ReturnType<typeof analysis.analyzeCompany>>;

function runRow(over: Record<string, unknown> = {}) {
  return {
    id: RUN_ID,
    status: 'EM_ANDAMENTO',
    processados: 0,
    total: 3,
    errorMessage: null,
    nichosFalhos: [],
    iaDisabledReason: null,
    iaEnabled: false,
    pagespeedEnabled: false,
    cnpjEnabled: false,
    ...over,
  };
}

/** `findUnique` com `select: { status }` (vigia/verificação) reflete `ctl.cancelled`; o resto devolve a linha. */
function fakeDb(ctl: { cancelled: boolean }, row: Record<string, unknown> = runRow()) {
  const db = {
    miningRun: {
      findUnique: vi.fn(async (args?: { select?: { status?: boolean } }) =>
        args?.select?.status ? { status: ctl.cancelled ? 'CANCELADA' : (row.status as string) } : { ...row },
      ),
      updateMany: vi.fn(async () => ({ count: 1 })),
      update: vi.fn(async () => ({})),
    },
    miningRunCompany: {
      groupBy: vi.fn(async () => []),
      count: vi.fn(async () => 0),
      findMany: vi.fn(async () => []),
    },
    $queryRaw: vi.fn(async () => [{ id: RUN_ID }]),
    $executeRaw: vi.fn(async () => 1),
    $transaction: vi.fn(async (fn: (tx: unknown) => unknown) => fn(db)),
  };
  return db;
}

function makeDeps(db: ReturnType<typeof fakeDb>): PipelineDeps {
  const unused = () => {
    throw new Error('dependência não deveria ser chamada');
  };
  return {
    db: db as unknown as PrismaClient,
    osm: { http: { getJson: unused }, limiter: { acquire: unused }, sleep: async () => undefined } as never,
    site: {} as never,
    ai: { client: null, usage: {} as never, limit: 0, now: () => new Date(0) },
    google: { http: null, usage: {} as never, limit: 0, now: () => new Date(0), sleep: async () => undefined },
    pagespeed: { http: { run: unused }, usage: {} as never, limit: 0, now: () => new Date(0), hasKey: false } as never,
    cnpj: {} as never,
    now: () => 0,
    newToken: () => 'tok-1',
  };
}

const item = (id: string): ClaimedItemV2 =>
  ({ id, runId: RUN_ID, companyId: `c-${id}`, nicho: A, nome: `Empresa ${id}`, bairro: 'Centro', cidade: 'Santos', website: null }) as unknown as ClaimedItemV2;

const DEADLINE = 10 * 60_000;
const tick = () => new Promise<void>((r) => setTimeout(r, 0));

beforeEach(() => {
  vi.clearAllMocks();
});

describe('runBatch sob cancelamento', () => {
  it('cancelada antes de começar os itens: nada é analisado nem gravado e os claims voltam ao pool', async () => {
    const ctl = { cancelled: false };
    const db = fakeDb(ctl);
    // A 1ª leitura (linha da mineração) vê EM_ANDAMENTO; a verificação entre itens já vê CANCELADA.
    claimBatch.mockImplementationOnce(async () => {
      ctl.cancelled = true;
      return [item('a'), item('b'), item('c')];
    });

    await runBatch(RUN_ID, makeDeps(db), DEADLINE);

    expect(analyzeCompany).not.toHaveBeenCalled();
    expect(persistAnalysis).not.toHaveBeenCalled();
    expect(persistFailure).not.toHaveBeenCalled();
    expect(releaseClaims).toHaveBeenCalledWith(db, 'tok-1', ['a', 'b', 'c']);
    expect(db.miningRun.updateMany).not.toHaveBeenCalled(); // não vira ERRO
  });

  it('aborta a análise em curso sem gravar resultado parcial; o item concluído antes permanece', async () => {
    const ctl = { cancelled: false };
    const db = fakeDb(ctl);
    claimBatch.mockResolvedValueOnce([item('a'), item('b'), item('c')]);
    analyzeCompany.mockImplementation(async (t, o) => {
      if (t.companyId === 'c-a') return FAKE_DATA; // termina antes do cancelamento
      // Demais: ficam "em rede" até o AbortSignal (como site/PageSpeed/IA reais).
      await new Promise<void>((_, reject) =>
        o.signal?.addEventListener('abort', () => reject(new analysis.AnalysisAbortedError()), { once: true }),
      );
      return FAKE_DATA;
    });

    const batch = runBatch(RUN_ID, makeDeps(db), DEADLINE);
    await tick();
    await tick();
    ctl.cancelled = true;
    expect(abortRunLocally(RUN_ID)).toBe(1);
    await batch;

    // 'a' foi gravado; 'b' e 'c' foram interrompidos e NÃO viraram análise nem falha.
    expect(persistAnalysis).toHaveBeenCalledTimes(1);
    expect(persistAnalysis.mock.calls[0][1]).toMatchObject({ id: 'a' });
    expect(persistFailure).not.toHaveBeenCalled();
    expect(releaseClaims).toHaveBeenCalledTimes(1);
    const released = releaseClaims.mock.calls[0][2] as string[];
    expect([...released].sort()).toEqual(['b', 'c']);
  });

  it('erro qualquer com a mineração já abortada também não vira falha gravada', async () => {
    const ctl = { cancelled: false };
    const db = fakeDb(ctl);
    claimBatch.mockResolvedValueOnce([item('a')]);
    analyzeCompany.mockImplementation(async (_t, o) => {
      await new Promise<void>((_, reject) =>
        o.signal?.addEventListener('abort', () => reject(new Error('socket hang up')), { once: true }),
      );
      return FAKE_DATA;
    });

    const batch = runBatch(RUN_ID, makeDeps(db), DEADLINE);
    await tick();
    abortRunLocally(RUN_ID);
    await batch;

    expect(persistFailure).not.toHaveBeenCalled();
    expect(persistAnalysis).not.toHaveBeenCalled();
    expect(releaseClaims).toHaveBeenCalledWith(db, 'tok-1', ['a']);
  });

  it('mineração já CANCELADA no início do lote é no-op', async () => {
    const ctl = { cancelled: false };
    const db = fakeDb(ctl, runRow({ status: 'CANCELADA' }));

    await runBatch(RUN_ID, makeDeps(db), DEADLINE);

    expect(claimBatch).not.toHaveBeenCalled();
    expect(analyzeCompany).not.toHaveBeenCalled();
  });
});

describe('discoverStep sob cancelamento', () => {
  const PENDENTE = runRow({
    status: 'PENDENTE',
    total: 0,
    nichos: [A],
    nichosProcessados: [],
    nichosGoogleProcessados: [],
    nichosGoogleFalhos: [],
    googleNichosAfetados: [],
    googleCursor: null,
    googleMotivo: null,
    fonteSolicitada: 'OSM',
    fonte: 'OSM',
    excluirRedes: false,
    bairro: 'Centro',
    cidade: 'Santos',
    uf: 'SP',
    area: { kind: 'bbox', south: -23.97, west: -46.4, north: -23.93, east: -46.3 },
  });

  it('cancelada antes do nicho: não consulta fontes, não grava empresas e não finaliza a descoberta', async () => {
    const ctl = { cancelled: true };
    const db = fakeDb(ctl, PENDENTE);

    await discoverStep(RUN_ID, makeDeps(db), DEADLINE);

    expect(searchNiche).not.toHaveBeenCalled();
    expect(upsertFoundCompany).not.toHaveBeenCalled();
    expect(db.miningRun.updateMany).not.toHaveBeenCalled(); // a transação final (PENDENTE → …) não roda
  });

  it('cancelada durante a consulta: descarta o resultado da página', async () => {
    const ctl = { cancelled: false };
    const db = fakeDb(ctl, PENDENTE);
    searchNiche.mockImplementationOnce(async () => {
      ctl.cancelled = true; // o usuário para enquanto a fonte responde
      return { ok: true, companies: [{ osmId: 'node/1', nome: 'Dente Feliz', nicho: A }] } as never;
    });

    await discoverStep(RUN_ID, makeDeps(db), DEADLINE);

    expect(searchNiche).toHaveBeenCalledTimes(1);
    expect(upsertFoundCompany).not.toHaveBeenCalled();
    expect(db.miningRun.updateMany).not.toHaveBeenCalled();
  });
});

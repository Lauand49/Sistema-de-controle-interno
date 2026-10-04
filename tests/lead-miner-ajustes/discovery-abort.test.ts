/**
 * P2 — "Parar" interrompe a descoberta em andamento: o AbortSignal da mineração chega às
 * requisições de Nominatim, Overpass e Google Places. Offline: HTTP falso que só termina quando o
 * sinal aborta (ou nunca), banco e repositório simulados.
 */
import { getEventListeners } from 'node:events';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PrismaClient } from '@prisma/client';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/prisma', () => ({ prisma: {} }));
vi.mock('@/lib/leads/repository', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/leads/repository')>()),
  upsertFoundCompany: vi.fn(async () => undefined),
  upsertGooglePlace: vi.fn(async () => undefined),
}));
vi.mock('@/lib/leads/google-cache', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/leads/google-cache')>()),
  purgeExpiredGoogleCache: vi.fn(async () => 0),
}));

import * as repo from '@/lib/leads/repository';
import { abortRunLocally, registeredAbortCount } from '@/lib/leads/cancel';
import { discoverStep, type PipelineDeps } from '@/lib/leads/pipeline';
import { NICHES } from '@/lib/leads/config';
import { RunAbortedError, sleepOrAbort, timeoutSignal } from '@/lib/leads/abort';
import { geocodeText, searchNiche, type HttpJsonClient, type OsmDeps } from '@/lib/leads/sources/osm';
import { searchGooglePage, type GooglePlacesDeps, type PlacesHttp } from '@/lib/leads/sources/google-places';

const upsertFoundCompany = vi.mocked(repo.upsertFoundCompany);
const RUN_ID = 'run-1';
const NICHE = NICHES[0];
const DEADLINE = 10 * 60_000;

/** Promessa que rejeita quando o sinal aborta e nunca resolve sozinha (requisição "pendurada"). */
function hang(signal: AbortSignal | undefined): Promise<never> {
  return new Promise((_, reject) => {
    if (signal?.aborted) return reject(new Error('aborted'));
    signal?.addEventListener('abort', () => reject(new Error('aborted')), { once: true });
  });
}

const waitFor = async (cond: () => boolean, ms = 2000) => {
  const start = Date.now();
  while (!cond()) {
    if (Date.now() - start > ms) throw new Error('timeout aguardando condição');
    await new Promise((r) => setTimeout(r, 5));
  }
};

interface Ctl {
  cancelled: boolean;
}

function runRow(over: Record<string, unknown> = {}) {
  return {
    id: RUN_ID,
    status: 'PENDENTE',
    processados: 0,
    total: 0,
    errorMessage: null,
    nichosFalhos: [],
    iaDisabledReason: null,
    iaEnabled: false,
    pagespeedEnabled: false,
    cnpjEnabled: false,
    nichos: [NICHE.id],
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
    ...over,
  };
}

function fakeDb(ctl: Ctl, row: Record<string, unknown>) {
  const db = {
    miningRun: {
      findUnique: vi.fn(async (args?: { select?: { status?: boolean } }) =>
        args?.select?.status ? { status: ctl.cancelled ? 'CANCELADA' : (row.status as string) } : { ...row },
      ),
      updateMany: vi.fn(async () => ({ count: 1 })),
      update: vi.fn(async () => ({})),
    },
    miningRunCompany: { groupBy: vi.fn(async () => []), count: vi.fn(async () => 0), findMany: vi.fn(async () => []) },
    $queryRaw: vi.fn(async () => [{ id: RUN_ID }]),
    $executeRaw: vi.fn(async () => 1),
    $transaction: vi.fn(async (fn: (tx: unknown) => unknown) => fn(db)),
  };
  return db;
}

function makeDeps(
  db: ReturnType<typeof fakeDb>,
  http: HttpJsonClient,
  google: Partial<GooglePlacesDeps> = {},
  sleep: (ms: number) => Promise<void> = async () => undefined,
): PipelineDeps {
  return {
    db: db as unknown as PrismaClient,
    osm: { http, limiter: { schedule: (fn) => fn() }, sleep },
    site: {} as never,
    ai: { client: null, usage: {} as never, limit: 0, now: () => new Date(0) },
    google: { http: null, usage: {} as never, limit: 0, now: () => new Date(0), sleep, ...google },
    pagespeed: {} as never,
    cnpj: {} as never,
    now: () => 0,
    newToken: () => 'tok',
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});
afterEach(() => {
  // nenhum teste pode deixar controladores registrados
  expect(registeredAbortCount()).toBe(0);
});

describe('descoberta: cancelar aborta a requisição em voo', () => {
  it('Overpass em voo: aborta, não retenta, não grava, não vira ERRO e desregistra o controlador', async () => {
    const ctl: Ctl = { cancelled: false };
    const db = fakeDb(ctl, runRow());
    let signalSeen: AbortSignal | undefined;
    const getJson = vi.fn((_url: string, init: { signal?: AbortSignal }) => {
      signalSeen = init.signal;
      return hang(init.signal);
    });
    const sleep = vi.fn(async () => undefined);
    const promise = discoverStep(RUN_ID, makeDeps(db, { getJson }, {}, sleep), DEADLINE);

    await waitFor(() => getJson.mock.calls.length === 1);
    expect(registeredAbortCount(RUN_ID)).toBe(1);
    expect(signalSeen?.aborted).toBe(false);

    // O que a rota de cancelamento faz: status no banco + abort local.
    ctl.cancelled = true;
    expect(abortRunLocally(RUN_ID)).toBe(1);

    const progress = await promise;
    expect(signalSeen?.aborted).toBe(true);
    expect(getJson).toHaveBeenCalledTimes(1); // sem retentativa
    expect(sleep).not.toHaveBeenCalled();
    expect(upsertFoundCompany).not.toHaveBeenCalled();
    expect(db.miningRun.updateMany).not.toHaveBeenCalled(); // nem ERRO nem fim da descoberta
    expect(progress.status).not.toBe('ERRO');
  });

  it('Nominatim em voo (geocodificação): cancelar não vira "geocodificação indisponível"', async () => {
    const ctl: Ctl = { cancelled: false };
    const db = fakeDb(ctl, runRow({ area: null }));
    const getJson = vi.fn((_url: string, init: { signal?: AbortSignal }) => hang(init.signal));
    const promise = discoverStep(RUN_ID, makeDeps(db, { getJson }), DEADLINE);
    await waitFor(() => getJson.mock.calls.length === 1);
    ctl.cancelled = true;
    abortRunLocally(RUN_ID);
    await promise;
    expect(db.miningRun.update).not.toHaveBeenCalled(); // área não gravada
    expect(db.miningRun.updateMany).not.toHaveBeenCalled(); // markRunError não rodou
    expect(upsertFoundCompany).not.toHaveBeenCalled();
  });

  it('Google Places em voo: aborta a requisição e não trata como falha do Google', async () => {
    const ctl: Ctl = { cancelled: false };
    const db = fakeDb(ctl, runRow({ fonteSolicitada: 'GOOGLE', fonte: 'GOOGLE' }));
    const request = vi.fn((req: { signal?: AbortSignal }) => hang(req.signal));
    const reserve = vi.fn(async () => true);
    const google: Partial<GooglePlacesDeps> = {
      http: { request } as unknown as PlacesHttp,
      usage: { reserve, count: vi.fn(async () => 0) },
      limit: 100,
    };
    const unused: HttpJsonClient = { getJson: vi.fn(async () => ({ elements: [] })) };
    const promise = discoverStep(RUN_ID, makeDeps(db, unused, google), DEADLINE);
    await waitFor(() => request.mock.calls.length === 1);
    ctl.cancelled = true;
    abortRunLocally(RUN_ID);
    await promise;
    expect(request).toHaveBeenCalledTimes(1);
    expect(reserve).toHaveBeenCalledTimes(1);
    expect(upsertFoundCompany).not.toHaveBeenCalled();
    expect(repo.upsertGooglePlace).not.toHaveBeenCalled();
    expect(db.miningRun.update).not.toHaveBeenCalled(); // googleMotivo/estado não foram gravados
    expect(db.miningRun.updateMany).not.toHaveBeenCalled();
  });

  it('outra instância (sem abort local): o vigia do banco aborta a requisição em voo', async () => {
    const ctl: Ctl = { cancelled: false };
    const db = fakeDb(ctl, runRow());
    let signalSeen: AbortSignal | undefined;
    const getJson = vi.fn((_url: string, init: { signal?: AbortSignal }) => {
      signalSeen = init.signal;
      return hang(init.signal);
    });
    const promise = discoverStep(RUN_ID, makeDeps(db, { getJson }), DEADLINE);
    await waitFor(() => getJson.mock.calls.length === 1);
    ctl.cancelled = true; // só o banco mudou
    await promise;
    expect(signalSeen?.aborted).toBe(true);
    expect(upsertFoundCompany).not.toHaveBeenCalled();
    expect(db.miningRun.updateMany).not.toHaveBeenCalled();
  }, 8000);

  it('empresas salvas antes do cancelamento permanecem (nada é apagado)', async () => {
    const ctl: Ctl = { cancelled: false };
    const db = fakeDb(ctl, runRow({ nichos: [NICHES[0].id, NICHES[1].id] }));
    let n = 0;
    const getJson = vi.fn((_url: string, init: { signal?: AbortSignal }) => {
      n += 1;
      if (n === 1) return Promise.resolve({ elements: [{ type: 'node', id: 1, lat: -23.9, lon: -46.3, tags: { name: 'Clínica Um' } }] });
      return hang(init.signal); // 2º nicho fica em voo
    });
    const promise = discoverStep(RUN_ID, makeDeps(db, { getJson }), DEADLINE);
    await waitFor(() => getJson.mock.calls.length === 2);
    ctl.cancelled = true;
    abortRunLocally(RUN_ID);
    await promise;
    expect(upsertFoundCompany).toHaveBeenCalledTimes(1); // a do 1º nicho, já salva
    expect(db.miningRun.updateMany).not.toHaveBeenCalled();
  });

  it('cancelamento repetido é idempotente: 2º abort local não faz nada e não lança', async () => {
    const ctl: Ctl = { cancelled: false };
    const db = fakeDb(ctl, runRow());
    const getJson = vi.fn((_url: string, init: { signal?: AbortSignal }) => hang(init.signal));
    const promise = discoverStep(RUN_ID, makeDeps(db, { getJson }), DEADLINE);
    await waitFor(() => getJson.mock.calls.length === 1);
    ctl.cancelled = true;
    expect(abortRunLocally(RUN_ID)).toBe(1);
    expect(abortRunLocally(RUN_ID)).toBe(0);
    await promise;
    expect(abortRunLocally(RUN_ID)).toBe(0); // já desregistrado
  });
});

describe('fontes: sinal, retentativas e listeners', () => {
  /** Sinal + contagem de listeners `abort` ainda registrados (detecta listeners pendurados). */
  function countedSignal() {
    const ac = new AbortController();
    return { ac, open: () => getEventListeners(ac.signal, 'abort').length };
  }

  const area = { kind: 'bbox', south: -23.97, west: -46.4, north: -23.93, east: -46.3 } as never;

  it('sinal já abortado: geocodeText/searchNiche nem chamam a rede', async () => {
    const ac = new AbortController();
    ac.abort();
    const getJson = vi.fn(async () => ({}));
    const deps: OsmDeps = { http: { getJson }, limiter: { schedule: (fn) => fn() }, sleep: async () => undefined, signal: ac.signal };
    expect(await geocodeText('Santos, SP', deps)).toEqual({ ok: false, reason: 'CANCELADA' });
    expect(await searchNiche(NICHE, area, deps)).toEqual({ ok: false, aborted: true });
    expect(getJson).not.toHaveBeenCalled();
  });

  it('abortar durante a espera entre retentativas interrompe a espera e não tenta de novo', async () => {
    const { ac, open } = countedSignal();
    const getJson = vi.fn(async () => {
      throw new Error('HTTP 503');
    });
    let sleepResolve: (() => void) | undefined;
    const sleep = vi.fn(() => new Promise<void>((r) => (sleepResolve = r))); // nunca termina sozinho
    const deps: OsmDeps = { http: { getJson }, limiter: { schedule: (fn) => fn() }, sleep, signal: ac.signal };
    const p = searchNiche(NICHE, area, deps);
    await waitFor(() => sleep.mock.calls.length === 1);
    ac.abort();
    expect(await p).toEqual({ ok: false, aborted: true });
    expect(getJson).toHaveBeenCalledTimes(1);
    expect(open()).toBe(0); // listener da espera removido
    sleepResolve?.();
  });

  it('sem cancelamento: retenta normalmente e não deixa listeners', async () => {
    const { ac, open } = countedSignal();
    let n = 0;
    const getJson = vi.fn(async () => {
      n += 1;
      if (n === 1) throw new Error('HTTP 503');
      return { elements: [] };
    });
    const deps: OsmDeps = { http: { getJson }, limiter: { schedule: (fn) => fn() }, sleep: async () => undefined, signal: ac.signal };
    expect(await searchNiche(NICHE, area, deps)).toEqual({ ok: true, companies: [] });
    expect(getJson).toHaveBeenCalledTimes(2);
    expect(open()).toBe(0);
  });

  it('Overpass recebe o sinal e o timeout limite em cada tentativa', async () => {
    const ac = new AbortController();
    const getJson = vi.fn(async (_u: string, init: { timeoutMs: number; signal?: AbortSignal }) => {
      expect(init.signal).toBe(ac.signal);
      expect(init.timeoutMs).toBeGreaterThan(0);
      return { elements: [] };
    });
    await searchNiche(NICHE, area, { http: { getJson }, limiter: { schedule: (fn) => fn() }, sleep: async () => undefined, signal: ac.signal });
    expect(getJson).toHaveBeenCalledTimes(1);
  });

  it('searchGooglePage: sinal pré-abortado → ABORTED sem reservar cota nem enviar', async () => {
    const ac = new AbortController();
    ac.abort();
    const request = vi.fn();
    const reserve = vi.fn(async () => true);
    const deps: GooglePlacesDeps = {
      http: { request } as unknown as PlacesHttp,
      usage: { reserve, count: vi.fn(async () => 0) },
      limit: 10,
      now: () => new Date(0),
      sleep: async () => undefined,
      signal: ac.signal,
    };
    const run = { bairro: 'Centro', cidade: 'Santos', uf: 'SP' };
    const rect = { low: { latitude: -24, longitude: -46.4 }, high: { latitude: -23.9, longitude: -46.3 } } as never;
    expect(await searchGooglePage(NICHE, run, rect, null, deps)).toEqual({ ok: false, kind: 'ABORTED' });
    expect(reserve).not.toHaveBeenCalled();
    expect(request).not.toHaveBeenCalled();
  });

  it('searchGooglePage: abort durante a espera de retentativa → ABORTED, sem 2ª requisição', async () => {
    const ac = new AbortController();
    const request = vi.fn(async () => ({ status: 503, json: null }));
    const sleep = vi.fn(() => new Promise<void>(() => undefined));
    const deps: GooglePlacesDeps = {
      http: { request } as unknown as PlacesHttp,
      usage: { reserve: vi.fn(async () => true), count: vi.fn(async () => 0) },
      limit: 10,
      now: () => new Date(0),
      sleep,
      signal: ac.signal,
    };
    const rect = { low: { latitude: -24, longitude: -46.4 }, high: { latitude: -23.9, longitude: -46.3 } } as never;
    const p = searchGooglePage(NICHE, { bairro: 'Centro', cidade: 'Santos', uf: 'SP' }, rect, null, deps);
    await waitFor(() => sleep.mock.calls.length === 1);
    ac.abort();
    expect(await p).toEqual({ ok: false, kind: 'ABORTED' });
    expect(request).toHaveBeenCalledTimes(1);
  });
});

describe('abort.ts', () => {
  it('sleepOrAbort: resolve sem abort e remove o listener; rejeita no abort', async () => {
    const ac = new AbortController();
    await expect(sleepOrAbort(async () => undefined, 10, ac.signal)).resolves.toBeUndefined();
    const pending = sleepOrAbort(() => new Promise(() => undefined), 10, ac.signal);
    ac.abort();
    await expect(pending).rejects.toBeInstanceOf(RunAbortedError);
    await expect(sleepOrAbort(async () => undefined, 10, ac.signal)).rejects.toBeInstanceOf(RunAbortedError);
  });

  it('timeoutSignal: dispara no abort externo e, sozinho, no timeout', async () => {
    const ac = new AbortController();
    const s = timeoutSignal(60_000, ac.signal);
    expect(s.aborted).toBe(false);
    ac.abort();
    expect(s.aborted).toBe(true);
    const t = timeoutSignal(5);
    await new Promise((r) => setTimeout(r, 30));
    expect(t.aborted).toBe(true);
  });
});

describe('fetchJsonClient (HTTP real com fetch simulado)', () => {
  it('repassa o cancelamento da mineração e mantém o timeout limite', async () => {
    const { fetchJsonClient } = await import('@/lib/leads/deps');
    const ac = new AbortController();
    let seen: AbortSignal | undefined;
    vi.stubGlobal(
      'fetch',
      vi.fn((_u: string, init: { signal: AbortSignal }) => {
        seen = init.signal;
        return hang(init.signal);
      }),
    );
    try {
      const p = fetchJsonClient.getJson('https://exemplo.test/x', { headers: {}, timeoutMs: 60_000, signal: ac.signal });
      p.catch(() => undefined);
      await waitFor(() => seen !== undefined);
      expect(seen?.aborted).toBe(false);
      ac.abort();
      await expect(p).rejects.toThrow();
      expect(seen?.aborted).toBe(true);

      // Sem sinal externo: só o timeout (que aborta sozinho).
      seen = undefined;
      const q = fetchJsonClient.getJson('https://exemplo.test/y', { headers: {}, timeoutMs: 10 });
      q.catch(() => undefined);
      await expect(q).rejects.toThrow();
      expect(seen?.aborted).toBe(true);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

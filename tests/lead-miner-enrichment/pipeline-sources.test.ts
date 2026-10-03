/**
 * Testes de exemplo do pipeline com as duas fontes (Etapa 3, tarefa 11.8), sem rede e sem banco.
 *
 * - Fonte_Google: `searchGooglePage` real sobre o cliente falso `fakePlaces` e o Portao_Uso em
 *   memória (`memoryUsageGate`) — assim a reserva por requisição/retentativa é a real (Req. 2.4).
 * - Fonte_OSM: `searchNiche` substituído por um roteiro por Nicho (a área já está gravada, então
 *   não há geocodificação).
 * - Repositório: `upsertGooglePlace`/`upsertFoundCompany` gravam num armazenamento em memória que
 *   une Google + OSM pelo mesmo nome (origem acumulada); `pruneGoogleChains` é o real, rodando
 *   sobre o Prisma falso (Req. 3.9).
 *
 * Requisitos: 4.3, 4.5, 4.6, 4.7, 4.8, 4.10, 3.5, 3.9, 2.4, 21.2.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Prisma, type PrismaClient } from '@prisma/client';
import type { FoundCompany, GooglePlace, SourceMode } from '@/lib/leads/types';

vi.mock('@/lib/leads/repository', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/leads/repository')>()),
  upsertGooglePlace: vi.fn(),
  upsertFoundCompany: vi.fn(),
}));
vi.mock('@/lib/leads/google-cache', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/leads/google-cache')>()),
  purgeExpiredGoogleCache: vi.fn(async () => 0),
}));
vi.mock('@/lib/leads/sources/osm', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/leads/sources/osm')>()),
  searchNiche: vi.fn(),
  geocode: vi.fn(async () => {
    throw new Error('geocode não deveria ser chamado (área já gravada)');
  }),
}));

import * as repo from '@/lib/leads/repository';
import * as osm from '@/lib/leads/sources/osm';
import { purgeExpiredGoogleCache } from '@/lib/leads/google-cache';
import { createRun, discoverStep, GOOGLE_PAGE_MARGIN_MS, type PipelineDeps } from '@/lib/leads/pipeline';
import { RETRY_DELAYS_MS } from '@/lib/leads/config';
import { SEARCH_TEXT_PATH } from '@/lib/leads/sources/google-places';
import { fakePlaces, rawPlace, searchPage, type FakePlaces, type PlacesRequest } from './support/fake-places';
import { memoryUsageGate, type MemoryUsageGate } from './support/fake-usage';
import type { ScriptStep } from './support/scripted';

const upsertGooglePlace = vi.mocked(repo.upsertGooglePlace);
const upsertFoundCompany = vi.mocked(repo.upsertFoundCompany);
const searchNiche = vi.mocked(osm.searchNiche);

const RUN_ID = 'run-1';
const MONTH = '2025-05';
const GOOGLE_NOW = new Date('2025-05-10T12:00:00Z');
const AREA = { kind: 'bbox', south: -23.6, west: -46.65, north: -23.58, east: -46.62 } as const;
/** Nichos usados nos testes, na ordem da mineração. */
const A = 'clinica_odontologica';
const B = 'advocacia';
const C = 'contabilidade';

// ---------------------------------------------------------------------------
// Armazenamento em memória + Prisma falso
// ---------------------------------------------------------------------------

interface FakeCompanyRow {
  id: string;
  nome: string;
  osmId: string | null;
  googlePlaceId: string | null;
  aliases: Array<{ source: string; externalId: string }>;
  googleCache: { placeId: string; nome: string } | null;
}
interface FakeLink {
  id: string;
  runId: string;
  companyId: string;
  origem: SourceMode;
  isNew: boolean;
  nicho: string;
}
interface Store {
  run: Record<string, unknown>;
  companies: Map<string, FakeCompanyRow>;
  links: FakeLink[];
  deletedCompanies: string[];
}

function runRow(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: RUN_ID,
    status: 'PENDENTE',
    bairro: 'Vila Mariana',
    cidade: 'São Paulo',
    uf: 'SP',
    area: AREA,
    nichos: [A, B],
    excluirRedes: false,
    processados: 0,
    total: 0,
    errorMessage: null,
    iaDisabledReason: null,
    iaEnabled: false,
    fonteSolicitada: 'MISTA',
    fonte: 'MISTA',
    googleMotivo: null,
    googleNichosAfetados: [],
    googleCursor: null,
    nichosProcessados: [],
    nichosFalhos: [],
    nichosGoogleProcessados: [],
    nichosGoogleFalhos: [],
    pagespeedEnabled: false,
    pagespeedMotivo: null,
    cnpjEnabled: false,
    lockedUntil: null,
    ...over,
  };
}

function newStore(run: Record<string, unknown> = {}): Store {
  return { run: runRow(run), companies: new Map(), links: [], deletedCompanies: [] };
}

/** `Prisma.DbNull` gravado vira null, como no banco. */
function applyData(target: Record<string, unknown>, data: Record<string, unknown>) {
  for (const [k, v] of Object.entries(data)) target[k] = v === Prisma.DbNull ? null : v;
}

function statusMatches(where: unknown, status: unknown): boolean {
  if (where === undefined) return true;
  if (typeof where === 'string') return where === status;
  const w = where as { in?: unknown[] };
  return Array.isArray(w.in) ? w.in.includes(status) : true;
}

function fakeDb(s: Store) {
  const withCompany = (l: FakeLink) => ({ ...l, company: s.companies.get(l.companyId) as FakeCompanyRow });
  const db = {
    miningRun: {
      findUnique: vi.fn(async () => ({ ...s.run })),
      findFirst: vi.fn(async () => null),
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({
        id: 'new-run',
        processados: 0,
        total: 0,
        errorMessage: null,
        nichosFalhos: [],
        googleNichosAfetados: [],
        ...data,
      })),
      update: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        applyData(s.run, data);
        return { ...s.run };
      }),
      updateMany: vi.fn(async ({ where, data }: { where: { status?: unknown }; data: Record<string, unknown> }) => {
        if (!statusMatches(where.status, s.run.status)) return { count: 0 };
        applyData(s.run, data);
        return { count: 1 };
      }),
    },
    miningRunCompany: {
      findMany: vi.fn(async (args: { where: { runId: string; origem?: string }; distinct?: string[] }) => {
        const rows = s.links.filter((l) => l.runId === args.where.runId && (!args.where.origem || l.origem === args.where.origem));
        if (args.distinct) return [...new Set(rows.map((l) => l.origem))].map((origem) => ({ origem }));
        return rows.map(withCompany);
      }),
      count: vi.fn(async () => s.links.length),
      groupBy: vi.fn(async () => {
        const novos = s.links.filter((l) => l.isNew).length;
        const out = [];
        if (novos) out.push({ isNew: true, _count: { _all: novos } });
        if (s.links.length - novos) out.push({ isNew: false, _count: { _all: s.links.length - novos } });
        return out;
      }),
      deleteMany: vi.fn(async ({ where }: { where: { id: { in: string[] } } }) => {
        const before = s.links.length;
        s.links = s.links.filter((l) => !where.id.in.includes(l.id));
        return { count: before - s.links.length };
      }),
    },
    company: {
      deleteMany: vi.fn(async ({ where }: { where: { id: { in: string[] } } }) => {
        const orphan = where.id.in.filter((id) => !s.links.some((l) => l.companyId === id));
        for (const id of orphan) s.companies.delete(id);
        s.deletedCompanies.push(...orphan);
        return { count: orphan.length };
      }),
    },
    // Lease da descoberta: concedido enquanto PENDENTE.
    $queryRaw: vi.fn(async () => (s.run.status === 'PENDENTE' ? [{ id: RUN_ID }] : [])),
    $executeRaw: vi.fn(async () => 1),
    $transaction: vi.fn(async (fn: (tx: unknown) => unknown) => fn(db)),
  };
  return db;
}

/**
 * Upserts falsos: une Google e OSM pela igualdade do nome (o Deduplicador real é coberto em
 * `dedup-sources.test.ts`); o vínculo acumula a origem (GOOGLE + OSM → MISTA).
 */
function installRepo(s: Store) {
  let seq = 0;
  const link = (runId: string, companyId: string, origem: 'GOOGLE' | 'OSM', isNew: boolean, nicho: string) => {
    const existing = s.links.find((l) => l.runId === runId && l.companyId === companyId);
    if (existing) {
      if (existing.origem !== origem) existing.origem = 'MISTA';
      return;
    }
    s.links.push({ id: `link-${++seq}`, runId, companyId, origem, isNew, nicho });
  };
  // Google casa com Empresa do OSM pelo nome; OSM casa com Empresa do Google pelo nome do cache.
  const osmByName = (nome: string) => [...s.companies.values()].find((c) => c.osmId !== null && c.nome === nome);
  const googleByName = (nome: string) =>
    [...s.companies.values()].find((c) => c.googlePlaceId !== null && c.googleCache?.nome === nome);

  upsertGooglePlace.mockImplementation(async (_db, runId, p: GooglePlace) => {
    let c = [...s.companies.values()].find((x) => x.googlePlaceId === p.placeId) ?? osmByName(p.nome);
    const isNew = !c;
    if (!c) {
      c = { id: `c-${++seq}`, nome: '', osmId: null, googlePlaceId: p.placeId, aliases: [], googleCache: null };
      s.companies.set(c.id, c);
    } else if (!c.googlePlaceId) c.googlePlaceId = p.placeId;
    c.googleCache = { placeId: p.placeId, nome: p.nome };
    link(runId, c.id, 'GOOGLE', isNew, p.nicho);
    return undefined as never;
  });
  upsertFoundCompany.mockImplementation(async (_db, runId, f: FoundCompany) => {
    let c = [...s.companies.values()].find((x) => x.osmId === f.osmId) ?? googleByName(f.nome);
    const isNew = !c;
    if (!c) {
      c = { id: `c-${++seq}`, nome: f.nome, osmId: f.osmId, googlePlaceId: null, aliases: [], googleCache: null };
      s.companies.set(c.id, c);
    } else if (!c.osmId) c.osmId = f.osmId;
    link(runId, c.id, 'OSM', isNew, f.nicho);
    return undefined as never;
  });
}

// ---------------------------------------------------------------------------
// Fontes falsas
// ---------------------------------------------------------------------------

function found(osmId: string, nome: string, nicho: string, over: Partial<FoundCompany> = {}): FoundCompany {
  return {
    osmId,
    nome,
    nicho,
    endereco: null,
    bairro: 'Vila Mariana',
    cidade: 'São Paulo',
    uf: 'SP',
    telefone: null,
    website: null,
    latitude: -23.59,
    longitude: -46.63,
    marcaRede: null,
    ...over,
  };
}

/** OSM por Nicho: lista de empresas ou `'FALHA'`. Nicho fora do roteiro → erro explícito. */
function scriptOsm(byNiche: Record<string, FoundCompany[] | 'FALHA'>) {
  searchNiche.mockImplementation(async (niche) => {
    const r = byNiche[niche.id];
    if (r === undefined) throw new Error(`OSM não deveria ser consultado para ${niche.id}`);
    return r === 'FALHA' ? { ok: false as const } : { ok: true as const, companies: r };
  });
}
const osmNiches = () => searchNiche.mock.calls.map((c) => c[0].id);

const place = (id: string, nome: string, over: Record<string, unknown> = {}) =>
  rawPlace({ id, displayName: { text: nome, languageCode: 'pt-BR' }, ...over });

interface Env {
  store: Store;
  db: ReturnType<typeof fakeDb>;
  deps: PipelineDeps;
  places: FakePlaces | null;
  usage: MemoryUsageGate;
  log: string[];
  sleeps: number[];
  clock: { t: number };
}

function setup(opts: {
  run?: Record<string, unknown>;
  places?: ReadonlyArray<ScriptStep<PlacesRequest>> | null;
  limit?: number;
  usedThisMonth?: number;
}): Env {
  const store = newStore(opts.run);
  installRepo(store);
  const db = fakeDb(store);
  const log: string[] = [];
  const sleeps: number[] = [];
  const clock = { t: 0 };
  const usage = memoryUsageGate(opts.usedThisMonth ? { [`places:${MONTH}`]: opts.usedThisMonth } : {}, log);
  const places = opts.places === null ? null : fakePlaces(opts.places ?? [], { log });
  const unused = () => {
    throw new Error('dependência não deveria ser chamada');
  };
  const deps: PipelineDeps = {
    db: db as unknown as PrismaClient,
    osm: { http: { getJson: unused }, limiter: { acquire: unused }, sleep: async () => undefined } as never,
    google: {
      http: places,
      usage,
      limit: opts.limit ?? 1000,
      now: () => GOOGLE_NOW,
      sleep: async (ms) => {
        sleeps.push(ms);
      },
    },
    site: {} as never,
    ai: { client: null, usage: {} as never, limit: 0, now: () => GOOGLE_NOW },
    pagespeed: { http: { run: unused }, usage: memoryUsageGate(), limit: 0, now: () => GOOGLE_NOW, hasKey: false } as never,
    cnpj: {} as never,
    now: () => clock.t,
    newToken: () => 'tok',
  };
  return { store, db, deps, places, usage, log, sleeps, clock };
}

/** Prazo folgado: um passo trata tudo. */
const FAR = 10 * 60_000;
const placesNames = (s: Store) =>
  [...s.companies.values()].filter((c) => c.googleCache).map((c) => c.googleCache?.nome).sort();

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});

// ---------------------------------------------------------------------------
// createRun: Google indisponível na criação (Req. 4.3)
// ---------------------------------------------------------------------------

describe('createRun — fonte solicitada × Google indisponível (Req. 4.3)', () => {
  const input = {
    bairro: 'Vila Mariana',
    cidade: 'São Paulo',
    uf: 'SP',
    nichos: [A],
    excluirRedes: false,
    iaEnabled: false,
    pagespeedEnabled: false,
    cnpjEnabled: false,
  };

  it('GOOGLE sem chave → grava OSM e SEM_CHAVE, sem reservar cota', async () => {
    const env = setup({ places: null });
    const progress = await createRun('user-1', { ...input, fonte: 'GOOGLE' }, env.deps);
    const data = env.db.miningRun.create.mock.calls[0][0].data;
    expect(data).toMatchObject({ fonteSolicitada: 'GOOGLE', fonte: 'OSM', googleMotivo: 'SEM_CHAVE' });
    expect(progress).toMatchObject({ fonteSolicitada: 'GOOGLE', fonte: 'OSM', googleMotivo: 'SEM_CHAVE' });
    expect(env.usage.reserveCalls).toHaveLength(0);
  });

  it('MISTA com cota do mês esgotada → grava OSM e COTA_ESGOTADA', async () => {
    const env = setup({ places: [], limit: 5, usedThisMonth: 5 });
    await createRun('user-1', { ...input, fonte: 'MISTA' }, env.deps);
    const data = env.db.miningRun.create.mock.calls[0][0].data;
    expect(data).toMatchObject({ fonteSolicitada: 'MISTA', fonte: 'OSM', googleMotivo: 'COTA_ESGOTADA' });
    expect(env.places?.calls).toHaveLength(0);
  });

  it('MISTA com Google disponível → fonte provisória MISTA, sem motivo', async () => {
    const env = setup({ places: [], limit: 5, usedThisMonth: 4 });
    await createRun('user-1', { ...input, fonte: 'MISTA' }, env.deps);
    expect(env.db.miningRun.create.mock.calls[0][0].data).toMatchObject({ fonte: 'MISTA', googleMotivo: null });
  });
});

// ---------------------------------------------------------------------------
// Fallback por Nicho (Req. 4.5, 4.6, 3.7, 3.8, 2.4)
// ---------------------------------------------------------------------------

describe('discoverStep — fallback do Google para o OSM', () => {
  it('sem chave (motivo gravado na criação): todos os Nichos pelo OSM, nenhuma chamada ao Google', async () => {
    const env = setup({
      places: null,
      run: { fonteSolicitada: 'GOOGLE', fonte: 'OSM', googleMotivo: 'SEM_CHAVE' },
    });
    scriptOsm({ [A]: [found('node/1', 'Dente Feliz', A)], [B]: [found('node/2', 'Silva Advogados', B)] });

    const p = await discoverStep(RUN_ID, env.deps, FAR);

    expect(osmNiches()).toEqual([A, B]);
    expect(env.usage.reserveCalls).toHaveLength(0);
    expect(p).toMatchObject({
      status: 'EM_ANDAMENTO',
      total: 2,
      fonteSolicitada: 'GOOGLE',
      fonte: 'OSM',
      googleMotivo: 'SEM_CHAVE',
      googleNichosAfetados: [A, B],
      nichosFalhos: [],
    });
    expect(purgeExpiredGoogleCache).toHaveBeenCalledTimes(1);
  });

  it('chave removida depois da criação: o 1º Nicho já marca SEM_CHAVE e o resto segue pelo OSM', async () => {
    const env = setup({ places: null, run: { fonteSolicitada: 'GOOGLE', fonte: 'GOOGLE' } });
    scriptOsm({ [A]: [found('node/1', 'Dente Feliz', A)], [B]: [] });

    const p = await discoverStep(RUN_ID, env.deps, FAR);

    expect(osmNiches()).toEqual([A, B]);
    expect(env.store.run.nichosGoogleFalhos).toEqual([A]); // B nem foi tentado no Google
    expect(p).toMatchObject({ googleMotivo: 'SEM_CHAVE', googleNichosAfetados: [A, B], fonte: 'OSM' });
  });

  it('cota esgotada no meio (GOOGLE): Nicho atendido não vai ao OSM; os restantes vão; nada é enviado sem reserva', async () => {
    const env = setup({
      run: { fonteSolicitada: 'GOOGLE', fonte: 'GOOGLE', nichos: [A, B, C] },
      places: [searchPage([place('g-1', 'Dente Feliz')])],
      limit: 1,
    });
    scriptOsm({ [B]: [found('node/2', 'Silva Advogados', B)], [C]: [found('node/3', 'Conta Certa', C)] });

    const p = await discoverStep(RUN_ID, env.deps, FAR);

    expect(env.places?.calls).toHaveLength(1);
    // A: 1 reserva concedida; B: 1 negada (sem envio); C: Google já indisponível, nem reserva.
    expect(env.usage.reserveCalls.map((r) => r.granted)).toEqual([true, false]);
    expect(env.log).toEqual(['reserve:places:ok', `places:${SEARCH_TEXT_PATH}`, 'reserve:places:negada']);
    expect(osmNiches()).toEqual([B, C]);
    expect(p).toMatchObject({
      googleMotivo: 'COTA_ESGOTADA',
      googleNichosAfetados: [B, C],
      fonte: 'MISTA', // Google em A e OSM em B/C (Req. 4.7)
      total: 3,
      nichosFalhos: [],
    });
    expect(env.store.run.nichosGoogleProcessados).toEqual([A]);
    expect(env.store.run.nichosGoogleFalhos).toEqual([B]);
  });

  it('429/5xx esgotados: 3 tentativas com 2 s e 4 s, 1 reserva por tentativa; só o Nicho cai no OSM', async () => {
    const env = setup({
      run: { fonteSolicitada: 'GOOGLE', fonte: 'GOOGLE' },
      places: [{ status: 429 }, { status: 503 }, { status: 500 }, searchPage([place('g-2', 'Silva Advogados')])],
    });
    scriptOsm({ [A]: [found('node/1', 'Dente Feliz', A)] });

    const p = await discoverStep(RUN_ID, env.deps, FAR);

    expect(env.sleeps).toEqual([...RETRY_DELAYS_MS]);
    expect(env.places?.calls).toHaveLength(4);
    expect(env.usage.reserveCalls).toHaveLength(4);
    expect(env.usage.peek('places', MONTH)).toBe(4);
    // Reserva sempre antes de cada envio, inclusive nas retentativas (Req. 2.4, 3.7).
    expect(env.log).toEqual(Array(4).fill(['reserve:places:ok', `places:${SEARCH_TEXT_PATH}`]).flat());
    expect(osmNiches()).toEqual([A]); // B atendido pelo Google não vai ao OSM em GOOGLE (Req. 4.5)
    expect(p).toMatchObject({
      googleMotivo: null, // falha transitória não torna o Google indisponível
      googleNichosAfetados: [A],
      fonte: 'MISTA',
      total: 2,
      nichosFalhos: [],
    });
  });

  it.each([401, 403])('%i: não repete, Google indisponível (ERRO) no restante, Nichos concluídos pelo OSM', async (status) => {
    const env = setup({ run: { fonteSolicitada: 'GOOGLE', fonte: 'GOOGLE' }, places: [{ status }] });
    scriptOsm({ [A]: [found('node/1', 'Dente Feliz', A)], [B]: [found('node/2', 'Silva Advogados', B)] });

    const p = await discoverStep(RUN_ID, env.deps, FAR);

    expect(env.places?.calls).toHaveLength(1);
    expect(env.usage.reserveCalls).toHaveLength(1);
    expect(env.sleeps).toEqual([]);
    expect(osmNiches()).toEqual([A, B]);
    expect(p).toMatchObject({ googleMotivo: 'ERRO', googleNichosAfetados: [A, B], fonte: 'OSM', total: 2 });
  });
});

// ---------------------------------------------------------------------------
// Fonte_Efetiva (Req. 4.7)
// ---------------------------------------------------------------------------

describe('discoverStep — Fonte_Efetiva', () => {
  it('GOOGLE: só o Google atendeu (OSM não consultado)', async () => {
    const env = setup({
      run: { fonteSolicitada: 'GOOGLE', fonte: 'GOOGLE' },
      places: [searchPage([place('g-1', 'Dente Feliz')]), searchPage([place('g-2', 'Silva Advogados')])],
    });
    scriptOsm({});

    const p = await discoverStep(RUN_ID, env.deps, FAR);

    expect(searchNiche).not.toHaveBeenCalled();
    expect(p).toMatchObject({ status: 'EM_ANDAMENTO', fonte: 'GOOGLE', total: 2, googleNichosAfetados: [] });
  });

  it('OSM: modo OSM nunca consulta o Google', async () => {
    const env = setup({ run: { fonteSolicitada: 'OSM', fonte: 'OSM' }, places: [] });
    scriptOsm({ [A]: [found('node/1', 'Dente Feliz', A)], [B]: [] });

    const p = await discoverStep(RUN_ID, env.deps, FAR);

    expect(env.usage.reserveCalls).toHaveLength(0);
    expect(p).toMatchObject({ fonte: 'OSM', total: 1, googleMotivo: null, googleNichosAfetados: [] });
  });

  it('MISTA: cada Nicho nas duas fontes; a mesma empresa nas duas vira um vínculo MISTA', async () => {
    const env = setup({
      run: { nichos: [A] },
      places: [searchPage([place('g-1', 'Dente Feliz'), place('g-2', 'Sorriso Total')])],
    });
    scriptOsm({ [A]: [found('node/1', 'Dente Feliz', A), found('node/9', 'Odonto Bairro', A)] });

    const p = await discoverStep(RUN_ID, env.deps, FAR);

    expect(osmNiches()).toEqual([A]);
    expect(env.store.links.map((l) => l.origem).sort()).toEqual(['GOOGLE', 'MISTA', 'OSM']);
    expect(p).toMatchObject({ fonte: 'MISTA', total: 3, googleNichosAfetados: [] });
  });

  it('MISTA solicitada sem nenhum resultado do OSM e com o Google atendendo → GOOGLE', async () => {
    const env = setup({ run: { nichos: [A] }, places: [searchPage([place('g-1', 'Dente Feliz')])] });
    scriptOsm({ [A]: [] });

    const p = await discoverStep(RUN_ID, env.deps, FAR);

    expect(p).toMatchObject({ fonteSolicitada: 'MISTA', fonte: 'GOOGLE', total: 1 });
  });
});

// ---------------------------------------------------------------------------
// Paginação retomável (Req. 4.10, 3.3) e descarte (Req. 3.5)
// ---------------------------------------------------------------------------

describe('discoverStep — paginação do Google', () => {
  it('para entre páginas sem tempo, grava o cursor e o próximo passo retoma com o pageToken', async () => {
    const STEP = 50_000;
    let env!: Env;
    env = setup({
      run: { fonteSolicitada: 'GOOGLE', fonte: 'GOOGLE', nichos: [A] },
      places: [
        () => {
          env.clock.t += STEP - GOOGLE_PAGE_MARGIN_MS + 1; // sobra menos que a margem de uma página
          return searchPage([place('g-1', 'Dente Feliz')], 'token-p2');
        },
        searchPage([place('g-2', 'Sorriso Total')], 'token-p3'),
        searchPage([place('g-3', 'Odonto Vila')], 'token-p4'), // 3ª página: o token é ignorado
      ],
    });
    scriptOsm({});

    // Passo 1: só a 1ª página; descoberta ainda PENDENTE com cursor gravado e lease liberado.
    const p1 = await discoverStep(RUN_ID, env.deps, STEP);
    expect(env.places?.calls).toHaveLength(1);
    expect(p1.status).toBe('PENDENTE');
    expect(env.store.run.googleCursor).toEqual({ nicheId: A, page: 1, pageToken: 'token-p2' });
    expect(env.store.run.nichosProcessados).toEqual([]);
    expect(env.store.run.lockedUntil).toBeNull();

    // Passo 2: retoma do cursor; páginas 2 e 3 e para no máximo de 3 páginas (Req. 3.3).
    const p2 = await discoverStep(RUN_ID, env.deps, env.clock.t + FAR);
    const bodies = env.places?.calls.map((c) => (c.body as { pageToken?: string }).pageToken);
    expect(bodies).toEqual([undefined, 'token-p2', 'token-p3']);
    expect(env.places?.remaining()).toBe(0);
    expect(env.usage.reserveCalls).toHaveLength(3); // 1 reserva por página
    expect(p2).toMatchObject({ status: 'EM_ANDAMENTO', total: 3, fonte: 'GOOGLE' });
    expect(env.store.run.googleCursor).toBeNull();
    expect(env.store.run.nichosGoogleProcessados).toEqual([A]);
  });

  it('descarta CLOSED_PERMANENTLY e nome vazio sem contá-los no total', async () => {
    const env = setup({
      run: { fonteSolicitada: 'GOOGLE', fonte: 'GOOGLE', nichos: [A] },
      places: [
        searchPage([
          place('g-1', 'Dente Feliz'),
          place('g-2', 'Clínica Fechada', { businessStatus: 'CLOSED_PERMANENTLY' }),
          place('g-3', '   '),
          place('g-4', 'Sorriso Temporário', { businessStatus: 'CLOSED_TEMPORARILY' }),
        ]),
      ],
    });
    scriptOsm({});

    const p = await discoverStep(RUN_ID, env.deps, FAR);

    expect(upsertGooglePlace.mock.calls.map((c) => c[2].placeId)).toEqual(['g-1', 'g-4']);
    expect(p.total).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// Rede no Google (Req. 3.9)
// ---------------------------------------------------------------------------

describe('discoverStep — Rede por 3 nomes iguais no Google', () => {
  const script = () => [
    // A: dois lugares da rede; B: o terceiro (só somando os Nichos chega a 3) + dois de outra marca.
    searchPage([place('g-1', 'Rede Sorriso'), place('g-2', 'REDE SORRISO'), place('g-3', 'Dente Feliz')]),
    searchPage([place('g-4', 'Rede  Sorríso'), place('g-5', 'Silva Advogados'), place('g-6', 'Silva Advogados')]),
  ];

  it('com "excluir redes": remove os 3 lugares de mesmo Nome_Normalizado entre Nichos, antes do total', async () => {
    const env = setup({ run: { fonteSolicitada: 'GOOGLE', fonte: 'GOOGLE', excluirRedes: true }, places: script() });
    scriptOsm({});

    const p = await discoverStep(RUN_ID, env.deps, FAR);

    expect(placesNames(env.store)).toEqual(['Dente Feliz', 'Silva Advogados', 'Silva Advogados']);
    expect(env.store.deletedCompanies).toHaveLength(3); // criadas por esta Mineracao, sem outros vínculos
    expect(p).toMatchObject({ total: 3, status: 'EM_ANDAMENTO', fonte: 'GOOGLE' });
  });

  it('sem "excluir redes": nada é podado', async () => {
    const env = setup({ run: { fonteSolicitada: 'GOOGLE', fonte: 'GOOGLE', excluirRedes: false }, places: script() });
    scriptOsm({});

    const p = await discoverStep(RUN_ID, env.deps, FAR);

    expect(p.total).toBe(6);
    expect(env.store.deletedCompanies).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Nicho falho nas duas fontes (Req. 4.8)
// ---------------------------------------------------------------------------

describe('discoverStep — Nicho falho', () => {
  it('falho no Google e no OSM → nichosFalhos; os outros seguem e a mineração continua', async () => {
    const env = setup({
      run: { fonteSolicitada: 'MISTA', fonte: 'MISTA' },
      places: [{ status: 500 }, { status: 500 }, { error: 'timeout' }, searchPage([place('g-2', 'Silva Advogados')])],
    });
    scriptOsm({ [A]: 'FALHA', [B]: 'FALHA' });

    const p = await discoverStep(RUN_ID, env.deps, FAR);

    // B: OSM falhou, mas o Google atendeu → não é falho (Req. 4.8).
    expect(p).toMatchObject({ status: 'EM_ANDAMENTO', nichosFalhos: [A], total: 1, googleNichosAfetados: [A] });
    expect(env.store.run.nichosProcessados).toEqual([B]);
  });

  it('todos os Nichos falhos nas duas fontes → ERRO (regra da Etapa 1)', async () => {
    const env = setup({ run: { fonteSolicitada: 'MISTA', fonte: 'MISTA', nichos: [A] }, places: [{ status: 400 }] });
    scriptOsm({ [A]: 'FALHA' });

    const p = await discoverStep(RUN_ID, env.deps, FAR);

    expect(p).toMatchObject({ status: 'ERRO', nichosFalhos: [A], googleMotivo: 'ERRO', total: 0 });
    expect(p.errorMessage).toBeTruthy();
  });
});

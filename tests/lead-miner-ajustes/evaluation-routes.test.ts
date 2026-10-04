/**
 * T5 — rotas POST /companies/evaluate e POST /runs/[id]/evaluate (offline).
 * Cobre 401/403 sem efeitos, validação do corpo, 404/409 e o caminho feliz sem chave (regras).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

let currentUserId: string | null = null;
let actor: Record<string, unknown> | null = null;
const store = {
  run: null as null | Record<string, unknown>,
  rows: [] as unknown[],
  touched: vi.fn(),
  updates: [] as Array<{ where: { id: string }; data: Record<string, unknown> }>,
};

vi.mock('server-only', () => ({}));
vi.mock('@/auth', () => ({ auth: async () => (currentUserId ? { user: { id: currentUserId } } : null) }));
vi.mock('@/lib/users', () => ({ findUserDTO: async (id: string) => (actor ? { ...actor, id } : null) }));
vi.mock('@/lib/leads/deps', () => ({
  getEvaluationDeps: () => ({
    client: null, // sem GEMINI_API_KEY: avaliação por regras
    usage: { reserve: async () => true, count: async () => 0 },
    limit: 10,
    now: () => new Date('2026-10-20T12:00:00Z'),
  }),
}));
vi.mock('@/lib/prisma', () => {
  const db = {
    company: {
      findMany: vi.fn(async () => {
        store.touched();
        return store.rows;
      }),
      count: vi.fn(async () => 0),
      update: vi.fn(async (a: { where: { id: string }; data: Record<string, unknown> }) => {
        store.updates.push(a);
        return {};
      }),
    },
    miningRun: { findUnique: vi.fn(async () => store.run) },
  };
  return { prisma: db };
});

const NEGOCIOS = (over: Record<string, unknown> = {}) => ({
  status: 'ATIVO',
  globalRole: null,
  departmentCode: 'NEGOCIOS',
  departmentRole: 'ASSESSOR',
  sectors: [],
  name: 'Ana',
  ...over,
});

const UUID_A = '7c9e6679-7425-40de-944b-e07fc1f90ae7';
const UUID_B = '9b2f6a7a-1d0a-4f4e-8a39-0d6a3a5f0c11';

async function evaluate(body: unknown) {
  const { POST } = await import('@/app/api/tools/lead-miner/companies/evaluate/route');
  const res = await POST(
    new Request('http://localhost/x', { method: 'POST', body: JSON.stringify(body), headers: { 'content-type': 'application/json' } }),
    { params: {} } as never,
  );
  return { status: res.status, body: (await res.json()) as Record<string, any> };
}

async function evaluateRun() {
  const { POST } = await import('@/app/api/tools/lead-miner/runs/[id]/evaluate/route');
  const res = await POST(new Request('http://localhost/x', { method: 'POST' }), { params: { id: 'r1' } });
  return { status: res.status, body: (await res.json()) as Record<string, any> };
}

beforeEach(() => {
  currentUserId = 'u1';
  actor = NEGOCIOS();
  store.run = { status: 'CONCLUIDA', createdAt: new Date('2026-10-20T10:00:00Z') };
  store.rows = [];
  store.updates = [];
  store.touched.mockClear();
});
afterEach(() => vi.resetModules());

describe('POST /companies/evaluate', () => {
  it('sem sessão → 401 e nada é consultado', async () => {
    currentUserId = null;
    expect((await evaluate({ ids: [UUID_A] })).status).toBe(401);
    expect(store.touched).not.toHaveBeenCalled();
  });

  it('fora de Negócios → 403 e nada é consultado', async () => {
    actor = NEGOCIOS({ departmentCode: 'GENTE' });
    expect((await evaluate({ ids: [UUID_A] })).status).toBe(403);
    expect(store.touched).not.toHaveBeenCalled();
  });

  it.each([
    ['sem ids', {}],
    ['lista vazia', { ids: [] }],
    ['id inválido', { ids: ['x'] }],
    ['repetidos', { ids: [UUID_A, UUID_A] }],
    ['mais de 30', { ids: Array.from({ length: 31 }, (_, i) => `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`) }],
  ])('corpo inválido (%s) → 400', async (_n, body) => {
    expect((await evaluate(body)).status).toBe(400);
    expect(store.touched).not.toHaveBeenCalled();
  });

  it('sem chave de IA: avalia por regras e grava com fonte REGRA', async () => {
    store.rows = [
      { id: UUID_A, nome: 'Loja A', nicho: 'clinica_odontologica', bairro: 'Centro', cidade: 'Santos', website: null, hasSite: false, isHttps: null, analyses: [] },
    ];
    const r = await evaluate({ ids: [UUID_A, UUID_B] });
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ avaliados: 1, porIa: 0, porRegra: 1, motivoSemIa: 'IA_SEM_CHAVE' });
    expect(store.updates).toHaveLength(1);
    expect(store.updates[0].data).toMatchObject({ fonteAvaliacao: 'REGRA' });
  });

  it('ignora campos de autor enviados pelo cliente (o ator vem da sessão)', async () => {
    const r = await evaluate({ ids: [UUID_A], userId: 'outro', authorId: 'outro' });
    expect(r.status).toBe(200);
  });
});

describe('POST /runs/[id]/evaluate', () => {
  it('sem sessão → 401; fora de Negócios → 403', async () => {
    currentUserId = null;
    expect((await evaluateRun()).status).toBe(401);
    currentUserId = 'u1';
    actor = NEGOCIOS({ departmentCode: 'GENTE' });
    expect((await evaluateRun()).status).toBe(403);
    expect(store.touched).not.toHaveBeenCalled();
  });

  it('mineração inexistente → 404', async () => {
    store.run = null;
    expect((await evaluateRun()).status).toBe(404);
  });

  it('mineração em andamento → 409 (só avalia ao concluir)', async () => {
    store.run = { status: 'EM_ANDAMENTO', createdAt: new Date() };
    expect((await evaluateRun()).status).toBe(409);
    expect(store.touched).not.toHaveBeenCalled();
  });

  it('mineração concluída sem pendentes → 200 com zeros', async () => {
    const r = await evaluateRun();
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ avaliados: 0, restantes: 0 });
  });
});

/**
 * T3 — rotas: ordenação "recentes" na listagem e contador `comContato` no detalhe da mineração.
 * Prisma simulado (offline).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const captured = { orderBy: undefined as unknown, countWhere: undefined as unknown };

vi.mock('server-only', () => ({}));
vi.mock('@/auth', () => ({ auth: async () => ({ user: { id: 'u1' } }) }));
vi.mock('@/lib/users', () => ({
  findUserDTO: async (id: string) => ({
    id,
    name: 'Ana',
    status: 'ATIVO',
    globalRole: null,
    departmentCode: 'NEGOCIOS',
    departmentRole: 'ASSESSOR',
    sectors: [],
  }),
}));
vi.mock('@/lib/leads/google-cache', () => ({ purgeExpiredGoogleCache: async () => undefined }));
vi.mock('@/lib/prisma', () => {
  const runRow = {
    id: 'r1',
    status: 'EM_ANDAMENTO',
    processados: 2,
    total: 5,
    errorMessage: null,
    nichosFalhos: [],
    iaDisabledReason: null,
    fonteSolicitada: 'OSM',
    fonte: 'OSM',
    googleMotivo: null,
    googleNichosAfetados: [],
    pagespeedEnabled: false,
    pagespeedMotivo: null,
    cnpjEnabled: false,
    bairro: 'Centro',
    cidade: 'Santos',
    uf: 'SP',
    iaEnabled: false,
    createdAt: new Date('2026-10-20T12:00:00Z'),
    finishedAt: null,
    createdBy: { id: 'u1', name: 'Ana' },
  };
  const db = {
    company: {
      findMany: vi.fn(async ({ orderBy }: { orderBy: unknown }) => {
        captured.orderBy = orderBy;
        return [];
      }),
      count: vi.fn(async () => 0),
    },
    miningRun: { findUnique: vi.fn(async () => runRow) },
    miningRunCompany: {
      groupBy: vi.fn(async () => [
        { isNew: true, _count: { _all: 3 } },
        { isNew: false, _count: { _all: 2 } },
      ]),
      count: vi.fn(async ({ where }: { where: unknown }) => {
        captured.countWhere = where;
        return 4;
      }),
    },
    $transaction: async (ops: Promise<unknown>[]) => Promise.all(ops),
  };
  return { prisma: db };
});

beforeEach(() => {
  captured.orderBy = undefined;
  captured.countWhere = undefined;
});
afterEach(() => vi.resetModules());

async function list(qs: string) {
  const { GET } = await import('@/app/api/tools/lead-miner/companies/route');
  return GET(new Request(`http://localhost/api/tools/lead-miner/companies?${qs}`), { params: {} } as never);
}

describe('GET /companies — ordem', () => {
  it('padrão: score desc (sem análise ao final)', async () => {
    await list('');
    expect(captured.orderBy).toEqual([
      { scoreFinal: { sort: 'desc', nulls: 'last' } },
      { nomeExibicao: 'asc' },
      { id: 'asc' },
    ]);
  });

  it('ordem=recentes: mais recentemente atualizadas primeiro', async () => {
    const res = await list('ordem=recentes');
    expect(res.status).toBe(200);
    expect(captured.orderBy).toEqual([{ updatedAt: 'desc' }, { id: 'asc' }]);
  });

  it('ordem inválida → 400', async () => {
    expect((await list('ordem=nome')).status).toBe(400);
  });
});

describe('GET /runs/[id] — contadores ao vivo', () => {
  it('traz comContato, novos/existentes e processados', async () => {
    const { GET } = await import('@/app/api/tools/lead-miner/runs/[id]/route');
    const res = await GET(new Request('http://localhost/x'), { params: { id: 'r1' } });
    const body = (await res.json()) as Record<string, unknown>;
    expect(res.status).toBe(200);
    expect(body).toMatchObject({ comContato: 4, novos: 3, existentes: 2, processados: 2, status: 'EM_ANDAMENTO' });
    // mesma regra da aba "Com contato", restrita a esta mineração
    expect(JSON.stringify(captured.countWhere)).toContain('"runId":"r1"');
    expect(JSON.stringify(captured.countWhere)).toContain('temContato');
  });
});

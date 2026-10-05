/**
 * T1 — POST /api/tools/lead-miner/runs/[id]/cancel (offline: sessão, ator e Prisma simulados).
 * Cobre 401/403 (sem efeitos), 200, idempotência, 409 em mineração terminada e 404.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

let currentUserId: string | null = null;
let actor: Record<string, unknown> | null = null;
const store = { run: null as null | Record<string, unknown>, linked: 5, destructive: vi.fn(), audits: [] as unknown[] };

vi.mock('server-only', () => ({}));
vi.mock('@/auth', () => ({ auth: async () => (currentUserId ? { user: { id: currentUserId } } : null) }));
vi.mock('@/lib/users', () => ({ findUserDTO: async (id: string) => (actor ? { ...actor, id } : null) }));
vi.mock('@/lib/prisma', () => {
  const db: Record<string, unknown> = {
    miningRun: {
      findUnique: vi.fn(async () => (store.run ? { ...store.run } : null)),
      updateMany: vi.fn(async ({ where, data }: { where: { status: { in: string[] } }; data: Record<string, unknown> }) => {
        if (!store.run || !where.status.in.includes(store.run.status as string)) return { count: 0 };
        store.run = { ...store.run, ...data };
        return { count: 1 };
      }),
      delete: (...a: unknown[]) => store.destructive(...a),
      deleteMany: (...a: unknown[]) => store.destructive(...a),
    },
    miningRunCompany: {
      count: vi.fn(async () => store.linked),
      groupBy: vi.fn(async () => []),
      deleteMany: (...a: unknown[]) => store.destructive(...a),
    },
    company: { deleteMany: (...a: unknown[]) => store.destructive(...a) },
    auditLog: {
      create: vi.fn(async ({ data }: { data: unknown }) => {
        store.audits.push(data);
        return {};
      }),
    },
  };
  db.$transaction = async (fn: (tx: unknown) => unknown) => fn(db);
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

const runRow = (status: string, over: Record<string, unknown> = {}) => ({
  id: 'r1',
  status,
  createdById: 'u-creator',
  processados: 2,
  total: 5,
  errorMessage: null,
  nichosFalhos: [],
  iaDisabledReason: null,
  ...over,
});

async function cancel() {
  const { POST } = await import('@/app/api/tools/lead-miner/runs/[id]/cancel/route');
  const res = await POST(new Request('http://localhost/x', { method: 'POST' }), { params: { id: 'r1' } });
  return { status: res.status, body: (await res.json()) as Record<string, any> };
}

beforeEach(() => {
  currentUserId = 'u-creator';
  actor = NEGOCIOS();
  store.run = runRow('EM_ANDAMENTO');
  store.linked = 5;
  store.destructive.mockClear();
  store.audits = [];
});
afterEach(() => vi.resetModules());

describe('POST /runs/[id]/cancel', () => {
  it('sem sessão → 401', async () => {
    currentUserId = null;
    expect((await cancel()).status).toBe(401);
    expect(store.run?.status).toBe('EM_ANDAMENTO');
  });

  it('fora de Negócios → 403 sem alterar a mineração', async () => {
    actor = NEGOCIOS({ departmentCode: 'GENTE' });
    const r = await cancel();
    expect(r.status).toBe(403);
    expect(store.run?.status).toBe('EM_ANDAMENTO');
  });

  it('assessor de Negócios que não iniciou a mineração → 403 sem alterar nada', async () => {
    currentUserId = 'u-outro';
    const r = await cancel();
    expect(r.status).toBe(403);
    expect(store.run?.status).toBe('EM_ANDAMENTO');
    expect(store.audits).toHaveLength(0);
  });

  it('quem iniciou → 200 CANCELADA, com "N de M processados" e nada apagado', async () => {
    const r = await cancel();
    expect(r.status).toBe(200);
    expect(r.body.status).toBe('CANCELADA');
    expect(r.body.processados).toBe(2);
    expect(r.body.total).toBe(5);
    expect(store.destructive).not.toHaveBeenCalled();
    expect(store.audits).toHaveLength(1);
  });

  it.each([
    ['gerência de Negócios', { departmentRole: 'GERENTE' }],
    ['Presidente', { departmentCode: null, departmentRole: null, globalRole: 'PRESIDENTE' }],
    ['Vice-presidente', { departmentCode: null, departmentRole: null, globalRole: 'VICE_PRESIDENTE' }],
  ])('%s pode parar a mineração de outra pessoa', async (_n, over) => {
    currentUserId = 'u-outro';
    actor = NEGOCIOS(over);
    expect((await cancel()).status).toBe(200);
    expect(store.run?.status).toBe('CANCELADA');
  });

  it('cancelar duas vezes não falha (200 nas duas) e audita uma vez', async () => {
    expect((await cancel()).status).toBe(200);
    expect((await cancel()).status).toBe(200);
    expect(store.audits).toHaveLength(1);
  });

  it.each(['CONCLUIDA', 'ERRO'])('mineração %s → 409 e permanece como está', async (status) => {
    store.run = runRow(status);
    const r = await cancel();
    expect(r.status).toBe(409);
    expect(r.body.error).toMatch(/já terminou/);
    expect(store.run?.status).toBe(status);
  });

  it('mineração inexistente → 404', async () => {
    store.run = null;
    expect((await cancel()).status).toBe(404);
  });
});

/** Etapa 4 (D1) — GET /api/health: caminho simples sem efeitos e modo `deep` restrito. */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const state = {
  actor: null as null | Record<string, unknown>,
  dbFails: false,
  touched: vi.fn(),
};

vi.mock('server-only', () => ({}));
vi.mock('@/lib/api', () => ({
  getActor: async () => {
    state.touched('auth');
    return state.actor;
  },
}));
vi.mock('@/lib/prisma', () => ({
  prisma: {
    $queryRaw: async () => {
      state.touched('db');
      if (state.dbFails) throw new Error('connect ECONNREFUSED postgresql://user:senha@host/db');
      return [{ '?column?': 1 }];
    },
  },
}));

const call = async (qs = '') => {
  const { GET } = await import('@/app/api/health/route');
  const res = await GET(new Request(`http://localhost/api/health${qs}`));
  return { status: res.status, body: (await res.json()) as Record<string, unknown>, cache: res.headers.get('cache-control') };
};

const PRESIDENTE = { id: 'u1', status: 'ATIVO', globalRole: 'PRESIDENTE', departmentCode: null };
const ASSESSOR = { id: 'u2', status: 'ATIVO', globalRole: null, departmentCode: 'NEGOCIOS' };

beforeEach(() => {
  state.actor = null;
  state.dbFails = false;
  state.touched.mockClear();
});
afterEach(() => vi.resetModules());

describe('GET /api/health', () => {
  it('simples: 200 { status: ok } sem tocar em banco nem sessão, sem cache', async () => {
    const r = await call();
    expect(r).toMatchObject({ status: 200, body: { status: 'ok' }, cache: 'no-store' });
    expect(state.touched).not.toHaveBeenCalled();
  });

  it('deep=0 ou valores diferentes de 1 também são o caminho simples', async () => {
    for (const qs of ['?deep=0', '?deep=true', '?deep=']) {
      expect((await call(qs)).status).toBe(200);
    }
    expect(state.touched).not.toHaveBeenCalled();
  });

  it('deep sem sessão → 401 e não consulta o banco', async () => {
    const r = await call('?deep=1');
    expect(r.status).toBe(401);
    expect(state.touched).not.toHaveBeenCalledWith('db');
  });

  it('deep com usuário comum → 403 e não consulta o banco', async () => {
    state.actor = ASSESSOR;
    const r = await call('?deep=1');
    expect(r.status).toBe(403);
    expect(state.touched).not.toHaveBeenCalledWith('db');
  });

  it('deep inativo (mesmo com cargo global) → 403', async () => {
    state.actor = { ...PRESIDENTE, status: 'INATIVO' };
    expect((await call('?deep=1')).status).toBe(403);
  });

  it('deep com Presidente/Vice: consulta o banco e responde 200', async () => {
    state.actor = PRESIDENTE;
    const r = await call('?deep=1');
    expect(r).toMatchObject({ status: 200, body: { status: 'ok', database: 'ok' } });
    expect(state.touched).toHaveBeenCalledWith('db');
  });

  it('deep com banco fora do ar → 503 genérico, sem vazar o erro', async () => {
    state.actor = PRESIDENTE;
    state.dbFails = true;
    const r = await call('?deep=1');
    expect(r.status).toBe(503);
    expect(JSON.stringify(r.body)).not.toMatch(/senha|postgresql|ECONNREFUSED|host/);
  });
});

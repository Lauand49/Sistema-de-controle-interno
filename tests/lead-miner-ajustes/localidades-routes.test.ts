/**
 * T2 — rotas GET /localidades/cidades e /localidades/bairros (offline): 401/403, UF inválida
 * rejeitada no servidor (400 com fields), formato das respostas e fallback `indisponivel`.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

let currentUserId: string | null = 'u1';
let actor: Record<string, unknown> | null = null;
const cities = { list: vi.fn() };
const bairros = { list: vi.fn() };

vi.mock('server-only', () => ({}));
vi.mock('@/auth', () => ({ auth: async () => (currentUserId ? { user: { id: currentUserId } } : null) }));
vi.mock('@/lib/users', () => ({ findUserDTO: async (id: string) => (actor ? { ...actor, id } : null) }));
vi.mock('@/lib/prisma', () => ({ prisma: {} }));
vi.mock('@/lib/leads/deps', () => ({ getLocalidadesServices: () => ({ cities, bairros }) }));

const NEGOCIOS = { status: 'ATIVO', globalRole: null, departmentCode: 'NEGOCIOS', departmentRole: 'ASSESSOR', sectors: [] };

async function call(path: 'cidades' | 'bairros', query: string) {
  const mod =
    path === 'cidades'
      ? await import('@/app/api/tools/lead-miner/localidades/cidades/route')
      : await import('@/app/api/tools/lead-miner/localidades/bairros/route');
  const res = await mod.GET(new Request(`http://localhost/api/tools/lead-miner/localidades/${path}${query}`), { params: {} });
  return { status: res.status, body: (await res.json()) as Record<string, any>, headers: res.headers };
}

beforeEach(() => {
  currentUserId = 'u1';
  actor = { ...NEGOCIOS };
  cities.list.mockReset();
  bairros.list.mockReset();
});
afterEach(() => vi.resetModules());

describe('GET /localidades/cidades', () => {
  it('sem sessão → 401 e nenhuma consulta', async () => {
    currentUserId = null;
    expect((await call('cidades', '?uf=SP')).status).toBe(401);
    expect(cities.list).not.toHaveBeenCalled();
  });

  it('fora de Negócios → 403 e nenhuma consulta', async () => {
    actor = { ...NEGOCIOS, departmentCode: 'GENTE' };
    expect((await call('cidades', '?uf=SP')).status).toBe(403);
    expect(cities.list).not.toHaveBeenCalled();
  });

  it.each(['', '?uf=', '?uf=sp', '?uf=XX', '?uf=São Paulo', '?uf=SP/../x'])('UF inválida (%s) → 400 e nenhuma consulta', async (q) => {
    const r = await call('cidades', q);
    expect(r.status).toBe(400);
    expect(r.body.fields.uf).toBe('Selecione uma UF válida.');
    expect(cities.list).not.toHaveBeenCalled();
  });

  it('UF válida → 200 com as cidades e cache HTTP privado', async () => {
    cities.list.mockResolvedValue({ ok: true, items: [{ id: 1, nome: 'Bauru' }] });
    const r = await call('cidades', '?uf=SP');
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ items: [{ id: 1, nome: 'Bauru' }] });
    expect(r.headers.get('cache-control')).toBe('private, max-age=3600');
    expect(cities.list).toHaveBeenCalledWith('SP');
  });

  it('IBGE fora do ar → 200 com lista vazia e indisponivel (nunca bloqueia a mineração)', async () => {
    cities.list.mockResolvedValue({ ok: false });
    const r = await call('cidades', '?uf=SP');
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ items: [], indisponivel: true });
    expect(r.headers.get('cache-control')).toBeNull();
  });
});

describe('GET /localidades/bairros', () => {
  it('sem sessão → 401; fora de Negócios → 403', async () => {
    currentUserId = null;
    expect((await call('bairros', '?uf=SP&cidade=Santos')).status).toBe(401);
    currentUserId = 'u1';
    actor = { ...NEGOCIOS, departmentCode: 'MARKETING' };
    expect((await call('bairros', '?uf=SP&cidade=Santos')).status).toBe(403);
    expect(bairros.list).not.toHaveBeenCalled();
  });

  it('UF inválida ou cidade ausente → 400 com o campo em fields', async () => {
    const semUf = await call('bairros', '?uf=XX&cidade=Santos');
    expect(semUf.status).toBe(400);
    expect(semUf.body.fields.uf).toBe('Selecione uma UF válida.');

    const semCidade = await call('bairros', '?uf=SP&cidade=%20%20');
    expect(semCidade.status).toBe(400);
    expect(semCidade.body.fields.cidade).toBeTruthy();
    expect(bairros.list).not.toHaveBeenCalled();
  });

  it('200 com os bairros (cidade com acento e espaços é aparada)', async () => {
    bairros.list.mockResolvedValue({ ok: true, items: ['Centro', 'Gonzaga'] });
    const r = await call('bairros', '?uf=SP&cidade=%20S%C3%A3o%20Vicente%20');
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ items: ['Centro', 'Gonzaga'] });
    expect(r.headers.get('cache-control')).toBe('private, max-age=3600');
    expect(bairros.list).toHaveBeenCalledWith('SP', 'São Vicente');
  });

  it('lista vazia → 200 sem cache HTTP (digitação livre)', async () => {
    bairros.list.mockResolvedValue({ ok: true, items: [] });
    const r = await call('bairros', '?uf=SP&cidade=Santos');
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ items: [] });
    expect(r.headers.get('cache-control')).toBeNull();
  });

  it('falha do OSM → 200 com indisponivel', async () => {
    bairros.list.mockResolvedValue({ ok: false });
    const r = await call('bairros', '?uf=SP&cidade=Santos');
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ items: [], indisponivel: true });
  });
});

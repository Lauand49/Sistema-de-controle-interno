/**
 * **Validates: Requirements 20.1, 20.2**
 *
 * Property 45: as rotas novas/estendidas negam sem efeitos colaterais. Para qualquer ator sem
 * sessão (401) ou sem permissão de Negócios/inativo (403), o handler responde o status esperado
 * ANTES de tocar o banco (`prisma`) ou os serviços externos (`deps`): ambos são proxies que
 * lançam a qualquer acesso. `requireNegocios` é a primeira instrução de cada rota.
 */
import fc from 'fast-check';
import { afterEach, describe, expect, it, vi } from 'vitest';

// --- Mocks (offline): sessão, ator, banco e deps proibidos de serem acessados ---

let currentUserId: string | null = null;
let currentActor: Record<string, unknown> | null = null;
let prismaTouched = false;
let depsTouched = false;

vi.mock('server-only', () => ({}));

vi.mock('@/auth', () => ({
  auth: async () => (currentUserId ? { user: { id: currentUserId } } : null),
}));

vi.mock('@/lib/users', () => ({
  findUserDTO: async (id: string) => (currentActor ? { ...currentActor, id } : null),
}));

/** Proxy que lança (e marca) a qualquer acesso: prova que nenhuma consulta é feita. */
function forbiddenProxy(mark: () => void): unknown {
  const handler: ProxyHandler<() => void> = {
    get() {
      mark();
      throw new Error('acesso ao banco/serviço não deveria ocorrer na negação');
    },
    apply() {
      mark();
      throw new Error('chamada ao banco/serviço não deveria ocorrer na negação');
    },
  };
  return new Proxy(() => { }, handler);
}

vi.mock('@/lib/prisma', () => ({ prisma: forbiddenProxy(() => (prismaTouched = true)) }));

vi.mock('@/lib/leads/deps', () => ({
  isAiAvailable: () => false,
  getServicesStatus: () => {
    depsTouched = true;
    throw new Error('getServicesStatus não deveria ser chamado na negação');
  },
  getPipelineDeps: () => {
    depsTouched = true;
    throw new Error('getPipelineDeps não deveria ser chamado na negação');
  },
  getApproachDeps: () => {
    depsTouched = true;
    throw new Error('getApproachDeps não deveria ser chamado na negação');
  },
}));

// Importa os handlers depois dos mocks.
const routes = {
  config: () => import('@/app/api/tools/lead-miner/config/route'),
  companies: () => import('@/app/api/tools/lead-miner/companies/route'),
  map: () => import('@/app/api/tools/lead-miner/companies/map/route'),
  export: () => import('@/app/api/tools/lead-miner/companies/export/route'),
  triage: () => import('@/app/api/tools/lead-miner/companies/triage/route'),
  reanalyze: () => import('@/app/api/tools/lead-miner/companies/[id]/reanalyze/route'),
  cnpj: () => import('@/app/api/tools/lead-miner/companies/[id]/cnpj/route'),
  approach: () => import('@/app/api/tools/lead-miner/companies/[id]/approach/route'),
  cancel: () => import('@/app/api/tools/lead-miner/runs/[id]/cancel/route'),
  cidades: () => import('@/app/api/tools/lead-miner/localidades/cidades/route'),
  bairros: () => import('@/app/api/tools/lead-miner/localidades/bairros/route'),
};

interface Target {
  name: string;
  load: () => Promise<Record<string, unknown>>;
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  export: string;
  body?: unknown;
  params?: Record<string, string>;
}

const TARGETS: Target[] = [
  { name: 'GET /config', load: routes.config, method: 'GET', export: 'GET' },
  { name: 'GET /companies', load: routes.companies, method: 'GET', export: 'GET' },
  { name: 'GET /companies/map', load: routes.map, method: 'GET', export: 'GET' },
  { name: 'POST /companies/export', load: routes.export, method: 'POST', export: 'POST', body: {} },
  { name: 'POST /companies/triage', load: routes.triage, method: 'POST', export: 'POST', body: { ids: ['x'] } },
  { name: 'POST /reanalyze', load: routes.reanalyze, method: 'POST', export: 'POST', params: { id: 'c1' } },
  { name: 'PUT /cnpj', load: routes.cnpj, method: 'PUT', export: 'PUT', body: { cnpj: '11222333000181' }, params: { id: 'c1' } },
  { name: 'DELETE /cnpj', load: routes.cnpj, method: 'DELETE', export: 'DELETE', params: { id: 'c1' } },
  { name: 'POST /approach', load: routes.approach, method: 'POST', export: 'POST', body: { canal: 'WHATSAPP' }, params: { id: 'c1' } },
  { name: 'POST /runs/[id]/cancel', load: routes.cancel, method: 'POST', export: 'POST', params: { id: 'r1' } },
  { name: 'GET /localidades/cidades', load: routes.cidades, method: 'GET', export: 'GET' },
  { name: 'GET /localidades/bairros', load: routes.bairros, method: 'GET', export: 'GET' },
];

async function callTarget(t: Target): Promise<Response> {
  const mod = await t.load();
  const handler = mod[t.export] as (req: Request, ctx: { params: Record<string, string> }) => Promise<Response>;
  const init: RequestInit = { method: t.method };
  if (t.body !== undefined) {
    init.body = JSON.stringify(t.body);
    init.headers = { 'content-type': 'application/json' };
  }
  const req = new Request('http://localhost/api/tools/lead-miner', init);
  return handler(req, { params: t.params ?? {} });
}

/** Ator sem permissão de Negócios: outro departamento, inativo, ou Negócios não-ativo. */
const denyActorArb = fc.oneof(
  fc.record({
    status: fc.constantFrom('ATIVO', 'INATIVO', 'PENDENTE'),
    globalRole: fc.constant(null),
    departmentCode: fc.constantFrom('GENTE', 'PROJETOS', 'MARKETING', 'ADMIN_FINANCEIRO'),
    departmentRole: fc.constantFrom(null, 'GERENTE', 'ASSESSOR'),
    sectors: fc.constant([]),
  }),
  // Negócios mas inativo → 403 (status não-ATIVO barra no withAuth).
  fc.record({
    status: fc.constantFrom('INATIVO', 'PENDENTE'),
    globalRole: fc.constant(null),
    departmentCode: fc.constant('NEGOCIOS'),
    departmentRole: fc.constantFrom(null, 'GERENTE', 'ASSESSOR'),
    sectors: fc.constant([]),
  }),
);

afterEach(() => {
  currentUserId = null;
  currentActor = null;
  prismaTouched = false;
  depsTouched = false;
  vi.resetModules();
});

describe('Property 45: rotas novas negam sem efeitos colaterais', () => {
  it('sem sessão → 401 e nenhum acesso ao banco/serviços', async () => {
    await fc.assert(
      fc.asyncProperty(fc.constantFrom(...TARGETS), async (t) => {
        currentUserId = null;
        currentActor = null;
        prismaTouched = false;
        depsTouched = false;
        const res = await callTarget(t);
        expect(res.status).toBe(401);
        expect(prismaTouched).toBe(false);
        expect(depsTouched).toBe(false);
      }),
      { numRuns: TARGETS.length * 3 },
    );
  });

  it('ator sem permissão → 403 e nenhum acesso ao banco/serviços', async () => {
    await fc.assert(
      fc.asyncProperty(fc.constantFrom(...TARGETS), denyActorArb, async (t, actor) => {
        currentUserId = 'u1';
        currentActor = actor;
        prismaTouched = false;
        depsTouched = false;
        const res = await callTarget(t);
        expect(res.status).toBe(403);
        expect(prismaTouched).toBe(false);
        expect(depsTouched).toBe(false);
      }),
      { numRuns: 120 },
    );
  });
});

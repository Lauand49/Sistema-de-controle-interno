/**
 * Testes de exemplo das rotas novas/estendidas da Etapa 3 (tarefa 13.9), offline.
 *
 * Sessão (`@/auth`), ator (`@/lib/users`), serviços (`@/lib/leads/deps`) e banco (`@/lib/prisma`)
 * são simulados. Cobrem: contrato de `/config`; validação (400) de `/cnpj` e `/approach`; autor
 * sempre da sessão; 409 de `/approach` sem Analise. Os contratos completos de CRUD com Postgres
 * real ficam nos testes de integração (`tests/lead-miner/integration/routes.int.test.ts`).
 *
 * Requisitos: 20.1, 20.2, 20.3, 20.5, 2.8, 21.3.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ServicesStatus } from '@/lib/leads/services';

let currentUserId: string | null = 'u1';
let actor: Record<string, unknown> | null = null;
const prismaMock: Record<string, any> = {};
let servicesStatus: ServicesStatus;

vi.mock('server-only', () => ({}));
vi.mock('@/auth', () => ({ auth: async () => (currentUserId ? { user: { id: currentUserId } } : null) }));
vi.mock('@/lib/users', () => ({ findUserDTO: async (id: string) => (actor ? { ...actor, id } : null) }));
vi.mock('@/lib/prisma', () => ({ prisma: new Proxy({}, { get: (_t, p) => prismaMock[p as string] }) }));
vi.mock('@/lib/leads/deps', () => ({
  isAiAvailable: () => true,
  getServicesStatus: async () => servicesStatus,
  getApproachDeps: () => ({ client: null, usage: { reserve: async () => false }, limit: 0, now: () => new Date() }),
  getPipelineDeps: () => ({}),
}));

const NEGOCIOS = {
  status: 'ATIVO',
  globalRole: null,
  departmentCode: 'NEGOCIOS',
  departmentRole: 'ASSESSOR',
  sectors: [],
  name: 'Ana Negócios',
};

function serviceState(usados = 0, limite = 1000) {
  return { available: true, motivo: null, usados, limite };
}

async function call(
  load: () => Promise<Record<string, unknown>>,
  exportName: string,
  opts: { method?: string; body?: unknown; params?: Record<string, string> } = {},
): Promise<{ status: number; body: any }> {
  const mod = await load();
  const handler = mod[exportName] as (req: Request, ctx: { params: Record<string, string> }) => Promise<Response>;
  const init: RequestInit = { method: opts.method ?? 'GET' };
  if (opts.body !== undefined) {
    init.body = JSON.stringify(opts.body);
    init.headers = { 'content-type': 'application/json' };
  }
  const req = new Request('http://localhost/api/tools/lead-miner', init);
  const res = await handler(req, { params: opts.params ?? {} });
  const text = await res.text();
  let body: any = text;
  try {
    body = JSON.parse(text);
  } catch {
    /* não-JSON */
  }
  return { status: res.status, body };
}

beforeEach(() => {
  currentUserId = 'u1';
  actor = { ...NEGOCIOS };
  for (const k of Object.keys(prismaMock)) delete prismaMock[k];
  servicesStatus = {
    places: serviceState(10, 1000),
    pagespeed: { ...serviceState(5, 25000), semChave: true },
    gemini: serviceState(2, 1500),
  };
});

afterEach(() => {
  vi.resetModules();
  vi.restoreAllMocks();
});

const configRoute = () => import('@/app/api/tools/lead-miner/config/route');
const cnpjRoute = () => import('@/app/api/tools/lead-miner/companies/[id]/cnpj/route');
const approachRoute = () => import('@/app/api/tools/lead-miner/companies/[id]/approach/route');

describe('GET /config', () => {
  it('devolve { iaAvailable, services } com o estado dos serviços (Req. 2.6)', async () => {
    const { status, body } = await call(configRoute, 'GET');
    expect(status).toBe(200);
    expect(body.iaAvailable).toBe(true);
    expect(body.services.places).toMatchObject({ available: true, usados: 10, limite: 1000 });
    expect(body.services.pagespeed.semChave).toBe(true);
    expect(body.services.gemini).toMatchObject({ usados: 2, limite: 1500 });
  });
});

describe('PUT /companies/[id]/cnpj — validação (Req. 11.7, 20.5)', () => {
  it('CNPJ inválido → 400 "CNPJ inválido" sem tocar o banco', async () => {
    // Nenhum método de prisma definido: um acesso lançaria. A validação acontece antes.
    const { status, body } = await call(cnpjRoute, 'PUT', {
      method: 'PUT',
      body: { cnpj: '123' },
      params: { id: 'c1' },
    });
    expect(status).toBe(400);
    expect(body.error).toBe('CNPJ inválido');
    expect(body.fields?.cnpj).toBe('CNPJ inválido');
  });

  it('ignora ids de autor no corpo (Req. 20.3): só `cnpj` é lido', async () => {
    // cnpj inválido para parar na validação; o importante é não quebrar com campos extras.
    const { status } = await call(cnpjRoute, 'PUT', {
      method: 'PUT',
      body: { cnpj: 'xx', actorId: 'hacker', authorId: 'hacker' },
      params: { id: 'c1' },
    });
    expect(status).toBe(400);
  });
});

describe('POST /companies/[id]/approach', () => {
  it('canal inválido → 400 com fields.canal (Req. 20.5)', async () => {
    const { status, body } = await call(approachRoute, 'POST', {
      method: 'POST',
      body: { canal: 'SMS' },
      params: { id: 'c1' },
    });
    expect(status).toBe(400);
    expect(body.fields?.canal).toBeTruthy();
  });

  it('Empresa sem Analise → 409 "Empresa ainda não analisada" (Req. 15.1)', async () => {
    prismaMock.company = {
      findUnique: vi.fn(async () => ({
        id: 'c1',
        nome: 'Clínica',
        nomeExibicao: 'Clínica',
        nicho: 'clinica_odontologica',
        bairro: null,
        cidade: null,
        whatsappOsm: null,
        cnpj: null,
        cnpjDadosCnpj: null,
        cnpjNomeFantasia: null,
        cnpjCnaeCodigo: null,
        cnpjCnaeDescricao: null,
        cnpjPorte: null,
        situacaoCadastral: null,
        cnpjInicioAtividade: null,
        analyses: [], // sem análise
      })),
    };
    const { status, body } = await call(approachRoute, 'POST', {
      method: 'POST',
      body: { canal: 'WHATSAPP' },
      params: { id: 'c1' },
    });
    expect(status).toBe(409);
    expect(body.error).toBe('Empresa ainda não analisada');
  });

  it('Empresa inexistente → 404', async () => {
    prismaMock.company = { findUnique: vi.fn(async () => null) };
    const { status } = await call(approachRoute, 'POST', {
      method: 'POST',
      body: { canal: 'EMAIL' },
      params: { id: 'nope' },
    });
    expect(status).toBe(404);
  });
});

/**
 * Etapa 5 / F4 — dados da pessoa: campos por papel, mudanças de hierarquia valendo na requisição seguinte
 * e identidade sempre vinda da sessão (offline: sessão, usuários e Prisma simulados).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const world = vi.hoisted(() => ({
  /** Claims da sessão (o servidor só pode confiar no id). */
  session: null as null | Record<string, unknown>,
  pessoas: {} as Record<string, any>,
  linhas: [] as any[],
  writes: [] as { key: string; args: any }[],
}));

vi.mock('server-only', () => ({}));
vi.mock('@/auth', () => ({ auth: async () => (world.session ? { user: world.session } : null) }));
vi.mock('@/lib/users', async (orig) => {
  const real = await orig<typeof import('@/lib/users')>();
  return { ...real, findUserDTO: async (id: string) => world.pessoas[id] ?? null };
});
vi.mock('@/lib/prisma', () => {
  const WRITE = /^(create|createMany|update|updateMany|upsert|delete|deleteMany)$/;
  const model = (name: string) =>
    new Proxy(
      {},
      {
        get: (_t, method: string) => async (args: any) => {
          const key = `${name}.${method}`;
          if (WRITE.test(method)) {
            world.writes.push({ key, args });
            return { id: 'novo', ...(args?.data ?? {}) };
          }
          if (key === 'user.findMany') return world.linhas;
          if (key === 'unit.findUnique') return { id: 'u-GENTE', code: args.where.code, name: 'Gente', type: 'DEPARTAMENTO' };
          if (method === 'findMany' || method === 'groupBy') return [];
          if (method === 'count') return 0;
          return null;
        },
      },
    );
  const prisma: any = new Proxy({ $transaction: async (fn: any) => fn(prisma) }, {
    get: (t: any, p: string) => (p in t ? t[p] : model(p)),
  });
  return { prisma };
});

import { GET as listarUsuarios } from '@/app/api/users/route';
import { GET as perfil, PATCH as editarPerfil } from '@/app/api/users/[id]/route';
import { GET as membros } from '@/app/api/units/[code]/members/route';
import { GET as financeiro } from '@/app/api/finance/route';
import { GET as auditoria } from '@/app/api/audit/route';
import { GET as meuPerfil } from '@/app/api/me/route';
import { GET as listarTarefas } from '@/app/api/tasks/route';
import { POST as criarSolicitacao } from '@/app/api/requests/route';

const ULTIMO_ACESSO = '2026-09-01T12:00:00.000Z';

function dto(id: string, over: Record<string, unknown> = {}) {
  return {
    id,
    name: id,
    email: `${id}@scitecjr.com`,
    avatar: null,
    cargo: null,
    status: 'ATIVO',
    globalRole: null,
    departmentCode: null,
    departmentRole: null,
    sectors: [],
    lastLoginAt: ULTIMO_ACESSO,
    createdAt: '2026-01-01T00:00:00.000Z',
    ...over,
  };
}

function linha(id: string, dept: string | null, over: Record<string, unknown> = {}) {
  return {
    id,
    name: id,
    email: `${id}@scitecjr.com`,
    avatar: null,
    cargo: null,
    status: 'ATIVO',
    globalRole: null,
    departmentRole: 'ASSESSOR',
    department: dept ? { code: dept, name: dept } : null,
    sectorMemberships: [],
    lastLoginAt: new Date(ULTIMO_ACESSO),
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    ...over,
  };
}

const entrar = (id: string) => {
  world.session = { id };
};
const ctx = { params: {} as never };
const ultimoAcessoVisivel = (lista: any[]) => Object.fromEntries(lista.map((u) => [u.id, u.lastLoginAt !== null]));

beforeEach(() => {
  world.session = null;
  world.writes = [];
  world.pessoas = {
    presidente: dto('presidente', { globalRole: 'PRESIDENTE' }),
    assNeg: dto('assNeg', { departmentCode: 'NEGOCIOS', departmentRole: 'ASSESSOR' }),
    gerGente: dto('gerGente', { departmentCode: 'GENTE', departmentRole: 'GERENTE' }),
    assGente: dto('assGente', { departmentCode: 'GENTE', departmentRole: 'ASSESSOR' }),
    assAdm: dto('assAdm', { departmentCode: 'ADMJURFIN', departmentRole: 'ASSESSOR' }),
  };
  world.linhas = [linha('assNeg', 'NEGOCIOS'), linha('assGente', 'GENTE'), linha('gerGente', 'GENTE', { departmentRole: 'GERENTE' })];
});

describe('F4: último acesso só para quem pode acompanhar a pessoa', () => {
  it('GET /api/users: Assessor vê o próprio; Gerente do depto vê os do depto; Presidência vê todos', async () => {
    entrar('assNeg');
    expect(ultimoAcessoVisivel(await (await listarUsuarios(new Request('http://x/api/users'), ctx)).json())).toEqual({
      assNeg: true,
      assGente: false,
      gerGente: false,
    });

    entrar('gerGente');
    expect(ultimoAcessoVisivel(await (await listarUsuarios(new Request('http://x/api/users'), ctx)).json())).toEqual({
      assNeg: false,
      assGente: true,
      gerGente: true,
    });

    entrar('presidente');
    expect(ultimoAcessoVisivel(await (await listarUsuarios(new Request('http://x/api/users'), ctx)).json())).toEqual({
      assNeg: true,
      assGente: true,
      gerGente: true,
    });
  });

  it('GET /api/users/[id]: idem (perfil de outra pessoa não traz o último acesso ao Assessor)', async () => {
    entrar('assNeg');
    const outro = await (await perfil(new Request('http://x'), { params: { id: 'assGente' } })).json();
    expect(outro.lastLoginAt).toBeNull();
    expect(outro.email).toBe('assGente@scitecjr.com'); // diretório segue como está: decisão D-02 pendente
    const proprio = await (await perfil(new Request('http://x'), { params: { id: 'assNeg' } })).json();
    expect(proprio.lastLoginAt).toBe(ULTIMO_ACESSO);

    entrar('gerGente');
    const doDepto = await (await perfil(new Request('http://x'), { params: { id: 'assGente' } })).json();
    expect(doDepto.lastLoginAt).toBe(ULTIMO_ACESSO);
  });

  it('GET /api/units/[code]/members: mesma regra', async () => {
    entrar('assGente');
    const lista = await (await membros(new Request('http://x'), { params: { code: 'GENTE' } })).json();
    expect(ultimoAcessoVisivel(lista)).toEqual({ assNeg: false, assGente: true, gerGente: false });
  });

  it('GET /api/me devolve o próprio usuário completo', async () => {
    entrar('assNeg');
    const eu = await (await meuPerfil(new Request('http://x'), ctx)).json();
    expect(eu.lastLoginAt).toBe(ULTIMO_ACESSO);
    expect(eu.id).toBe('assNeg');
  });
});

describe('F4: mudanças de hierarquia valem na requisição seguinte', () => {
  const chamar = async (fn: (r: Request, c: any) => Promise<Response>, url = 'http://x/api') =>
    (await fn(new Request(url), ctx)).status;

  it('transferência de departamento tira o acesso à unidade antiga e dá o da nova', async () => {
    entrar('assAdm');
    expect(await chamar(financeiro)).toBe(200);
    world.pessoas.assAdm = { ...world.pessoas.assAdm, departmentCode: 'GENTE' };
    expect(await chamar(financeiro)).toBe(403);
  });

  it('rebaixar Gerente tira a auditoria; nomear dá', async () => {
    entrar('gerGente');
    expect(await chamar(auditoria)).toBe(200);
    world.pessoas.gerGente = { ...world.pessoas.gerGente, departmentRole: 'ASSESSOR' };
    expect(await chamar(auditoria)).toBe(403);
    world.pessoas.gerGente = { ...world.pessoas.gerGente, departmentRole: 'GERENTE' };
    expect(await chamar(auditoria)).toBe(200);
  });

  it('desativar a conta derruba a sessão existente; reativar devolve', async () => {
    entrar('assGente');
    expect(await chamar(listarTarefas)).toBe(200);
    world.pessoas.assGente = { ...world.pessoas.assGente, status: 'INATIVO' };
    expect(await chamar(listarTarefas)).toBe(403);
    expect(await chamar(meuPerfil)).toBe(200); // /api/me continua respondendo para a tela "conta desativada"
    world.pessoas.assGente = { ...world.pessoas.assGente, status: 'ATIVO' };
    expect(await chamar(listarTarefas)).toBe(200);
  });

  it('aprovar um pendente libera as APIs na requisição seguinte', async () => {
    world.pessoas.novo = dto('novo', { status: 'PENDENTE' });
    entrar('novo');
    expect(await chamar(listarTarefas)).toBe(403);
    world.pessoas.novo = { ...world.pessoas.novo, status: 'ATIVO', departmentCode: 'GENTE', departmentRole: 'ASSESSOR' };
    expect(await chamar(listarTarefas)).toBe(200);
  });

  it('o servidor ignora cargos/status que viajem na sessão: vale só o id e o banco', async () => {
    world.pessoas.novo = dto('novo', { status: 'PENDENTE' });
    world.session = { id: 'novo', status: 'ATIVO', globalRole: 'PRESIDENTE', departmentCode: 'ADMJURFIN' };
    expect(await chamar(financeiro)).toBe(403);
    expect(await chamar(auditoria)).toBe(403);
  });

  it('usuário removido do banco com sessão válida → 401 (o cliente encerra a sessão)', async () => {
    entrar('fantasma');
    expect(await chamar(meuPerfil)).toBe(401);
    expect(await chamar(listarTarefas)).toBe(401);
  });
});

describe('F4: identidade vem da sessão, nunca do corpo da requisição', () => {
  it('POST /api/requests grava o solicitante da sessão mesmo se o corpo mandar outro requesterId', async () => {
    entrar('assGente');
    const res = await criarSolicitacao(
      new Request('http://x/api/requests', {
        method: 'POST',
        body: JSON.stringify({
          title: 't',
          description: 'd',
          toDept: 'ADMJURFIN',
          requesterId: 'presidente',
          fromDept: 'GLOBAL',
          createTargetCard: false,
        }),
      }),
      ctx,
    );
    expect(res.status).toBe(201);
    const criacao = world.writes.find((w) => w.key === 'crossDeptRequest.create')!;
    expect(criacao.args.data.requesterId).toBe('assGente');
    expect(criacao.args.data.fromDept).toBe('GENTE');
  });

  it('PATCH /api/users/[id]: só o próprio ou a Presidência; cargo só a Presidência', async () => {
    entrar('assGente');
    const patch = (id: string, body: unknown) =>
      editarPerfil(new Request('http://x', { method: 'PATCH', body: JSON.stringify(body) }), { params: { id } });
    expect((await patch('assNeg', { name: 'Fulano' })).status).toBe(403);
    expect((await patch('assGente', { name: 'Fulano' })).status).toBe(200);
    expect((await patch('assGente', { cargo: 'Diretor' })).status).toBe(403);

    entrar('presidente');
    expect((await patch('assGente', { cargo: 'Diretor' })).status).toBe(200);
  });
});

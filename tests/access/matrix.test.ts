/**
 * Etapa 5 / F3 — matriz de acesso: personas × rotas de API (offline: sessão, usuários e Prisma simulados).
 *
 * A coluna "permitidos" de cada linha é escrita à mão a partir do plano (seção 4 e 8.1), NÃO calculada por
 * lib/permissions.ts; assim o teste pega regra errada tanto na rota quanto no helper.
 *
 * Regras verificadas para toda linha:
 *  - sem sessão → 401; PENDENTE e INATIVO → 403 (o servidor recarrega o status, nunca confia no cliente);
 *  - persona fora da lista → 403, nenhuma escrita no banco e corpo só com `{ error }` (sem dados do objeto);
 *  - persona da lista → passa pela guarda (nem 401/403 e, em rota por id, nem 404).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

type Status = 'ATIVO' | 'PENDENTE' | 'INATIVO';
interface Persona {
  id: string;
  status: Status;
  globalRole: 'PRESIDENTE' | 'VICE_PRESIDENTE' | null;
  departmentCode: 'NEGOCIOS' | 'ADMJURFIN' | 'GENTE' | 'MIDIAS' | null;
  departmentRole: 'GERENTE' | 'ASSESSOR' | null;
  sectors: { code: string; name: string; role: 'GERENTE' | 'MEMBRO' }[];
}

const base = (id: string, over: Partial<Persona> = {}): Persona => ({
  id,
  status: 'ATIVO',
  globalRole: null,
  departmentCode: null,
  departmentRole: null,
  sectors: [],
  ...over,
});
const dto = (p: Persona) => ({ ...p, name: p.id, email: `${p.id}@scitecjr.com`, avatar: null, cargo: null });

const PERSONAS: Record<string, Persona> = {
  pendente: base('pendente', { status: 'PENDENTE' }),
  inativo: base('inativo', { status: 'INATIVO', departmentCode: 'NEGOCIOS', departmentRole: 'ASSESSOR' }),
  presidente: base('presidente', { globalRole: 'PRESIDENTE' }),
  vice: base('vice', { globalRole: 'VICE_PRESIDENTE' }),
  gerNeg: base('gerNeg', { departmentCode: 'NEGOCIOS', departmentRole: 'GERENTE' }),
  assNeg: base('assNeg', { departmentCode: 'NEGOCIOS', departmentRole: 'ASSESSOR' }),
  gerAdm: base('gerAdm', { departmentCode: 'ADMJURFIN', departmentRole: 'GERENTE' }),
  assAdm: base('assAdm', { departmentCode: 'ADMJURFIN', departmentRole: 'ASSESSOR' }),
  gerGente: base('gerGente', { departmentCode: 'GENTE', departmentRole: 'GERENTE' }),
  assGente: base('assGente', { departmentCode: 'GENTE', departmentRole: 'ASSESSOR' }),
  assMidias: base('assMidias', { departmentCode: 'MIDIAS', departmentRole: 'ASSESSOR' }),
  // Gerente de Setor: Assessor de Mídias que gerencia o setor Tecnologia e Software.
  gerSetor: base('gerSetor', {
    departmentCode: 'MIDIAS',
    departmentRole: 'ASSESSOR',
    sectors: [{ code: 'TEC_SOFTWARE', name: 'Tecnologia e Software', role: 'GERENTE' }],
  }),
};
const ATIVOS = Object.values(PERSONAS).filter((p) => p.status === 'ATIVO').map((p) => p.id);

/** Pessoas-alvo (não logam): servem de objeto nas rotas de usuários. */
const ALVOS: Record<string, Persona> = {
  'u-pend': base('u-pend', { status: 'PENDENTE' }),
  'u-gente': base('u-gente', { departmentCode: 'GENTE', departmentRole: 'ASSESSOR' }),
};

const world = vi.hoisted(() => ({
  session: null as string | null,
  writes: [] as string[],
  queries: [] as { key: string; args: any }[],
}));

vi.mock('server-only', () => ({}));
vi.mock('@/auth', () => ({ auth: async () => (world.session ? { user: { id: world.session } } : null) }));
vi.mock('@/lib/users', async (orig) => {
  const real = await orig<typeof import('@/lib/users')>();
  return {
    ...real,
    findUserDTO: async (id: string) => {
      const p = (globalThis as any).__pessoas?.[id];
      return p ?? null;
    },
  };
});
vi.mock('@/lib/prisma', () => {
  const WRITE = /^(create|createMany|update|updateMany|upsert|delete|deleteMany)$/;
  const unitRow = (code: string) => ({
    id: `unit-${code}`,
    code,
    name: code,
    type: ['TEC_SOFTWARE', 'ENG_INOVACAO', 'DESIGN_CONCEPCAO', 'CIENCIA_CONSULTORIA', 'DADOS_INTELIGENCIA'].includes(code)
      ? 'SETOR'
      : 'DEPARTAMENTO',
  });
  const cardRow = (unit: string) => ({
    id: 'card',
    title: 'DADO-SIGILOSO-DO-CARD',
    phaseId: 'ph1',
    values: [],
    phase: { id: 'ph1', pipeId: 'pipe1', order: 0, name: 'Fase', fields: [], pipe: { unit: { code: unit } } },
  });
  const F: Record<string, (args: any) => unknown> = {
    'unit.findUnique': ({ where }) => unitRow(where.code),
    'card.findUnique': ({ where }) =>
      ({ 'c-gente': cardRow('GENTE'), 'c-neg': cardRow('NEGOCIOS') })[where.id as string] ?? null,
    'phase.findUnique': () => ({ id: 'ph2', pipeId: 'pipe1', order: 1, name: 'Outra', fields: [], isFinal: false }),
    'pipe.findUnique': ({ where }) =>
      where.id === 'p-gente' ? { id: 'p-gente', name: 'DADO-SIGILOSO-DO-FUNIL', unit: { code: 'GENTE' }, phases: [] } : null,
    'field.findUnique': () => ({ phase: { pipe: { unit: { code: 'GENTE' } } } }),
    'task.findUnique': ({ where }) =>
      where.id === 't-gente'
        ? { assigneeId: 'u-ext', status: 'TODO', unit: { code: 'GENTE' } }
        : where.id === 't-do-assNeg'
          ? { assigneeId: 'assNeg', status: 'TODO', unit: { code: 'GENTE' } }
          : null,
    'crossDeptRequest.findUnique': ({ where }) =>
      where.id === 'r-gente-adm'
        ? { id: 'r1', requesterId: 'u-ext', handlerId: null, fromDept: 'GENTE', toDept: 'ADMJURFIN', title: 'DADO-SIGILOSO' }
        : where.id === 'r-do-assGente'
          ? { id: 'r2', requesterId: 'assGente', handlerId: null, fromDept: 'GENTE', toDept: 'ADMJURFIN', title: 'DADO-SIGILOSO' }
          : null,
    'prospectLead.findUnique': () => ({ id: 'l1', assignedTo: 'u-ext', companyName: 'DADO-SIGILOSO-DO-LEAD' }),
    'sectorMember.findUnique': () => ({ id: 'sm1', role: 'MEMBRO' }),
    'user.findUnique': ({ where }) =>
      where.id === 'u-gente' ? { status: 'ATIVO', globalRole: null, departmentId: 'unit-GENTE' } : null,
  };
  const model = (name: string) =>
    new Proxy(
      {},
      {
        get: (_t, method: string) => async (args: any) => {
          const key = `${name}.${method}`;
          world.queries.push({ key, args });
          if (WRITE.test(method)) world.writes.push(key);
          if (F[key] && !WRITE.test(method)) return F[key](args);
          if (WRITE.test(method)) return { id: 'novo', ...(args?.data ?? {}) };
          if (method === 'findMany' || method === 'groupBy') return [];
          if (method === 'count') return 0;
          return null;
        },
      },
    );
  const root: Record<string, unknown> = {
    $transaction: async (fn: unknown) => (typeof fn === 'function' ? (fn as any)(prisma) : Promise.all(fn as any)),
  };
  const prisma: any = new Proxy(root, { get: (t, p: string) => (p in t ? t[p] : model(p)) });
  return { prisma };
});

type Loader = () => Promise<Record<string, any>>;
const ROUTES: Record<string, Loader> = {
  cards: () => import('@/app/api/cards/[id]/route'),
  cardMove: () => import('@/app/api/cards/[id]/move/route'),
  pipe: () => import('@/app/api/pipes/[id]/route'),
  pipes: () => import('@/app/api/pipes/route'),
  field: () => import('@/app/api/fields/[id]/route'),
  tasks: () => import('@/app/api/tasks/route'),
  task: () => import('@/app/api/tasks/[id]/route'),
  requests: () => import('@/app/api/requests/route'),
  request: () => import('@/app/api/requests/[id]/route'),
  finance: () => import('@/app/api/finance/route'),
  audit: () => import('@/app/api/audit/route'),
  users: () => import('@/app/api/users/route'),
  user: () => import('@/app/api/users/[id]/route'),
  hierarchy: () => import('@/app/api/users/[id]/hierarchy/route'),
  members: () => import('@/app/api/units/[code]/members/route'),
  member: () => import('@/app/api/units/[code]/members/[userId]/route'),
  manager: () => import('@/app/api/units/[code]/manager/route'),
  leads: () => import('@/app/api/tools/leads/route'),
  lead: () => import('@/app/api/tools/leads/[id]/route'),
  pricing: () => import('@/app/api/tools/pricing/route'),
  minerConfig: () => import('@/app/api/tools/lead-miner/config/route'),
  minerCompanies: () => import('@/app/api/tools/lead-miner/companies/route'),
  minerAssignees: () => import('@/app/api/tools/lead-miner/assignees/route'),
  minerRuns: () => import('@/app/api/tools/lead-miner/runs/route'),
};

interface Linha {
  nome: string;
  rota: keyof typeof ROUTES;
  metodo: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  params?: Record<string, string>;
  url?: string;
  body?: unknown;
  /** Quem passa pela guarda. Todos os demais ativos recebem 403. */
  permitidos: string[];
  /** Rota por id: permitido nunca pode receber 404. */
  porObjeto?: boolean;
}

const GLOBAIS = ['presidente', 'vice'];
const NEG = [...GLOBAIS, 'gerNeg', 'assNeg'];
const GENTE = [...GLOBAIS, 'gerGente', 'assGente'];
const ADM = [...GLOBAIS, 'gerAdm', 'assAdm'];
const TEC = [...GLOBAIS, 'gerSetor'];
const GERENTES = [...GLOBAIS, 'gerNeg', 'gerAdm', 'gerGente', 'gerSetor'];
const GERENCIA_NEG = [...GLOBAIS, 'gerNeg'];
/** Solicitação Gente → AdmJurFin, solicitante externo. */
const SOL_VER = [...GLOBAIS, 'gerGente', 'assGente', 'gerAdm', 'assAdm'];
const SOL_ATENDER = ADM;

const L: Linha[] = [
  // ─── Objetos de Gente (Assessor de Negócios NÃO pode ler nem editar) ───
  { nome: 'GET card de Gente', rota: 'cards', metodo: 'GET', params: { id: 'c-gente' }, permitidos: GENTE, porObjeto: true },
  { nome: 'PATCH card de Gente', rota: 'cards', metodo: 'PATCH', params: { id: 'c-gente' }, body: { title: 'x' }, permitidos: GENTE, porObjeto: true },
  { nome: 'DELETE card de Gente', rota: 'cards', metodo: 'DELETE', params: { id: 'c-gente' }, permitidos: GENTE, porObjeto: true },
  { nome: 'PATCH move card de Gente', rota: 'cardMove', metodo: 'PATCH', params: { id: 'c-gente' }, body: { targetPhaseId: 'ph2' }, permitidos: GENTE, porObjeto: true },
  { nome: 'GET funil de Gente', rota: 'pipe', metodo: 'GET', params: { id: 'p-gente' }, permitidos: GENTE, porObjeto: true },
  { nome: 'GET funis ?department=GENTE', rota: 'pipes', metodo: 'GET', url: 'http://x/api/pipes?department=GENTE', permitidos: GENTE },
  { nome: 'DELETE campo de funil de Gente', rota: 'field', metodo: 'DELETE', params: { id: 'f1' }, permitidos: GENTE, porObjeto: true },
  { nome: 'GET tarefas ?department=GENTE', rota: 'tasks', metodo: 'GET', url: 'http://x/api/tasks?department=GENTE', permitidos: GENTE },
  { nome: 'POST tarefa na unidade Gente', rota: 'tasks', metodo: 'POST', body: { title: 't', department: 'GENTE' }, permitidos: GENTE },
  { nome: 'PATCH tarefa de Gente', rota: 'task', metodo: 'PATCH', params: { id: 't-gente' }, body: { title: 'x' }, permitidos: GENTE, porObjeto: true },
  { nome: 'DELETE tarefa de Gente', rota: 'task', metodo: 'DELETE', params: { id: 't-gente' }, permitidos: GENTE, porObjeto: true },
  { nome: 'PATCH tarefa de Gente atribuída ao Assessor de Negócios (responsável edita)', rota: 'task', metodo: 'PATCH', params: { id: 't-do-assNeg' }, body: { title: 'x' }, permitidos: [...GENTE, 'assNeg'], porObjeto: true },
  { nome: 'GET membros do depto Gente', rota: 'members', metodo: 'GET', params: { code: 'GENTE' }, permitidos: GENTE },
  { nome: 'GET membros do setor TEC_SOFTWARE', rota: 'members', metodo: 'GET', params: { code: 'TEC_SOFTWARE' }, permitidos: TEC },

  // ─── Solicitações: solicitante, responsável, deptos de origem e destino ───
  { nome: 'PATCH solicitação (status) Gente→AdmJurFin', rota: 'request', metodo: 'PATCH', params: { id: 'r-gente-adm' }, body: { status: 'APPROVED' }, permitidos: SOL_ATENDER, porObjeto: true },
  { nome: 'PATCH solicitação (conteúdo) Gente→AdmJurFin', rota: 'request', metodo: 'PATCH', params: { id: 'r-gente-adm' }, body: { title: 'x' }, permitidos: SOL_ATENDER, porObjeto: true },
  { nome: 'PATCH solicitação (conteúdo) do próprio solicitante', rota: 'request', metodo: 'PATCH', params: { id: 'r-do-assGente' }, body: { title: 'x' }, permitidos: [...SOL_ATENDER, 'assGente'], porObjeto: true },
  { nome: 'DELETE solicitação Gente→AdmJurFin', rota: 'request', metodo: 'DELETE', params: { id: 'r-gente-adm' }, permitidos: [...GLOBAIS, 'gerAdm'], porObjeto: true },
  { nome: 'DELETE solicitação do próprio solicitante', rota: 'request', metodo: 'DELETE', params: { id: 'r-do-assGente' }, permitidos: [...GLOBAIS, 'gerAdm', 'assGente'], porObjeto: true },

  // ─── Financeiro, auditoria, usuários ───
  { nome: 'GET /api/finance', rota: 'finance', metodo: 'GET', permitidos: ADM },
  { nome: 'POST /api/finance', rota: 'finance', metodo: 'POST', body: { description: 'd', amount: 1 }, permitidos: ADM },
  { nome: 'GET /api/audit', rota: 'audit', metodo: 'GET', permitidos: GERENTES },
  { nome: 'GET /api/users?status=PENDENTE', rota: 'users', metodo: 'GET', url: 'http://x/api/users?status=PENDENTE', permitidos: [...GLOBAIS, 'gerNeg', 'gerAdm', 'gerGente'] },
  { nome: 'GET /api/users?status=INATIVO', rota: 'users', metodo: 'GET', url: 'http://x/api/users?status=INATIVO', permitidos: [...GLOBAIS, 'gerNeg', 'gerAdm', 'gerGente'] },
  { nome: 'GET /api/users/[pendente]', rota: 'user', metodo: 'GET', params: { id: 'u-pend' }, permitidos: [...GLOBAIS, 'gerNeg', 'gerAdm', 'gerGente'], porObjeto: true },
  { nome: 'PATCH /api/users/[outra pessoa] (perfil)', rota: 'user', metodo: 'PATCH', params: { id: 'u-gente' }, body: { name: 'Novo Nome' }, permitidos: GLOBAIS, porObjeto: true },
  { nome: 'POST hierarchy APPROVE pendente em Gente', rota: 'hierarchy', metodo: 'POST', params: { id: 'u-pend' }, body: { action: 'APPROVE', departmentCode: 'GENTE' }, permitidos: [...GLOBAIS, 'gerGente'], porObjeto: true },
  { nome: 'POST hierarchy DEACTIVATE membro de Gente', rota: 'hierarchy', metodo: 'POST', params: { id: 'u-gente' }, body: { action: 'DEACTIVATE' }, permitidos: [...GLOBAIS, 'gerGente'], porObjeto: true },
  { nome: 'POST hierarchy SET_DEPARTMENT', rota: 'hierarchy', metodo: 'POST', params: { id: 'u-gente' }, body: { action: 'SET_DEPARTMENT', departmentCode: 'MIDIAS' }, permitidos: GLOBAIS, porObjeto: true },
  { nome: 'POST hierarchy SET_VICE (só Presidente)', rota: 'hierarchy', metodo: 'POST', params: { id: 'u-gente' }, body: { action: 'SET_VICE' }, permitidos: ['presidente'], porObjeto: true },
  { nome: 'PUT gerente de unidade', rota: 'manager', metodo: 'PUT', params: { code: 'GENTE' }, body: { userId: 'u-gente' }, permitidos: GLOBAIS },
  { nome: 'POST membro em setor', rota: 'members', metodo: 'POST', params: { code: 'TEC_SOFTWARE' }, body: { userId: 'u-gente' }, permitidos: TEC },
  { nome: 'DELETE membro de setor', rota: 'member', metodo: 'DELETE', params: { code: 'TEC_SOFTWARE', userId: 'u-gente' }, permitidos: TEC },

  // ─── Negócios: leads, precificação, minerador ───
  { nome: 'GET leads', rota: 'leads', metodo: 'GET', permitidos: NEG },
  { nome: 'POST lead', rota: 'leads', metodo: 'POST', body: { companyName: 'Acme' }, permitidos: NEG },
  { nome: 'PATCH lead de outro responsável', rota: 'lead', metodo: 'PATCH', params: { id: 'l1' }, body: { notes: 'n' }, permitidos: GERENCIA_NEG, porObjeto: true },
  { nome: 'DELETE lead', rota: 'lead', metodo: 'DELETE', params: { id: 'l1' }, permitidos: GERENCIA_NEG },
  { nome: 'GET /api/tools/pricing', rota: 'pricing', metodo: 'GET', permitidos: NEG },
  { nome: 'POST /api/tools/pricing', rota: 'pricing', metodo: 'POST', body: { projeto: {}, servicos: [] }, permitidos: NEG },
  { nome: 'GET minerador: config', rota: 'minerConfig', metodo: 'GET', permitidos: NEG },
  { nome: 'GET minerador: empresas', rota: 'minerCompanies', metodo: 'GET', permitidos: NEG },
  { nome: 'GET minerador: assignees', rota: 'minerAssignees', metodo: 'GET', permitidos: GERENCIA_NEG },
  { nome: 'GET minerador: minerações', rota: 'minerRuns', metodo: 'GET', permitidos: NEG },
];

async function chamar(l: Linha, quem: string | null) {
  world.session = quem;
  world.writes = [];
  const mod = await ROUTES[l.rota]();
  const init: RequestInit = { method: l.metodo };
  if (l.body !== undefined) {
    init.body = JSON.stringify(l.body);
    init.headers = { 'content-type': 'application/json' };
  }
  const res = await mod[l.metodo](new Request(l.url ?? 'http://x/api', init), { params: l.params ?? {} });
  const texto = await res.text();
  let corpo: any = null;
  try {
    corpo = JSON.parse(texto);
  } catch {
    /* corpo não JSON */
  }
  return { status: res.status as number, corpo, texto, escritas: [...world.writes] };
}

beforeEach(() => {
  (globalThis as any).__pessoas = Object.fromEntries(
    [...Object.values(PERSONAS), ...Object.values(ALVOS)].map((p) => [p.id, dto(p)]),
  );
  world.queries = [];
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});

describe.each(L.map((l) => [`${l.metodo} ${l.nome}`, l] as const))('%s', (_titulo, l) => {
  it('sem sessão → 401 e nenhuma escrita', async () => {
    const r = await chamar(l, null);
    expect(r.status).toBe(401);
    expect(r.escritas).toEqual([]);
  });

  it.each(['pendente', 'inativo'])('%s → 403 (status lido do banco) e nenhuma escrita', async (quem) => {
    const r = await chamar(l, quem);
    expect(r.status).toBe(403);
    expect(r.escritas).toEqual([]);
  });

  it.each(ATIVOS.filter((id) => !GLOBAIS.includes(id)).concat(GLOBAIS))('%s', async (quem) => {
    const r = await chamar(l, quem);
    if (l.permitidos.includes(quem)) {
      expect([401, 403], `${quem} deveria passar: ${r.texto}`).not.toContain(r.status);
      if (l.porObjeto) expect(r.status, `fixture ausente? ${r.texto}`).not.toBe(404);
    } else {
      expect(r.status, `${quem} deveria ser negado`).toBe(403);
      expect(r.escritas).toEqual([]);
      expect(Object.keys(r.corpo ?? {})).toEqual(['error']);
      expect(r.texto).not.toContain('DADO-SIGILOSO');
    }
  });
});

describe('objeto inexistente × objeto de outra unidade (política de resposta: ver docs/AUDITORIA-ACESSO.md, A-02)', () => {
  it('hoje: inexistente → 404 e existente de outra unidade → 403 (decisão do dono pendente)', async () => {
    world.session = 'assNeg';
    const { GET } = await ROUTES.cards();
    const existente = await GET(new Request('http://x'), { params: { id: 'c-gente' } });
    const fantasma = await GET(new Request('http://x'), { params: { id: 'c-nao-existe' } });
    expect(existente.status).toBe(403);
    expect(fantasma.status).toBe(404);
  });
});

describe('POST /api/requests com card vinculado', () => {
  const corpo = { title: 't', description: 'd', toDept: 'ADMJURFIN', linkedCardId: 'c-gente', createTargetCard: false };
  const postar = async (quem: string, linkedCardId = 'c-gente') => {
    world.session = quem;
    world.writes = [];
    const { POST } = await ROUTES.requests();
    const res = await POST(
      new Request('http://x/api/requests', { method: 'POST', body: JSON.stringify({ ...corpo, linkedCardId }) }),
      { params: {} },
    );
    return { status: res.status, escritas: [...world.writes] };
  };

  it('card de outra unidade (ou inexistente) → 400 igual, sem escrita', async () => {
    expect(await postar('assNeg')).toEqual({ status: 400, escritas: [] });
    expect(await postar('assNeg', 'c-nao-existe')).toEqual({ status: 400, escritas: [] });
  });

  it.each(['assGente', 'gerGente', 'presidente'])('%s vincula card que enxerga → 201', async (quem) => {
    expect((await postar(quem)).status).toBe(201);
  });
});

describe('listas filtradas no servidor', () => {
  it('GET /api/requests: Assessor de Negócios só consulta solicitações que envolvem a si ou seu departamento', async () => {
    world.session = 'assNeg';
    const { GET } = await ROUTES.requests();
    await GET(new Request('http://x/api/requests?toDept=GENTE'), { params: {} });
    const q = world.queries.find((x) => x.key === 'crossDeptRequest.findMany')!;
    const dump = JSON.stringify(q.args.where);
    expect(dump).toContain('"requesterId":"assNeg"');
    expect(dump).toContain('"handlerId":"assNeg"');
    expect(dump).toContain('"fromDept":"NEGOCIOS"');
    expect(dump).toContain('"toDept":"NEGOCIOS"');
    // o filtro ?toDept=GENTE só restringe (AND), não amplia a visibilidade
    expect(q.args.where.AND).toHaveLength(2);
  });

  it('GET /api/requests: Presidência não recebe filtro de visibilidade', async () => {
    world.session = 'presidente';
    const { GET } = await ROUTES.requests();
    await GET(new Request('http://x/api/requests'), { params: {} });
    const q = world.queries.find((x) => x.key === 'crossDeptRequest.findMany')!;
    expect(q.args.where.AND).toEqual([]);
  });

  it('GET /api/tasks: Assessor só consulta tarefas suas ou das suas unidades', async () => {
    world.session = 'assNeg';
    const { GET } = await ROUTES.tasks();
    await GET(new Request('http://x/api/tasks'), { params: {} });
    const dump = JSON.stringify(world.queries.find((x) => x.key === 'task.findMany')!.args.where);
    expect(dump).toContain('"assigneeId":"assNeg"');
    expect(dump).toContain('"in":["NEGOCIOS"]');
    expect(dump).not.toContain('GENTE');
  });

  it('GET /api/audit: Gerente de Gente só vê o escopo do seu departamento', async () => {
    world.session = 'gerGente';
    const { GET } = await ROUTES.audit();
    await GET(new Request('http://x/api/audit?unit=NEGOCIOS'), { params: {} });
    const dump = JSON.stringify(world.queries.find((x) => x.key === 'auditLog.findMany')!.args.where);
    expect(dump).toContain('"code":"GENTE"');
    // ?unit=NEGOCIOS entra em AND com o escopo: resultado vazio, nunca ampliado
    expect(dump).toContain('"AND"');
  });

  it('GET /api/pipes sem parâmetro: só funis das unidades visíveis', async () => {
    world.session = 'assNeg';
    const { GET } = await ROUTES.pipes();
    await GET(new Request('http://x/api/pipes'), { params: {} });
    const dump = JSON.stringify(world.queries.find((x) => x.key === 'pipe.findMany')?.args ?? {});
    expect(dump).not.toContain('GENTE');
  });
});

/**
 * Testes de integração das rotas `/api/tools/lead-miner/**` contra Postgres real (Tarefa 12.8).
 * Pulados sem `RUN_DB_TESTS=1` + `TEST_DATABASE_URL` (banco `*_test`; `npm run test:int`). Nunca usa `DATABASE_URL`.
 *
 * Os handlers são importados diretamente. Só a sessão (`@/auth`) é simulada; o ator é lido do
 * banco pelo `withAuth` real. `getPipelineDeps` devolve dependências sem rede e `audit` aceita
 * injeção de falha para os testes de rollback. Toda linha criada é removida no `afterAll`.
 *
 * Requisitos: 15.4, 15.8, 15.10, 15.12, 16.4, 16.8, 18.1, 18.2, 18.3, 18.7, 18.11, 18.12.
 */
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { RUN_INTEGRATION, assertTestDatabase, rawTestDatabaseUrl } from '../../support/assert-test-db';
import type { PrismaClient } from '@prisma/client';
import { auditFault, call, SIMULATED_FAILURE } from './routes-helpers';

const RUN_DB_TESTS = RUN_INTEGRATION;

vi.mock('server-only', () => ({}));

vi.mock('@/auth', async () => {
  const { sessionStore } = await import('./routes-helpers');
  return {
    auth: async () => {
      const id = sessionStore.getStore();
      return id ? { user: { id } } : null;
    },
  };
});

vi.mock('@/lib/leads/deps', async () => {
  const { prisma } = await import('@/lib/prisma');
  const { fakePipelineDeps } = await import('./routes-helpers');
  return {
    GEMINI_MODEL_DEFAULT: 'gemini-2.0-flash',
    isAiAvailable: () => false,
    getPipelineDeps: () => fakePipelineDeps(prisma),
  };
});

vi.mock('@/lib/audit', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/audit')>();
  const { auditFault: fault, SIMULATED_FAILURE: msg } = await import('./routes-helpers');
  return {
    audit: async (...args: Parameters<typeof actual.audit>) => {
      if (fault.failAt > 0) {
        fault.calls += 1;
        if (fault.calls === fault.failAt) throw new Error(msg);
      }
      return actual.audit(...args);
    },
  };
});

const ROOT = path.resolve(__dirname, '../../..');
const TAG = `rtint-${randomUUID().slice(0, 8)}`;
const NICHO = 'clinica_odontologica';

type Handlers = Record<string, any>;

describe.skipIf(!RUN_DB_TESTS)('lead-miner — rotas (Postgres)', () => {
  let prisma: PrismaClient;
  let r: Handlers = {};
  const users = { gerente: '', assessor: '', midias: '', presidente: '' };
  const companyIds: string[] = [];
  const leadIds: string[] = [];
  const cardIds: string[] = [];
  const runIds: string[] = [];
  let fixtureRunId = '';
  let startedAt: Date;
  let seq = 0;

  async function newCompany(data: { assignedTo?: string | null } = {}): Promise<string> {
    seq += 1;
    const c = await prisma.company.create({
      data: {
        osmId: `${TAG}/node/${seq}`,
        nome: `${TAG} Empresa ${seq}`,
        nomeNormalizado: `${TAG} empresa ${seq}`,
        nicho: NICHO,
        bairro: 'Centro',
        cidade: 'Santos',
        uf: 'SP',
        telefone: '(13) 3333-0000',
        assignedTo: data.assignedTo ?? null,
      },
    });
    companyIds.push(c.id);
    return c.id;
  }

  async function newLead(companyId: string | null, status = 'RAW'): Promise<string> {
    const l = await prisma.prospectLead.create({
      data: { companyName: `${TAG} Lead`, actionPlan: 'Plano', status, companyId },
    });
    leadIds.push(l.id);
    return l.id;
  }

  const minerAudits = (where: Record<string, unknown> = {}) =>
    prisma.auditLog.count({
      where: { action: { startsWith: 'LEAD_MINER_' }, createdAt: { gte: startedAt }, ...where },
    });

  const auditsFor = (action: string, companyId: string) =>
    prisma.auditLog.count({ where: { action, after: { path: ['companyId'], equals: companyId } } });

  /** Estado observável que nenhuma requisição rejeitada pode alterar. */
  async function snapshot() {
    const [audits, leads, runs, companies] = await Promise.all([
      minerAudits(),
      prisma.prospectLead.count({ where: { companyId: { in: companyIds } } }),
      prisma.miningRun.count({ where: { bairro: { startsWith: TAG } } }),
      prisma.company.findMany({
        where: { id: { in: companyIds } },
        select: { id: true, assignedTo: true, updatedAt: true },
        orderBy: { id: 'asc' },
      }),
    ]);
    return { audits, leads, runs, companies };
  }

  const runBody = (bairro: string) => ({ bairro, cidade: 'Santos', uf: 'SP', nichos: [NICHO] });

  beforeAll(async () => {
    // Trava: só o banco de teste (`TEST_DATABASE_URL`, nome `*_test`); nunca `DATABASE_URL`.
    process.env.DATABASE_URL = assertTestDatabase(rawTestDatabaseUrl(), 'teste de integração');

    ({ prisma } = await import('@/lib/prisma'));
    r = {
      assignees: await import('@/app/api/tools/lead-miner/assignees/route'),
      config: await import('@/app/api/tools/lead-miner/config/route'),
      runs: await import('@/app/api/tools/lead-miner/runs/route'),
      runsActive: await import('@/app/api/tools/lead-miner/runs/active/route'),
      runsLookup: await import('@/app/api/tools/lead-miner/runs/lookup/route'),
      run: await import('@/app/api/tools/lead-miner/runs/[id]/route'),
      discover: await import('@/app/api/tools/lead-miner/runs/[id]/discover/route'),
      batch: await import('@/app/api/tools/lead-miner/runs/[id]/batch/route'),
      companies: await import('@/app/api/tools/lead-miner/companies/route'),
      map: await import('@/app/api/tools/lead-miner/companies/map/route'),
      exportCsv: await import('@/app/api/tools/lead-miner/companies/export/route'),
      triage: await import('@/app/api/tools/lead-miner/companies/triage/route'),
      assign: await import('@/app/api/tools/lead-miner/companies/assign/route'),
      company: await import('@/app/api/tools/lead-miner/companies/[id]/route'),
      claim: await import('@/app/api/tools/lead-miner/companies/[id]/claim/route'),
      lead: await import('@/app/api/tools/leads/[id]/route'),
      convert: await import('@/app/api/tools/leads/[id]/convert/route'),
    };

    const byEmail = async (email: string) =>
      (await prisma.user.findUniqueOrThrow({ where: { email }, select: { id: true } })).id;
    users.gerente = await byEmail('gabriel.santos@scitecjr.com');
    users.assessor = await byEmail('lucas.mendes@scitecjr.com');
    users.midias = await byEmail('mariana.duarte@scitecjr.com');
    users.presidente = await byEmail('joao.vaz@scitecjr.com');

    startedAt = new Date(Date.now() - 1000);
    const run = await prisma.miningRun.create({
      data: {
        bairro: `${TAG} fixture`,
        cidade: 'Santos',
        uf: 'SP',
        bairroNorm: `${TAG} fixture`,
        cidadeNorm: 'santos',
        nichos: [NICHO],
        paramsKey: `${TAG}-fixture`,
        status: 'PENDENTE',
        createdById: users.gerente,
      },
    });
    fixtureRunId = run.id;
    runIds.push(run.id);
  }, 60_000);

  afterEach(() => auditFault.disarm());

  afterAll(async () => {
    if (!prisma) return;
    await prisma.auditLog.deleteMany({
      where: { OR: companyIds.map((id) => ({ after: { path: ['companyId'], equals: id } })) },
    });
    await prisma.card.deleteMany({ where: { id: { in: cardIds } } });
    await prisma.prospectLead.deleteMany({
      where: { OR: [{ id: { in: leadIds } }, { companyId: { in: companyIds } }] },
    });
    await prisma.miningRun.deleteMany({
      where: { OR: [{ id: { in: runIds } }, { bairro: { startsWith: TAG } }] },
    });
    await prisma.company.deleteMany({ where: { id: { in: companyIds } } });
    await prisma.$disconnect();
  });

  /** Todas as rotas, com corpos válidos que gravariam algo se a permissão não fosse checada. */
  function allRoutes(companyId: string) {
    const q = '?bairro=Centro&cidade=Santos&uf=SP';
    return [
      { name: 'GET assignees', h: r.assignees.GET },
      { name: 'GET config', h: r.config.GET },
      { name: 'GET runs', h: r.runs.GET, path: '/api/tools/lead-miner/runs' },
      { name: 'POST runs', h: r.runs.POST, method: 'POST', body: runBody(`${TAG} negado`) },
      { name: 'GET runs/active', h: r.runsActive.GET },
      { name: 'GET runs/lookup', h: r.runsLookup.GET, path: `/api/tools/lead-miner/runs/lookup${q}` },
      { name: 'GET runs/[id]', h: r.run.GET, params: { id: fixtureRunId } },
      { name: 'POST runs/[id]/discover', h: r.discover.POST, method: 'POST', params: { id: fixtureRunId } },
      { name: 'POST runs/[id]/batch', h: r.batch.POST, method: 'POST', params: { id: fixtureRunId } },
      { name: 'GET companies', h: r.companies.GET, path: '/api/tools/lead-miner/companies' },
      { name: 'GET companies/map', h: r.map.GET, path: '/api/tools/lead-miner/companies/map' },
      { name: 'POST companies/export', h: r.exportCsv.POST, method: 'POST', body: { ids: [companyId] } },
      { name: 'POST companies/triage', h: r.triage.POST, method: 'POST', body: { ids: [companyId] } },
      {
        name: 'POST companies/assign',
        h: r.assign.POST,
        method: 'POST',
        body: { ids: [companyId], assigneeId: users.assessor },
      },
      { name: 'GET companies/[id]', h: r.company.GET, params: { id: companyId } },
      { name: 'POST companies/[id]/claim', h: r.claim.POST, method: 'POST', params: { id: companyId } },
    ];
  }

  describe('autenticação e permissão (Req. 18.1, 18.2, 18.3, 18.11)', () => {
    it('sem sessão → 401 em todas as rotas, sem escrita e sem AuditLog', async () => {
      const companyId = await newCompany();
      const before = await snapshot();
      for (const route of allRoutes(companyId)) {
        const res = await call(null, route.h, route);
        expect(res.status, route.name).toBe(401);
        expect(Object.keys(res.body), route.name).toEqual(['error']);
      }
      expect(await snapshot()).toEqual(before);
    });

    it('usuário fora de Negócios → 403 em todas as rotas, sem dados, escrita ou AuditLog', async () => {
      const companyId = await newCompany();
      const before = await snapshot();
      for (const route of allRoutes(companyId)) {
        const res = await call(users.midias, route.h, route);
        expect(res.status, route.name).toBe(403);
        expect(Object.keys(res.body), route.name).toEqual(['error']);
      }
      expect(await snapshot()).toEqual(before);
    });

    it('Negócios sem ser Atribuidor → 403 em assignees e assign, sem escrita', async () => {
      const companyId = await newCompany();
      const before = await snapshot();
      const a = await call(users.assessor, r.assignees.GET);
      const b = await call(users.assessor, r.assign.POST, {
        method: 'POST',
        body: { ids: [companyId], assigneeId: users.assessor },
      });
      expect([a.status, b.status]).toEqual([403, 403]);
      expect(await snapshot()).toEqual(before);
    });

    it('Atribuidor recebe assignees como lista plana de elegíveis', async () => {
      const res = await call(users.gerente, r.assignees.GET);
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      const ids = res.body.map((u: { id: string }) => u.id);
      expect(ids).toEqual(expect.arrayContaining([users.gerente, users.assessor, users.presidente]));
      expect(ids).not.toContain(users.midias);
    });
  });

  describe('mineração (Req. 18.7, 18.12)', () => {
    it('POSTs idênticos concorrentes → 201 + 409 com o runId do vencedor; parâmetros diferentes → 201', async () => {
      const body = runBody(`${TAG} Vila Mathias`);
      const results = await Promise.all([
        call(users.gerente, r.runs.POST, { method: 'POST', body }),
        call(users.gerente, r.runs.POST, { method: 'POST', body: { ...body, bairro: `  ${body.bairro}  ` } }),
      ]);
      const statuses = results.map((x) => x.status).sort();
      expect(statuses).toEqual([201, 409]);
      const created = results.find((x) => x.status === 201)!;
      const conflict = results.find((x) => x.status === 409)!;
      runIds.push(created.body.id);
      expect(conflict.body.runId).toBe(created.body.id);
      expect(typeof conflict.body.error).toBe('string');
      expect(await prisma.miningRun.count({ where: { bairro: body.bairro } })).toBe(1);

      const other = await call(users.gerente, r.runs.POST, {
        method: 'POST',
        body: runBody(`${TAG} Gonzaga`),
      });
      expect(other.status).toBe(201);
      runIds.push(other.body.id);
      expect(other.body.status).toBe('PENDENTE');
      const autor = await prisma.miningRun.findUniqueOrThrow({ where: { id: other.body.id } });
      expect(autor.createdById).toBe(users.gerente);
    });
  });

  describe('triagem (Req. 15.4, 15.10, 15.12)', () => {
    it('0 ou 201 ids → 400 com o limite, sem criar lead', async () => {
      const companyId = await newCompany();
      const many = [companyId, ...Array.from({ length: 200 }, () => randomUUID())];
      const before = await snapshot();
      for (const ids of [[], many]) {
        const res = await call(users.gerente, r.triage.POST, { method: 'POST', body: { ids } });
        expect(res.status).toBe(400);
        expect(res.body.error).toMatch(/1 a 200/);
      }
      expect(await snapshot()).toEqual(before);
    });

    it('envios concorrentes da mesma empresa criam exatamente 1 lead', async () => {
      const companyId = await newCompany({ assignedTo: users.assessor });
      const results = await Promise.all(
        Array.from({ length: 3 }, () =>
          call(users.gerente, r.triage.POST, { method: 'POST', body: { ids: [companyId] } }),
        ),
      );
      for (const res of results) {
        expect(res.status).toBe(200);
        expect(res.body.created + res.body.ignored).toBe(1);
      }
      expect(results.reduce((s, x) => s + x.body.created, 0)).toBe(1);
      const leads = await prisma.prospectLead.findMany({ where: { companyId } });
      expect(leads).toHaveLength(1);
      expect(leads[0]).toMatchObject({ status: 'RAW', assignedTo: users.assessor });
      expect(await auditsFor('LEAD_MINER_SENT_TO_TRIAGE', companyId)).toBe(1);
    });

    it('erro durante a gravação desfaz todos os leads do envio e não deixa AuditLog', async () => {
      const ids = [await newCompany(), await newCompany()];
      auditFault.arm(2);
      const errSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
      const res = await call(users.gerente, r.triage.POST, { method: 'POST', body: { ids } });
      errSpy.mockRestore();
      expect(res.status).toBe(500);
      expect(JSON.stringify(res.body)).not.toContain(SIMULATED_FAILURE);
      expect(await prisma.prospectLead.count({ where: { companyId: { in: ids } } })).toBe(0);
      for (const id of ids) expect(await auditsFor('LEAD_MINER_SENT_TO_TRIAGE', id)).toBe(0);
    });
  });

  describe('responsável (Req. 16.4, 16.8)', () => {
    it('dois "Assumir" simultâneos → 200 + 409 com o responsável atual', async () => {
      const companyId = await newCompany();
      const leadId = await newLead(companyId);
      const results = await Promise.all([
        call(users.gerente, r.claim.POST, { method: 'POST', params: { id: companyId } }),
        call(users.assessor, r.claim.POST, { method: 'POST', params: { id: companyId } }),
      ]);
      expect(results.map((x) => x.status).sort()).toEqual([200, 409]);
      const ok = results.find((x) => x.status === 200)!;
      const conflict = results.find((x) => x.status === 409)!;
      const winner = ok.body.assignedTo.id as string;
      expect([users.gerente, users.assessor]).toContain(winner);
      expect(conflict.body.assignedTo).toMatchObject({ id: winner });
      expect(typeof conflict.body.error).toBe('string');

      const company = await prisma.company.findUniqueOrThrow({ where: { id: companyId } });
      const lead = await prisma.prospectLead.findUniqueOrThrow({ where: { id: leadId } });
      expect(company.assignedTo).toBe(winner);
      expect(lead.assignedTo).toBe(winner);
      expect(await auditsFor('LEAD_MINER_CLAIMED', companyId)).toBe(1);
    });

    it('falha durante "Atribuir" desfaz empresas e leads da seleção, sem AuditLog', async () => {
      const ids = [await newCompany(), await newCompany({ assignedTo: users.gerente })];
      const leads = [await newLead(ids[0]), await newLead(ids[1])];
      await prisma.prospectLead.update({ where: { id: leads[1] }, data: { assignedTo: users.gerente } });
      auditFault.arm(2);
      const errSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
      const res = await call(users.gerente, r.assign.POST, {
        method: 'POST',
        body: { ids, assigneeId: users.assessor },
      });
      errSpy.mockRestore();
      expect(res.status).toBe(500);

      const companies = await prisma.company.findMany({ where: { id: { in: ids } } });
      const byId = new Map(companies.map((c) => [c.id, c.assignedTo]));
      expect(byId.get(ids[0])).toBeNull();
      expect(byId.get(ids[1])).toBe(users.gerente);
      const leadRows = await prisma.prospectLead.findMany({ where: { id: { in: leads } } });
      const leadById = new Map(leadRows.map((l) => [l.id, l.assignedTo]));
      expect(leadById.get(leads[0])).toBeNull();
      expect(leadById.get(leads[1])).toBe(users.gerente);
      for (const id of ids) expect(await auditsFor('LEAD_MINER_ASSIGNED', id)).toBe(0);

      // Sem falha, a mesma atribuição é aplicada a todas as empresas e leads.
      const again = await call(users.gerente, r.assign.POST, {
        method: 'POST',
        body: { ids, assigneeId: users.assessor },
      });
      expect(again.status).toBe(200);
      expect(again.body).toMatchObject({ updated: 2, assignee: { id: users.assessor } });
      expect(await prisma.company.count({ where: { id: { in: ids }, assignedTo: users.assessor } })).toBe(2);
      expect(await prisma.prospectLead.count({ where: { id: { in: leads }, assignedTo: users.assessor } })).toBe(2);
    });
  });

  describe('regressão da triagem existente (Req. 15.8)', () => {
    async function rawToCard(leadId: string) {
      const pending = await call(users.gerente, r.lead.PATCH, {
        method: 'PATCH',
        params: { id: leadId },
        body: { status: 'PENDING' },
      });
      expect(pending.status).toBe(200);
      expect(pending.body.status).toBe('PENDING');

      const converted = await call(users.gerente, r.convert.POST, {
        method: 'POST',
        params: { id: leadId },
        body: {},
      });
      expect(converted.status).toBe(200);
      cardIds.push(converted.body.card.id);
      expect(converted.body.lead).toMatchObject({
        status: 'CONVERTED_TO_PIPE',
        pipeCardId: converted.body.card.id,
      });
      return converted.body;
    }

    it('lead com companyId (enviado pelo minerador): RAW → PENDING → card', async () => {
      const companyId = await newCompany();
      const sent = await call(users.gerente, r.triage.POST, { method: 'POST', body: { ids: [companyId] } });
      expect(sent.body).toEqual({ created: 1, ignored: 0 });
      const lead = await prisma.prospectLead.findUniqueOrThrow({ where: { companyId } });
      leadIds.push(lead.id);
      expect(lead.status).toBe('RAW');

      const out = await rawToCard(lead.id);
      expect(out.card.title).toBe(`Projeto - ${lead.companyName}`);
      expect(out.lead.companyId).toBe(companyId);
    });

    it('lead sem companyId: RAW → PENDING → card, comportamento inalterado', async () => {
      const leadId = await newLead(null);
      const out = await rawToCard(leadId);
      expect(out.card.title).toBe(`Projeto - ${TAG} Lead`);
      expect(out.lead.companyId).toBeNull();
    });
  });
});

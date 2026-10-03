/**
 * Testes de integração dos painéis contra Postgres real (Tarefa 11.3).
 * Pulados sem `RUN_DB_TESTS=1`. Banco: `DATABASE_URL_TEST` (ou `DATABASE_URL` do `.env`); as
 * migrações pendentes são aplicadas com `prisma migrate deploy` antes dos testes.
 *
 * Padrão de `tests/lead-miner/integration/`: prefixo único por execução (`TAG`) em toda linha
 * criada, limpeza no `afterAll`, `@/auth` simulado com `AsyncLocalStorage` e `withAuth` real
 * lendo o ator do banco. Os handlers de rota são importados diretamente.
 *
 * - Repositório ≡ Calculadora_Metricas: cada número de `prismaDashboardRepository` é comparado
 *   com a Calculadora aplicada às mesmas linhas, lidas do banco (antes e depois da consulta, para
 *   não depender de dados de outros testes rodando em paralelo).
 * - Rotas `/api/dashboards/**`: 401/403/404/400/200 por tipo de pessoa, sem alterar registros e
 *   sem `email`/`description`/`contactInfo` nas respostas.
 * - API_Tarefas: POST/PATCH gravam e apagam `completedAt`.
 * - Migração `20261010000000_paineis`: backfill `completedAt = updatedAt` sem alterar `updatedAt`.
 *
 * Requisitos: 2.8, 2.10, 3.8, 3.9, 3.10, 4.1, 4.5, 5.3, 6.1, 6.3, 8.3, 8.4, 8.8, 12.5.
 */
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { Prisma, PrismaClient } from '@prisma/client';
import type { DashboardRepository } from '@/lib/dashboards/repository';
import {
  CONVERSION_COHORT_STATUSES,
  CONVERTED_LEAD_STATUS,
  LEAD_STATUSES,
  OPEN_REQUEST_STATUSES,
  buildMemberSummaries,
  computeConversion,
  computeTaskCounts,
  conversionFromCounts,
  countLeadsByStatus,
  countRequestsByStatus,
  emptyLeadCounts,
  isOverdueRequest,
  isOverdueTask,
  leadsByAssignee,
  phaseCounts,
  statusRowsToCounts,
  summarizeTasksByMember,
  sumRows,
  tasksInScope,
  type CountRow,
  type LeadFact,
  type LeadStatus,
  type LeadStatusCounts,
  type ProgressScope,
  type RequestFact,
  type TaskFact,
} from '@/lib/dashboards/metrics';
import {
  PERIODS,
  addDays,
  buildMetricContext,
  dueDayKey,
  periodWindow,
  saoPauloDayKey,
  type MetricContext,
  type Periodo,
} from '@/lib/dashboards/period';
import { formatDayKey } from '@/lib/dashboards/format';
import { FORBIDDEN_MESSAGE, INVALID_PERIOD_MESSAGE, NOT_FOUND_MESSAGE } from '@/lib/dashboards/service';
import { call } from './session';

const RUN_DB_TESTS = process.env.RUN_DB_TESTS === '1';

vi.mock('server-only', () => ({}));

vi.mock('@/auth', async () => {
  const { sessionStore } = await import('./session');
  return {
    auth: async () => {
      const id = sessionStore.getStore();
      return id ? { user: { id } } : null;
    },
  };
});

const ROOT = path.resolve(__dirname, '../../..');
const MIGRATION_FILE = path.join(ROOT, 'prisma/migrations/20261010000000_paineis/migration.sql');
const TAG = `DBINT${Date.now().toString(36)}${randomUUID().slice(0, 6)}`;
const SECRET = `${TAG} segredo`;
const EMAIL_DOMAIN = '@dashboards-int.test';
const SENSITIVE_KEYS = ['email', 'description', 'contactInfo', 'contactName', 'values', 'notes'];

type Handlers = Record<string, any>;
type DeptCode = 'NEGOCIOS' | 'ADMJURFIN' | 'GENTE' | 'MIDIAS';
type SectorCode = 'TEC_SOFTWARE' | 'ENG_INOVACAO';

/** Fatos de tarefa com as chaves de ordenação da lista de atrasadas. */
type TaskRow = TaskFact & { id: string; title: string; createdAt: Date };

/** Chaves sensíveis presentes em qualquer nível de um JSON. */
function sensitiveKeysIn(value: unknown, found: string[] = []): string[] {
  if (Array.isArray(value)) {
    for (const v of value) sensitiveKeysIn(v, found);
  } else if (value !== null && typeof value === 'object') {
    for (const [k, v] of Object.entries(value)) {
      if (SENSITIVE_KEYS.includes(k)) found.push(k);
      sensitiveKeysIn(v, found);
    }
  }
  return found;
}

/** Ordem da lista de atrasadas: Dia_Prazo (instante), criação e id crescentes. */
function overdueOrder(a: TaskRow, b: TaskRow): number {
  return (
    a.dueDate!.getTime() - b.dueDate!.getTime() ||
    a.createdAt.getTime() - b.createdAt.getTime() ||
    (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
  );
}

function sortIds(ids: string[]): string[] {
  return [...ids].sort();
}

describe.skipIf(!RUN_DB_TESTS)('dashboards — repositório, rotas e migração (Postgres)', () => {
  let prisma: PrismaClient;
  let repo: DashboardRepository;
  let r: Handlers = {};

  const units = {} as Record<DeptCode | SectorCode, string>;
  const users = {
    presidente: '',
    gdNeg: '',
    assessorNeg: '',
    gsTec: '',
    assessorMid: '',
    lista: '',
    inativoNeg: '',
    pendente: '',
  };
  const userIds: string[] = [];
  const taskIds: string[] = [];
  const pipeIds: string[] = [];
  const cardIds: string[] = [];
  const requestIds: string[] = [];
  const leadIds: string[] = [];
  const phases = { neg: [] as string[], tec: [] as string[] };

  let now0: Date;
  let today: string;
  /** Instante `HH:MM:SS` UTC do dia `today + k`. */
  const day = (k: number, time = '12:00:00') => new Date(`${addDays(today, k)}T${time}.000Z`);

  // -------------------------------------------------------------------------
  // Leitura das linhas do banco como fatos da Calculadora
  // -------------------------------------------------------------------------

  const taskSelect = {
    id: true,
    title: true,
    status: true,
    dueDate: true,
    completedAt: true,
    assigneeId: true,
    createdAt: true,
    unit: { select: { code: true } },
  } satisfies Prisma.TaskSelect;

  async function taskFacts(where: Prisma.TaskWhereInput): Promise<TaskRow[]> {
    const rows = await prisma.task.findMany({ where, select: taskSelect, orderBy: { id: 'asc' } });
    return rows.map((t) => ({
      id: t.id,
      title: t.title,
      status: t.status,
      dueDate: t.dueDate,
      completedAt: t.completedAt,
      assigneeId: t.assigneeId,
      createdAt: t.createdAt,
      unitCode: t.unit?.code ?? null,
    }));
  }

  async function requestFacts(where: Prisma.CrossDeptRequestWhereInput): Promise<RequestFact[]> {
    return prisma.crossDeptRequest.findMany({
      where,
      select: { status: true, fromDept: true, toDept: true, handlerId: true, dueDate: true, updatedAt: true },
      orderBy: { id: 'asc' },
    });
  }

  /** Leads com status do enum (a coluna é `String`; o repositório filtra pela mesma lista). */
  async function leadFacts(where: Prisma.ProspectLeadWhereInput = {}): Promise<LeadFact[]> {
    const rows = await prisma.prospectLead.findMany({
      where: { AND: [where, { status: { in: [...LEAD_STATUSES] } }] },
      select: { status: true, assignedTo: true, createdAt: true },
      orderBy: { id: 'asc' },
    });
    return rows as LeadFact[];
  }

  async function activeMemberIds(code: DeptCode | SectorCode, kind: 'DEPARTAMENTO' | 'SETOR') {
    const where: Prisma.UserWhereInput =
      kind === 'DEPARTAMENTO'
        ? { status: 'ATIVO', departmentId: units[code] }
        : { status: 'ATIVO', sectorMemberships: { some: { unitId: units[code] } } };
    const rows = await prisma.user.findMany({ where, select: { id: true } });
    return sortIds(rows.map((u) => u.id));
  }

  /**
   * Lê os fatos antes e depois da consulta e só compara quando não mudaram no meio
   * (outros arquivos de integração podem gravar em paralelo no mesmo banco).
   */
  async function consistent<F, R>(read: () => Promise<F>, query: () => Promise<R>): Promise<{ facts: F; result: R }> {
    for (let attempt = 0; attempt < 5; attempt++) {
      const before = await read();
      const result = await query();
      const after = await read();
      if (JSON.stringify(before) === JSON.stringify(after)) return { facts: after, result };
    }
    throw new Error('os dados mudaram durante todas as tentativas de comparação');
  }

  /** Estado observável que nenhuma requisição dos painéis pode alterar (Req. 2.8). */
  async function snapshot() {
    const [tasks, cards, requests, leads, people, audits] = await Promise.all([
      prisma.task.findMany({ where: { id: { in: taskIds } }, orderBy: { id: 'asc' } }),
      prisma.card.findMany({ where: { id: { in: cardIds } }, orderBy: { id: 'asc' } }),
      prisma.crossDeptRequest.findMany({ where: { id: { in: requestIds } }, orderBy: { id: 'asc' } }),
      prisma.prospectLead.findMany({ where: { id: { in: leadIds } }, orderBy: { id: 'asc' } }),
      prisma.user.findMany({ where: { id: { in: userIds } }, orderBy: { id: 'asc' } }),
      prisma.auditLog.findMany({
        where: { OR: [{ actorId: { in: userIds } }, { targetUserId: { in: userIds } }] },
        orderBy: { id: 'asc' },
      }),
    ]);
    return { tasks, cards, requests, leads, people, audits };
  }

  // -------------------------------------------------------------------------
  // Semeadura
  // -------------------------------------------------------------------------

  async function newUser(
    key: string,
    data: {
      status?: 'PENDENTE' | 'ATIVO' | 'INATIVO';
      globalRole?: 'PRESIDENTE' | 'VICE_PRESIDENTE';
      dept?: DeptCode;
      deptRole?: 'GERENTE' | 'ASSESSOR';
      sectors?: [SectorCode, 'GERENTE' | 'MEMBRO'][];
    }
  ): Promise<string> {
    const u = await prisma.user.create({
      data: {
        name: `${TAG} ${key}`,
        email: `${TAG.toLowerCase()}.${key.toLowerCase()}${EMAIL_DOMAIN}`,
        status: data.status ?? 'ATIVO',
        globalRole: data.globalRole ?? null,
        departmentId: data.dept ? units[data.dept] : null,
        departmentRole: data.dept ? (data.deptRole ?? 'ASSESSOR') : null,
        sectorMemberships: {
          create: (data.sectors ?? []).map(([code, role]) => ({ unitId: units[code], role })),
        },
      },
      select: { id: true },
    });
    userIds.push(u.id);
    return u.id;
  }

  async function newTask(data: {
    unit: DeptCode | SectorCode | null;
    status: string;
    assigneeId: string | null;
    dueDate?: Date | null;
    completedAt?: Date | null;
    createdAt?: Date;
    title?: string;
  }): Promise<string> {
    const t = await prisma.task.create({
      data: {
        title: data.title ?? `${TAG} tarefa ${taskIds.length}`,
        description: SECRET,
        status: data.status,
        dueDate: data.dueDate ?? null,
        completedAt: data.completedAt ?? null,
        unitId: data.unit ? units[data.unit] : null,
        assigneeId: data.assigneeId,
        ...(data.createdAt ? { createdAt: data.createdAt } : {}),
      },
      select: { id: true },
    });
    taskIds.push(t.id);
    return t.id;
  }

  async function newPipe(unit: DeptCode | SectorCode, phaseOrders: number[]): Promise<string[]> {
    const pipe = await prisma.pipe.create({
      data: {
        name: `${TAG} Funil ${unit}`,
        description: SECRET,
        unitId: units[unit],
        phases: { create: phaseOrders.map((order) => ({ name: `${TAG} Fase ${order}`, order })) },
      },
      select: { id: true, phases: { select: { id: true, order: true } } },
    });
    pipeIds.push(pipe.id);
    // ids das fases indexados por `order`
    const byOrder: string[] = [];
    for (const ph of pipe.phases) byOrder[ph.order] = ph.id;
    return byOrder;
  }

  async function newCard(phaseId: string, assigneeId: string | null): Promise<void> {
    const c = await prisma.card.create({
      data: { title: `${TAG} card ${cardIds.length}`, description: SECRET, phaseId, assigneeId },
      select: { id: true },
    });
    cardIds.push(c.id);
  }

  async function seed() {
    now0 = new Date();
    today = saoPauloDayKey(now0);
    const from30 = periodWindow('30d', now0).from!;
    const from7 = periodWindow('7d', now0).from!;

    users.presidente = await newUser('Presidente', { globalRole: 'PRESIDENTE' });
    users.gdNeg = await newUser('GerenteNegocios', { dept: 'NEGOCIOS', deptRole: 'GERENTE' });
    users.assessorNeg = await newUser('AssessorNegocios', {
      dept: 'NEGOCIOS',
      sectors: [['TEC_SOFTWARE', 'MEMBRO']],
    });
    users.gsTec = await newUser('GerenteSetorTec', { dept: 'MIDIAS', sectors: [['TEC_SOFTWARE', 'GERENTE']] });
    users.assessorMid = await newUser('AssessorMidias', { dept: 'MIDIAS' });
    users.lista = await newUser('ListaGente', { dept: 'GENTE' });
    users.inativoNeg = await newUser('InativoNegocios', { status: 'INATIVO', dept: 'NEGOCIOS' });
    users.pendente = await newUser('Pendente', { status: 'PENDENTE' });

    // Tarefas nas bordas de prazo, conclusão e status (inclui CANCELLED e status fora do enum).
    const statuses = ['TODO', 'IN_PROGRESS', 'DONE', 'CANCELLED', 'ARQUIVADA'];
    const dues = [null, day(-1), day(0, '00:00:00'), day(0, '23:59:59'), day(1), day(-40)];
    const dones = [
      new Date(from30.getTime() - 1),
      from30,
      new Date(from7.getTime() - 1),
      from7,
      new Date(now0.getTime() - 3_600_000),
      null,
      day(-120),
    ];
    const negAssignees = [users.gdNeg, users.assessorNeg, users.inativoNeg, null];
    for (let i = 0; i < 35; i++) {
      const status = statuses[i % statuses.length];
      await newTask({
        unit: 'NEGOCIOS',
        status,
        assigneeId: negAssignees[i % negAssignees.length],
        dueDate: dues[i % dues.length],
        // completedAt em tarefa não concluída não pode contar
        completedAt: status === 'DONE' ? dones[i % dones.length] : i % 4 === 0 ? day(-2) : null,
      });
    }
    const tecAssignees = [users.assessorNeg, users.gsTec, null];
    for (let i = 0; i < 15; i++) {
      const status = statuses[i % statuses.length];
      await newTask({
        unit: 'TEC_SOFTWARE',
        status,
        assigneeId: tecAssignees[i % tecAssignees.length],
        dueDate: dues[(i + 1) % dues.length],
        completedAt: status === 'DONE' ? dones[(i + 2) % dones.length] : null,
      });
    }
    // Tarefas gerais (sem Unidade) do assessor: entram só no escopo 'ALL'.
    for (let i = 0; i < 8; i++) {
      const status = statuses[i % statuses.length];
      await newTask({
        unit: null,
        status,
        assigneeId: users.assessorNeg,
        dueDate: dues[(i + 3) % dues.length],
        completedAt: status === 'DONE' ? dones[(i + 4) % dones.length] : null,
      });
    }
    // 12 atrasadas do membro "lista" em Gente, com empates de prazo e criação fora da ordem de inserção.
    for (let i = 0; i < 12; i++) {
      await newTask({
        unit: 'GENTE',
        status: i % 2 === 0 ? 'TODO' : 'IN_PROGRESS',
        assigneeId: users.lista,
        dueDate: day(-(2 + Math.floor(i / 3)), '15:00:00'),
        createdAt: new Date(now0.getTime() - ((i * 7) % 12) * 60_000 - 3_600_000),
        title: `${TAG} atrasada ${String(i).padStart(2, '0')}`,
      });
    }
    await newTask({ unit: 'GENTE', status: 'TODO', assigneeId: users.lista, dueDate: day(0) });
    await newTask({ unit: 'GENTE', status: 'DONE', assigneeId: users.lista, dueDate: day(-30), completedAt: day(-1) });
    await newTask({ unit: 'GENTE', status: 'CANCELLED', assigneeId: users.lista, dueDate: day(-30) });

    // Funis: fases criadas fora de ordem; uma fase sem cards.
    phases.neg = await newPipe('NEGOCIOS', [2, 0, 1]);
    await newCard(phases.neg[0], users.assessorNeg);
    await newCard(phases.neg[0], users.assessorNeg);
    await newCard(phases.neg[0], null);
    await newCard(phases.neg[2], users.gdNeg);
    phases.tec = await newPipe('TEC_SOFTWARE', [0, 1]);
    await newCard(phases.tec[0], users.assessorNeg);
    await newCard(phases.tec[0], users.assessorNeg);
    await newCard(phases.tec[1], users.gsTec);

    // Solicitações recebidas e enviadas por Negócios, com e sem prazo, concluídas dentro e fora do Periodo.
    const reqStatuses = ['PENDING', 'APPROVED', 'REJECTED', 'IN_PROGRESS', 'COMPLETED', 'OUTRO'];
    const reqDues = [null, day(-1), day(0, '00:00:00'), day(3), day(-10)];
    const reqUpdated = [new Date(now0.getTime() - 3_600_000), new Date(from30.getTime() - 1), from30, day(-200)];
    for (let i = 0; i < 18; i++) {
      const received = i % 3 !== 2;
      const req = await prisma.crossDeptRequest.create({
        data: {
          title: `${TAG} solicitação ${i}`,
          description: SECRET,
          fromDept: received ? (i % 2 === 0 ? 'MIDIAS' : 'GLOBAL') : 'NEGOCIOS',
          toDept: received ? 'NEGOCIOS' : 'GENTE',
          status: reqStatuses[i % reqStatuses.length],
          requesterId: users.gdNeg,
          handlerId: i % 2 === 0 ? users.assessorNeg : null,
          dueDate: reqDues[i % reqDues.length],
          updatedAt: reqUpdated[i % reqUpdated.length],
        },
        select: { id: true },
      });
      requestIds.push(req.id);
    }

    // Leads em todos os status, com e sem responsável, criados dentro e fora do Periodo.
    const leadCreated = [new Date(now0.getTime() - 3_600_000), new Date(from30.getTime() - 1), from30, day(-200)];
    const leadAssignees = [users.assessorNeg, users.gdNeg, null];
    for (let i = 0; i < 20; i++) {
      const lead = await prisma.prospectLead.create({
        data: {
          companyName: `${TAG} Lead ${i}`,
          contactName: SECRET,
          contactInfo: SECRET,
          notes: SECRET,
          actionPlan: 'Plano',
          status: LEAD_STATUSES[i % LEAD_STATUSES.length],
          assignedTo: leadAssignees[i % leadAssignees.length],
          createdAt: leadCreated[i % leadCreated.length],
        },
        select: { id: true },
      });
      leadIds.push(lead.id);
    }
  }

  // -------------------------------------------------------------------------
  // Ciclo de vida
  // -------------------------------------------------------------------------

  beforeAll(async () => {
    if (!process.env.DATABASE_URL_TEST && !process.env.DATABASE_URL) {
      try {
        process.loadEnvFile(path.join(ROOT, '.env'));
      } catch {
        /* sem .env */
      }
    }
    if (process.env.DATABASE_URL_TEST) process.env.DATABASE_URL = process.env.DATABASE_URL_TEST;
    if (!process.env.DATABASE_URL) throw new Error('Defina DATABASE_URL_TEST ou DATABASE_URL');

    execFileSync('npx', ['prisma', 'migrate', 'deploy'], {
      cwd: ROOT,
      env: { ...process.env, DATABASE_URL: process.env.DATABASE_URL },
      stdio: 'pipe',
    });

    ({ prisma } = await import('@/lib/prisma'));
    const { prismaDashboardRepository } = await import('@/lib/dashboards/repository');
    repo = prismaDashboardRepository(prisma);
    r = {
      hub: await import('@/app/api/dashboards/route'),
      unit: await import('@/app/api/dashboards/units/[code]/route'),
      member: await import('@/app/api/dashboards/members/[userId]/route'),
      tasks: await import('@/app/api/tasks/route'),
      task: await import('@/app/api/tasks/[id]/route'),
    };

    const unitRows = await prisma.unit.findMany({ select: { id: true, code: true } });
    for (const u of unitRows) (units as Record<string, string>)[u.code] = u.id;

    await seed();
  }, 180_000);

  afterAll(async () => {
    if (!prisma) return;
    await prisma.task.deleteMany({
      where: { OR: [{ id: { in: taskIds } }, { title: { startsWith: TAG } }] },
    });
    await prisma.crossDeptRequest.deleteMany({ where: { id: { in: requestIds } } });
    await prisma.prospectLead.deleteMany({ where: { id: { in: leadIds } } });
    await prisma.card.deleteMany({ where: { id: { in: cardIds } } });
    await prisma.pipe.deleteMany({ where: { id: { in: pipeIds } } }); // fases em cascata
    await prisma.auditLog.deleteMany({
      where: { OR: [{ actorId: { in: userIds } }, { targetUserId: { in: userIds } }] },
    });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } }); // vínculos de setor em cascata
    await prisma.$disconnect();
  }, 60_000);

  // -------------------------------------------------------------------------
  // Repositório ≡ Calculadora_Metricas
  // -------------------------------------------------------------------------

  describe('repositório ≡ Calculadora_Metricas (Req. 4.1, 6.1, 6.3, 8.3, 8.4)', () => {
    const ctxFor = (p: Periodo) => buildMetricContext(new Date(), p);

    it.each([
      ['NEGOCIOS', 'DEPARTAMENTO'],
      ['TEC_SOFTWARE', 'SETOR'],
    ] as const)('tarefas e Resumos_Membro de %s em todos os Periodos', async (code, kind) => {
      const members = await activeMemberIds(code, kind);
      const fromRepo = await repo.activeUnitMembers({ id: units[code], type: kind });
      expect(sortIds(fromRepo.map((m) => m.id))).toEqual(members);
      expect(members).not.toContain(users.inativoNeg);

      for (const p of PERIODS) {
        const ctx = ctxFor(p);
        const { facts, result: rows } = await consistent(
          () => taskFacts({ unitId: units[code] }),
          () => repo.unitTaskRows(units[code], ctx)
        );
        const expected = summarizeTasksByMember(facts, members, ctx);
        expect({ open: sumRows(rows.open), overdue: sumRows(rows.overdue), doneInPeriod: sumRows(rows.doneInPeriod) }, p)
          .toEqual(expected.total);
        expect(buildMemberSummaries(members, rows), p).toEqual(expected.members);
      }

      const ctx30 = ctxFor('30d');
      const counts = computeTaskCounts(await taskFacts({ unitId: units[code] }), ctx30);
      // O conjunto semeado exercita as três contagens.
      expect(counts.open).toBeGreaterThan(0);
      expect(counts.overdue).toBeGreaterThan(0);
      expect(counts.doneInPeriod).toBeGreaterThan(0);
    });

    it('tarefas do Alvo por Escopo_Progresso (ALL, setor com e sem tarefas)', async () => {
      const scopes: ProgressScope[] = ['ALL', ['TEC_SOFTWARE'], ['ENG_INOVACAO']];
      for (const scope of scopes) {
        for (const p of PERIODS) {
          const ctx = ctxFor(p);
          const { facts, result } = await consistent(
            () => taskFacts({ assigneeId: users.assessorNeg }),
            () => repo.scopedTaskCounts(users.assessorNeg, scope, ctx)
          );
          expect(result, `${JSON.stringify(scope)} ${p}`).toEqual(computeTaskCounts(tasksInScope(facts, scope), ctx));
        }
      }
    });

    it('cards por fase: fases na ordem de `order`, inclusive com zero cards', async () => {
      const pipes = await repo.unitPipes(units.NEGOCIOS);
      const ours = pipes.find((p) => p.id === pipeIds[0])!;
      expect(ours.phases.map((ph) => ph.order)).toEqual([0, 1, 2]);
      expect(ours.phases.map((ph) => ph.id)).toEqual(phases.neg);

      const ids = ours.phases.map((ph) => ph.id);
      const cards = await prisma.card.findMany({ where: { phaseId: { in: ids } }, select: { phaseId: true, assigneeId: true } });
      const expectedRows = (pred: (c: { assigneeId: string | null }) => boolean): CountRow[] =>
        ids.map((id) => ({ key: id, count: cards.filter((c) => c.phaseId === id && pred(c)).length }));

      const all = phaseCounts(ours.phases, await repo.cardRowsByPhase(ids));
      expect(all).toEqual(phaseCounts(ours.phases, expectedRows(() => true)));
      expect(all.map((ph) => ph.cards)).toEqual([3, 0, 1]);

      const mine = phaseCounts(ours.phases, await repo.cardRowsByPhase(ids, users.assessorNeg));
      expect(mine).toEqual(phaseCounts(ours.phases, expectedRows((c) => c.assigneeId === users.assessorNeg)));
      expect(mine.map((ph) => ph.cards)).toEqual([2, 0, 0]);
    });

    it('cards do Alvo por funil e fase, restritos aos setores do escopo (Req. 8.3, 8.4)', async () => {
      const normalize = (groups: { pipe: { id: string; unit: { code: string } }; phases: { id: string; cards: number }[] }[]) =>
        groups
          .map((g) => ({ pipe: g.pipe.id, unit: g.pipe.unit.code, phases: g.phases.map((ph) => [ph.id, ph.cards]) }))
          .sort((a, b) => (a.pipe < b.pipe ? -1 : 1));

      async function expectedGroups(scope: ProgressScope) {
        const cards = await prisma.card.findMany({
          where: { assigneeId: users.assessorNeg },
          select: { phase: { select: { id: true, order: true, pipe: { select: { id: true, unit: { select: { code: true } } } } } } },
        });
        const inScope = cards.filter((c) => scope === 'ALL' || scope.includes(c.phase.pipe.unit.code));
        const byPipe = new Map<string, { unit: string; phases: Map<string, { order: number; cards: number }> }>();
        for (const { phase } of inScope) {
          const g = byPipe.get(phase.pipe.id) ?? { unit: phase.pipe.unit.code, phases: new Map() };
          const ph = g.phases.get(phase.id) ?? { order: phase.order, cards: 0 };
          ph.cards++;
          g.phases.set(phase.id, ph);
          byPipe.set(phase.pipe.id, g);
        }
        return Array.from(byPipe, ([pipe, g]) => ({
          pipe,
          unit: g.unit,
          phases: Array.from(g.phases)
            .sort((a, b) => a[1].order - b[1].order || (a[0] < b[0] ? -1 : 1))
            .map(([id, ph]) => [id, ph.cards]),
        })).sort((a, b) => (a.pipe < b.pipe ? -1 : 1));
      }

      for (const scope of ['ALL', ['TEC_SOFTWARE'], ['ENG_INOVACAO']] as ProgressScope[]) {
        const groups = await repo.memberCardPhases(users.assessorNeg, scope);
        expect(normalize(groups), JSON.stringify(scope)).toEqual(await expectedGroups(scope));
        for (const g of groups) {
          const orders = g.phases.map((ph) => ph.order);
          expect(orders).toEqual([...orders].sort((a, b) => a - b));
        }
      }
      const tecOnly = await repo.memberCardPhases(users.assessorNeg, ['TEC_SOFTWARE']);
      expect(tecOnly.map((g) => g.pipe.id)).toEqual([pipeIds[1]]);
      expect(await repo.memberCardPhases(users.assessorNeg, ['ENG_INOVACAO'])).toEqual([]);
    });

    it('solicitações do departamento e do responsável em todos os Periodos', async () => {
      for (const p of PERIODS) {
        const ctx = ctxFor(p);
        const { facts, result } = await consistent(
          () => requestFacts({ OR: [{ toDept: 'NEGOCIOS' }, { fromDept: 'NEGOCIOS' }] }),
          () => repo.requestRows('NEGOCIOS', ctx)
        );
        const received = facts.filter((f) => f.toDept === 'NEGOCIOS');
        expect(statusRowsToCounts(result.received), p).toEqual(countRequestsByStatus(received, ctx));
        expect(statusRowsToCounts(result.sent), p).toEqual(
          countRequestsByStatus(facts.filter((f) => f.fromDept === 'NEGOCIOS'), ctx)
        );
        expect(result.overdueReceived, p).toBe(received.filter((f) => isOverdueRequest(f, ctx)).length);
      }

      const ctx = ctxFor('30d');
      const { facts, result } = await consistent(
        () => requestFacts({ handlerId: users.assessorNeg }),
        () => repo.handlerRequestCounts(users.assessorNeg, ctx)
      );
      expect(result).toEqual({
        open: facts.filter((f) => (OPEN_REQUEST_STATUSES as readonly string[]).includes(f.status)).length,
        overdue: facts.filter((f) => isOverdueRequest(f, ctx)).length,
      });
      expect(result.open).toBeGreaterThan(0);
      expect(result.overdue).toBeGreaterThan(0);
    });

    it('leads por status, por responsável e Taxa_Conversao em todos os Periodos (Req. 6.1, 6.3)', async () => {
      for (const p of PERIODS) {
        const ctx = ctxFor(p);
        const { facts, result } = await consistent(() => leadFacts(), () => repo.leadRows(ctx));

        const isLead = (s: string): s is LeadStatus => (LEAD_STATUSES as readonly string[]).includes(s);
        const byStatus = emptyLeadCounts();
        const perAssignee = new Map<string | null, LeadStatusCounts>();
        for (const row of result.byAssigneeStatus) {
          if (!isLead(row.status)) continue;
          byStatus[row.status] += row.count;
          const counts = perAssignee.get(row.assignedTo) ?? emptyLeadCounts();
          counts[row.status] += row.count;
          perAssignee.set(row.assignedTo, counts);
        }
        expect(byStatus, p).toEqual(countLeadsByStatus(facts));
        const expectedByAssignee = leadsByAssignee(facts);
        expect(perAssignee.size, p).toBe(expectedByAssignee.length);
        for (const row of expectedByAssignee) expect(perAssignee.get(row.assignedTo), p).toEqual(row.counts);

        const cohort = new Map(result.cohort.map((c) => [c.key, c.count]));
        const total = CONVERSION_COHORT_STATUSES.reduce((acc, s) => acc + (cohort.get(s) ?? 0), 0);
        expect(conversionFromCounts(cohort.get(CONVERTED_LEAD_STATUS) ?? 0, total), p).toEqual(
          computeConversion(facts, ctx)
        );
        expect(cohort.has('RAW'), p).toBe(false);
      }

      const { facts, result } = await consistent(
        () => leadFacts({ assignedTo: users.assessorNeg }),
        () => repo.memberLeadRows(users.assessorNeg)
      );
      const counts = emptyLeadCounts();
      for (const row of result) counts[row.key as LeadStatus] += row.count;
      expect(counts).toEqual(countLeadsByStatus(facts));
    });
  });

  // -------------------------------------------------------------------------
  // Listas "até 10" (Req. 4.5, 5.3, 8.8)
  // -------------------------------------------------------------------------

  describe('tarefas atrasadas: até 10, ordenadas (Req. 4.5, 5.3, 8.8)', () => {
    it('12 atrasadas do membro → 10 por Dia_Prazo, criação e id', async () => {
      const ctx = buildMetricContext(new Date(), '30d');
      const { facts, result } = await consistent(
        () => taskFacts({ assigneeId: users.lista }),
        () => repo.overdueTasks({ targetId: users.lista, scope: 'ALL' }, ctx, 10)
      );
      const overdue = facts.filter((t) => isOverdueTask(t, ctx)).sort(overdueOrder);
      expect(overdue).toHaveLength(12);
      expect(result).toHaveLength(10);
      expect(result.map((t) => t.id)).toEqual(overdue.slice(0, 10).map((t) => t.id));
      expect(result.map((t) => t.dueDate)).toEqual(overdue.slice(0, 10).map((t) => dueDayKey(t.dueDate!)));
      for (const t of result) {
        expect(t.unit).toEqual({ code: 'GENTE', name: expect.any(String) });
        expect(t.assignee?.id).toBe(users.lista);
        expect(formatDayKey(t.dueDate)).toMatch(/^\d{2}\/\d{2}\/\d{4}$/);
      }
      // Há empates de Dia_Prazo resolvidos pela criação (não pela ordem de inserção).
      const keys = result.map((t) => t.dueDate);
      expect(new Set(keys).size).toBeLessThan(keys.length);
    });

    it('lista da Unidade (Gente) e do Alvo com escopo de setores seguem a mesma ordem', async () => {
      const ctx = buildMetricContext(new Date(), '30d');
      const unitList = await consistent(
        () => taskFacts({ unitId: units.GENTE }),
        () => repo.overdueTasks({ unitId: units.GENTE }, ctx, 10)
      );
      const expectedUnit = unitList.facts.filter((t) => isOverdueTask(t, ctx)).sort(overdueOrder).slice(0, 10);
      expect(unitList.result.map((t) => t.id)).toEqual(expectedUnit.map((t) => t.id));
      expect(unitList.result).toHaveLength(10);

      const scoped = await consistent(
        () => taskFacts({ assigneeId: users.assessorNeg }),
        () => repo.overdueTasks({ targetId: users.assessorNeg, scope: ['TEC_SOFTWARE'] }, ctx, 10)
      );
      const expectedScoped = tasksInScope(scoped.facts, ['TEC_SOFTWARE'])
        .filter((t) => isOverdueTask(t, ctx))
        .sort((a, b) => overdueOrder(a as TaskRow, b as TaskRow))
        .slice(0, 10) as TaskRow[];
      expect(scoped.result.map((t) => t.id)).toEqual(expectedScoped.map((t) => t.id));
      expect(scoped.result.every((t) => t.unit?.code === 'TEC_SOFTWARE')).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // Rotas /api/dashboards/** (Req. 2.1–2.10, 7.3)
  // -------------------------------------------------------------------------

  describe('rotas por tipo de pessoa, somente leitura (Req. 2.8, 2.10)', () => {
    const unitCall = (actor: string | null, code: string, query = '') =>
      call(actor, r.unit.GET, { path: `/api/dashboards/units/${code}${query}`, params: { code } });
    const memberCall = (actor: string | null, userId: string, query = '') =>
      call(actor, r.member.GET, { path: `/api/dashboards/members/${userId}${query}`, params: { userId } });
    const hubCall = (actor: string | null) => call(actor, r.hub.GET, { path: '/api/dashboards' });

    /** Corpo de sucesso: período, Data_Referencia e nada sensível (Req. 2.9, 2.10). */
    function expectSafe(body: unknown) {
      expect(sensitiveKeysIn(body)).toEqual([]);
      const text = JSON.stringify(body);
      expect(text).not.toContain(SECRET);
      expect(text).not.toContain(EMAIL_DOMAIN);
    }

    function ctxOf(body: { period: { key: Periodo; from: string | null; to: string }; referenceDate: string }): MetricContext {
      const ctx = buildMetricContext(new Date(body.period.to), body.period.key);
      expect(body.referenceDate).toBe(ctx.todayKey);
      expect(body.period.from).toBe(ctx.window.from?.toISOString() ?? null);
      return ctx;
    }

    it('401, 403, 404 e 400 sem alterar Task, Card, CrossDeptRequest, ProspectLead e AuditLog', async () => {
      const before = await snapshot();
      const missing = randomUUID();

      const cases: [string, Promise<{ status: number; body: any }>, number, string?][] = [
        ['hub sem sessão', hubCall(null), 401],
        ['unidade sem sessão', unitCall(null, 'NEGOCIOS'), 401],
        ['membro sem sessão', memberCall(null, users.assessorNeg), 401],
        ['hub PENDENTE', hubCall(users.pendente), 403],
        ['unidade INATIVO', unitCall(users.inativoNeg, 'NEGOCIOS'), 403],
        ['membro INATIVO', memberCall(users.inativoNeg, users.inativoNeg), 403],
        ['Assessor de Mídias em Negócios', unitCall(users.assessorMid, 'NEGOCIOS'), 403, FORBIDDEN_MESSAGE],
        ['Assessor de Mídias em outro membro', memberCall(users.assessorMid, users.assessorNeg), 403, FORBIDDEN_MESSAGE],
        ['GD de Negócios em setor sem vínculo', unitCall(users.gdNeg, 'TEC_SOFTWARE'), 403, FORBIDDEN_MESSAGE],
        ['GS em membro sem setor em comum', memberCall(users.gsTec, users.assessorMid), 403, FORBIDDEN_MESSAGE],
        ['Assessor em painel de colega', memberCall(users.assessorNeg, users.gdNeg), 403, FORBIDDEN_MESSAGE],
        ['código inexistente', unitCall(users.presidente, 'XYZ'), 404, NOT_FOUND_MESSAGE],
        ['alvo inexistente', memberCall(users.presidente, missing), 404, NOT_FOUND_MESSAGE],
        ['periodo inválido (unidade)', unitCall(users.presidente, 'NEGOCIOS', '?periodo=30D'), 400, INVALID_PERIOD_MESSAGE],
        ['periodo inválido (membro)', memberCall(users.presidente, users.lista, '?periodo=1a'), 400, INVALID_PERIOD_MESSAGE],
      ];
      for (const [name, pending, status, message] of cases) {
        const res = await pending;
        expect(res.status, name).toBe(status);
        expect(Object.keys(res.body), name).toEqual(['error']);
        if (message) expect(res.body.error, name).toBe(message);
      }

      expect(await snapshot()).toEqual(before);
    });

    it('200 por tipo de pessoa, números iguais à Calculadora e sem dados sensíveis', async () => {
      const before = await snapshot();

      // Presidência: Painel_Departamento de Negócios com solicitações, leads e Resumos de todos os ativos.
      const pres = await consistent(
        () => taskFacts({ unitId: units.NEGOCIOS }),
        () => unitCall(users.presidente, 'negocios', '?periodo=90d')
      );
      expect(pres.result.status).toBe(200);
      const presBody = pres.result.body;
      expectSafe(presBody);
      const presCtx = ctxOf(presBody);
      expect(presBody.unit).toMatchObject({ code: 'NEGOCIOS', type: 'DEPARTAMENTO' });
      expect(presBody.tasks).toEqual(computeTaskCounts(pres.facts, presCtx));
      expect(presBody.requests).not.toBeNull();
      expect(presBody.leads).not.toBeNull();
      expect(presBody.sector).toBeNull();
      const presMembers = presBody.members.map((m: any) => m.user.id);
      expect(presMembers).toEqual(expect.arrayContaining([users.gdNeg, users.assessorNeg]));
      expect(presMembers).not.toContain(users.inativoNeg);
      const ourPipe = presBody.pipes.find((p: any) => p.id === pipeIds[0]);
      expect(ourPipe.phases.map((ph: any) => ph.cards)).toEqual([3, 0, 1]);

      // Gerente de Departamento: vê os Resumos do próprio departamento.
      const gd = await unitCall(users.gdNeg, 'NEGOCIOS');
      expect(gd.status).toBe(200);
      expectSafe(gd.body);
      expect(gd.body.period.key).toBe('30d');
      expect(gd.body.members.map((m: any) => m.user.id)).toEqual(
        expect.arrayContaining([users.gdNeg, users.assessorNeg])
      );

      // Assessor: só a própria linha, no departamento e no setor.
      const asNeg = await unitCall(users.assessorNeg, 'NEGOCIOS');
      expect(asNeg.status).toBe(200);
      expect(asNeg.body.members.map((m: any) => m.user.id)).toEqual([users.assessorNeg]);
      const asTec = await unitCall(users.assessorNeg, 'TEC_SOFTWARE');
      expect(asTec.status).toBe(200);
      expectSafe(asTec.body);
      expect(asTec.body.members.map((m: any) => m.user.id)).toEqual([users.assessorNeg]);
      expect(asTec.body.requests).toBeNull();
      expect(asTec.body.leads).toBeNull();
      expect(asTec.body.sector.manager).toMatchObject({ id: users.gsTec });

      // Gerente de Setor: Resumos do setor; nenhum no departamento dele (escopo só de setor).
      const gsSector = await unitCall(users.gsTec, 'TEC_SOFTWARE');
      expect(gsSector.status).toBe(200);
      expect(gsSector.body.members.map((m: any) => m.user.id)).toEqual(
        expect.arrayContaining([users.gsTec, users.assessorNeg])
      );
      const gsDept = await unitCall(users.gsTec, 'MIDIAS');
      expect(gsDept.status).toBe(200);
      expect(gsDept.body.members.map((m: any) => m.user.id)).toEqual([users.gsTec]);

      // Painel_Membro com escopo 'ALL' (GD sobre membro do departamento).
      const gdMember = await consistent(
        () => Promise.all([
          taskFacts({ assigneeId: users.assessorNeg }),
          requestFacts({ handlerId: users.assessorNeg }),
          leadFacts({ assignedTo: users.assessorNeg }),
        ]),
        () => memberCall(users.gdNeg, users.assessorNeg, '?periodo=tudo')
      );
      expect(gdMember.result.status).toBe(200);
      const all = gdMember.result.body;
      expectSafe(all);
      const allCtx = ctxOf(all);
      const [tFacts, rFacts, lFacts] = gdMember.facts;
      expect(all.scope).toEqual({ kind: 'ALL' });
      expect(all.tasks).toEqual(computeTaskCounts(tFacts, allCtx));
      expect(all.requests).toEqual({
        open: rFacts.filter((f) => (OPEN_REQUEST_STATUSES as readonly string[]).includes(f.status)).length,
        overdue: rFacts.filter((f) => isOverdueRequest(f, allCtx)).length,
      });
      expect(all.leads).toEqual({ byStatus: countLeadsByStatus(lFacts) });
      expect(all.cards.map((g: any) => g.pipe.id).sort()).toEqual([...pipeIds].sort());

      // Painel_Membro com escopo de setores (GS sobre membro de outro departamento).
      const gsMember = await consistent(
        () => taskFacts({ assigneeId: users.assessorNeg }),
        () => memberCall(users.gsTec, users.assessorNeg)
      );
      expect(gsMember.result.status).toBe(200);
      const sec = gsMember.result.body;
      expectSafe(sec);
      const secCtx = ctxOf(sec);
      expect(sec.scope).toEqual({ kind: 'SECTORS', sectors: [{ code: 'TEC_SOFTWARE', name: expect.any(String) }] });
      expect(sec.tasks).toEqual(computeTaskCounts(tasksInScope(gsMember.facts, ['TEC_SOFTWARE']), secCtx));
      expect(sec.requests).toBeNull();
      expect(sec.leads).toBeNull();
      expect(sec.cards.map((g: any) => g.pipe.id)).toEqual([pipeIds[1]]);
      expect(sec.overdueTasks.every((t: any) => t.unit?.code === 'TEC_SOFTWARE')).toBe(true);

      // Painel do membro "lista": 10 atrasadas com Unidade, sem responsável repetido.
      const lista = await memberCall(users.presidente, users.lista);
      expect(lista.status).toBe(200);
      expectSafe(lista.body);
      expect(lista.body.overdueTasks).toHaveLength(10);
      expect(lista.body.overdueTasks.every((t: any) => t.unit?.code === 'GENTE' && t.assignee === null)).toBe(true);

      // Conta desativada continua acessível a quem tem escopo.
      const inactive = await memberCall(users.gdNeg, users.inativoNeg);
      expect(inactive.status).toBe(200);
      expect(inactive.body.member).toMatchObject({ id: users.inativoNeg, status: 'INATIVO' });

      // Hub por tipo de pessoa.
      const presHub = await hubCall(users.presidente);
      expect(presHub.status).toBe(200);
      expectSafe(presHub.body);
      expect(presHub.body.departments).toHaveLength(4);
      expect(presHub.body.sectors).toHaveLength(5);
      const hubIds = presHub.body.members.map((m: any) => m.id);
      expect(hubIds).toEqual(
        expect.arrayContaining([users.gdNeg, users.assessorNeg, users.gsTec, users.assessorMid, users.lista])
      );
      for (const id of [users.presidente, users.inativoNeg, users.pendente]) expect(hubIds).not.toContain(id);

      const gsHub = await hubCall(users.gsTec);
      expect(gsHub.status).toBe(200);
      expect(gsHub.body.members.map((m: any) => m.id)).toContain(users.assessorNeg);
      expect(gsHub.body.members.map((m: any) => m.id)).not.toContain(users.assessorMid);
      expect(gsHub.body.sectors.map((s: any) => s.code)).toEqual(['TEC_SOFTWARE']);

      const midHub = await hubCall(users.assessorMid);
      expect(midHub.status).toBe(200);
      expect(midHub.body).toMatchObject({ me: { id: users.assessorMid }, members: null, sectors: [] });
      expect(midHub.body.departments.map((d: any) => d.code)).toEqual(['MIDIAS']);

      expect(await snapshot()).toEqual(before);
    });
  });

  // -------------------------------------------------------------------------
  // API_Tarefas: Data_Conclusao (Req. 3.8, 3.9)
  // -------------------------------------------------------------------------

  describe('API_Tarefas grava e apaga completedAt (Req. 3.8, 3.9)', () => {
    const completedAtOf = async (id: string) =>
      (await prisma.task.findUniqueOrThrow({ where: { id }, select: { completedAt: true } })).completedAt;

    async function create(status: string): Promise<{ id: string; t0: number; t1: number }> {
      const t0 = Date.now();
      const res = await call(users.assessorNeg, r.tasks.POST, {
        method: 'POST',
        path: '/api/tasks',
        body: { title: `${TAG} via API ${status}`, status, department: 'NEGOCIOS' },
      });
      const t1 = Date.now();
      expect(res.status).toBe(201);
      taskIds.push(res.body.id);
      return { id: res.body.id, t0, t1 };
    }

    const patch = (id: string, body: Record<string, unknown>) =>
      call(users.assessorNeg, r.task.PATCH, { method: 'PATCH', path: `/api/tasks/${id}`, body, params: { id } });

    it('POST com DONE grava o instante; POST com TODO deixa nulo', async () => {
      const done = await create('DONE');
      const at = await completedAtOf(done.id);
      expect(at).not.toBeNull();
      expect(at!.getTime()).toBeGreaterThanOrEqual(done.t0);
      expect(at!.getTime()).toBeLessThanOrEqual(done.t1);

      const todo = await create('TODO');
      expect(await completedAtOf(todo.id)).toBeNull();
    });

    it('PATCH TODO→DONE grava, só título preserva, DONE→IN_PROGRESS apaga', async () => {
      const { id } = await create('TODO');

      const t0 = Date.now();
      expect((await patch(id, { status: 'DONE' })).status).toBe(200);
      const t1 = Date.now();
      const at = await completedAtOf(id);
      expect(at).not.toBeNull();
      expect(at!.getTime()).toBeGreaterThanOrEqual(t0);
      expect(at!.getTime()).toBeLessThanOrEqual(t1);

      expect((await patch(id, { title: `${TAG} renomeada` })).status).toBe(200);
      expect(await completedAtOf(id)).toEqual(at);
      expect((await patch(id, { status: 'DONE' })).status).toBe(200);
      expect(await completedAtOf(id)).toEqual(at);

      expect((await patch(id, { status: 'IN_PROGRESS' })).status).toBe(200);
      expect(await completedAtOf(id)).toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  // Migração 20261010000000_paineis: backfill (Req. 3.10)
  // -------------------------------------------------------------------------

  describe('migração: backfill de completedAt (Req. 3.10)', () => {
    it('DONE sem completedAt recebe updatedAt; demais inalteradas; updatedAt não muda', async () => {
      const sql = readFileSync(MIGRATION_FILE, 'utf8');
      const statement = sql.match(/UPDATE\s+"Task"[^;]*;/)?.[0];
      expect(statement).toBe(
        'UPDATE "Task" SET "completedAt" = "updatedAt" WHERE "status" = \'DONE\' AND "completedAt" IS NULL;'
      );

      const kept = new Date('2026-01-02T03:04:05.006Z');
      const doneNull = await newTask({ unit: 'NEGOCIOS', status: 'DONE', assigneeId: null });
      const doneSet = await newTask({ unit: 'NEGOCIOS', status: 'DONE', assigneeId: null, completedAt: kept });
      const todo = await newTask({ unit: null, status: 'TODO', assigneeId: users.assessorNeg });
      const cancelled = await newTask({ unit: 'GENTE', status: 'CANCELLED', assigneeId: null });
      const ids = [doneNull, doneSet, todo, cancelled];

      // Estado de antes da migração: completedAt nulo (exceto `doneSet`) e updatedAt antigo e distinto.
      await prisma.$executeRawUnsafe(
        `UPDATE "Task" SET "updatedAt" = TIMESTAMP '2025-03-01 10:00:00' + ("id" = $1)::int * INTERVAL '1 day' WHERE "id" = ANY($2::text[])`,
        doneNull,
        ids
      );
      const before = await prisma.task.findMany({
        where: { id: { in: ids } },
        select: { id: true, status: true, completedAt: true, updatedAt: true },
      });
      const beforeById = new Map(before.map((t) => [t.id, t]));

      // A instrução da migração, restrita às linhas deste teste.
      const scoped = `${statement!.replace(/;$/, '')} AND "id" = ANY($1::text[])`;
      expect(await prisma.$executeRawUnsafe(scoped, ids)).toBe(1);

      const after = await prisma.task.findMany({
        where: { id: { in: ids } },
        select: { id: true, completedAt: true, updatedAt: true },
      });
      const afterById = new Map(after.map((t) => [t.id, t]));
      for (const id of ids) expect(afterById.get(id)!.updatedAt).toEqual(beforeById.get(id)!.updatedAt);
      expect(afterById.get(doneNull)!.completedAt).toEqual(beforeById.get(doneNull)!.updatedAt);
      expect(afterById.get(doneNull)!.completedAt).toEqual(new Date('2025-03-02T10:00:00.000Z'));
      expect(afterById.get(doneSet)!.completedAt).toEqual(kept);
      expect(afterById.get(todo)!.completedAt).toBeNull();
      expect(afterById.get(cancelled)!.completedAt).toBeNull();

      // Idempotente: rodar de novo não altera nada.
      expect(await prisma.$executeRawUnsafe(scoped, ids)).toBe(0);
    });
  });
});

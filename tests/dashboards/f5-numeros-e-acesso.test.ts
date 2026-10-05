/**
 * Etapa 5 / F5 — painéis: números com dados conhecidos, escopo por papel, fuso e consultas.
 *
 * Usa o repositório Prisma REAL (`prismaDashboardRepository`) e o serviço real. O cliente Prisma é um
 * duplo em memória que avalia os `where` gerados por `filters.ts` (mesmo avaliador das Properties 7 e 8).
 * Sem rede e sem banco.
 */
import { describe, expect, it, vi } from 'vitest';
import { evalWhere } from './support/where-eval';

vi.mock('server-only', () => ({}));

import { prismaDashboardRepository } from '@/lib/dashboards/repository';
import { getHub, getMemberDashboard, getUnitDashboard } from '@/lib/dashboards/service';
import { makePerson } from './support/fake-repo';
import { formatDueDate } from '@/lib/dashboards/format';

// ─────────────────────────────── Dados de teste ───────────────────────────────

const d = (iso: string) => new Date(iso);
const unitRows = [
  ...['NEGOCIOS', 'ADMJURFIN', 'GENTE', 'MIDIAS'].map((code) => ({ id: `unit-${code}`, code, name: code, type: 'DEPARTAMENTO' })),
  ...['TEC_SOFTWARE', 'ENG_INOVACAO', 'DESIGN_CONCEPCAO', 'CIENCIA_CONSULTORIA', 'DADOS_INTELIGENCIA'].map((code) => ({
    id: `unit-${code}`,
    code,
    name: code,
    type: 'SETOR',
  })),
];

const P = {
  pres: makePerson({ id: 'pres', name: 'Ana Presidente', globalRole: 'PRESIDENTE' }),
  gerNeg: makePerson({ id: 'gerNeg', name: 'Bruno', departmentCode: 'NEGOCIOS', departmentRole: 'GERENTE' }),
  ass1: makePerson({ id: 'ass1', name: 'Carla', departmentCode: 'NEGOCIOS', departmentRole: 'ASSESSOR' }),
  ass2: makePerson({ id: 'ass2', name: 'Davi', departmentCode: 'NEGOCIOS', departmentRole: 'ASSESSOR' }),
  vazio: makePerson({ id: 'vazio', name: 'Fábio', departmentCode: 'NEGOCIOS', departmentRole: 'ASSESSOR' }),
  inativo: makePerson({ id: 'inativo', name: 'Zé', status: 'INATIVO', departmentCode: 'NEGOCIOS', departmentRole: 'ASSESSOR' }),
  gerGente: makePerson({ id: 'gerGente', name: 'Gil', departmentCode: 'GENTE', departmentRole: 'GERENTE' }),
  gerTec: makePerson({
    id: 'gerTec',
    name: 'Gabi',
    departmentCode: 'MIDIAS',
    departmentRole: 'ASSESSOR',
    sectors: [{ code: 'TEC_SOFTWARE', role: 'GERENTE' }],
  }),
  membTec: makePerson({
    id: 'membTec',
    name: 'Hugo',
    departmentCode: 'MIDIAS',
    departmentRole: 'ASSESSOR',
    sectors: [
      { code: 'TEC_SOFTWARE', role: 'MEMBRO' },
      { code: 'ENG_INOVACAO', role: 'MEMBRO' },
    ],
  }),
};

interface T {
  id: string;
  title: string;
  status: string;
  dueDate: Date | null;
  completedAt: Date | null;
  assigneeId: string | null;
  unit: string | null;
  createdAt: Date;
}
const task = (id: string, status: string, unit: string | null, assigneeId: string | null, dueDate: string | null, completedAt: string | null = null): T => ({
  id,
  title: `Tarefa ${id}`,
  status,
  dueDate: dueDate ? d(`${dueDate}T00:00:00.000Z`) : null,
  completedAt: completedAt ? d(completedAt) : null,
  assigneeId,
  unit,
  createdAt: d('2026-01-01T12:00:00.000Z'),
});

const TASKS: T[] = [
  // Negócios
  task('t1', 'TODO', 'NEGOCIOS', 'ass1', '2026-09-28'), // atrasada
  task('t2', 'IN_PROGRESS', 'NEGOCIOS', 'ass1', '2026-09-29'), // vence hoje (não atrasada)
  task('t3', 'TODO', 'NEGOCIOS', 'ass1', null),
  task('t4', 'DONE', 'NEGOCIOS', 'ass1', null, '2026-09-20T15:00:00.000Z'), // concluída no período
  task('t5', 'DONE', 'NEGOCIOS', 'ass1', null, '2026-07-01T15:00:00.000Z'), // fora dos 30 dias
  task('t6', 'CANCELLED', 'NEGOCIOS', 'ass1', '2026-09-01'), // não conta em nada
  task('t7', 'TODO', 'NEGOCIOS', 'ass2', '2026-09-10'), // atrasada
  task('t8', 'TODO', 'NEGOCIOS', null, '2026-09-01'), // atrasada, sem responsável
  // Hugo: setor TEC, setor ENG, tarefa geral e departamento
  task('s1', 'TODO', 'TEC_SOFTWARE', 'membTec', '2026-09-25'),
  task('s2', 'DONE', 'TEC_SOFTWARE', 'membTec', null, '2026-09-28T12:00:00.000Z'),
  task('e1', 'TODO', 'ENG_INOVACAO', 'membTec', '2026-09-24'),
  task('g1', 'TODO', null, 'membTec', '2026-09-20'),
  task('m1', 'TODO', 'MIDIAS', 'membTec', null),
];

const PIPES = [
  { id: 'pn', name: 'Vendas', unit: 'NEGOCIOS', createdAt: d('2026-01-01T00:00:00Z'), phases: [{ id: 'pn-a', name: 'Prospecção', order: 0, isFinal: false }, { id: 'pn-b', name: 'Fechado', order: 1, isFinal: true }] },
  { id: 'pt', name: 'Projetos TEC', unit: 'TEC_SOFTWARE', createdAt: d('2026-01-02T00:00:00Z'), phases: [{ id: 'pt-a', name: 'Fazendo', order: 0, isFinal: false }] },
  { id: 'pe', name: 'Projetos ENG', unit: 'ENG_INOVACAO', createdAt: d('2026-01-03T00:00:00Z'), phases: [{ id: 'pe-a', name: 'Fazendo', order: 0, isFinal: false }] },
];
const CARDS = [
  ...['c1', 'c2', 'c3'].map((id) => ({ id, phaseId: 'pn-a', assigneeId: 'ass1' })),
  { id: 'c4', phaseId: 'pn-b', assigneeId: 'ass2' },
  { id: 'c5', phaseId: 'pt-a', assigneeId: 'membTec' },
  { id: 'c6', phaseId: 'pt-a', assigneeId: 'membTec' },
  { id: 'c7', phaseId: 'pe-a', assigneeId: 'membTec' },
];
const REQUESTS = [
  { id: 'r1', status: 'PENDING', fromDept: 'GENTE', toDept: 'NEGOCIOS', handlerId: null, dueDate: d('2026-09-01T00:00:00Z'), updatedAt: d('2026-09-02T00:00:00Z') },
  { id: 'r2', status: 'COMPLETED', fromDept: 'GENTE', toDept: 'NEGOCIOS', handlerId: null, dueDate: null, updatedAt: d('2026-09-20T00:00:00Z') },
  { id: 'r3', status: 'COMPLETED', fromDept: 'GENTE', toDept: 'NEGOCIOS', handlerId: null, dueDate: null, updatedAt: d('2026-07-01T00:00:00Z') },
  { id: 'r4', status: 'IN_PROGRESS', fromDept: 'NEGOCIOS', toDept: 'GENTE', handlerId: null, dueDate: null, updatedAt: d('2026-09-02T00:00:00Z') },
  { id: 'r5', status: 'APPROVED', fromDept: 'GENTE', toDept: 'NEGOCIOS', handlerId: null, dueDate: null, updatedAt: d('2026-09-02T00:00:00Z') },
  { id: 'r6', status: 'PENDING', fromDept: 'GENTE', toDept: 'MIDIAS', handlerId: 'membTec', dueDate: d('2026-09-01T00:00:00Z'), updatedAt: d('2026-09-02T00:00:00Z') },
];
const lead = (id: string, status: string, assignedTo: string | null, created: string) => ({ id, status, assignedTo, createdAt: d(`${created}T12:00:00Z`) });
const LEADS = [
  lead('l1', 'RAW', 'ass1', '2026-09-01'),
  lead('l2', 'RAW', null, '2026-09-01'),
  lead('l3', 'PENDING', 'ass1', '2026-09-10'),
  lead('l4', 'IN_PROGRESS', 'ass2', '2026-09-15'),
  lead('l5', 'CONVERTED_TO_PIPE', 'ass1', '2026-09-12'),
  lead('l6', 'CONVERTED_TO_PIPE', 'ass2', '2026-07-01'), // criado fora do período
  lead('l7', 'DISCARDED', 'ass2', '2026-09-05'),
];

// ─────────────────────────────── Duplo do Prisma ───────────────────────────────

const unitByCode = (code: string) => unitRows.find((u) => u.code === code)!;
const unitIdOf = (code: string) => `unit-${code}`;

function personRow(p: ReturnType<typeof makePerson>) {
  return {
    id: p.id,
    name: p.name,
    avatar: null,
    cargo: null,
    status: p.status,
    globalRole: p.globalRole,
    departmentRole: p.departmentRole,
    departmentId: p.departmentCode ? unitIdOf(p.departmentCode) : null,
    department: p.departmentCode ? { code: p.departmentCode, name: p.departmentCode } : null,
    sectorMemberships: p.sectors.map((s) => ({ role: s.role, unit: { code: s.code, name: s.name }, unitId: unitIdOf(s.code) })),
  };
}

function makeDb(opts: { tasks?: T[]; people?: ReturnType<typeof makePerson>[] } = {}) {
  const tasks = opts.tasks ?? TASKS;
  const people = opts.people ?? Object.values(P);
  const calls: string[] = [];
  const taskRec = (t: T) => ({ ...t, unitId: t.unit ? unitIdOf(t.unit) : null, unit: t.unit ? { code: t.unit } : null });
  const cardRec = (c: (typeof CARDS)[number]) => {
    const pipe = PIPES.find((p) => p.phases.some((ph) => ph.id === c.phaseId))!;
    return { ...c, phase: { pipe: { unit: { code: pipe.unit } } } };
  };
  const group = <R extends Record<string, unknown>>(rows: R[], by: string[]) => {
    const m = new Map<string, { keys: Record<string, unknown>; n: number }>();
    for (const r of rows) {
      const keys = Object.fromEntries(by.map((k) => [k, r[k] ?? null]));
      const id = JSON.stringify(keys);
      const cur = m.get(id) ?? { keys, n: 0 };
      cur.n++;
      m.set(id, cur);
    }
    return [...m.values()].map((g) => ({ ...g.keys, _count: { _all: g.n } }));
  };
  const rec = (name: string, f: (...a: any[]) => any) => (...a: any[]) => {
    calls.push(name);
    return Promise.resolve(f(...a));
  };
  const db: any = {
    task: {
      groupBy: rec('task.groupBy', ({ by, where }: any) => group(tasks.map(taskRec).filter((t) => evalWhere(where, t)), by)),
      count: rec('task.count', ({ where }: any) => tasks.map(taskRec).filter((t) => evalWhere(where, t)).length),
      findMany: rec('task.findMany', ({ where, take }: any) =>
        tasks
          .map(taskRec)
          .filter((t) => evalWhere(where, t))
          .sort((a, b) => a.dueDate!.getTime() - b.dueDate!.getTime() || a.id.localeCompare(b.id))
          .slice(0, take)
          .map((t) => ({
            id: t.id,
            title: t.title,
            dueDate: t.dueDate,
            assignee: people.filter((p) => p.id === t.assigneeId).map((p) => ({ id: p.id, name: p.name, avatar: null }))[0] ?? null,
            unit: t.unit ? { code: t.unit, name: t.unit } : null,
          })),
      ),
    },
    card: {
      groupBy: rec('card.groupBy', ({ by, where }: any) => group(CARDS.map(cardRec).filter((c) => evalWhere(where, c)), by)),
    },
    phase: {
      findMany: rec('phase.findMany', ({ where }: any) =>
        PIPES.flatMap((p) =>
          p.phases
            .filter((ph) => where.id.in.includes(ph.id))
            .map((ph) => ({ ...ph, pipe: { id: p.id, name: p.name, createdAt: p.createdAt, unit: { code: p.unit, name: p.unit } } })),
        ),
      ),
    },
    pipe: {
      findMany: rec('pipe.findMany', ({ where }: any) =>
        PIPES.filter((p) => unitIdOf(p.unit) === where.unitId).map((p) => ({ id: p.id, name: p.name, phases: p.phases })),
      ),
    },
    crossDeptRequest: {
      groupBy: rec('request.groupBy', ({ by, where }: any) => group(REQUESTS.filter((r) => evalWhere(where, r)), by)),
      count: rec('request.count', ({ where }: any) => REQUESTS.filter((r) => evalWhere(where, r)).length),
    },
    prospectLead: {
      groupBy: rec('lead.groupBy', ({ by, where }: any) => group(LEADS.filter((l) => evalWhere(where, l)), by)),
    },
    unit: { findUnique: rec('unit.findUnique', ({ where }: any) => unitRows.find((u) => u.code === where.code) ?? null) },
    sectorMember: {
      findFirst: rec('sectorMember.findFirst', ({ where }: any) => {
        const m = people.find((p) => p.status === 'ATIVO' && p.sectors.some((s) => unitIdOf(s.code) === where.unitId && s.role === 'GERENTE'));
        return m ? { user: { id: m.id, name: m.name, avatar: null } } : null;
      }),
    },
    user: {
      findUnique: rec('user.findUnique', ({ where }: any) => {
        const p = people.find((x) => x.id === where.id);
        return p ? personRow(p) : null;
      }),
      findMany: rec('user.findMany', ({ where }: any) => {
        let rows = people.map(personRow);
        if (where.id?.in) rows = rows.filter((r) => where.id.in.includes(r.id));
        if (where.status) rows = rows.filter((r) => r.status === where.status);
        if (where.departmentId) rows = rows.filter((r) => r.departmentId === where.departmentId);
        if (where.sectorMemberships?.some) {
          rows = rows.filter((r) => r.sectorMemberships.some((m) => m.unitId === where.sectorMemberships.some.unitId));
        }
        return rows;
      }),
    },
  };
  return { db, calls };
}

const NOW = d('2026-09-29T15:00:00.000Z'); // 12:00 em São Paulo
const unit = (actor: ReturnType<typeof makePerson>, code: string, periodo: string | null = '30d', now = NOW, db = makeDb().db) =>
  getUnitDashboard(prismaDashboardRepository(db), actor, code, periodo, now);
const member = (actor: ReturnType<typeof makePerson>, id: string, periodo: string | null = '30d', now = NOW, db = makeDb().db) =>
  getMemberDashboard(prismaDashboardRepository(db), actor, id, periodo, now);
const status = async (p: Promise<unknown>) => {
  try {
    await p;
    return 200;
  } catch (e) {
    return (e as { status: number }).status;
  }
};

// ─────────────────────────────── Testes ───────────────────────────────

describe('F5 (b): números do painel de Negócios com dados conhecidos', () => {
  it('tarefas: abertas, atrasadas (vence hoje não conta), concluídas no período; canceladas não contam', async () => {
    const r = await unit(P.gerNeg, 'NEGOCIOS');
    expect(r.referenceDate).toBe('2026-09-29');
    expect(r.tasks).toEqual({ open: 5, overdue: 3, doneInPeriod: 1 });
    expect(r.overdueTasks.map((t) => t.id)).toEqual(['t8', 't7', 't1']); // por prazo crescente
    expect(r.overdueTasks[0].assignee).toBeNull(); // sem responsável
    expect((await unit(P.gerNeg, 'NEGOCIOS', 'tudo')).tasks.doneInPeriod).toBe(2);
  });

  it('resumo por membro: ativos do departamento, com zeros; inativo fora; tarefa sem dono só no total', async () => {
    const r = await unit(P.gerNeg, 'NEGOCIOS');
    expect(r.members.map((m) => [m.user.name, m.open, m.overdue, m.doneInPeriod])).toEqual([
      ['Bruno', 0, 0, 0],
      ['Carla', 3, 1, 1],
      ['Davi', 1, 1, 0],
      ['Fábio', 0, 0, 0],
    ]);
    expect(r.members.reduce((n, m) => n + m.overdue, 0)).toBeLessThanOrEqual(r.tasks.overdue);
  });

  it('cards por fase, solicitações (recebidas/enviadas/atrasadas) e leads com conversão', async () => {
    const r = await unit(P.gerNeg, 'NEGOCIOS');
    expect(r.pipes).toHaveLength(1);
    expect(r.pipes[0].phases.map((f) => [f.name, f.cards])).toEqual([['Prospecção', 3], ['Fechado', 1]]);

    expect(r.requests!.received).toMatchObject({ PENDING: 1, APPROVED: 1, COMPLETED: 1, IN_PROGRESS: 0, REJECTED: 0 });
    expect(r.requests!.sent).toMatchObject({ IN_PROGRESS: 1, COMPLETED: 0 });
    expect(r.requests!.overdueReceived).toBe(1);

    expect(r.leads!.byStatus).toEqual({ RAW: 2, PENDING: 1, IN_PROGRESS: 1, CONVERTED_TO_PIPE: 2, DISCARDED: 1 });
    // coorte: criados nos 30 dias e fora de RAW = l3, l4, l5, l7; convertido = l5
    expect(r.leads!.conversion).toEqual({ converted: 1, total: 4, percent: 25 });
    expect(r.leads!.byAssignee.map((a) => [a.assignee?.name ?? null, a.counts.RAW + a.counts.PENDING + a.counts.IN_PROGRESS + a.counts.CONVERTED_TO_PIPE + a.counts.DISCARDED])).toEqual([
      ['Carla', 3],
      ['Davi', 3],
      [null, 1],
    ]);
  });

  it('só Negócios tem leads e só departamentos têm solicitações', async () => {
    const tec = await unit(P.pres, 'TEC_SOFTWARE');
    expect(tec.leads).toBeNull();
    expect(tec.requests).toBeNull();
    expect(tec.sector!.manager!.name).toBe('Gabi');
    expect((await unit(P.pres, 'GENTE')).leads).toBeNull();
  });
});

describe('F5 (c): "atrasada" conta pelo dia de São Paulo, não pelo de UTC', () => {
  it('23:00 em SP (02:00 UTC do dia seguinte): o prazo de hoje ainda não está atrasado', async () => {
    const r = await unit(P.gerNeg, 'NEGOCIOS', '30d', d('2026-09-30T02:00:00.000Z'));
    expect(r.referenceDate).toBe('2026-09-29');
    expect(r.tasks.overdue).toBe(3);
  });

  it('00:00 em SP (03:00 UTC): o prazo de ontem passa a atrasado', async () => {
    const r = await unit(P.gerNeg, 'NEGOCIOS', '30d', d('2026-09-30T03:00:00.000Z'));
    expect(r.referenceDate).toBe('2026-09-30');
    expect(r.tasks.overdue).toBe(4);
  });

  it('a janela de 30 dias começa à meia-noite de São Paulo', async () => {
    const r = await unit(P.gerNeg, 'NEGOCIOS');
    expect(r.period.from).toBe('2026-08-31T03:00:00.000Z');
  });
});

describe('F5 (a): escopo do Gerente de Setor, Assessor e parâmetros de URL', () => {
  it('Gerente de Setor vê o membro SÓ nas atividades do setor (tarefas, cards, sem solicitações/leads)', async () => {
    const r = await member(P.gerTec, 'membTec');
    expect(r.scope).toEqual({ kind: 'SECTORS', sectors: [{ code: 'TEC_SOFTWARE', name: 'Tecnologia e Software' }] });
    expect(r.tasks).toEqual({ open: 1, overdue: 1, doneInPeriod: 1 }); // s1, s1, s2 (e1, g1, m1 ficam de fora)
    expect(r.overdueTasks.map((t) => t.id)).toEqual(['s1']);
    expect(r.cards.map((g) => g.pipe.unit.code)).toEqual(['TEC_SOFTWARE']);
    expect(r.cards[0].phases[0].cards).toBe(2);
    expect(r.requests).toBeNull();
    expect(r.leads).toBeNull();
  });

  it('Presidência vê o mesmo membro por inteiro (inclui setor ENG, tarefa geral, departamento e solicitações)', async () => {
    const r = await member(P.pres, 'membTec');
    expect(r.scope).toEqual({ kind: 'ALL' });
    expect(r.tasks).toEqual({ open: 4, overdue: 3, doneInPeriod: 1 });
    expect(r.overdueTasks.map((t) => t.id)).toEqual(['g1', 'e1', 's1']);
    expect(r.cards.map((g) => g.pipe.unit.code)).toEqual(['TEC_SOFTWARE', 'ENG_INOVACAO']);
    expect(r.requests).toEqual({ open: 1, overdue: 1 });
  });

  it('membro sem tarefas, cards nem leads: zeros, listas vazias e leads nulo', async () => {
    const r = await member(P.gerNeg, 'vazio');
    expect(r.tasks).toEqual({ open: 0, overdue: 0, doneInPeriod: 0 });
    expect(r.overdueTasks).toEqual([]);
    expect(r.cards).toEqual([]);
    expect(r.requests).toEqual({ open: 0, overdue: 0 });
    expect(r.leads).toBeNull();
  });

  it('painel de unidade vazio (setor sem funil nem tarefas) não quebra', async () => {
    const r = await unit(P.pres, 'DADOS_INTELIGENCIA');
    expect(r.tasks).toEqual({ open: 0, overdue: 0, doneInPeriod: 0 });
    expect(r.pipes).toEqual([]);
    expect(r.members).toEqual([]);
    expect(r.sector).toEqual({ manager: null, activeMembers: 0 });
  });

  it('Gerente de Setor no painel do setor vê a si e aos membros do setor; no do departamento, só a si', async () => {
    const setor = await unit(P.gerTec, 'TEC_SOFTWARE');
    expect(setor.tasks).toEqual({ open: 1, overdue: 1, doneInPeriod: 1 });
    expect(setor.members.map((m) => m.user.name)).toEqual(['Gabi', 'Hugo']);
    expect(setor.members.find((m) => m.user.name === 'Hugo')).toMatchObject({ open: 1, overdue: 1, doneInPeriod: 1 });
    const depto = await unit(P.gerTec, 'MIDIAS');
    expect(depto.members.map((m) => m.user.name)).toEqual(['Gabi']);
  });

  it('Assessor vê só a própria linha', async () => {
    const r = await unit(P.ass2, 'NEGOCIOS');
    expect(r.members.map((m) => m.user.name)).toEqual(['Davi']);
  });

  it.each([
    ['Assessor de Negócios → painel de outro departamento', () => unit(P.ass1, 'GENTE'), 403],
    ['Assessor de Negócios → painel de setor', () => unit(P.ass1, 'TEC_SOFTWARE'), 403],
    ['Gerente de Negócios → painel de setor do qual não participa', () => unit(P.gerNeg, 'TEC_SOFTWARE'), 403],
    ['Gerente de Gente → painel de Negócios', () => unit(P.gerGente, 'NEGOCIOS'), 403],
    ['Gerente de Setor → painel de outro setor', () => unit(P.gerTec, 'ENG_INOVACAO'), 403],
    ['código inexistente', () => unit(P.pres, 'XYZ'), 404],
    ['período inválido', () => unit(P.pres, 'NEGOCIOS', '365d'), 400],
    ['Assessor → membro do mesmo departamento', () => member(P.ass1, 'ass2'), 403],
    ['Gerente de Negócios → membro de outro departamento/setor', () => member(P.gerNeg, 'membTec'), 403],
    ['Gerente de Gente → membro de Negócios', () => member(P.gerGente, 'ass1'), 403],
    ['Gerente de Setor → membro que não é do setor dele', () => member(P.gerTec, 'ass1'), 403],
    ['membro inexistente', () => member(P.pres, 'nao-existe'), 404],
  ] as const)('%s → %i', async (_nome, fn, esperado) => {
    expect(await status(fn())).toBe(esperado);
  });

  it('permitidos: próprio, Gerente do departamento sobre o membro, Presidência sobre todos', async () => {
    expect(await status(member(P.ass1, 'ass1'))).toBe(200);
    expect(await status(member(P.gerNeg, 'ass1'))).toBe(200);
    expect(await status(member(P.pres, 'inativo'))).toBe(200); // conta desativada segue acessível por URL a quem tem escopo
    expect(await status(unit(P.gerNeg, 'NEGOCIOS'))).toBe(200);
  });

  it('hub lista só o que o ator abre', async () => {
    const ass = await getHub(prismaDashboardRepository(makeDb().db), P.ass1);
    expect(ass.departments.map((u) => u.code)).toEqual(['NEGOCIOS']);
    expect(ass.sectors).toEqual([]);
    expect(ass.members).toBeNull();

    const setor = await getHub(prismaDashboardRepository(makeDb().db), P.gerTec);
    expect(setor.departments.map((u) => u.code)).toEqual(['MIDIAS']);
    expect(setor.sectors.map((u) => u.code)).toEqual(['TEC_SOFTWARE']);
    expect(setor.members!.map((m) => m.name)).toEqual(['Hugo']); // só quem está no escopo

    const depto = await getHub(prismaDashboardRepository(makeDb().db), P.gerNeg);
    expect(depto.members!.map((m) => m.name)).toEqual(['Carla', 'Davi', 'Fábio']); // ativos; sem o próprio, sem inativo
  });

  it('a resposta não carrega e-mail, descrição nem contatos', async () => {
    const dump = JSON.stringify([await unit(P.pres, 'NEGOCIOS'), await member(P.pres, 'membTec')]);
    expect(dump).not.toMatch(/email|description|contactInfo|contactName/i);
  });
});

describe('F5 (e): quantidade de consultas não cresce com o volume (sem N+1)', () => {
  it('painel de unidade: mesmas consultas com 3 ou 150 membros/tarefas', async () => {
    const muitasPessoas = Array.from({ length: 150 }, (_, i) =>
      makePerson({ id: `n${i}`, name: `Pessoa ${String(i).padStart(3, '0')}`, departmentCode: 'NEGOCIOS', departmentRole: 'ASSESSOR' }),
    );
    const muitasTarefas = muitasPessoas.flatMap((p, i) => [
      task(`x${i}`, 'TODO', 'NEGOCIOS', p.id, '2026-09-01'),
      task(`y${i}`, 'DONE', 'NEGOCIOS', p.id, null, '2026-09-20T15:00:00.000Z'),
    ]);
    const pequeno = makeDb();
    const grande = makeDb({ tasks: [...TASKS, ...muitasTarefas], people: [...Object.values(P), ...muitasPessoas] });

    await unit(P.pres, 'NEGOCIOS', '30d', NOW, pequeno.db);
    const r = await unit(P.pres, 'NEGOCIOS', '30d', NOW, grande.db);
    expect(r.members.length).toBeGreaterThan(150);
    expect(grande.calls.length).toBe(pequeno.calls.length);
    expect(pequeno.calls.length).toBeLessThan(20);
  });

  it('painel de membro e hub também têm número fixo de consultas', async () => {
    const a = makeDb();
    await member(P.pres, 'membTec', '30d', NOW, a.db);
    expect(a.calls.length).toBeLessThan(15);
    const b = makeDb();
    await getHub(prismaDashboardRepository(b.db), P.pres);
    expect(b.calls).toEqual(['user.findMany']);
  });
});

describe('F5 (c): prazo exibido nas telas é o dia escolhido, sem deslocar por fuso', () => {
  it('prazo gravado à meia-noite UTC aparece no mesmo dia (new Date().toLocaleDateString mostraria o dia anterior em UTC-3)', () => {
    expect(formatDueDate('2026-09-29T00:00:00.000Z')).toBe('29/09/2026');
    expect(formatDueDate('2026-01-01T00:00:00.000Z')).toBe('01/01/2026');
    expect(formatDueDate('2026-09-29')).toBe('29/09/2026');
  });
});

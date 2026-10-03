/**
 * DashboardRepository em memória para os testes do serviço e das rotas dos painéis.
 *
 * Cada método filtra fatos semeados com as mesmas regras da Calculadora_Metricas
 * (`metrics.ts`), devolve as mesmas formas do repositório Prisma e registra a chamada
 * em `calls`. Os métodos de busca (`findUnit`, `findPerson`) ficam separados dos de
 * métrica, para verificar que respostas de erro não consultam métrica nenhuma.
 *
 * Os objetos semeados são devolvidos como estão (sem recópia): extras como `email`
 * chegam ao serviço, que é quem deve removê-los (Property 26).
 *
 * Só `import type` de `@/lib/dashboards/repository` (o módulo tem `import 'server-only'`).
 */
import {
  CONVERSION_COHORT_STATUSES,
  LEAD_STATUSES,
  OPEN_REQUEST_STATUSES,
  REQUEST_STATUSES,
  COMPLETED_REQUEST_STATUS,
  isDoneInPeriod,
  isOpenTask,
  isOverdueRequest,
  isOverdueTask,
  type CountRow,
  type PhaseInfo,
  type ProgressScope,
  type RequestFact,
  type TaskFact,
} from '@/lib/dashboards/metrics';
import { dueDayKey, inWindow, type MetricContext } from '@/lib/dashboards/period';
import type {
  DashboardRepository,
  LeadAssigneeStatusRow,
  PersonWithProfile,
  UnitRecord,
} from '@/lib/dashboards/repository';
import type { MemberCardGroupDTO, OverdueTaskDTO, PersonBrief } from '@/lib/dashboards/types';
import {
  DEPARTMENTS,
  SECTORS,
  personTitle,
  type Person,
  type UnitCode,
} from '@/lib/permissions';

// ---------------------------------------------------------------------------
// Semente
// ---------------------------------------------------------------------------

export interface FakeTask extends TaskFact {
  id: string;
  title: string;
  createdAt: Date;
}

export interface FakePipe {
  id: string;
  name: string;
  unitCode: UnitCode;
  createdAt: Date;
  phases: PhaseInfo[];
}

export interface FakeCard {
  id: string;
  phaseId: string;
  assigneeId: string | null;
}

export interface FakeLead {
  /** Coluna `String`: valores fora do enum são ignorados, como no `in` do Prisma. */
  status: string;
  assignedTo: string | null;
  createdAt: Date;
}

export interface FakeSeed {
  /** Padrão: as 9 Unidades de `lib/permissions.ts`, com id `unit-<CODE>`. */
  units?: UnitRecord[];
  people?: PersonWithProfile[];
  tasks?: FakeTask[];
  pipes?: FakePipe[];
  cards?: FakeCard[];
  requests?: RequestFact[];
  leads?: FakeLead[];
}

export const LOOKUP_METHODS = ['findUnit', 'findPerson'] as const;
export type RepoMethod = keyof DashboardRepository;

export interface RepoCall {
  method: RepoMethod;
  args: unknown[];
}

export interface FakeDashboardRepository extends DashboardRepository {
  /** Todas as chamadas, na ordem. */
  readonly calls: RepoCall[];
  /** Chamadas de um método. */
  callsOf(method: RepoMethod): RepoCall[];
  /** Chamadas que não são de busca (`findUnit`/`findPerson`). */
  metricCalls(): RepoCall[];
  /** Esvazia o registro de chamadas. */
  resetCalls(): void;
  readonly seed: Required<FakeSeed>;
}

// ---------------------------------------------------------------------------
// Construtores de dados
// ---------------------------------------------------------------------------

export function unitId(code: string): string {
  return `unit-${code}`;
}

export function defaultUnits(): UnitRecord[] {
  return [
    ...DEPARTMENTS.map((d) => ({ id: unitId(d.code), code: d.code, name: d.name, type: 'DEPARTAMENTO' as const })),
    ...SECTORS.map((s) => ({ id: unitId(s.code), code: s.code, name: s.name, type: 'SETOR' as const })),
  ];
}

const SECTOR_NAME = new Map<string, string>(SECTORS.map((s) => [s.code, s.name]));

/** Pessoa com perfil; `sectors` aceita só código e papel (o nome vem de `SECTORS`). */
export function makePerson(
  p: Partial<Omit<PersonWithProfile, 'sectors'>> & {
    id: string;
    sectors?: { code: Person['sectors'][number]['code']; role: Person['sectors'][number]['role'] }[];
  }
): PersonWithProfile {
  const person: Person = {
    id: p.id,
    status: p.status ?? 'ATIVO',
    globalRole: p.globalRole ?? null,
    departmentCode: p.departmentCode ?? null,
    departmentRole: p.departmentRole ?? null,
    sectors: (p.sectors ?? []).map((s) => ({ code: s.code, name: SECTOR_NAME.get(s.code)!, role: s.role })),
  };
  return {
    ...p,
    ...person,
    name: p.name ?? `Pessoa ${p.id}`,
    avatar: p.avatar ?? null,
    title: p.title ?? personTitle(person),
  };
}

export function makeTask(t: Partial<FakeTask> & { id: string }): FakeTask {
  return {
    title: `Tarefa ${t.id}`,
    status: 'TODO',
    dueDate: null,
    completedAt: null,
    assigneeId: null,
    unitCode: null,
    createdAt: new Date('2026-01-01T12:00:00.000Z'),
    ...t,
  };
}

// ---------------------------------------------------------------------------
// Auxiliares
// ---------------------------------------------------------------------------

function countBy<T>(items: readonly T[], key: (item: T) => string | null): CountRow[] {
  const counts = new Map<string | null, number>();
  for (const item of items) {
    const k = key(item);
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  return Array.from(counts, ([k, count]) => ({ key: k, count }));
}

function cmp(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function inScope(unitCode: string | null, scope: ProgressScope): boolean {
  return scope === 'ALL' || (unitCode !== null && scope.includes(unitCode));
}

/** Mesma regra de `requestStatusWhere`: não concluídas sempre; COMPLETED só no Periodo. */
function countsForStatus(r: RequestFact, ctx: MetricContext): boolean {
  if (!(REQUEST_STATUSES as readonly string[]).includes(r.status)) return false;
  return r.status !== COMPLETED_REQUEST_STATUS || inWindow(r.updatedAt, ctx.window);
}

function isLeadStatus(s: string): boolean {
  return (LEAD_STATUSES as readonly string[]).includes(s);
}

// ---------------------------------------------------------------------------
// Repositório
// ---------------------------------------------------------------------------

export function createFakeRepo(input: FakeSeed = {}): FakeDashboardRepository {
  const seed: Required<FakeSeed> = {
    units: input.units ?? defaultUnits(),
    people: input.people ?? [],
    tasks: input.tasks ?? [],
    pipes: input.pipes ?? [],
    cards: input.cards ?? [],
    requests: input.requests ?? [],
    leads: input.leads ?? [],
  };
  const calls: RepoCall[] = [];

  const unitById = (id: string) => seed.units.find((u) => u.id === id) ?? null;
  const unitByCode = (code: string | null) => seed.units.find((u) => u.code === code) ?? null;
  const personById = (id: string | null) => (id === null ? null : seed.people.find((p) => p.id === id) ?? null);
  const pipeOfPhase = (phaseId: string) => seed.pipes.find((p) => p.phases.some((ph) => ph.id === phaseId)) ?? null;

  function unitTasks(id: string): FakeTask[] {
    const code = unitById(id)?.code ?? null;
    return code === null ? [] : seed.tasks.filter((t) => t.unitCode === code);
  }

  function scopedTasks(targetId: string, scope: ProgressScope): FakeTask[] {
    return seed.tasks.filter((t) => t.assigneeId === targetId && inScope(t.unitCode, scope));
  }

  const impl: DashboardRepository = {
    async findUnit(code) {
      return unitByCode(code);
    },

    async findPerson(userId) {
      return personById(userId);
    },

    async activeUnitMembers(unit) {
      const code = unitById(unit.id)?.code;
      if (!code) return [];
      return seed.people.filter(
        (p) =>
          p.status === 'ATIVO' &&
          (unit.type === 'DEPARTAMENTO' ? p.departmentCode === code : p.sectors.some((s) => s.code === code))
      );
    },

    async sectorManager(id) {
      const code = unitById(id)?.code;
      return (
        seed.people.find(
          (p) => p.status === 'ATIVO' && p.sectors.some((s) => s.code === code && s.role === 'GERENTE')
        ) ?? null
      );
    },

    async unitTaskRows(id, ctx) {
      const tasks = unitTasks(id);
      return {
        open: countBy(tasks.filter(isOpenTask), (t) => t.assigneeId),
        overdue: countBy(tasks.filter((t) => isOverdueTask(t, ctx)), (t) => t.assigneeId),
        doneInPeriod: countBy(tasks.filter((t) => isDoneInPeriod(t, ctx)), (t) => t.assigneeId),
      };
    },

    async scopedTaskCounts(targetId, scope, ctx) {
      const tasks = scopedTasks(targetId, scope);
      return {
        open: tasks.filter(isOpenTask).length,
        overdue: tasks.filter((t) => isOverdueTask(t, ctx)).length,
        doneInPeriod: tasks.filter((t) => isDoneInPeriod(t, ctx)).length,
      };
    },

    async overdueTasks(query, ctx, take) {
      let tasks = seed.tasks.filter((t) => isOverdueTask(t, ctx));
      if (query.unitId !== undefined) {
        const code = unitById(query.unitId)?.code ?? null;
        tasks = tasks.filter((t) => code !== null && t.unitCode === code);
      }
      if (query.targetId !== undefined) {
        const scope = query.scope ?? 'ALL';
        tasks = tasks.filter((t) => t.assigneeId === query.targetId && inScope(t.unitCode, scope));
      }
      return tasks
        .map((t) => ({ t, day: dueDayKey(t.dueDate!) }))
        .sort(
          (a, b) =>
            cmp(a.day, b.day) || a.t.createdAt.getTime() - b.t.createdAt.getTime() || cmp(a.t.id, b.t.id)
        )
        .slice(0, take)
        .map(({ t, day }): OverdueTaskDTO => {
          const unit = unitByCode(t.unitCode);
          return {
            id: t.id,
            title: t.title,
            dueDate: day,
            assignee: personById(t.assigneeId),
            unit: unit ? { code: unit.code, name: unit.name } : null,
          };
        });
    },

    async unitPipes(id) {
      const code = unitById(id)?.code;
      return seed.pipes
        .filter((p) => p.unitCode === code)
        .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime() || cmp(a.id, b.id))
        .map((p) => ({
          id: p.id,
          name: p.name,
          phases: [...p.phases].sort((a, b) => a.order - b.order || cmp(a.id, b.id)),
        }));
    },

    async cardRowsByPhase(phaseIds, assigneeId) {
      const cards = seed.cards.filter(
        (c) => phaseIds.includes(c.phaseId) && (assigneeId === undefined || c.assigneeId === assigneeId)
      );
      return countBy(cards, (c) => c.phaseId);
    },

    async memberCardPhases(targetId, scope) {
      const counts = new Map<string, number>();
      for (const c of seed.cards) {
        if (c.assigneeId !== targetId) continue;
        const pipe = pipeOfPhase(c.phaseId);
        if (!pipe || !inScope(pipe.unitCode, scope)) continue;
        counts.set(c.phaseId, (counts.get(c.phaseId) ?? 0) + 1);
      }
      return seed.pipes
        .filter((p) => p.phases.some((ph) => counts.has(ph.id)))
        .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime() || cmp(a.id, b.id))
        .map((p): MemberCardGroupDTO => {
          const unit = unitByCode(p.unitCode);
          return {
            pipe: { id: p.id, name: p.name, unit: { code: p.unitCode, name: unit?.name ?? p.unitCode } },
            phases: p.phases
              .filter((ph) => counts.has(ph.id))
              .sort((a, b) => a.order - b.order || cmp(a.id, b.id))
              .map((ph) => ({ ...ph, cards: counts.get(ph.id)! })),
          };
        });
    },

    async requestRows(deptCode, ctx) {
      const counted = seed.requests.filter((r) => countsForStatus(r, ctx));
      return {
        received: countBy(counted.filter((r) => r.toDept === deptCode), (r) => r.status),
        sent: countBy(counted.filter((r) => r.fromDept === deptCode), (r) => r.status),
        overdueReceived: seed.requests.filter((r) => r.toDept === deptCode && isOverdueRequest(r, ctx)).length,
      };
    },

    async handlerRequestCounts(targetId, ctx) {
      const mine = seed.requests.filter((r) => r.handlerId === targetId);
      return {
        open: mine.filter((r) => (OPEN_REQUEST_STATUSES as readonly string[]).includes(r.status)).length,
        overdue: mine.filter((r) => isOverdueRequest(r, ctx)).length,
      };
    },

    async leadRows(ctx) {
      const byKey = new Map<string, LeadAssigneeStatusRow>();
      for (const l of seed.leads) {
        if (!isLeadStatus(l.status)) continue;
        const k = `${l.assignedTo ?? ''}\u0000${l.status}`;
        const row = byKey.get(k) ?? { assignedTo: l.assignedTo, status: l.status, count: 0 };
        row.count++;
        byKey.set(k, row);
      }
      const cohort = seed.leads.filter(
        (l) => (CONVERSION_COHORT_STATUSES as readonly string[]).includes(l.status) && inWindow(l.createdAt, ctx.window)
      );
      return { byAssigneeStatus: Array.from(byKey.values()), cohort: countBy(cohort, (l) => l.status) };
    },

    async memberLeadRows(targetId) {
      return countBy(
        seed.leads.filter((l) => l.assignedTo === targetId && isLeadStatus(l.status)),
        (l) => l.status
      );
    },

    async usersBrief(ids): Promise<PersonBrief[]> {
      return seed.people.filter((p) => ids.includes(p.id));
    },

    async activePeople() {
      return seed.people.filter((p) => p.status === 'ATIVO');
    },
  };

  // Envolve cada método para registrar a chamada antes de executá-la.
  const recorded = {} as DashboardRepository;
  for (const method of Object.keys(impl) as RepoMethod[]) {
    const fn = impl[method] as (...args: unknown[]) => Promise<unknown>;
    (recorded as unknown as Record<string, unknown>)[method] = (...args: unknown[]) => {
      calls.push({ method, args });
      return fn(...args);
    };
  }

  return {
    ...recorded,
    calls,
    seed,
    callsOf: (method) => calls.filter((c) => c.method === method),
    metricCalls: () => calls.filter((c) => !(LOOKUP_METHODS as readonly string[]).includes(c.method)),
    resetCalls: () => {
      calls.length = 0;
    },
  };
}

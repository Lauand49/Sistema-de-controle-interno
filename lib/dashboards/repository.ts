/**
 * DashboardRepository: consultas somente leitura dos painéis (servidor).
 *
 * Agrega no banco (`count`/`groupBy`) com os `where` de `filters.ts`, para que os números
 * sigam as mesmas fronteiras da Calculadora_Metricas. Todo `select` é mínimo: nenhuma
 * consulta lê `description`, `CardFieldValue`, `contactInfo`, `contactName` ou `email`
 * (Req. 2.10). Nenhuma operação de escrita (Req. 2.8).
 */
import 'server-only';
import type { Prisma, PrismaClient } from '@prisma/client';
import {
  isDepartmentCode,
  isSectorCode,
  isUnitCode,
  personTitle,
  type DepartmentCode,
  type Person,
  type SectorCode,
  type UnitCode,
} from '@/lib/permissions';
import { userHierarchyInclude } from '@/lib/users';
import {
  taskDoneWhere,
  taskOpenWhere,
  taskOverdueWhere,
  taskScopeWhere,
  requestOverdueWhere,
  requestStatusWhere,
  leadCohortWhere,
} from './filters';
import {
  LEAD_STATUSES,
  OPEN_REQUEST_STATUSES,
  type CountRow,
  type PhaseInfo,
  type ProgressScope,
  type TaskCounts,
} from './metrics';
import { dueDayKey, type MetricContext } from './period';
import type { MemberCardGroupDTO, OverdueTaskDTO, PersonBrief, UnitType } from './types';

// ---------------------------------------------------------------------------
// Interface
// ---------------------------------------------------------------------------

export interface UnitRecord {
  id: string;
  code: UnitCode;
  name: string;
  type: UnitType;
}

export type PersonWithProfile = Person & { name: string; avatar: string | null; title: string };

export interface OverdueTaskQuery {
  unitId?: string;
  targetId?: string;
  scope?: ProgressScope;
}

export interface UnitTaskRows {
  open: CountRow[];
  overdue: CountRow[];
  doneInPeriod: CountRow[];
}

export interface PipeWithPhases {
  id: string;
  name: string;
  phases: PhaseInfo[];
}

export interface LeadAssigneeStatusRow {
  assignedTo: string | null;
  status: string;
  count: number;
}

export interface DashboardRepository {
  findUnit(code: UnitCode): Promise<UnitRecord | null>;
  findPerson(userId: string): Promise<PersonWithProfile | null>;
  /** Membros ATIVOS: departamento por `departmentId`; setor por vínculo em `SectorMember` (Req. 7.1, 7.2). */
  activeUnitMembers(unit: { id: string; type: UnitType }): Promise<PersonWithProfile[]>;
  /** Gerente ativo do setor (o vínculo mais antigo, se houver mais de um) (Req. 5.4). */
  sectorManager(unitId: string): Promise<PersonBrief | null>;
  /** Linhas por responsável das três contagens de tarefas da Unidade (Req. 4.1, 5.1, 7.1, 7.2). */
  unitTaskRows(unitId: string, ctx: MetricContext): Promise<UnitTaskRows>;
  /** Contagens das tarefas do Alvo dentro do Escopo_Progresso (Req. 8.1, 8.2). */
  scopedTaskCounts(targetId: string, scope: ProgressScope, ctx: MetricContext): Promise<TaskCounts>;
  /** Até `take` Tarefas_Atrasadas por Dia_Prazo, criação e id crescentes (Req. 4.5, 5.3, 8.8). */
  overdueTasks(where: OverdueTaskQuery, ctx: MetricContext, take: number): Promise<OverdueTaskDTO[]>;
  /** Funis da Unidade (criação crescente) com fases por `order` (Req. 4.2, 5.2). */
  unitPipes(unitId: string): Promise<PipeWithPhases[]>;
  /** Cards por fase, opcionalmente só os de um responsável. */
  cardRowsByPhase(phaseIds: string[], assigneeId?: string): Promise<CountRow[]>;
  /** Cards do Alvo por funil e fase, restritos aos funis dos setores do escopo (Req. 8.3, 8.4). */
  memberCardPhases(targetId: string, scope: ProgressScope): Promise<MemberCardGroupDTO[]>;
  /** Solicitações recebidas/enviadas por status e atrasadas recebidas (Req. 4.3, 4.4, 4.6). */
  requestRows(
    deptCode: string,
    ctx: MetricContext
  ): Promise<{ received: CountRow[]; sent: CountRow[]; overdueReceived: number }>;
  /** Solicitações abertas e atrasadas em que o Alvo é responsável (Req. 8.5). */
  handlerRequestCounts(targetId: string, ctx: MetricContext): Promise<{ open: number; overdue: number }>;
  /** Leads por responsável e status, e coorte da conversão por status (Req. 6.1, 6.2, 6.3). */
  leadRows(ctx: MetricContext): Promise<{ byAssigneeStatus: LeadAssigneeStatusRow[]; cohort: CountRow[] }>;
  /** Leads do Alvo por status (Req. 8.6). */
  memberLeadRows(targetId: string): Promise<CountRow[]>;
  usersBrief(ids: string[]): Promise<PersonBrief[]>;
  activePeople(): Promise<PersonWithProfile[]>;
}

// ---------------------------------------------------------------------------
// Pessoas: mesma conversão de lib/users.ts (toUserDTO), sem ler `email`
// ---------------------------------------------------------------------------

const personSelect = {
  id: true,
  name: true,
  avatar: true,
  cargo: true,
  status: true,
  globalRole: true,
  departmentRole: true,
  department: userHierarchyInclude.department,
  sectorMemberships: userHierarchyInclude.sectorMemberships,
} satisfies Prisma.UserSelect;

type PersonRow = Prisma.UserGetPayload<{ select: typeof personSelect }>;

function toPerson(u: PersonRow): PersonWithProfile {
  const departmentCode = isDepartmentCode(u.department?.code)
    ? (u.department!.code as DepartmentCode)
    : null;
  const sectors = u.sectorMemberships
    .filter((m) => isSectorCode(m.unit.code))
    .map((m) => ({ code: m.unit.code as SectorCode, name: m.unit.name, role: m.role }));
  const person: Person = {
    id: u.id,
    status: u.status,
    globalRole: u.globalRole,
    departmentCode,
    departmentRole: u.departmentRole,
    sectors,
  };
  return {
    ...person,
    name: u.name,
    avatar: u.avatar,
    title: personTitle({ ...person, cargo: u.cargo }),
  };
}

const briefSelect = { id: true, name: true, avatar: true } satisfies Prisma.UserSelect;

// ---------------------------------------------------------------------------
// Auxiliares
// ---------------------------------------------------------------------------

function toRows<K extends string>(
  rows: ({ _count: { _all: number } } & Record<K, string | null>)[],
  key: K
): CountRow[] {
  return rows.map((r) => ({ key: r[key], count: r._count._all }));
}

function scopeUnitCodes(scope: ProgressScope): string[] | null {
  return scope === 'ALL' ? null : [...scope];
}

// ---------------------------------------------------------------------------
// Implementação Prisma
// ---------------------------------------------------------------------------

export function prismaDashboardRepository(db: PrismaClient): DashboardRepository {
  async function taskRowsByAssignee(where: Prisma.TaskWhereInput): Promise<CountRow[]> {
    const rows = await db.task.groupBy({ by: ['assigneeId'], where, _count: { _all: true } });
    return toRows(rows, 'assigneeId');
  }

  return {
    async findUnit(code) {
      const unit = await db.unit.findUnique({
        where: { code },
        select: { id: true, code: true, name: true, type: true },
      });
      if (!unit || !isUnitCode(unit.code)) return null;
      return { id: unit.id, code: unit.code, name: unit.name, type: unit.type };
    },

    async findPerson(userId) {
      const u = await db.user.findUnique({ where: { id: userId }, select: personSelect });
      return u ? toPerson(u) : null;
    },

    async activeUnitMembers(unit) {
      const where: Prisma.UserWhereInput =
        unit.type === 'DEPARTAMENTO'
          ? { status: 'ATIVO', departmentId: unit.id }
          : { status: 'ATIVO', sectorMemberships: { some: { unitId: unit.id } } };
      const users = await db.user.findMany({ where, select: personSelect });
      return users.map(toPerson);
    },

    async sectorManager(unitId) {
      const link = await db.sectorMember.findFirst({
        where: { unitId, role: 'GERENTE', user: { status: 'ATIVO' } },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        select: { user: { select: briefSelect } },
      });
      return link ? link.user : null;
    },

    async unitTaskRows(unitId, ctx) {
      const [open, overdue, doneInPeriod] = await Promise.all([
        taskRowsByAssignee({ AND: [{ unitId }, taskOpenWhere()] }),
        taskRowsByAssignee({ AND: [{ unitId }, taskOverdueWhere(ctx)] }),
        taskRowsByAssignee({ AND: [{ unitId }, taskDoneWhere(ctx)] }),
      ]);
      return { open, overdue, doneInPeriod };
    },

    async scopedTaskCounts(targetId, scope, ctx) {
      const base = taskScopeWhere(targetId, scope);
      const [open, overdue, doneInPeriod] = await Promise.all([
        db.task.count({ where: { AND: [base, taskOpenWhere()] } }),
        db.task.count({ where: { AND: [base, taskOverdueWhere(ctx)] } }),
        db.task.count({ where: { AND: [base, taskDoneWhere(ctx)] } }),
      ]);
      return { open, overdue, doneInPeriod };
    },

    async overdueTasks(query, ctx, take) {
      const and: Prisma.TaskWhereInput[] = [taskOverdueWhere(ctx)];
      if (query.unitId !== undefined) and.push({ unitId: query.unitId });
      if (query.targetId !== undefined) and.push(taskScopeWhere(query.targetId, query.scope ?? 'ALL'));
      const tasks = await db.task.findMany({
        where: { AND: and },
        orderBy: [{ dueDate: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
        take,
        select: {
          id: true,
          title: true,
          dueDate: true,
          assignee: { select: briefSelect },
          unit: { select: { code: true, name: true } },
        },
      });
      return tasks.map((t) => ({
        id: t.id,
        title: t.title,
        // O filtro de atraso exige dueDate não nulo.
        dueDate: dueDayKey(t.dueDate!),
        assignee: t.assignee,
        unit: t.unit,
      }));
    },

    async unitPipes(unitId) {
      return db.pipe.findMany({
        where: { unitId },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        select: {
          id: true,
          name: true,
          phases: {
            select: { id: true, name: true, order: true, isFinal: true },
            orderBy: [{ order: 'asc' }, { id: 'asc' }],
          },
        },
      });
    },

    async cardRowsByPhase(phaseIds, assigneeId) {
      if (phaseIds.length === 0) return [];
      const where: Prisma.CardWhereInput = { phaseId: { in: phaseIds } };
      if (assigneeId !== undefined) where.assigneeId = assigneeId;
      const rows = await db.card.groupBy({ by: ['phaseId'], where, _count: { _all: true } });
      return toRows(rows, 'phaseId');
    },

    async memberCardPhases(targetId, scope) {
      const codes = scopeUnitCodes(scope);
      if (codes !== null && codes.length === 0) return [];
      const where: Prisma.CardWhereInput =
        codes === null
          ? { assigneeId: targetId }
          : { assigneeId: targetId, phase: { pipe: { unit: { code: { in: codes } } } } };
      const rows = await db.card.groupBy({ by: ['phaseId'], where, _count: { _all: true } });
      if (rows.length === 0) return [];

      const counts = new Map(rows.map((r) => [r.phaseId, r._count._all]));
      const phases = await db.phase.findMany({
        where: { id: { in: Array.from(counts.keys()) } },
        select: {
          id: true,
          name: true,
          order: true,
          isFinal: true,
          pipe: {
            select: { id: true, name: true, createdAt: true, unit: { select: { code: true, name: true } } },
          },
        },
      });

      const groups = new Map<string, { createdAt: Date; group: MemberCardGroupDTO }>();
      for (const ph of phases) {
        let entry = groups.get(ph.pipe.id);
        if (!entry) {
          entry = {
            createdAt: ph.pipe.createdAt,
            group: { pipe: { id: ph.pipe.id, name: ph.pipe.name, unit: ph.pipe.unit }, phases: [] },
          };
          groups.set(ph.pipe.id, entry);
        }
        entry.group.phases.push({
          id: ph.id,
          name: ph.name,
          order: ph.order,
          isFinal: ph.isFinal,
          cards: counts.get(ph.id) ?? 0,
        });
      }

      return Array.from(groups.values())
        .sort(
          (a, b) =>
            a.createdAt.getTime() - b.createdAt.getTime() ||
            (a.group.pipe.id < b.group.pipe.id ? -1 : a.group.pipe.id > b.group.pipe.id ? 1 : 0)
        )
        .map(({ group }) => ({
          ...group,
          phases: group.phases.sort((a, b) => a.order - b.order || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)),
        }));
    },

    async requestRows(deptCode, ctx) {
      const statusWhere = requestStatusWhere(ctx);
      const [received, sent, overdueReceived] = await Promise.all([
        db.crossDeptRequest.groupBy({
          by: ['status'],
          where: { AND: [{ toDept: deptCode }, statusWhere] },
          _count: { _all: true },
        }),
        db.crossDeptRequest.groupBy({
          by: ['status'],
          where: { AND: [{ fromDept: deptCode }, statusWhere] },
          _count: { _all: true },
        }),
        db.crossDeptRequest.count({ where: { AND: [{ toDept: deptCode }, requestOverdueWhere(ctx)] } }),
      ]);
      return { received: toRows(received, 'status'), sent: toRows(sent, 'status'), overdueReceived };
    },

    async handlerRequestCounts(targetId, ctx) {
      const [open, overdue] = await Promise.all([
        db.crossDeptRequest.count({
          where: { handlerId: targetId, status: { in: [...OPEN_REQUEST_STATUSES] } },
        }),
        db.crossDeptRequest.count({ where: { AND: [{ handlerId: targetId }, requestOverdueWhere(ctx)] } }),
      ]);
      return { open, overdue };
    },

    async leadRows(ctx) {
      const [byAssigneeStatus, cohort] = await Promise.all([
        db.prospectLead.groupBy({
          by: ['assignedTo', 'status'],
          where: { status: { in: [...LEAD_STATUSES] } },
          _count: { _all: true },
        }),
        db.prospectLead.groupBy({ by: ['status'], where: leadCohortWhere(ctx), _count: { _all: true } }),
      ]);
      return {
        byAssigneeStatus: byAssigneeStatus.map((r) => ({
          assignedTo: r.assignedTo,
          status: r.status,
          count: r._count._all,
        })),
        cohort: toRows(cohort, 'status'),
      };
    },

    async memberLeadRows(targetId) {
      const rows = await db.prospectLead.groupBy({
        by: ['status'],
        where: { assignedTo: targetId, status: { in: [...LEAD_STATUSES] } },
        _count: { _all: true },
      });
      return toRows(rows, 'status');
    },

    async usersBrief(ids) {
      if (ids.length === 0) return [];
      return db.user.findMany({ where: { id: { in: Array.from(new Set(ids)) } }, select: briefSelect });
    },

    async activePeople() {
      const users = await db.user.findMany({ where: { status: 'ATIVO' }, select: personSelect });
      return users.map(toPerson);
    },
  };
}

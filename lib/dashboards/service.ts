/**
 * Serviço dos painéis: validação, permissão e montagem das respostas da API_Paineis.
 *
 * Recebe um `DashboardRepository` (só o tipo é importado, para que o serviço seja
 * testável com um repositório falso, sem Prisma) e um `now` único por requisição.
 *
 * Ordem fixa das verificações (Req. 2.1–2.6): Periodo (400) → existência da Unidade ou
 * do Alvo (404) → permissão (403) → consultas de métrica em paralelo. Todo objeto vindo
 * do repositório é recopiado campo a campo, para que nenhuma chave extra (e-mail,
 * descrição, contatos) chegue à resposta (Req. 2.10).
 */
import { badRequest, forbidden, notFound } from '@/lib/api-error';
import {
  DEPARTMENTS,
  SECTORS,
  canSeeMemberSummary,
  canViewMemberDashboard,
  canViewUnitDashboard,
  isDepartmentManager,
  isGlobal,
  isSectorManager,
  isUnitCode,
  progressScope,
  type Person,
} from '@/lib/permissions';
import {
  CONVERSION_COHORT_STATUSES,
  CONVERTED_LEAD_STATUS,
  LEAD_STATUSES,
  buildMemberSummaries,
  conversionFromCounts,
  emptyLeadCounts,
  phaseCounts,
  statusRowsToCounts,
  sumRows,
  type CountRow,
  type LeadStatus,
  type LeadStatusCounts,
  type TaskCounts,
} from './metrics';
import { buildMetricContext, parsePeriodo, type MetricContext, type Periodo } from './period';
import type { DashboardRepository, LeadAssigneeStatusRow, PersonWithProfile } from './repository';
import type {
  HubDTO,
  LeadsByAssigneeDTO,
  MemberCardGroupDTO,
  MemberDashboardDTO,
  MemberScopeDTO,
  MemberSummaryDTO,
  OverdueTaskDTO,
  PeriodDTO,
  PersonBrief,
  PipeCountDTO,
  UnitDashboardDTO,
  UnitLeadsDTO,
  UnitRef,
} from './types';

export const INVALID_PERIOD_MESSAGE = 'Parâmetro "periodo" inválido: use 7d, 30d, 90d ou tudo.';
export const NOT_FOUND_MESSAGE = 'Painel não encontrado.';
export const FORBIDDEN_MESSAGE = 'Você não tem permissão para ver este painel.';

/** Limite das listas de tarefas atrasadas (Req. 4.5, 5.3, 8.8). */
export const OVERDUE_LIST_LIMIT = 10;

// ---------------------------------------------------------------------------
// Auxiliares
// ---------------------------------------------------------------------------

function requirePeriodo(raw: string | null | undefined): Periodo {
  const periodo = parsePeriodo(raw);
  if (periodo === null) throw badRequest(INVALID_PERIOD_MESSAGE);
  return periodo;
}

function byName(a: { name: string }, b: { name: string }): number {
  return a.name.localeCompare(b.name, 'pt-BR');
}

function toBrief(p: { id: string; name: string; avatar: string | null }): PersonBrief {
  return { id: p.id, name: p.name, avatar: p.avatar };
}

function toUnitRef(u: { code: string; name: string }): UnitRef {
  return { code: u.code, name: u.name };
}

function toPeriodDTO(ctx: MetricContext): PeriodDTO {
  return {
    key: ctx.window.key,
    from: ctx.window.from === null ? null : ctx.window.from.toISOString(),
    to: ctx.window.to.toISOString(),
  };
}

function toTaskCounts(c: TaskCounts): TaskCounts {
  return { open: c.open, overdue: c.overdue, doneInPeriod: c.doneInPeriod };
}

function toOverdueTask(
  t: OverdueTaskDTO,
  keep: { assignee: boolean; unit: boolean }
): OverdueTaskDTO {
  return {
    id: t.id,
    title: t.title,
    dueDate: t.dueDate,
    assignee: keep.assignee && t.assignee ? toBrief(t.assignee) : null,
    unit: keep.unit && t.unit ? toUnitRef(t.unit) : null,
  };
}

function toMemberCardGroup(g: MemberCardGroupDTO): MemberCardGroupDTO {
  return {
    pipe: { id: g.pipe.id, name: g.pipe.name, unit: toUnitRef(g.pipe.unit) },
    phases: g.phases.map((ph) => ({
      id: ph.id,
      name: ph.name,
      order: ph.order,
      isFinal: ph.isFinal,
      cards: ph.cards,
    })),
  };
}

function isLeadStatus(s: string | null): s is LeadStatus {
  return s !== null && (LEAD_STATUSES as readonly string[]).includes(s);
}

/** Linhas por status → as 5 chaves de lead (zero incluído); ignora status fora do enum. */
function leadRowsToCounts(rows: readonly CountRow[]): LeadStatusCounts {
  const counts = emptyLeadCounts();
  for (const r of rows) {
    if (isLeadStatus(r.key)) counts[r.key] += r.count;
  }
  return counts;
}

function sumLeadCounts(c: LeadStatusCounts): number {
  return LEAD_STATUSES.reduce((acc, s) => acc + c[s], 0);
}

/** Pessoa referenciada por id que não está mais no banco. */
function unknownPerson(id: string): PersonBrief {
  return { id, name: 'Usuário removido', avatar: null };
}

// ---------------------------------------------------------------------------
// Tela_Hub (Req. 9.1–9.3)
// ---------------------------------------------------------------------------

export async function getHub(repo: DashboardRepository, actor: Person): Promise<HubDTO> {
  const departments = DEPARTMENTS.filter((d) => canViewUnitDashboard(actor, d.code)).map(toUnitRef);
  const sectors = SECTORS.filter((s) => canViewUnitDashboard(actor, s.code)).map(toUnitRef);

  let members: HubDTO['members'] = null;
  if (isGlobal(actor) || isDepartmentManager(actor) || isSectorManager(actor)) {
    const people = await repo.activePeople();
    members = people
      .filter((p) => p.status === 'ATIVO' && p.id !== actor.id && canViewMemberDashboard(actor, p))
      .sort(byName)
      .map((p) => ({ ...toBrief(p), title: p.title }));
  }

  return { me: { id: actor.id }, departments, sectors, members };
}

// ---------------------------------------------------------------------------
// Painel_Departamento / Painel_Setor (Req. 4–7)
// ---------------------------------------------------------------------------

async function buildUnitLeads(
  repo: DashboardRepository,
  ctx: MetricContext
): Promise<UnitLeadsDTO> {
  const { byAssigneeStatus, cohort } = await repo.leadRows(ctx);

  const byStatus = emptyLeadCounts();
  const perAssignee = new Map<string, LeadStatusCounts>();
  let unassigned: LeadStatusCounts | null = null;
  for (const row of byAssigneeStatus as readonly LeadAssigneeStatusRow[]) {
    if (!isLeadStatus(row.status) || row.count <= 0) continue;
    byStatus[row.status] += row.count;
    let counts: LeadStatusCounts;
    if (row.assignedTo === null) {
      counts = unassigned ??= emptyLeadCounts();
    } else {
      counts = perAssignee.get(row.assignedTo) ?? emptyLeadCounts();
      perAssignee.set(row.assignedTo, counts);
    }
    counts[row.status] += row.count;
  }

  const ids = Array.from(perAssignee.keys());
  const briefs = new Map((await repo.usersBrief(ids)).map((u) => [u.id, toBrief(u)]));
  const byAssignee: LeadsByAssigneeDTO[] = ids
    .map((id) => ({ assignee: briefs.get(id) ?? unknownPerson(id), counts: perAssignee.get(id)! }))
    .sort((a, b) => byName(a.assignee, b.assignee) || (a.assignee.id < b.assignee.id ? -1 : 1));
  if (unassigned !== null) byAssignee.push({ assignee: null, counts: unassigned });

  const cohortCounts = leadRowsToCounts(cohort);
  const total = CONVERSION_COHORT_STATUSES.reduce((acc, s) => acc + cohortCounts[s], 0);
  const conversion = conversionFromCounts(cohortCounts[CONVERTED_LEAD_STATUS], total);

  return { byStatus, conversion, byAssignee };
}

export async function getUnitDashboard(
  repo: DashboardRepository,
  actor: Person,
  rawCode: string,
  rawPeriodo: string | null,
  now: Date
): Promise<UnitDashboardDTO> {
  const periodo = requirePeriodo(rawPeriodo);

  const code = String(rawCode ?? '').toUpperCase();
  if (!isUnitCode(code)) throw notFound(NOT_FOUND_MESSAGE);
  const unit = await repo.findUnit(code);
  if (!unit) throw notFound(NOT_FOUND_MESSAGE);

  if (!canViewUnitDashboard(actor, code)) throw forbidden(FORBIDDEN_MESSAGE);

  const ctx = buildMetricContext(now, periodo);
  const isDepartment = unit.type === 'DEPARTAMENTO';

  const [taskRows, overdue, pipes, members, requests, sectorManager, leads] = await Promise.all([
    repo.unitTaskRows(unit.id, ctx),
    repo.overdueTasks({ unitId: unit.id }, ctx, OVERDUE_LIST_LIMIT),
    repo.unitPipes(unit.id).then(async (list): Promise<PipeCountDTO[]> => {
      const phaseIds = list.flatMap((p) => p.phases.map((ph) => ph.id));
      const rows = phaseIds.length > 0 ? await repo.cardRowsByPhase(phaseIds) : [];
      return list.map((p) => ({ id: p.id, name: p.name, phases: phaseCounts(p.phases, rows) }));
    }),
    repo.activeUnitMembers({ id: unit.id, type: unit.type }),
    isDepartment ? repo.requestRows(code, ctx) : Promise.resolve(null),
    isDepartment ? Promise.resolve(null) : repo.sectorManager(unit.id),
    code === 'NEGOCIOS' ? buildUnitLeads(repo, ctx) : Promise.resolve(null),
  ]);

  const activeMembers = (members as readonly PersonWithProfile[]).filter((m) => m.status === 'ATIVO');
  const visible = activeMembers.filter((m) => canSeeMemberSummary(actor, m, code)).sort(byName);
  const summaries = buildMemberSummaries(
    visible.map((m) => m.id),
    taskRows
  );
  const summaryById = new Map(summaries.map((s) => [s.userId, s]));
  const memberDTOs: MemberSummaryDTO[] = visible.map((m) => {
    const s = summaryById.get(m.id)!;
    return { user: toBrief(m), open: s.open, overdue: s.overdue, doneInPeriod: s.doneInPeriod };
  });

  return {
    unit: { code: unit.code, name: unit.name, type: unit.type },
    referenceDate: ctx.todayKey,
    period: toPeriodDTO(ctx),
    tasks: {
      open: sumRows(taskRows.open),
      overdue: sumRows(taskRows.overdue),
      doneInPeriod: sumRows(taskRows.doneInPeriod),
    },
    // A Unidade é a do próprio painel; a lista mostra o responsável.
    overdueTasks: overdue.map((t) => toOverdueTask(t, { assignee: true, unit: false })),
    pipes,
    requests:
      requests === null
        ? null
        : {
            received: statusRowsToCounts(requests.received),
            sent: statusRowsToCounts(requests.sent),
            overdueReceived: requests.overdueReceived,
          },
    sector: isDepartment
      ? null
      : {
          manager: sectorManager ? toBrief(sectorManager) : null,
          activeMembers: activeMembers.length,
        },
    members: memberDTOs,
    leads,
  };
}

// ---------------------------------------------------------------------------
// Painel_Membro (Req. 8)
// ---------------------------------------------------------------------------

export async function getMemberDashboard(
  repo: DashboardRepository,
  actor: Person,
  userId: string,
  rawPeriodo: string | null,
  now: Date
): Promise<MemberDashboardDTO> {
  const periodo = requirePeriodo(rawPeriodo);

  const target = await repo.findPerson(userId);
  if (!target) throw notFound(NOT_FOUND_MESSAGE);

  const scope = progressScope(actor, target);
  if (scope === null || !canViewMemberDashboard(actor, target)) throw forbidden(FORBIDDEN_MESSAGE);

  const ctx = buildMetricContext(now, periodo);
  const isAll = scope === 'ALL';
  const repoScope = isAll ? 'ALL' : [...scope];

  const [tasks, overdue, cards, requests, leadRows] = await Promise.all([
    repo.scopedTaskCounts(target.id, repoScope, ctx),
    repo.overdueTasks({ targetId: target.id, scope: repoScope }, ctx, OVERDUE_LIST_LIMIT),
    repo.memberCardPhases(target.id, repoScope),
    isAll ? repo.handlerRequestCounts(target.id, ctx) : Promise.resolve(null),
    isAll ? repo.memberLeadRows(target.id) : Promise.resolve(null),
  ]);

  const scopeDTO: MemberScopeDTO = isAll
    ? { kind: 'ALL' }
    : {
        kind: 'SECTORS',
        sectors: SECTORS.filter((s) => scope.includes(s.code)).map(toUnitRef),
      };

  let leads: MemberDashboardDTO['leads'] = null;
  if (leadRows !== null) {
    const byStatus = leadRowsToCounts(leadRows);
    if (sumLeadCounts(byStatus) > 0) leads = { byStatus };
  }

  return {
    member: { ...toBrief(target), title: target.title, status: target.status },
    scope: scopeDTO,
    referenceDate: ctx.todayKey,
    period: toPeriodDTO(ctx),
    tasks: toTaskCounts(tasks),
    // O responsável é o próprio Alvo; a lista mostra a Unidade (ou "Geral").
    overdueTasks: overdue.map((t) => toOverdueTask(t, { assignee: false, unit: true })),
    cards: cards.map(toMemberCardGroup),
    requests: requests === null ? null : { open: requests.open, overdue: requests.overdue },
    leads,
  };
}

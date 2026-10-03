/**
 * Calculadora_Metricas dos painéis (pura e isomórfica).
 *
 * Recebe fatos já carregados (ou linhas de `groupBy`) e um `MetricContext` e devolve
 * as métricas. Sem Prisma, sem Node e sem rede: as mesmas regras são a referência
 * em memória para os filtros de agregação de `filters.ts`.
 */
import { dueDayKey, inWindow, type MetricContext } from './period';

// ---------------------------------------------------------------------------
// Tarefas (Req. 3)
// ---------------------------------------------------------------------------

export type TaskStatus = 'TODO' | 'IN_PROGRESS' | 'DONE' | 'CANCELLED';

export interface TaskFact {
  /** A coluna é `String`; valores fora do enum não contam. */
  status: string;
  dueDate: Date | null;
  completedAt: Date | null;
  assigneeId: string | null;
  unitCode: string | null;
}

export interface TaskCounts {
  open: number;
  overdue: number;
  doneInPeriod: number;
}

export const OPEN_TASK_STATUSES = ['TODO', 'IN_PROGRESS'] as const;
export const DONE_TASK_STATUS = 'DONE' as const;

/** Tarefa_Aberta: TODO ou IN_PROGRESS (Req. 3.1). */
export function isOpenTask(t: TaskFact): boolean {
  return (OPEN_TASK_STATUSES as readonly string[]).includes(t.status);
}

/** Tarefa_Atrasada: aberta, com prazo e Dia_Prazo < Dia_Referencia (Req. 3.2, 3.5). */
export function isOverdueTask(t: TaskFact, ctx: MetricContext): boolean {
  return isOpenTask(t) && t.dueDate !== null && dueDayKey(t.dueDate) < ctx.todayKey;
}

/** Tarefa_Concluida com Data_Conclusao dentro do Periodo (Req. 3.3). */
export function isDoneInPeriod(t: TaskFact, ctx: MetricContext): boolean {
  return t.status === DONE_TASK_STATUS && t.completedAt !== null && inWindow(t.completedAt, ctx.window);
}

/** Contagens de tarefas; canceladas e status desconhecidos não entram em nada (Req. 3.4). */
export function computeTaskCounts(tasks: readonly TaskFact[], ctx: MetricContext): TaskCounts {
  const counts: TaskCounts = { open: 0, overdue: 0, doneInPeriod: 0 };
  for (const t of tasks) {
    if (isOpenTask(t)) counts.open++;
    if (isOverdueTask(t, ctx)) counts.overdue++;
    if (isDoneInPeriod(t, ctx)) counts.doneInPeriod++;
  }
  return counts;
}

/** Escopo_Progresso aplicado a tarefas: 'ALL' mantém tudo; lista mantém unitCode ∈ lista. */
export type ProgressScope = 'ALL' | readonly string[];

export function tasksInScope(tasks: readonly TaskFact[], scope: ProgressScope): TaskFact[] {
  if (scope === 'ALL') return [...tasks];
  return tasks.filter((t) => t.unitCode !== null && scope.includes(t.unitCode));
}

// ---------------------------------------------------------------------------
// Linhas de groupBy e Resumos_Membro (Req. 7)
// ---------------------------------------------------------------------------

export interface CountRow {
  key: string | null;
  count: number;
}

/** Soma de todas as linhas, inclusive a de chave nula (sem responsável). */
export function sumRows(rows: readonly CountRow[]): number {
  let total = 0;
  for (const r of rows) total += r.count;
  return total;
}

/** Mapa chave → contagem; ignora a chave nula e soma chaves repetidas. */
export function rowsToMap(rows: readonly CountRow[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const r of rows) {
    if (r.key === null) continue;
    map.set(r.key, (map.get(r.key) ?? 0) + r.count);
  }
  return map;
}

export interface MemberTaskSummary {
  userId: string;
  open: number;
  overdue: number;
  doneInPeriod: number;
}

export interface TaskRowsByAssignee {
  open: CountRow[];
  overdue: CountRow[];
  doneInPeriod: CountRow[];
}

/** Uma linha por membro (na ordem recebida, sem repetição), com zeros para quem não tem linha. */
export function buildMemberSummaries(
  memberIds: readonly string[],
  byAssignee: TaskRowsByAssignee
): MemberTaskSummary[] {
  const open = rowsToMap(byAssignee.open);
  const overdue = rowsToMap(byAssignee.overdue);
  const done = rowsToMap(byAssignee.doneInPeriod);
  const seen = new Set<string>();
  const result: MemberTaskSummary[] = [];
  for (const userId of memberIds) {
    if (seen.has(userId)) continue;
    seen.add(userId);
    result.push({
      userId,
      open: open.get(userId) ?? 0,
      overdue: overdue.get(userId) ?? 0,
      doneInPeriod: done.get(userId) ?? 0,
    });
  }
  return result;
}

/** Agrupa por responsável as tarefas que satisfazem `pred` (equivalente em memória ao groupBy). */
function rowsByAssignee(tasks: readonly TaskFact[], pred: (t: TaskFact) => boolean): CountRow[] {
  const counts = new Map<string | null, number>();
  for (const t of tasks) {
    if (!pred(t)) continue;
    counts.set(t.assigneeId, (counts.get(t.assigneeId) ?? 0) + 1);
  }
  return Array.from(counts, ([key, count]) => ({ key, count }));
}

/** Referência em memória: totais da Unidade e Resumos_Membro (Req. 7.1, 7.2, 7.6). */
export function summarizeTasksByMember(
  tasks: readonly TaskFact[],
  memberIds: readonly string[],
  ctx: MetricContext
): { total: TaskCounts; members: MemberTaskSummary[] } {
  const rows: TaskRowsByAssignee = {
    open: rowsByAssignee(tasks, isOpenTask),
    overdue: rowsByAssignee(tasks, (t) => isOverdueTask(t, ctx)),
    doneInPeriod: rowsByAssignee(tasks, (t) => isDoneInPeriod(t, ctx)),
  };
  return {
    total: {
      open: sumRows(rows.open),
      overdue: sumRows(rows.overdue),
      doneInPeriod: sumRows(rows.doneInPeriod),
    },
    members: buildMemberSummaries(memberIds, rows),
  };
}

// ---------------------------------------------------------------------------
// Cards por fase (Req. 4.2, 5.2)
// ---------------------------------------------------------------------------

export interface PhaseInfo {
  id: string;
  name: string;
  order: number;
  isFinal: boolean;
}

/** Fases na ordem de `order` (estável), com zero para fases sem linha; linhas desconhecidas são ignoradas. */
export function phaseCounts(
  phases: readonly PhaseInfo[],
  rows: readonly CountRow[]
): (PhaseInfo & { cards: number })[] {
  const byPhase = rowsToMap(rows);
  return [...phases]
    .sort((a, b) => a.order - b.order)
    .map((p) => ({ id: p.id, name: p.name, order: p.order, isFinal: p.isFinal, cards: byPhase.get(p.id) ?? 0 }));
}

// ---------------------------------------------------------------------------
// Solicitações (Req. 4.3, 4.4, 4.6, 8.5)
// ---------------------------------------------------------------------------

export const REQUEST_STATUSES = ['PENDING', 'APPROVED', 'REJECTED', 'IN_PROGRESS', 'COMPLETED'] as const;
export type RequestStatus = (typeof REQUEST_STATUSES)[number];
export const OPEN_REQUEST_STATUSES = ['PENDING', 'APPROVED', 'IN_PROGRESS'] as const;
export const COMPLETED_REQUEST_STATUS = 'COMPLETED' as const;

export interface RequestFact {
  status: string;
  fromDept: string;
  toDept: string;
  handlerId: string | null;
  dueDate: Date | null;
  updatedAt: Date;
}

export type RequestStatusCounts = Record<RequestStatus, number>;

function emptyRequestCounts(): RequestStatusCounts {
  return { PENDING: 0, APPROVED: 0, REJECTED: 0, IN_PROGRESS: 0, COMPLETED: 0 };
}

function isRequestStatus(s: string | null): s is RequestStatus {
  return s !== null && (REQUEST_STATUSES as readonly string[]).includes(s);
}

/** Por status; COMPLETED só com `updatedAt` no Periodo, demais sobre todas (Req. 4.6). */
export function countRequestsByStatus(reqs: readonly RequestFact[], ctx: MetricContext): RequestStatusCounts {
  const counts = emptyRequestCounts();
  for (const r of reqs) {
    if (!isRequestStatus(r.status)) continue;
    if (r.status === COMPLETED_REQUEST_STATUS && !inWindow(r.updatedAt, ctx.window)) continue;
    counts[r.status]++;
  }
  return counts;
}

/** Linhas de groupBy por status → as 5 chaves, zero para status sem linha; ignora status fora do enum. */
export function statusRowsToCounts(rows: readonly CountRow[]): RequestStatusCounts {
  const counts = emptyRequestCounts();
  for (const r of rows) {
    if (isRequestStatus(r.key)) counts[r.key] += r.count;
  }
  return counts;
}

/** Solicitacao_Atrasada: aberta, com prazo e Dia_Prazo < Dia_Referencia (Req. 4.4). */
export function isOverdueRequest(r: RequestFact, ctx: MetricContext): boolean {
  return (
    (OPEN_REQUEST_STATUSES as readonly string[]).includes(r.status) &&
    r.dueDate !== null &&
    dueDayKey(r.dueDate) < ctx.todayKey
  );
}

// ---------------------------------------------------------------------------
// Leads de Negócios (Req. 6)
// ---------------------------------------------------------------------------

export const LEAD_STATUSES = ['RAW', 'PENDING', 'IN_PROGRESS', 'CONVERTED_TO_PIPE', 'DISCARDED'] as const;
export type LeadStatus = (typeof LEAD_STATUSES)[number];
export const CONVERTED_LEAD_STATUS = 'CONVERTED_TO_PIPE' as const;
/** Status que entram no denominador da Taxa_Conversao (todos menos RAW). */
export const CONVERSION_COHORT_STATUSES = ['PENDING', 'IN_PROGRESS', 'CONVERTED_TO_PIPE', 'DISCARDED'] as const;

export interface LeadFact {
  status: LeadStatus;
  assignedTo: string | null;
  createdAt: Date;
}

export type LeadStatusCounts = Record<LeadStatus, number>;

export function emptyLeadCounts(): LeadStatusCounts {
  return { RAW: 0, PENDING: 0, IN_PROGRESS: 0, CONVERTED_TO_PIPE: 0, DISCARDED: 0 };
}

function isLeadStatus(s: string | null): s is LeadStatus {
  return s !== null && (LEAD_STATUSES as readonly string[]).includes(s);
}

/** Contagem atual por status, com todas as chaves presentes (Req. 6.1, 6.4). */
export function countLeadsByStatus(leads: readonly LeadFact[]): LeadStatusCounts {
  const counts = emptyLeadCounts();
  for (const l of leads) {
    if (isLeadStatus(l.status)) counts[l.status]++;
  }
  return counts;
}

export interface Conversion {
  converted: number;
  total: number;
  /** Porcentagem inteira (meio para cima) ou null quando total = 0 ("—"). */
  percent: number | null;
}

/** percent = ⌊(200·converted + total) / (2·total)⌋: arredondamento meio para cima só com inteiros. */
export function conversionFromCounts(converted: number, total: number): Conversion {
  const percent = total === 0 ? null : Math.floor((200 * converted + total) / (2 * total));
  return { converted, total, percent };
}

/** Coorte: leads criados no Periodo com status ≠ RAW; convertidos = CONVERTED_TO_PIPE (Req. 6.2, 6.6). */
export function computeConversion(leads: readonly LeadFact[], ctx: MetricContext): Conversion {
  let converted = 0;
  let total = 0;
  for (const l of leads) {
    if (!(CONVERSION_COHORT_STATUSES as readonly string[]).includes(l.status)) continue;
    if (!inWindow(l.createdAt, ctx.window)) continue;
    total++;
    if (l.status === CONVERTED_LEAD_STATUS) converted++;
  }
  return conversionFromCounts(converted, total);
}

/**
 * Uma linha por responsável com ao menos um lead (ordenadas por id; o serviço reordena
 * pelo nome) e a linha `assignedTo: null` ("Sem responsável") por último, quando houver (Req. 6.3).
 */
export function leadsByAssignee(
  leads: readonly LeadFact[]
): { assignedTo: string | null; counts: LeadStatusCounts }[] {
  const byAssignee = new Map<string, LeadFact[]>();
  const unassigned: LeadFact[] = [];
  for (const l of leads) {
    if (l.assignedTo === null) {
      unassigned.push(l);
      continue;
    }
    const list = byAssignee.get(l.assignedTo);
    if (list) list.push(l);
    else byAssignee.set(l.assignedTo, [l]);
  }
  const rows: { assignedTo: string | null; counts: LeadStatusCounts }[] = Array.from(byAssignee.keys())
    .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))
    .map((id) => ({ assignedTo: id, counts: countLeadsByStatus(byAssignee.get(id)!) }));
  if (unassigned.length > 0) rows.push({ assignedTo: null, counts: countLeadsByStatus(unassigned) });
  return rows;
}

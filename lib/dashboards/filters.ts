/**
 * Filtros `where` de Prisma gerados das mesmas fronteiras da Calculadora_Metricas (puro).
 *
 * Usados por `repository.ts` em `count`/`groupBy`, para que a agregação aconteça no banco.
 * Só `import type`: nenhum acesso a banco. Status sempre por lista explícita (`in`), então
 * valores fora do enum (as colunas são `String`) nunca entram em contagem nenhuma.
 * A equivalência com `metrics.ts` é garantida pelas Properties 7 e 8.
 */
import type { Prisma } from '@prisma/client';
import {
  COMPLETED_REQUEST_STATUS,
  CONVERSION_COHORT_STATUSES,
  DONE_TASK_STATUS,
  OPEN_REQUEST_STATUSES,
  OPEN_TASK_STATUSES,
  REQUEST_STATUSES,
  type ProgressScope,
} from './metrics';
import type { MetricContext, PeriodWindow } from './period';

/** `{ gte: from?, lte: to }`: equivalente a `inWindow` (Periodo 'tudo' não tem limite inferior). */
function windowFilter(w: PeriodWindow): Prisma.DateTimeFilter {
  return w.from === null ? { lte: w.to } : { gte: w.from, lte: w.to };
}

/** Status de solicitação que contam sobre todas as solicitações (todos menos COMPLETED). */
const NON_COMPLETED_REQUEST_STATUSES = REQUEST_STATUSES.filter((s) => s !== COMPLETED_REQUEST_STATUS);

// ---------------------------------------------------------------------------
// Tarefas (Req. 3, 8)
// ---------------------------------------------------------------------------

/** Tarefa_Aberta: status TODO ou IN_PROGRESS (Req. 3.1). */
export function taskOpenWhere(): Prisma.TaskWhereInput {
  return { status: { in: [...OPEN_TASK_STATUSES] } };
}

/**
 * Tarefa_Atrasada: aberta e `dueDate < overdueCutoff` (meia-noite UTC do Dia_Referencia),
 * o que equivale a Dia_Prazo < Dia_Referencia; `dueDate` nulo não satisfaz `lt` (Req. 3.2, 3.5).
 */
export function taskOverdueWhere(ctx: MetricContext): Prisma.TaskWhereInput {
  return { AND: [taskOpenWhere(), { dueDate: { lt: ctx.overdueCutoff } }] };
}

/** Tarefa_Concluida com Data_Conclusao no Periodo; `completedAt` nulo não satisfaz o filtro (Req. 3.3). */
export function taskDoneWhere(ctx: MetricContext): Prisma.TaskWhereInput {
  return { AND: [{ status: DONE_TASK_STATUS }, { completedAt: windowFilter(ctx.window) }] };
}

/** Tarefas do Alvo dentro do Escopo_Progresso: 'ALL' → todas; lista → unidade ∈ lista (Req. 8.1, 8.2). */
export function taskScopeWhere(targetId: string, scope: ProgressScope): Prisma.TaskWhereInput {
  if (scope === 'ALL') return { assigneeId: targetId };
  return { AND: [{ assigneeId: targetId }, { unit: { code: { in: [...scope] } } }] };
}

// ---------------------------------------------------------------------------
// Solicitações (Req. 4.4, 4.6)
// ---------------------------------------------------------------------------

/** Solicitações que entram na contagem por status: não concluídas sempre; COMPLETED só com `updatedAt` no Periodo (Req. 4.6). */
export function requestStatusWhere(ctx: MetricContext): Prisma.CrossDeptRequestWhereInput {
  return {
    OR: [
      { status: { in: [...NON_COMPLETED_REQUEST_STATUSES] } },
      { AND: [{ status: COMPLETED_REQUEST_STATUS }, { updatedAt: windowFilter(ctx.window) }] },
    ],
  };
}

/** Solicitacao_Atrasada: aberta e `dueDate < overdueCutoff` (Req. 4.4). */
export function requestOverdueWhere(ctx: MetricContext): Prisma.CrossDeptRequestWhereInput {
  return {
    AND: [{ status: { in: [...OPEN_REQUEST_STATUSES] } }, { dueDate: { lt: ctx.overdueCutoff } }],
  };
}

// ---------------------------------------------------------------------------
// Leads (Req. 6.2)
// ---------------------------------------------------------------------------

/** Coorte da Taxa_Conversao: criados no Periodo com status ≠ RAW (lista explícita). */
export function leadCohortWhere(ctx: MetricContext): Prisma.ProspectLeadWhereInput {
  return {
    AND: [
      { status: { in: [...CONVERSION_COHORT_STATUSES] } },
      { createdAt: windowFilter(ctx.window) },
    ],
  };
}

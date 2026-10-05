// Feature: dashboards, Property 12: Resumos_Membro somam no máximo o total
/**
 * **Validates: Requirements 7.1, 7.2, 7.6**
 */
import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import {
  buildMemberSummaries,
  isDoneInPeriod,
  isOpenTask,
  isOverdueTask,
  sumRows,
  summarizeTasksByMember,
  type CountRow,
  type MemberTaskSummary,
  type TaskFact,
  type TaskRowsByAssignee,
} from '@/lib/dashboards/metrics';
import { buildMetricContext, type MetricContext } from '@/lib/dashboards/period';
import { FACT_PERSON_IDS, arbScenario } from './support/arb-facts';

/** Ids de membros: responsáveis possíveis mais ids que nunca recebem tarefas. */
const MEMBER_ID_POOL = [...FACT_PERSON_IDS, 'm-sem-tarefas-1', 'm-sem-tarefas-2'] as const;
const arbMemberIds = fc.shuffledSubarray([...MEMBER_ID_POOL]);

const COUNT_KEYS = ['open', 'overdue', 'doneInPeriod'] as const;

/** Agrupamento local por responsável (equivalente ao groupBy), em ordem embaralhável. */
function groupByAssignee(tasks: readonly TaskFact[], pred: (t: TaskFact) => boolean): CountRow[] {
  const counts = new Map<string | null, number>();
  for (const t of tasks) {
    if (pred(t)) counts.set(t.assigneeId, (counts.get(t.assigneeId) ?? 0) + 1);
  }
  return Array.from(counts, ([key, count]) => ({ key, count }));
}

function rowsFor(tasks: readonly TaskFact[], ctx: MetricContext): TaskRowsByAssignee {
  return {
    open: groupByAssignee(tasks, isOpenTask),
    overdue: groupByAssignee(tasks, (t) => isOverdueTask(t, ctx)),
    doneInPeriod: groupByAssignee(tasks, (t) => isDoneInPeriod(t, ctx)),
  };
}

function sumMembers(members: readonly MemberTaskSummary[], key: (typeof COUNT_KEYS)[number]): number {
  return members.reduce((acc, m) => acc + m[key], 0);
}

/** Verifica a propriedade e devolve os valores para checagens extras. */
function checkProperty(tasks: TaskFact[], memberIds: string[], ctx: MetricContext, reverseRows: boolean) {
  const rows = rowsFor(tasks, ctx);
  const rowsInput: TaskRowsByAssignee = reverseRows
    ? { open: [...rows.open].reverse(), overdue: [...rows.overdue].reverse(), doneInPeriod: [...rows.doneInPeriod].reverse() }
    : rows;

  const built = buildMemberSummaries(memberIds, rowsInput);
  const reference = summarizeTasksByMember(tasks, memberIds, ctx);

  // Mesmo resultado que a referência em memória.
  expect(built).toEqual(reference.members);

  // Exatamente uma linha por id de membro, na ordem recebida; zeros quando não há tarefas.
  expect(built.map((m) => m.userId)).toEqual(memberIds);
  for (const m of built) {
    if (!tasks.some((t) => t.assigneeId === m.userId)) {
      expect(m).toEqual({ userId: m.userId, open: 0, overdue: 0, doneInPeriod: 0 });
    }
  }

  // Soma das linhas ≤ total da Unidade, e o total bate com sumRows.
  for (const key of COUNT_KEYS) {
    expect(reference.total[key]).toBe(sumRows(rows[key]));
    expect(sumMembers(built, key)).toBeLessThanOrEqual(reference.total[key]);
  }
  return { built, reference };
}

describe('Property 12: Resumos_Membro somam no máximo o total', () => {
  it('buildMemberSummaries ≡ summarizeTasksByMember, uma linha por membro e soma ≤ total', () => {
    fc.assert(
      fc.property(arbScenario, arbMemberIds, fc.boolean(), ({ now, periodo, tasks }, memberIds, reverseRows) => {
        const ctx = buildMetricContext(now, periodo);
        const { built, reference } = checkProperty(tasks, memberIds, ctx, reverseRows);

        const memberIdSet: ReadonlySet<string> = new Set(memberIds);
        const covered = tasks.every((t) => t.assigneeId !== null && memberIdSet.has(t.assigneeId));
        if (covered) {
          for (const key of COUNT_KEYS) expect(sumMembers(built, key)).toBe(reference.total[key]);
        }
      }),
      { numRuns: 100 },
    );
  });

  it('igualdade quando todo responsável é membro e nenhuma tarefa está sem responsável', () => {
    fc.assert(
      fc.property(
        arbScenario,
        fc.shuffledSubarray(['m-sem-tarefas-1', 'm-sem-tarefas-2']),
        fc.constantFrom(...FACT_PERSON_IDS),
        fc.boolean(),
        ({ now, periodo, tasks }, extraIds, fallbackId, reverseRows) => {
          const ctx = buildMetricContext(now, periodo);
          const assigned = tasks.map((t) => ({ ...t, assigneeId: t.assigneeId ?? fallbackId }));
          const memberIds = [...FACT_PERSON_IDS, ...extraIds];
          const { built, reference } = checkProperty(assigned, memberIds, ctx, reverseRows);
          for (const key of COUNT_KEYS) expect(sumMembers(built, key)).toBe(reference.total[key]);
        },
      ),
      { numRuns: 100 },
    );
  });
});

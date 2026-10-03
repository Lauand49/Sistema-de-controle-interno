// Feature: dashboards, Property 7: Filtros de tarefas equivalem à Calculadora_Metricas
/**
 * **Validates: Requirements 3.1, 3.2, 3.3, 3.5, 4.1, 5.1, 8.1, 8.2**
 */
import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import {
  isDoneInPeriod,
  isOpenTask,
  isOverdueTask,
  tasksInScope,
  type ProgressScope,
} from '@/lib/dashboards/metrics';
import {
  taskDoneWhere,
  taskOpenWhere,
  taskOverdueWhere,
  taskScopeWhere,
} from '@/lib/dashboards/filters';
import { buildMetricContext } from '@/lib/dashboards/period';
import { FACT_PERSON_IDS, FACT_UNIT_CODES, arbNow, arbPeriodo, arbTaskFact } from './support/arb-facts';
import { matchesTask } from './support/where-eval';

/** Escopo_Progresso: 'ALL' ou subconjunto (possivelmente vazio) dos códigos de unidade. */
const arbScope: fc.Arbitrary<ProgressScope> = fc.oneof(
  fc.constant<ProgressScope>('ALL'),
  fc.subarray([...FACT_UNIT_CODES]),
);

/** Alvo: um dos ids usados pelos fatos (para colidir com `assigneeId`). */
const arbTarget = fc.constantFrom(...FACT_PERSON_IDS);

/** `now`, Periodo, tarefa gerada nas bordas deles, alvo e escopo. */
const arbCase = fc.tuple(arbNow, arbPeriodo).chain(([now, periodo]) =>
  fc.record({
    now: fc.constant(now),
    periodo: fc.constant(periodo),
    task: arbTaskFact(now, periodo),
    target: arbTarget,
    scope: arbScope,
  }),
);

describe('Property 7: Filtros de tarefas equivalem à Calculadora_Metricas', () => {
  it('where de filters.ts aceita a tarefa exatamente quando os predicados de metrics.ts aceitam', () => {
    fc.assert(
      fc.property(arbCase, ({ now, periodo, task, target, scope }) => {
        const ctx = buildMetricContext(now, periodo);

        expect(matchesTask(taskOpenWhere(), task)).toBe(isOpenTask(task));
        expect(matchesTask(taskOverdueWhere(ctx), task)).toBe(isOverdueTask(task, ctx));
        expect(matchesTask(taskDoneWhere(ctx), task)).toBe(isDoneInPeriod(task, ctx));
        expect(matchesTask(taskScopeWhere(target, scope), task)).toBe(
          task.assigneeId === target && tasksInScope([task], scope).length === 1,
        );
      }),
      { numRuns: 100 },
    );
  });
});

// Feature: dashboards, Property 13: Escopo de setores nunca amplia as contagens
/**
 * **Validates: Requirements 8.9, 8.1, 8.2**
 */
import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { computeTaskCounts, tasksInScope } from '@/lib/dashboards/metrics';
import { buildMetricContext } from '@/lib/dashboards/period';
import { FACT_UNIT_CODES, arbScenario } from './support/arb-facts';

/** Lista de setores: subconjunto (possivelmente vazio) dos códigos usados nos fatos, mais códigos sem tarefas. */
const arbScopeList: fc.Arbitrary<string[]> = fc.array(
  fc.oneof(
    { weight: 4, arbitrary: fc.constantFrom<string>(...FACT_UNIT_CODES) },
    { weight: 1, arbitrary: fc.constantFrom('INEXISTENTE', 'negocios', '') },
  ),
  { maxLength: 8 },
);

describe('Property 13: Escopo de setores nunca amplia as contagens', () => {
  it('cada contagem com lista de setores é ≤ a mesma contagem com escopo ALL', () => {
    fc.assert(
      fc.property(arbScenario, arbScopeList, ({ now, periodo, tasks }, setores) => {
        const ctx = buildMetricContext(now, periodo);
        const all = computeTaskCounts(tasksInScope(tasks, 'ALL'), ctx);
        const scoped = computeTaskCounts(tasksInScope(tasks, setores), ctx);

        expect(scoped.open).toBeLessThanOrEqual(all.open);
        expect(scoped.overdue).toBeLessThanOrEqual(all.overdue);
        expect(scoped.doneInPeriod).toBeLessThanOrEqual(all.doneInPeriod);
      }),
      { numRuns: 100 },
    );
  });
});

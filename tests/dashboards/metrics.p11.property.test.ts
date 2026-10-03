// Feature: dashboards, Property 11: Concluídas crescem com o Periodo
/**
 * **Validates: Requirements 3.7**
 */
import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { computeTaskCounts } from '@/lib/dashboards/metrics';
import { buildMetricContext, type Periodo } from '@/lib/dashboards/period';
import { arbNow, arbTaskFact } from './support/arb-facts';

/** Ordem crescente de abrangência dos Periodos. */
const ORDERED_PERIODS: readonly Periodo[] = ['7d', '30d', '90d', 'tudo'];

/**
 * `now` e uma lista de tarefas que mistura fatos gerados em torno das bordas de
 * cada janela (7d, 30d, 90d e tudo), para exercitar todas as fronteiras.
 */
const arbNowAndTasks = arbNow.chain((now) =>
  fc.record({
    now: fc.constant(now),
    tasks: fc
      .tuple(...ORDERED_PERIODS.map((p) => fc.array(arbTaskFact(now, p), { maxLength: 8 })))
      .map((lists) => lists.flat()),
  }),
);

describe('Property 11: Concluídas crescem com o Periodo', () => {
  it('doneInPeriod para 7d, 30d, 90d e tudo é não decrescente', () => {
    fc.assert(
      fc.property(arbNowAndTasks, ({ now, tasks }) => {
        const counts = ORDERED_PERIODS.map(
          (p) => computeTaskCounts(tasks, buildMetricContext(now, p)).doneInPeriod,
        );
        for (let i = 1; i < counts.length; i++) {
          expect(counts[i]).toBeGreaterThanOrEqual(counts[i - 1]);
        }
      }),
      { numRuns: 100 },
    );
  });
});

// Feature: dashboards, Property 10: Atrasadas nunca excedem abertas
/**
 * **Validates: Requirements 3.6**
 */
import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { computeTaskCounts } from '@/lib/dashboards/metrics';
import { buildMetricContext } from '@/lib/dashboards/period';
import { arbScenario } from './support/arb-facts';

describe('Property 10: Atrasadas nunca excedem abertas', () => {
  it('computeTaskCounts(...).overdue ≤ computeTaskCounts(...).open', () => {
    fc.assert(
      fc.property(arbScenario, ({ now, periodo, tasks }) => {
        const counts = computeTaskCounts(tasks, buildMetricContext(now, periodo));
        expect(counts.overdue).toBeLessThanOrEqual(counts.open);
      }),
      { numRuns: 100 },
    );
  });
});

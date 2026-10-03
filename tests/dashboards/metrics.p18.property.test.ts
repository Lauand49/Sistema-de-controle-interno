/**
 * Property 18 da Calculadora_Metricas: leads RAW ficam fora da coorte da Taxa_Conversao.
 */
// Feature: dashboards, Property 18: Leads RAW não alteram a Taxa_Conversao
import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { computeConversion } from '@/lib/dashboards/metrics';
import { buildMetricContext } from '@/lib/dashboards/period';
import { FACT_PERSON_IDS, arbLeadFact, arbScenario, type LeadFact } from './support/arb-facts';

const MIN_MS = Date.UTC(2020, 0, 1);
const MAX_MS = Date.UTC(2035, 11, 31, 23, 59, 59, 999);

/** Cenário com uma lista extra de leads RAW: `createdAt` nas bordas da janela ou em qualquer instante. */
const arbScenarioWithRaw = arbScenario.chain((s) =>
  fc.record({
    scenario: fc.constant(s),
    raws: fc.array(
      fc
        .tuple(
          arbLeadFact(s.now, s.periodo),
          fc.option(fc.integer({ min: MIN_MS, max: MAX_MS }), { nil: undefined }),
          fc.constantFrom<string | null>(null, ...FACT_PERSON_IDS, 'outro'),
        )
        .map(
          ([lead, anyMs, assignedTo]): LeadFact => ({
            status: 'RAW',
            assignedTo,
            createdAt: anyMs === undefined ? lead.createdAt : new Date(anyMs),
          }),
        ),
      { maxLength: 20 },
    ),
  }),
);

describe('Property 18: Leads RAW não alteram a Taxa_Conversao', () => {
  // **Validates: Requirements 6.6**
  it('computeConversion(leads ++ raws) é igual a computeConversion(leads)', () => {
    fc.assert(
      fc.property(arbScenarioWithRaw, ({ scenario, raws }) => {
        const ctx = buildMetricContext(scenario.now, scenario.periodo);
        const base = computeConversion(scenario.leads, ctx);
        expect(computeConversion([...scenario.leads, ...raws], ctx)).toEqual(base);
      }),
      { numRuns: 100 },
    );
  });
});

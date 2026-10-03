// Feature: dashboards, Property 8: Filtros de solicitações e leads equivalem à Calculadora_Metricas
/**
 * **Validates: Requirements 4.4, 4.6, 6.2**
 */
import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { leadCohortWhere, requestOverdueWhere, requestStatusWhere } from '@/lib/dashboards/filters';
import {
  computeConversion,
  countRequestsByStatus,
  isOverdueRequest,
  type RequestStatusCounts,
} from '@/lib/dashboards/metrics';
import { buildMetricContext } from '@/lib/dashboards/period';
import { matchesLead, matchesRequest } from './support/where-eval';
import { arbLeadFact, arbNow, arbPeriodo, arbRequestFact } from './support/arb-facts';

/** `now`, Periodo e um fato de solicitação e de lead gerados em torno deles. */
const arbCase = fc
  .tuple(arbNow, arbPeriodo)
  .chain(([now, periodo]) =>
    fc.record({
      now: fc.constant(now),
      periodo: fc.constant(periodo),
      request: arbRequestFact(now, periodo),
      lead: arbLeadFact(now, periodo),
    }),
  );

function total(counts: RequestStatusCounts): number {
  return Object.values(counts).reduce((a, b) => a + b, 0);
}

describe('Property 8: Filtros de solicitações e leads equivalem à Calculadora_Metricas', () => {
  it('requestStatusWhere, requestOverdueWhere e leadCohortWhere aceitam exatamente o que a Calculadora conta', () => {
    fc.assert(
      fc.property(arbCase, ({ now, periodo, request, lead }) => {
        const ctx = buildMetricContext(now, periodo);

        // Solicitação entra na contagem por status ⇔ requestStatusWhere a aceita.
        const counted = total(countRequestsByStatus([request], ctx)) === 1;
        expect(matchesRequest(requestStatusWhere(ctx), request)).toBe(counted);

        // Solicitacao_Atrasada.
        expect(matchesRequest(requestOverdueWhere(ctx), request)).toBe(isOverdueRequest(request, ctx));

        // Lead entra no denominador da Taxa_Conversao ⇔ leadCohortWhere o aceita.
        const inCohort = computeConversion([lead], ctx).total === 1;
        expect(matchesLead(leadCohortWhere(ctx), lead)).toBe(inCohort);
      }),
      { numRuns: 100 },
    );
  });
});

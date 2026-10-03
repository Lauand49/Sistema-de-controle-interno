// Feature: lead-miner, Property 14: Invariantes dos componentes do score
/**
 * **Validates: Requirements 6.1, 6.3, 6.7, 6.9**
 */
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { DIGITAL_MAX, ICP_MAX, ICP_POINTS, OBJECTIVE_MAX } from '@/lib/leads/config';
import { score } from '@/lib/leads/scorer';
import { arbScoreInput } from './support/arb-score';

describe('Property 14: Invariantes dos componentes do score', () => {
  it('digital, ICP, objetivo e final respeitam seus intervalos e somas', () => {
    fc.assert(
      fc.property(arbScoreInput, (input) => {
        const r = score(input);
        const somaDigital = r.digital.criteria.reduce((s, c) => s + c.points, 0);
        expect(r.digital.raw).toBe(somaDigital);
        expect(r.digital.value).toBe(Math.min(DIGITAL_MAX, Math.max(0, r.digital.raw)));
        expect(r.digital.max).toBe(DIGITAL_MAX);
        expect(Number.isInteger(r.digital.value)).toBe(true);

        expect(r.icp.value).toBe(ICP_POINTS[input.tier]);
        expect(r.icp.value).toBeGreaterThanOrEqual(0);
        expect(r.icp.value).toBeLessThanOrEqual(ICP_MAX);
        expect(r.icp.raw).toBe(r.icp.criteria.reduce((s, c) => s + c.points, 0));

        expect(r.objetivo).toBe(r.digital.value + r.icp.value);
        expect(r.objetivo).toBeGreaterThanOrEqual(0);
        expect(r.objetivo).toBeLessThanOrEqual(OBJECTIVE_MAX);

        if (r.ia) expect(r.ia.raw).toBe(r.ia.criteria.reduce((s, c) => s + c.points, 0));

        expect(Number.isInteger(r.final)).toBe(true);
        expect(r.final).toBeGreaterThanOrEqual(0);
        expect(r.final).toBeLessThanOrEqual(100);
      }),
      { numRuns: 100 },
    );
  });
});

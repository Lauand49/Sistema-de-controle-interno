// Feature: lead-miner, Property 16: Faixas de Prioridade
/**
 * **Validates: Requirements 6.8**
 */
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { priorityOf } from '@/lib/leads/scorer';

describe('Property 16: Faixas de Prioridade', () => {
  it('ALTA se s ≥ 70, MEDIA se 40 ≤ s < 70, BAIXA se s < 40', () => {
    fc.assert(
      fc.property(fc.oneof(fc.constantFrom(0, 39, 40, 69, 70, 100), fc.integer({ min: 0, max: 100 })), (s) => {
        const esperado = s >= 70 ? 'ALTA' : s >= 40 ? 'MEDIA' : 'BAIXA';
        expect(priorityOf(s)).toBe(esperado);
      }),
      { numRuns: 100 },
    );
  });
});

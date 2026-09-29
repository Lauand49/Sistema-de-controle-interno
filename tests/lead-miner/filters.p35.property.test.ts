import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { canOpenRanking } from '@/lib/leads/filters';
import { RUN_STATUS_LIST } from './support/arb-filters';

// Feature: lead-miner, Property 35: Link para o ranking a partir de uma mineração
// **Validates: Requirements 10.11, 10.12, 11.5, 11.9**
describe('Property 35: Link para o ranking a partir de uma mineração', () => {
  it('canOpenRanking é falso sse status = ERRO e processados = 0', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...RUN_STATUS_LIST),
        fc.oneof(fc.constant(0), fc.integer({ min: 1, max: 10_000 })),
        (status, processados) => {
          expect(canOpenRanking({ status, processados })).toBe(!(status === 'ERRO' && processados === 0));
        },
      ),
      { numRuns: 100 },
    );
  });
});

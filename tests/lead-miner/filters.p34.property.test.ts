import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { MSG, finalizeDiscovery } from '@/lib/leads/filters';
import { NICHE_ID_LIST } from './support/arb-filters';

const arbCase = fc
  .shuffledSubarray(NICHE_ID_LIST, { minLength: 1 })
  .chain((selecionados) =>
    fc.record({
      selecionados: fc.constant(selecionados),
      falhos: fc.oneof(
        fc.shuffledSubarray(selecionados),
        fc.constant([...selecionados].reverse()), // todos falharam
      ),
      total: fc.oneof(fc.constant(0), fc.integer({ min: 1, max: 5000 })),
    }),
  );

// Feature: lead-miner, Property 34: Desfecho da descoberta
// **Validates: Requirements 2.11, 2.13, 8.13**
describe('Property 34: Desfecho da descoberta', () => {
  it('ERRO sse todos os nichos falharam; senão CONCLUIDA (total 0) ou EM_ANDAMENTO, sem mensagem', () => {
    fc.assert(
      fc.property(arbCase, ({ selecionados, falhos, total }) => {
        const result = finalizeDiscovery(selecionados, falhos, total);
        const allFailed = selecionados.every((id) => falhos.includes(id));
        if (allFailed) {
          expect(result).toEqual({ status: 'ERRO', errorMessage: MSG.nenhumNicho });
        } else {
          expect(result).toEqual({
            status: total === 0 ? 'CONCLUIDA' : 'EM_ANDAMENTO',
            errorMessage: null,
          });
        }
      }),
      { numRuns: 100 },
    );
  });
});

// Feature: lead-miner, Property 13: Determinismo do Classificador e do Pontuador
/**
 * **Validates: Requirements 5.7, 6.10**
 */
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { classify } from '@/lib/leads/classifier';
import { score } from '@/lib/leads/scorer';
import { arbScoreInput } from './support/arb-score';

describe('Property 13: Determinismo do Classificador e do Pontuador', () => {
  it('entrada original e cópia profunda produzem resultados profundamente iguais', () => {
    fc.assert(
      fc.property(arbScoreInput, (input) => {
        const copia = structuredClone(input);
        expect(classify(copia.analysis)).toEqual(classify(input.analysis));
        expect(score(copia)).toEqual(score(input));
        // Chamadas não mutam a entrada.
        expect(input).toEqual(copia);
      }),
      { numRuns: 100 },
    );
  });
});

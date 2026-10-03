// Feature: lead-miner-enrichment, Property 37: For any entrada do Pontuador, acrescentar um Resultado_PageSpeed com nota < 50 produz Score_Final maior ou igual ao da mesma entrada sem PageSpeed.
/**
 * **Validates: Requirements 13.5**
 */
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { score } from '@/lib/leads/scorer';
import type { PageSpeedResult } from '@/lib/leads/types';
import { arbScoreInput } from '../lead-miner/support/arb-score';

const arbNullableScore = (max: number): fc.Arbitrary<number | null> =>
  fc.option(fc.integer({ min: 0, max }), { nil: null });

/** Resultado_PageSpeed com Desempenho_Ruim: nota em [0, 50), inteira ou fracionária. */
const arbPoorPageSpeed: fc.Arbitrary<PageSpeedResult> = fc.record({
  desempenho: fc.oneof(
    fc.constantFrom(0, 49, 49.99),
    fc.integer({ min: 0, max: 49 }),
    fc.double({ min: 0, max: 49.999, noNaN: true }),
  ),
  acessibilidade: arbNullableScore(100),
  boasPraticas: arbNullableScore(100),
  seo: arbNullableScore(100),
  lcpMs: arbNullableScore(60_000),
  cls: fc.option(fc.double({ min: 0, max: 5, noNaN: true }), { nil: null }),
  tbtMs: arbNullableScore(60_000),
  fcpMs: arbNullableScore(60_000),
  urlAnalisada: fc.constant('https://exemplo.com.br/'),
});

describe('Property 37: Monotonicidade do Desempenho_Ruim', () => {
  it('acrescentar PageSpeed com nota < 50 nunca reduz o Score_Final', () => {
    fc.assert(
      fc.property(arbScoreInput, arbPoorPageSpeed, fc.constantFrom(undefined, null), (input, pagespeed, absent) => {
        const without = score({ ...input, pagespeed: absent });
        const withPoor = score({ ...input, pagespeed });
        expect(withPoor.final).toBeGreaterThanOrEqual(without.final);
      }),
      { numRuns: 300 },
    );
  });
});

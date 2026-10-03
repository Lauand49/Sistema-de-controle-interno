// Feature: lead-miner-enrichment, Property 36: Versao_Score 2 sem PageSpeed equivale à Versao_Score 1
/**
 * **Validates: Requirements 13.4, 13.6**
 *
 * Para qualquer entrada da Etapa 1 sem Resultado_PageSpeed (ausente/null) ou com nota de
 * desempenho >= 50, `classify` e `score` da Versao_Score 2 devolvem exatamente o mesmo
 * resultado do modelo congelado da Etapa 1 — ignorando apenas `versao` no detalhamento.
 */
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { classify } from '@/lib/leads/classifier';
import { score } from '@/lib/leads/scorer';
import type { PageSpeedResult } from '@/lib/leads/types';
import { arbScoreInput } from '../lead-miner/support/arb-score';
import { classify as classifyV1, score as scoreV1 } from './support/scorer-v1-model';

const arbOptionalNull = <T>(arb: fc.Arbitrary<T>) => fc.option(arb, { nil: null });

/** Resultado_PageSpeed com nota >= limite (não configura Desempenho_Ruim). */
const arbGoodPageSpeed: fc.Arbitrary<PageSpeedResult> = fc.record({
  desempenho: fc.oneof(fc.constantFrom(50, 51, 99, 100), fc.integer({ min: 50, max: 100 })),
  acessibilidade: arbOptionalNull(fc.integer({ min: 0, max: 100 })),
  boasPraticas: arbOptionalNull(fc.integer({ min: 0, max: 100 })),
  seo: arbOptionalNull(fc.integer({ min: 0, max: 100 })),
  lcpMs: arbOptionalNull(fc.integer({ min: 0, max: 20_000 })),
  cls: arbOptionalNull(fc.double({ min: 0, max: 2, noNaN: true })),
  tbtMs: arbOptionalNull(fc.integer({ min: 0, max: 5_000 })),
  fcpMs: arbOptionalNull(fc.integer({ min: 0, max: 10_000 })),
  urlAnalisada: fc.constantFrom('https://exemplo.com.br/', 'http://exemplo.com.br/'),
});

/** 'omit' = campo ausente; null = sem dados; ou resultado com nota >= 50. */
const arbPageSpeedVariant = fc.oneof(
  fc.constant<'omit'>('omit'),
  fc.constant(null),
  arbGoodPageSpeed,
);

describe('Property 36: Versao_Score 2 sem PageSpeed equivale à Versao_Score 1', () => {
  it('classify e score (sem versao) coincidem com o modelo congelado da Etapa 1', () => {
    fc.assert(
      fc.property(arbScoreInput, arbPageSpeedVariant, (input, ps) => {
        const v2Input = ps === 'omit' ? { ...input } : { ...input, pagespeed: ps };
        const extra = ps === 'omit' ? undefined : { pagespeed: ps };

        expect(classify(input.analysis, extra)).toEqual(classifyV1(input.analysis));

        const { versao, ...semVersao } = score(v2Input);
        expect(versao).toBe(2);
        expect(semVersao).toEqual(scoreV1(input));
      }),
      { numRuns: 200 },
    );
  });
});

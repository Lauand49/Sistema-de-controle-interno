// Feature: lead-miner-enrichment, Property 35: Desempenho_Ruim na classificação e no componente digital
/**
 * **Validates: Requirements 13.2, 13.3**
 *
 * Para qualquer `SiteAnalysis` e `PageSpeedResult`:
 * - `classify` com PageSpeed devolve os motivos da Etapa 1 seguidos de
 *   "Desempenho ruim no PageSpeed (nota N)" exatamente quando a nota é < 50 e a regra 3
 *   se aplica (categoria passa a "Otimização / Segurança"), com 1 a 6 motivos;
 * - o componente digital inclui o critério `desempenhoRuim` com 7 pontos exatamente quando
 *   há site e a nota é < 50 (depois dos critérios da Etapa 1), com `value = clamp(raw, 0, 40)`.
 *
 * O oráculo da Etapa 1 é o modelo congelado em `support/scorer-v1-model.ts`.
 */
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { classify } from '@/lib/leads/classifier';
import { score } from '@/lib/leads/scorer';
import type { PageSpeedResult, SiteAnalysis } from '@/lib/leads/types';
import { arbScoreInput } from '../lead-miner/support/arb-score';
import { classify as classifyV1, score as scoreV1 } from './support/scorer-v1-model';

const arbOptionalNull = <T>(arb: fc.Arbitrary<T>) => fc.option(arb, { nil: null });

/** Resultado_PageSpeed com nota em 0..100, concentrando casos na fronteira 49/50. */
const arbPageSpeed: fc.Arbitrary<PageSpeedResult> = fc.record({
  desempenho: fc.oneof(fc.constantFrom(0, 1, 48, 49, 50, 51, 100), fc.integer({ min: 0, max: 100 })),
  acessibilidade: arbOptionalNull(fc.integer({ min: 0, max: 100 })),
  boasPraticas: arbOptionalNull(fc.integer({ min: 0, max: 100 })),
  seo: arbOptionalNull(fc.integer({ min: 0, max: 100 })),
  lcpMs: arbOptionalNull(fc.integer({ min: 0, max: 20_000 })),
  cls: arbOptionalNull(fc.double({ min: 0, max: 2, noNaN: true })),
  tbtMs: arbOptionalNull(fc.integer({ min: 0, max: 5_000 })),
  fcpMs: arbOptionalNull(fc.integer({ min: 0, max: 10_000 })),
  urlAnalisada: fc.constantFrom('https://exemplo.com.br/', 'http://exemplo.com.br/'),
});

/** Regra 3 do Classificador se aplica: há site e a análise não está incompleta. */
const rule3Applies = (a: SiteAnalysis): boolean =>
  a.hasSite && !(a.online && (a.statusCode == null || a.responseTimeMs == null));

describe('Property 35: Desempenho_Ruim na classificação e no componente digital', () => {
  it('classify acrescenta a condição (f) exatamente quando nota < 50 e a regra 3 se aplica', () => {
    fc.assert(
      fc.property(arbScoreInput, arbPageSpeed, ({ analysis }, ps) => {
        const v1 = classifyV1(analysis);
        const v2 = classify(analysis, { pagespeed: ps });
        const poor = ps.desempenho < 50;
        const label = `Desempenho ruim no PageSpeed (nota ${ps.desempenho})`;

        if (poor && rule3Applies(analysis)) {
          const base = v1.category === 'ANALISE_DADOS_BI' ? [] : v1.motivos;
          expect(v2.category).toBe('OTIMIZACAO_SEGURANCA');
          expect(v2.motivos).toEqual([...base, label]);
        } else {
          expect(v2).toEqual(v1);
          expect(v2.motivos).not.toContain(label);
        }
        expect(v2.motivos.length).toBeGreaterThanOrEqual(1);
        expect(v2.motivos.length).toBeLessThanOrEqual(6);
      }),
      { numRuns: 300 },
    );
  });

  it('componente digital inclui desempenhoRuim (7 pontos) exatamente com site e nota < 50, limitado a 40', () => {
    fc.assert(
      fc.property(arbScoreInput, arbPageSpeed, (input, ps) => {
        const v1 = scoreV1(input).digital;
        const { digital } = score({ ...input, pagespeed: ps });
        const expected = input.analysis.hasSite && ps.desempenho < 50;

        const extra = digital.criteria.filter((c) => c.id === 'desempenhoRuim');
        if (expected) {
          expect(digital.criteria).toEqual([
            ...v1.criteria,
            { id: 'desempenhoRuim', label: `Desempenho ruim no PageSpeed (nota ${ps.desempenho})`, points: 7 },
          ]);
          expect(digital.raw).toBe(v1.raw + 7);
        } else {
          expect(extra).toHaveLength(0);
          expect(digital.criteria).toEqual(v1.criteria);
          expect(digital.raw).toBe(v1.raw);
        }

        const raw = digital.criteria.reduce((acc, c) => acc + c.points, 0);
        expect(digital.raw).toBe(raw);
        expect(digital.max).toBe(40);
        expect(digital.value).toBe(Math.min(40, Math.max(0, raw)));
      }),
      { numRuns: 300 },
    );
  });
});

// Feature: dashboards, Property 17: Taxa_Conversao limitada e bem arredondada
/**
 * **Validates: Requirements 6.2, 6.5**
 */
import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { computeConversion, conversionFromCounts, type Conversion } from '@/lib/dashboards/metrics';
import { formatConversion } from '@/lib/dashboards/format';
import { buildMetricContext } from '@/lib/dashboards/period';
import { arbScenario } from './support/arb-facts';

/**
 * Verifica em aritmética exata (BigInt) que `percent` = ⌊100·converted/total + 0,5⌋,
 * ou seja, o único inteiro p com 2·total·p ≤ 200·converted + total < 2·total·(p + 1).
 */
function expectExactRounding(c: Conversion): void {
  const p = BigInt(c.percent as number);
  const t = BigInt(c.total);
  const num = 200n * BigInt(c.converted) + t;
  expect(2n * t * p <= num).toBe(true);
  expect(num < 2n * t * (p + 1n)).toBe(true);
}

/** Verifica limites, arredondamento e (opcionalmente) o texto formatado. */
function checkConversion(c: Conversion, checkText: boolean): void {
  if (c.total === 0) {
    expect(c.converted).toBe(0);
    expect(c.percent).toBeNull();
    if (checkText) expect(formatConversion(c)).toBe('— (0 de 0)');
    return;
  }
  expect(Number.isInteger(c.converted)).toBe(true);
  expect(Number.isInteger(c.total)).toBe(true);
  expect(c.converted).toBeGreaterThanOrEqual(0);
  expect(c.converted).toBeLessThanOrEqual(c.total);
  expect(c.percent).not.toBeNull();
  expect(Number.isInteger(c.percent)).toBe(true);
  expect(c.percent!).toBeGreaterThanOrEqual(0);
  expect(c.percent!).toBeLessThanOrEqual(100);
  expectExactRounding(c);
  if (checkText) expect(formatConversion(c)).toBe(`${c.percent}% (${c.converted} de ${c.total})`);
}

/**
 * Contagens (converted ≤ total), com viés para totais pares pequenos (empates em ,5)
 * e totais grandes (precisão do ponto flutuante).
 */
const arbCounts = fc
  .oneof(
    { weight: 3, arbitrary: fc.integer({ min: 1, max: 400 }) },
    { weight: 1, arbitrary: fc.integer({ min: 1, max: 200 }).map((k) => 2 * k) },
    { weight: 1, arbitrary: fc.integer({ min: 1, max: 1_000_000_000_000 }) },
  )
  .chain((total) =>
    fc.tuple(
      fc.oneof(
        fc.integer({ min: 0, max: total }),
        fc.constantFrom(0, total, Math.floor(total / 2), Math.ceil(total / 2)),
      ),
      fc.constant(total),
    ),
  );

describe('Property 17: Taxa_Conversao limitada e bem arredondada', () => {
  it('computeConversion: total 0 → percent null; senão 0 ≤ converted ≤ total e percent exato em [0, 100]', () => {
    fc.assert(
      fc.property(arbScenario, ({ now, periodo, leads }) => {
        const ctx = buildMetricContext(now, periodo);
        checkConversion(computeConversion(leads, ctx), true);
      }),
      { numRuns: 100 },
    );
  });

  it('conversionFromCounts: arredondamento meio para cima exato, inclusive com totais grandes', () => {
    fc.assert(
      fc.property(arbCounts, ([converted, total]) => {
        const c = conversionFromCounts(converted, total);
        expect(c).toMatchObject({ converted, total });
        // Texto só para totais sem separador de milhar (o formato pt-BR é coberto em format).
        checkConversion(c, total < 1000);
      }),
      { numRuns: 100 },
    );
  });

  it('conversionFromCounts(0, 0) é "— (0 de 0)"', () => {
    const c = conversionFromCounts(0, 0);
    checkConversion(c, true);
  });
});

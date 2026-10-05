/**
 * **Validates: Requirements 17.2**
 *
 * Property 42: a faixa da nota do PageSpeed segue exatamente "Bom" ≥ 90, "Precisa melhorar"
 * 50–89 e "Ruim" < 50; e a faixa é monotônica (nota maior nunca cai para uma faixa pior).
 * Puro, offline.
 */
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { pageSpeedBand } from '@/components/lead-miner/enrichment-helpers';

const rank = { RUIM: 0, MELHORAR: 1, BOM: 2 } as const;

describe('Property 42: faixas das notas do PageSpeed', () => {
  it('fronteiras exatas: ≥90 Bom, 50–89 Precisa melhorar, <50 Ruim', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 100 }), (n) => {
        const info = pageSpeedBand(n);
        expect(info).not.toBeNull();
        if (n >= 90) expect(info!.band).toBe('BOM');
        else if (n >= 50) expect(info!.band).toBe('MELHORAR');
        else expect(info!.band).toBe('RUIM');
        // Rótulo sempre presente (acompanha a cor, Req. 17.6).
        expect(info!.label.length).toBeGreaterThan(0);
      }),
      { numRuns: 101 },
    );
  });

  it('monotônica: nota maior nunca resulta em faixa pior', () => {
    fc.assert(
      fc.property(
        fc.double({ min: 0, max: 100, noNaN: true }),
        fc.double({ min: 0, max: 100, noNaN: true }),
        (a, b) => {
          const lo = Math.min(a, b);
          const hi = Math.max(a, b);
          expect(rank[pageSpeedBand(hi)!.band]).toBeGreaterThanOrEqual(rank[pageSpeedBand(lo)!.band]);
        },
      ),
      { numRuns: 200 },
    );
  });

  it('entradas inválidas (null, NaN, não finitas) → null', () => {
    for (const v of [null, undefined, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(pageSpeedBand(v as number | null | undefined)).toBeNull();
    }
  });
});

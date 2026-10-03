import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { RANKING_ORDER, compareRanking } from '@/lib/leads/filters';
import { arbRankKey } from './support/arb-filters';

// Feature: lead-miner, Property 27: Ordenação do ranking
// **Validates: Requirements 12.1, 17.1**
describe('Property 27: Ordenação do ranking', () => {
  it('score não crescente, nome crescente nos empates e sem análise ao final', () => {
    expect(RANKING_ORDER).toEqual([
      { scoreFinal: { sort: 'desc', nulls: 'last' } },
      { nomeExibicao: 'asc' },
      { id: 'asc' },
    ]);

    fc.assert(
      fc.property(fc.uniqueArray(arbRankKey, { selector: (r) => r.id, maxLength: 40 }), (rows) => {
        const sorted = [...rows].sort(compareRanking);

        // Mesmo conjunto de empresas.
        expect(sorted.map((r) => r.id).sort()).toEqual(rows.map((r) => r.id).sort());

        const firstNull = sorted.findIndex((r) => r.scoreFinal === null);
        if (firstNull >= 0) {
          expect(sorted.slice(firstNull).every((r) => r.scoreFinal === null)).toBe(true);
        }

        for (let i = 1; i < sorted.length; i++) {
          const prev = sorted[i - 1];
          const cur = sorted[i];
          if (prev.scoreFinal !== null && cur.scoreFinal !== null) {
            expect(prev.scoreFinal).toBeGreaterThanOrEqual(cur.scoreFinal);
          }
          if (prev.scoreFinal === cur.scoreFinal) {
            expect(prev.nomeExibicao <= cur.nomeExibicao).toBe(true);
            if (prev.nomeExibicao === cur.nomeExibicao) expect(prev.id < cur.id).toBe(true);
          }
        }
      }),
      { numRuns: 100 },
    );
  });
});

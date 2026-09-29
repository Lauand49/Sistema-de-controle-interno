// Feature: lead-miner, Property 32: Limite de exportação
/**
 * **Validates: Requirements 17.7**
 */
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { limitExport } from '@/lib/leads/csv';

const MAX = 5000;

describe('Property 32: Limite de exportação', () => {
  it('mantém as min(n, 5000) primeiras linhas na ordem, truncated = n > 5000 e total = n', () => {
    fc.assert(
      fc.property(
        // Tamanhos concentrados em torno do limite, mais tamanhos pequenos.
        fc.oneof(fc.integer({ min: 0, max: 50 }), fc.integer({ min: MAX - 3, max: MAX + 3 }), fc.integer({ min: 0, max: 7000 })),
        (n) => {
          const rows = Array.from({ length: n }, (_, i) => ({ id: i }));
          const res = limitExport(rows, MAX);
          const kept = Math.min(n, MAX);
          expect(res.rows).toHaveLength(kept);
          expect(res.rows).toEqual(rows.slice(0, kept));
          expect(res.truncated).toBe(n > MAX);
          expect(res.total).toBe(n);
        },
      ),
      { numRuns: 100 },
    );
  });
});

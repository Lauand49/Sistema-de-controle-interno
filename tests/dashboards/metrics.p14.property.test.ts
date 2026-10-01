// Feature: dashboards, Property 14: Cards por fase
/**
 * **Validates: Requirements 4.2, 5.2**
 */
import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { phaseCounts, type CountRow, type PhaseInfo } from '@/lib/dashboards/metrics';

// Geradores locais: fases com ids únicos e `order` arbitrário (repetições e fora de ordem).
const arbPhases: fc.Arbitrary<PhaseInfo[]> = fc.uniqueArray(
  fc.record({
    id: fc.string({ minLength: 1, maxLength: 8 }).map((s) => `phase-${s}`),
    name: fc.string({ maxLength: 12 }),
    order: fc.integer({ min: -5, max: 20 }),
    isFinal: fc.boolean(),
  }),
  { selector: (p) => p.id, maxLength: 12 }
);

/** Cenário: linhas de groupBy (uma por chave) para parte das fases, ids desconhecidos e a chave nula. */
const arbScenario = arbPhases.chain((phases) =>
  fc
    .record({
      known: fc.subarray(phases.map((p) => p.id)),
      unknown: fc.uniqueArray(fc.string({ minLength: 1, maxLength: 8 }).map((s) => `other-${s}`), {
        maxLength: 5,
      }),
      withNull: fc.boolean(),
    })
    .chain(({ known, unknown, withNull }) => {
      const keys: (string | null)[] = [...known, ...unknown, ...(withNull ? [null] : [])];
      return fc
        .tuple(...keys.map(() => fc.integer({ min: 1, max: 1000 })))
        .chain((counts) =>
          fc.shuffledSubarray(
            keys.map((key, i): CountRow => ({ key, count: counts[i] })),
            { minLength: keys.length, maxLength: keys.length }
          )
        );
    })
    .map((rows) => ({ phases, rows }))
);

describe('Property 14: Cards por fase', () => {
  it('uma entrada por fase, ordenada por order, com cards da linha correspondente ou 0', () => {
    fc.assert(
      fc.property(arbScenario, ({ phases, rows }) => {
        const result = phaseCounts(phases, rows);

        // Uma entrada por fase, sem fases desconhecidas.
        expect(result).toHaveLength(phases.length);
        expect(result.map((r) => r.id).sort()).toEqual(phases.map((p) => p.id).sort());

        // Ordem crescente de `order` (empates preservam a ordem recebida).
        const expectedOrder = phases
          .map((p, i) => ({ p, i }))
          .sort((a, b) => a.p.order - b.p.order || a.i - b.i)
          .map(({ p }) => p.id);
        expect(result.map((r) => r.id)).toEqual(expectedOrder);

        const rowCount = new Map(rows.filter((r) => r.key !== null).map((r) => [r.key as string, r.count]));
        const phaseById = new Map(phases.map((p) => [p.id, p]));
        for (const entry of result) {
          const phase = phaseById.get(entry.id)!;
          expect(entry).toEqual({
            id: phase.id,
            name: phase.name,
            order: phase.order,
            isFinal: phase.isFinal,
            cards: rowCount.get(phase.id) ?? 0,
          });
        }

        // Linhas de fases desconhecidas (e a nula) não entram no total.
        const knownTotal = rows
          .filter((r) => r.key !== null && phaseById.has(r.key))
          .reduce((s, r) => s + r.count, 0);
        expect(result.reduce((s, r) => s + r.cards, 0)).toBe(knownTotal);
      }),
      { numRuns: 100 }
    );
  });
});

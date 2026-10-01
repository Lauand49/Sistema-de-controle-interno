// Feature: dashboards, Property 15: Solicitações por status
/**
 * **Validates: Requirements 4.3, 4.6**
 */
import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import {
  REQUEST_STATUSES,
  countRequestsByStatus,
  statusRowsToCounts,
  type CountRow,
  type RequestFact,
} from '@/lib/dashboards/metrics';
import { buildMetricContext, periodWindow, type Periodo } from '@/lib/dashboards/period';
import { arbScenario } from './support/arb-facts';

const ALL_TIME_STATUSES = ['PENDING', 'APPROVED', 'REJECTED', 'IN_PROGRESS'] as const;

/** Oráculo independente: janela calculada direto de `periodWindow`, comparação por ms. */
function inPeriod(instant: Date, periodo: Periodo, now: Date): boolean {
  const { from, to } = periodWindow(periodo, now);
  const t = instant.getTime();
  return (from === null || t >= from.getTime()) && t <= to.getTime();
}

/** groupBy local por status (uma linha por status presente), como o Prisma devolveria. */
function groupByStatus(reqs: readonly RequestFact[]): CountRow[] {
  const map = new Map<string, number>();
  for (const r of reqs) map.set(r.status, (map.get(r.status) ?? 0) + 1);
  return Array.from(map, ([key, count]) => ({ key, count }));
}

/** Linhas de groupBy: chaves únicas, do enum, nulas ou fora do enum. */
const arbStatusRows: fc.Arbitrary<CountRow[]> = fc.uniqueArray(
  fc.record({
    key: fc.oneof(
      { weight: 4, arbitrary: fc.constantFrom<string | null>(...REQUEST_STATUSES) },
      { weight: 1, arbitrary: fc.constant<string | null>(null) },
      { weight: 1, arbitrary: fc.constantFrom<string | null>('DONE', 'pending', 'CANCELLED', '') },
      { weight: 1, arbitrary: fc.string({ maxLength: 10 }) },
    ),
    count: fc.integer({ min: 0, max: 1000 }),
  }),
  { selector: (r) => r.key, maxLength: 10 },
);

describe('Property 15: Solicitações por status', () => {
  it('countRequestsByStatus: 5 chaves, abertas/recusadas sobre tudo, COMPLETED só no Periodo', () => {
    fc.assert(
      fc.property(arbScenario, ({ now, periodo, requests }) => {
        const ctx = buildMetricContext(now, periodo);
        const counts = countRequestsByStatus(requests, ctx);

        expect(Object.keys(counts).sort()).toEqual([...REQUEST_STATUSES].sort());
        for (const s of ALL_TIME_STATUSES) {
          expect(counts[s]).toBe(requests.filter((r) => r.status === s).length);
        }
        expect(counts.COMPLETED).toBe(
          requests.filter((r) => r.status === 'COMPLETED' && inPeriod(r.updatedAt, periodo, now)).length,
        );

        // Equivalente ao caminho groupBy: COMPLETED filtrado pela janela antes de agrupar.
        const rows = groupByStatus(
          requests.filter((r) => r.status !== 'COMPLETED' || inPeriod(r.updatedAt, periodo, now)),
        );
        expect(statusRowsToCounts([...rows].reverse())).toEqual(counts);
      }),
      { numRuns: 100 },
    );
  });

  it('statusRowsToCounts: zero para status sem linha e ignora status fora do enum', () => {
    fc.assert(
      fc.property(arbStatusRows, (rows) => {
        const counts = statusRowsToCounts(rows);

        expect(Object.keys(counts).sort()).toEqual([...REQUEST_STATUSES].sort());
        for (const s of REQUEST_STATUSES) {
          const row = rows.find((r) => r.key === s);
          expect(counts[s]).toBe(row ? row.count : 0);
        }
        const enumTotal = rows
          .filter((r) => (REQUEST_STATUSES as readonly (string | null)[]).includes(r.key))
          .reduce((acc, r) => acc + r.count, 0);
        expect(Object.values(counts).reduce((a, b) => a + b, 0)).toBe(enumTotal);
      }),
      { numRuns: 100 },
    );
  });
});

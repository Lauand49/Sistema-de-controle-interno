// Feature: dashboards, Property 16: Leads por status somam o total
/**
 * **Validates: Requirements 6.1, 6.4**
 */
import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { LEAD_STATUSES, countLeadsByStatus } from '@/lib/dashboards/metrics';
import { arbLeadFact, arbNow, arbPeriodo } from './support/arb-facts';

/** Listas de LeadFact (incluindo vazias), geradas em torno de um `now`/Periodo. */
const arbLeads = fc
  .tuple(arbNow, arbPeriodo)
  .chain(([now, periodo]) => fc.array(arbLeadFact(now, periodo), { maxLength: 40 }));

describe('Property 16: Leads por status somam o total', () => {
  it('countLeadsByStatus tem as 5 chaves de LEAD_STATUSES e soma igual ao tamanho da lista', () => {
    fc.assert(
      fc.property(arbLeads, (leads) => {
        const counts = countLeadsByStatus(leads);

        // Exatamente as 5 chaves, zero incluído.
        expect(Object.keys(counts).sort()).toEqual([...LEAD_STATUSES].sort());
        for (const status of LEAD_STATUSES) {
          expect(Number.isInteger(counts[status])).toBe(true);
          expect(counts[status]).toBeGreaterThanOrEqual(0);
          // Cada contagem bate com a quantidade de leads naquele status.
          expect(counts[status]).toBe(leads.filter((l) => l.status === status).length);
        }

        // Soma dos valores = total de leads.
        const sum = LEAD_STATUSES.reduce((acc, s) => acc + counts[s], 0);
        expect(sum).toBe(leads.length);
      }),
      { numRuns: 100 },
    );
  });
});

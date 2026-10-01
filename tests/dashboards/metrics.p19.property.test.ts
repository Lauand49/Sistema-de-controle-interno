// Feature: dashboards, Property 19: Leads por responsável
/**
 * **Validates: Requirements 6.3**
 */
import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { countLeadsByStatus, emptyLeadCounts, leadsByAssignee } from '@/lib/dashboards/metrics';
import { LEAD_STATUS_VALUES, arbScenario } from './support/arb-facts';

describe('Property 19: Leads por responsável', () => {
  it('uma linha por responsável com lead, linha null só quando há lead sem responsável (última), somas = countLeadsByStatus', () => {
    fc.assert(
      fc.property(arbScenario, ({ leads }) => {
        const rows = leadsByAssignee(leads);

        // Uma linha por responsável distinto (não nulo) com ao menos um lead.
        const expectedIds = new Set(leads.flatMap((l) => (l.assignedTo === null ? [] : [l.assignedTo])));
        const rowIds = rows.flatMap((r) => (r.assignedTo === null ? [] : [r.assignedTo]));
        expect(rowIds.length).toBe(new Set(rowIds).size);
        expect(new Set(rowIds)).toEqual(expectedIds);

        // No máximo uma linha null, somente se houver lead sem responsável, sempre a última.
        const nullIdx = rows.flatMap((r, i) => (r.assignedTo === null ? [i] : []));
        const hasUnassigned = leads.some((l) => l.assignedTo === null);
        expect(nullIdx).toEqual(hasUnassigned ? [rows.length - 1] : []);

        // Cada linha conta exatamente os leads do seu responsável (e tem ao menos um).
        for (const r of rows) {
          expect(r.counts).toEqual(countLeadsByStatus(leads.filter((l) => l.assignedTo === r.assignedTo)));
          const rowTotal = LEAD_STATUS_VALUES.reduce((acc, s) => acc + r.counts[s], 0);
          expect(rowTotal).toBeGreaterThan(0);
        }

        // Soma status a status das linhas = contagem da lista inteira.
        const sum = emptyLeadCounts();
        for (const r of rows) for (const s of LEAD_STATUS_VALUES) sum[s] += r.counts[s];
        expect(sum).toEqual(countLeadsByStatus(leads));
      }),
      { numRuns: 100 },
    );
  });
});

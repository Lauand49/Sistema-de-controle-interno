// Feature: lead-miner, Property 31: Neutralização de fórmulas no CSV
/**
 * **Validates: Requirements 17.5**
 */
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { sanitizeCell } from '@/lib/leads/csv';
import { arbCsvCell, arbFormulaCell, FORMULA_TRIGGER_CHARS } from './support/arb-csv';

const TRIGGERS = new Set<string>(FORMULA_TRIGGER_CHARS);

describe('Property 31: Neutralização de fórmulas no CSV', () => {
  it('células iniciadas por =, +, -, @, TAB ou CR recebem o prefixo apóstrofo', () => {
    fc.assert(
      fc.property(arbFormulaCell, (cell) => {
        expect(sanitizeCell(cell)).toBe(`'${cell}`);
      }),
      { numRuns: 100 },
    );
  });

  it('demais células ficam inalteradas', () => {
    fc.assert(
      fc.property(
        arbCsvCell.filter((c) => c.length === 0 || !TRIGGERS.has(c[0])),
        (cell) => {
          expect(sanitizeCell(cell)).toBe(cell);
        },
      ),
      { numRuns: 100 },
    );
  });
});

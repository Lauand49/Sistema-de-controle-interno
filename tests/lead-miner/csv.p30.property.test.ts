// Feature: lead-miner, Property 30: Round-trip e formato do CSV
/**
 * **Validates: Requirements 17.2, 17.3, 17.4, 17.6, 20.5**
 */
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { buildCsv, CSV_HEADER, parseCsv } from '@/lib/leads/csv';
import { arbCsvRow } from './support/arb-csv';

const BOM = '\uFEFF';

/** Remove o prefixo `'` de proteção quando a célula original foi neutralizada. */
function unprotect(parsed: string, original: string): string {
  return parsed !== original && parsed === `'${original}` ? original : parsed;
}

/** Conta separadores de registro fora de aspas e verifica que todos são CRLF. */
function recordSeparators(body: string): { count: number; allCrlf: boolean } {
  let inQuotes = false;
  let count = 0;
  let allCrlf = true;
  for (let i = 0; i < body.length; i++) {
    const ch = body[i];
    if (ch === '"') inQuotes = !inQuotes;
    else if (!inQuotes && (ch === '\r' || ch === '\n')) {
      if (ch === '\r' && body[i + 1] === '\n') {
        count++;
        i++;
      } else allCrlf = false;
    }
  }
  return { count, allCrlf };
}

describe('Property 30: Round-trip e formato do CSV', () => {
  it('BOM, CRLF, mesmo número de registros/colunas e mesmas células', () => {
    fc.assert(
      fc.property(fc.array(arbCsvRow, { maxLength: 8 }), (dataRows) => {
        const rows = [[...CSV_HEADER], ...dataRows];
        const csv = buildCsv(rows);

        expect(csv.startsWith(BOM)).toBe(true);
        const sep = recordSeparators(csv.slice(BOM.length));
        expect(sep.allCrlf).toBe(true);
        expect(sep.count).toBe(rows.length - 1);

        const parsed = parseCsv(csv);
        expect(parsed).toHaveLength(rows.length);
        parsed.forEach((record, r) => {
          expect(record).toHaveLength(CSV_HEADER.length);
          record.forEach((cell, c) => {
            expect(unprotect(cell, rows[r][c])).toBe(rows[r][c]);
          });
        });
      }),
      { numRuns: 100 },
    );
  });
});

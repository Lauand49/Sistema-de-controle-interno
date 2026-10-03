/**
 * **Validates: Requirements 11.2**
 */
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { cnpjCheckDigits, formatCnpj, isValidCnpj, normalizeCnpj } from '@/lib/leads/cnpj';

// Feature: lead-miner-enrichment, Property 29: For any CNPJ válido c, normalizeCnpj(formatCnpj(c)) === c e formatCnpj(normalizeCnpj(c)) casa com ^[0-9A-Z]{2}\.[0-9A-Z]{3}\.[0-9A-Z]{3}\/[0-9A-Z]{4}-[0-9]{2}$, inclusive quando c é dado em minúsculas ou com espaços.

const FORMATTED_RE = /^[0-9A-Z]{2}\.[0-9A-Z]{3}\.[0-9A-Z]{3}\/[0-9A-Z]{4}-[0-9]{2}$/;

/** CNPJ válido normalizado: base de 12 posições (numérica ou alfanumérica) + DVs, nunca todos iguais. */
const validCnpj = fc
  .oneof(fc.stringMatching(/^[0-9]{12}$/), fc.stringMatching(/^[0-9A-Z]{12}$/))
  .map((base) => base + cnpjCheckDigits(base))
  .filter((c) => !/^(.)\1{13}$/.test(c));

/** Variante "suja" do mesmo CNPJ: minúsculas, espaços e/ou pontuação nas posições usuais. */
function variant(c: string, lower: boolean, punct: boolean, spaces: number[]): string {
  let s = lower ? c.toLowerCase() : c;
  if (punct) s = `${s.slice(0, 2)}.${s.slice(2, 5)}.${s.slice(5, 8)}/${s.slice(8, 12)}-${s.slice(12)}`;
  for (const pos of spaces) {
    const i = pos % (s.length + 1);
    s = `${s.slice(0, i)} ${s.slice(i)}`;
  }
  return s;
}

describe('Property 29: round-trip de formatação do CNPJ', () => {
  it('normalize(format(c)) === c e format(normalize(c)) segue a máscara, também para entradas sujas', () => {
    fc.assert(
      fc.property(
        validCnpj,
        fc.boolean(),
        fc.boolean(),
        fc.array(fc.nat(), { maxLength: 4 }),
        (c, lower, punct, spaces) => {
          expect(isValidCnpj(c)).toBe(true);

          const formatted = formatCnpj(c);
          expect(normalizeCnpj(formatted)).toBe(c);
          expect(formatCnpj(normalizeCnpj(c))).toMatch(FORMATTED_RE);

          const dirty = variant(c, lower, punct, spaces);
          expect(normalizeCnpj(dirty)).toBe(c);
          expect(normalizeCnpj(formatCnpj(dirty))).toBe(c);
          expect(formatCnpj(normalizeCnpj(dirty))).toMatch(FORMATTED_RE);
          expect(formatCnpj(dirty)).toBe(formatted);
        },
      ),
      { numRuns: 200 },
    );
  });
});

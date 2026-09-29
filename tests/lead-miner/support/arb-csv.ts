/**
 * Geradores fast-check para o Exportador CSV.
 */
import fc from 'fast-check';
import { CSV_HEADER } from '@/lib/leads/csv';

/** Caracteres que disparam a neutralização de fórmulas (Req. 17.5). */
export const FORMULA_TRIGGER_CHARS = ['=', '+', '-', '@', '\t', '\r'] as const;

/** Caracteres "difíceis": delimitadores, aspas, quebras, gatilhos de fórmula, acentos e o próprio `'`. */
const SPECIAL_CHARS = ['"', ';', '\r', '\n', '\t', '=', '+', '-', '@', "'", ' ', ',', 'á', 'ç', 'ã', 'É', 'ü', '€', '\uFEFF'];

const arbCsvChar: fc.Arbitrary<string> = fc.oneof(
  { weight: 3, arbitrary: fc.constantFrom(...SPECIAL_CHARS) },
  { weight: 2, arbitrary: fc.constantFrom(...'abcXYZ019'.split('')) },
  { weight: 1, arbitrary: fc.char() },
);

/** Célula arbitrária (inclui vazio, `"`, `;`, CR, LF, acentos e gatilhos de fórmula). */
export const arbCsvCell: fc.Arbitrary<string> = fc
  .array(arbCsvChar, { maxLength: 12 })
  .map((chars) => chars.join(''));

/** Célula que começa com um gatilho de fórmula. */
export const arbFormulaCell: fc.Arbitrary<string> = fc
  .tuple(fc.constantFrom(...FORMULA_TRIGGER_CHARS), arbCsvCell)
  .map(([first, rest]) => first + rest);

/** Linha de dados com as 13 colunas do CSV. */
export const arbCsvRow: fc.Arbitrary<string[]> = fc.array(arbCsvCell, {
  minLength: CSV_HEADER.length,
  maxLength: CSV_HEADER.length,
});

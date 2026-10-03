// Feature: dashboards, Property 22: Busca de membros sem caixa e acentos
/**
 * **Validates: Requirements 9.3**
 */
import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { matchesMemberSearch } from '@/lib/dashboards/format';
import { normalizeText } from '@/lib/leads/text';

/** Variantes acentuadas (pré-compostas, NFC) das letras base usadas em nomes em português. */
const ACCENTED: Record<string, string[]> = {
  a: ['á', 'à', 'â', 'ã', 'ä'],
  e: ['é', 'ê', 'è', 'ë'],
  i: ['í', 'î', 'ì', 'ï'],
  o: ['ó', 'ô', 'õ', 'ò', 'ö'],
  u: ['ú', 'û', 'ù', 'ü'],
  c: ['ç'],
  n: ['ñ'],
};

const BASE_LETTERS = 'abcdefghijklmnopqrstuvwxyz'.split('');
const ACCENTED_LETTERS = Object.values(ACCENTED).flat();

/** Caractere de nome: letra base ou acentuada, em qualquer caixa, ou espaço. */
const arbNameChar: fc.Arbitrary<string> = fc.oneof(
  { weight: 6, arbitrary: fc.constantFrom(...BASE_LETTERS) },
  { weight: 2, arbitrary: fc.constantFrom(...ACCENTED_LETTERS) },
  { weight: 1, arbitrary: fc.constant(' ') },
).chain((ch) => fc.boolean().map((upper) => (upper ? ch.toUpperCase() : ch)));

const arbName: fc.Arbitrary<string> = fc
  .array(arbNameChar, { minLength: 1, maxLength: 30 })
  .map((chars) => chars.join(''));

/** Nome + substring contígua não vazia dele. */
const arbNameAndSubstring = arbName.chain((name) =>
  fc
    .integer({ min: 0, max: name.length - 1 })
    .chain((start) =>
      fc.integer({ min: start + 1, max: name.length }).map((end) => ({
        name,
        sub: name.slice(start, end),
      })),
    ),
);

/** Remove o acento de um caractere pré-composto (á → a). */
function stripAccent(ch: string): string {
  return ch.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

/**
 * Transforma cada caractere da substring: alterna caixa aleatoriamente e
 * remove o acento ou acrescenta um (quando a letra base admite).
 */
function arbMangled(sub: string): fc.Arbitrary<string> {
  const perChar = sub.split('').map((ch) =>
    fc
      .record({
        accentOp: fc.constantFrom('keep', 'strip', 'add'),
        accentIdx: fc.nat(),
        upper: fc.boolean(),
      })
      .map(({ accentOp, accentIdx, upper }) => {
        let out = ch;
        if (accentOp === 'strip') {
          out = stripAccent(ch);
        } else if (accentOp === 'add') {
          const variants = ACCENTED[stripAccent(ch).toLowerCase()];
          if (variants) out = variants[accentIdx % variants.length];
        }
        return upper ? out.toUpperCase() : out.toLowerCase();
      }),
  );
  return fc.tuple(...perChar).map((chars) => chars.join(''));
}

describe('Property 22: Busca de membros sem caixa e acentos', () => {
  it('substring contígua do nome casa mesmo com caixa alterada e acentos removidos/acrescentados', () => {
    fc.assert(
      fc.property(
        arbNameAndSubstring.chain(({ name, sub }) =>
          arbMangled(sub).map((q) => ({ name, q })),
        ),
        ({ name, q }) => {
          expect(matchesMemberSearch(name, q)).toBe(true);
        },
      ),
      { numRuns: 100 },
    );
  });

  it('é falso quando normalizeText(q) não é substring de normalizeText(nome)', () => {
    fc.assert(
      fc.property(
        arbName,
        fc.array(arbNameChar, { minLength: 2, maxLength: 8 }).map((c) => c.join('')),
        (name, q) => {
          fc.pre(!normalizeText(name).includes(normalizeText(q)));
          expect(matchesMemberSearch(name, q)).toBe(false);
        },
      ),
      { numRuns: 100 },
    );
  });
});

import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { matchesRunSearch } from '@/lib/leads/filters';
import { normalizeText } from '@/lib/leads/text';

/** Alfabeto pequeno com caixa, acentos e espaços para gerar muitas coincidências. */
const CHARS = ['a', 'A', 'á', 'Ã', 'e', 'É', 'c', 'Ç', 'o', ' ', '  '];
const arbField = fc.stringOf(fc.constantFrom(...CHARS), { minLength: 0, maxLength: 12 });
const arbQ = fc
  .stringOf(fc.constantFrom(...CHARS), { minLength: 1, maxLength: 6 })
  .filter((s) => s.length <= 100);

/** `q` derivado de um trecho de um dos campos, com a caixa trocada. */
const arbCase = fc
  .tuple(arbField, arbField, arbField, fc.integer({ min: 0, max: 2 }), fc.nat(), fc.nat(), fc.boolean())
  .map(([bairro, cidade, author, which, i, j, upper]) => {
    const src = [bairro, cidade, author][which];
    const a = src.length === 0 ? 0 : i % src.length;
    const b = src.length === 0 ? 0 : a + 1 + (j % (src.length - a));
    const piece = src.slice(a, b);
    return { bairro, cidade, author, q: upper ? piece.toUpperCase() : piece.toLowerCase() };
  })
  .filter((c) => c.q.length >= 1);

// Feature: lead-miner, Property 26: Busca do histórico de minerações
// **Validates: Requirements 11.2**
describe('Property 26: Busca do histórico de minerações', () => {
  it('casa sse normalizeText(q) é substring de bairro, cidade ou autor normalizados; q vazio casa tudo', () => {
    fc.assert(
      fc.property(
        arbField,
        arbField,
        arbField,
        fc.oneof(arbQ, fc.constantFrom(' ', '   ', '\t')),
        arbCase,
        (bairro, cidade, author, q, derived) => {
          const term = normalizeText(q);
          const expected =
            term === '' ||
            [bairro, cidade, author].some((f) => normalizeText(f).includes(term));
          expect(matchesRunSearch({ bairro, cidade }, author, q)).toBe(expected);

          // Um trecho de qualquer campo, em outra caixa, sempre casa.
          expect(
            matchesRunSearch({ bairro: derived.bairro, cidade: derived.cidade }, derived.author, derived.q),
          ).toBe(true);
        },
      ),
      { numRuns: 100 },
    );
  });
});

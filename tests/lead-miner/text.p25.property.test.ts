/**
 * **Validates: Requirements 9.2, 10.4, 20.3**
 */
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { normalizeCompanyName, normalizeText } from '@/lib/leads/text';
import { arbAccentPair, arbCompanySuffix, arbLatinText } from './support/arb-text';

const FUNCTIONS = [
  ['normalizeText', normalizeText],
  ['normalizeCompanyName', normalizeCompanyName],
] as const;

/** Verdadeiro se o texto normalizado (sem pontuação) termina em um sufixo societário. */
function endsWithCompanySuffix(s: string): boolean {
  const t = normalizeText(s);
  if (/(^|[^a-z0-9])s\s*[/.]\s*a[^a-z0-9]*$/.test(t)) return true;
  const words = t.replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
  return /(^|\s)(ltda|me|eireli|sa|epp)$/.test(words);
}

// Feature: lead-miner, Property 25: For any string s, normalizeText e normalizeCompanyName são idempotentes (f(f(s)) = f(s)), invariantes a caixa, acentos e espaços nas extremidades, e normalizeCompanyName(s + " " + sufixo) é igual a normalizeCompanyName(s) para cada sufixo societário (ltda, me, eireli, s/a, sa, epp) quando s normalizado não termina em sufixo.
describe('Property 25: Normalização de nomes e textos', () => {
  for (const [name, f] of FUNCTIONS) {
    it(`${name} é idempotente`, () => {
      fc.assert(
        fc.property(fc.oneof(arbLatinText, fc.string()), (s) => {
          expect(f(f(s))).toBe(f(s));
        }),
        { numRuns: 100 },
      );
    });

    it(`${name} é invariante a caixa, acentos e espaços nas extremidades`, () => {
      fc.assert(
        fc.property(
          arbAccentPair,
          fc.constantFrom('', ' ', '  ', '\t', '\n '),
          fc.constantFrom('', ' ', '\t ', '\n'),
          ({ plain, accented }, lead, trail) => {
            const expected = f(plain);
            expect(f(accented)).toBe(expected);
            expect(f(accented.toUpperCase())).toBe(expected);
            expect(f(plain.toUpperCase())).toBe(expected);
            expect(f(lead + accented + trail)).toBe(expected);
          },
        ),
        { numRuns: 100 },
      );
    });
  }

  it('normalizeCompanyName ignora um sufixo societário acrescentado ao final', () => {
    fc.assert(
      fc.property(arbLatinText, arbCompanySuffix, (s, suffix) => {
        fc.pre(!endsWithCompanySuffix(s));
        expect(normalizeCompanyName(`${s} ${suffix}`)).toBe(normalizeCompanyName(s));
      }),
      { numRuns: 100 },
    );
  });
});

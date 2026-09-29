import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { buildRunParamsKey } from '@/lib/leads/filters';
import { normalizeText } from '@/lib/leads/text';

/** Alfabeto pequeno (caixa, acento, espaço e separadores) para forçar colisões. */
const arbPlace = fc
  .stringOf(fc.constantFrom('a', 'Á', 'á', 'b', ' ', '|', ',', '\\'), { minLength: 1, maxLength: 4 })
  .filter((s) => s.trim().length >= 1);
const arbInput = fc.record({
  bairro: arbPlace,
  cidade: arbPlace,
  uf: fc.constantFrom('SP', 'RJ'),
  nichos: fc.shuffledSubarray(['restaurante', 'padaria', 'academia'], { minLength: 1 }),
});

const sameSet = (a: string[], b: string[]) =>
  new Set(a).size === new Set(b).size && a.every((x) => b.includes(x));

// Feature: lead-miner, Property 33: Chave de parâmetros da mineração
// **Validates: Requirements 18.7, 18.12, 10.4**
describe('Property 33: Chave de parâmetros da mineração', () => {
  it('chaves iguais sse bairro/cidade normalizados, UF e conjunto de nichos são iguais', () => {
    fc.assert(
      fc.property(arbInput, arbInput, fc.constantFrom('same', 'shift', 'indep'), (a, b0, variant) => {
        let b = b0;
        if (variant === 'same') {
          // Mesma entrada com caixa, espaços e ordem dos nichos trocados.
          b = {
            bairro: `  ${a.bairro.toUpperCase()} `,
            cidade: a.cidade.toLowerCase(),
            uf: a.uf,
            nichos: [...a.nichos].reverse(),
          };
        } else if (variant === 'shift') {
          // Desloca um trecho entre bairro e cidade através do separador "|".
          b = { ...b0, bairro: `${a.bairro}|${a.cidade}`, cidade: b0.cidade, uf: a.uf, nichos: a.nichos };
          a = { ...a, cidade: `${a.cidade}|${b0.cidade}` };
        }
        const expected =
          normalizeText(a.bairro) === normalizeText(b.bairro) &&
          normalizeText(a.cidade) === normalizeText(b.cidade) &&
          a.uf === b.uf &&
          sameSet(a.nichos, b.nichos);
        expect(buildRunParamsKey(a) === buildRunParamsKey(b)).toBe(expected);
      }),
      { numRuns: 100 },
    );
  });
});

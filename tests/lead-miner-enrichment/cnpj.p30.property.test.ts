// Feature: lead-miner-enrichment, Property 30: For any HTML de ruído com CNPJs válidos e inválidos inseridos no texto visível ou em atributos, nas formas formatada ou contínua, extractCnpjs devolve exatamente o conjunto dos CNPJs válidos inseridos, sem repetição e na ordem da primeira ocorrência.
/**
 * **Validates: Requirements 11.3**
 *
 * "Ordem da primeira ocorrência" segue o texto de busca de `htmlSearchText`:
 * primeiro o texto visível (em ordem do documento), depois os valores dos atributos.
 */
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { cnpjCheckDigits, extractCnpjs, isValidCnpj } from '@/lib/leads/cnpj';

/** CNPJ válido normalizado (numérico ou alfanumérico), nunca todos iguais. */
const validCnpj = fc
  .oneof(fc.stringMatching(/^[0-9]{12}$/), fc.stringMatching(/^[0-9A-Z]{12}$/))
  .map((base) => base + cnpjCheckDigits(base))
  .filter((c) => !/^(.)\1{13}$/.test(c));

/** CNPJ inválido: um válido com o último DV trocado (os DVs são únicos). */
const invalidCnpj = validCnpj.map((c) => c.slice(0, 13) + String((Number(c[13]) + 1) % 10));

const format = (c: string): string =>
  `${c.slice(0, 2)}.${c.slice(2, 5)}.${c.slice(5, 8)}/${c.slice(8, 12)}-${c.slice(12)}`;

/** Palavras de ruído curtas (sem `.`, `/`, `-`), incapazes de formar ou colar num CNPJ. */
const noise = fc
  .array(fc.constantFrom('Contato', 'Rua', 'das', 'Flores', 'tel', '123', 'CNPJ:', 'Ltda', 'SP', '2024', 'empresa'), {
    maxLength: 5,
  })
  .map((ws) => ws.join(' '));

const item = fc.record({
  valid: fc.boolean(),
  idx: fc.nat(),
  formatted: fc.boolean(),
  inAttr: fc.boolean(),
  attr: fc.constantFrom('title', 'data-cnpj', 'alt', 'aria-label'),
  pre: noise,
  post: noise,
  between: noise,
});

describe('Property 30: extração de CNPJs do HTML', () => {
  it('devolve exatamente os CNPJs válidos inseridos, sem repetição, na ordem da primeira ocorrência', () => {
    fc.assert(
      fc.property(
        fc.uniqueArray(validCnpj, { minLength: 1, maxLength: 4 }),
        fc.array(invalidCnpj, { minLength: 1, maxLength: 3 }),
        fc.array(item, { maxLength: 10 }),
        (validPool, invalidPool, items) => {
          for (const c of invalidPool) expect(isValidCnpj(c)).toBe(false);

          const parts: string[] = ['<html><head><title>Empresa</title></head><body>'];
          const visible: string[] = [];
          const inAttrs: string[] = [];
          for (const it of items) {
            const pool = it.valid ? validPool : invalidPool;
            const c = pool[it.idx % pool.length];
            const shown = it.formatted ? format(c) : c;
            const content = [it.pre, shown, it.post].filter(Boolean).join(' ');
            parts.push(`<p>${it.between}</p>`);
            if (it.inAttr) parts.push(`<span ${it.attr}="${content}">${it.between}</span>`);
            else parts.push(`<div><span>${content}</span></div>`);
            if (it.valid) (it.inAttr ? inAttrs : visible).push(c);
          }
          parts.push('</body></html>');

          const expected = [...new Set([...visible, ...inAttrs])];
          expect(extractCnpjs(parts.join('\n'))).toEqual(expected);
        },
      ),
      { numRuns: 200 },
    );
  });
});

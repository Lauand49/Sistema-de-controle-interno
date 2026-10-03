/**
 * **Validates: Requirements 15.7**
 */
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { whatsappOpenLink } from '@/lib/leads/approach';
// Feature: lead-miner-enrichment, Property 41: For any número válido e texto de mensagem (com acentos, emojis, `&`, `?`, `#` e quebras de linha), o link gerado é `https://wa.me/{número}?text=…` e decodificar o parâmetro `text` devolve exatamente o texto original.

const digit = fc.constantFrom(...'0123456789'.split(''));
/** Número normalizado dos Sinais_Digitais: 12 ou 13 dígitos (Req. 8.2, 8.3). */
const arbNumber = fc.integer({ min: 12, max: 13 }).chain((n) =>
  fc.array(digit, { minLength: n, maxLength: n }).map((a) => a.join('')),
);

const SPECIAL = ['&', '?', '#', '=', '+', '%', '/', ' ', '\n', '\r\n', 'á', 'ç', 'ã', 'É', '😀', '👍🏽', '🇧🇷', '%20', 'a&b=c'];
/** Texto com acentos, emojis e caracteres reservados de URL (sem surrogates isolados). */
const arbTexto = fc
  .array(fc.oneof(fc.fullUnicodeString({ maxLength: 20 }), fc.constantFrom(...SPECIAL)), { maxLength: 30 })
  .map((parts) => parts.join(''));

describe('Property 41: Link "Abrir no WhatsApp"', () => {
  it('gera https://wa.me/{número}?text=… e o parâmetro text decodifica no texto original', () => {
    fc.assert(
      fc.property(arbNumber, arbTexto, (numero, texto) => {
        const link = whatsappOpenLink(numero, texto);
        expect(link).not.toBeNull();
        const prefix = `https://wa.me/${numero}?text=`;
        expect(link!.startsWith(prefix)).toBe(true);

        const encoded = link!.slice(prefix.length);
        // Nada de `&`, `#` ou `?` cru: o texto fica todo dentro de um único parâmetro.
        expect(encoded).not.toMatch(/[&#?\s]/);
        expect(decodeURIComponent(encoded)).toBe(texto);

        const url = new URL(link!);
        expect(url.origin).toBe('https://wa.me');
        expect(url.pathname).toBe(`/${numero}`);
        expect(url.hash).toBe('');
        expect([...url.searchParams.keys()]).toEqual(['text']);
      }),
      { numRuns: 300 },
    );
  });

  it('sem número válido não há link', () => {
    const arbInvalid = fc.oneof(
      fc.constantFrom<string | null | undefined>(null, undefined, '', '   ', '+'),
      fc.array(digit, { maxLength: 11 }).map((a) => a.join('')),
      fc.array(digit, { minLength: 14, maxLength: 20 }).map((a) => a.join('')),
    );
    fc.assert(
      fc.property(arbInvalid, arbTexto, (numero, texto) => {
        expect(whatsappOpenLink(numero, texto)).toBeNull();
      }),
      { numRuns: 100 },
    );
  });
});

/**
 * Geradores de textos/nomes de empresa para os testes de normalização.
 *
 * Restritos ao alfabeto latino (com acentos do português), dígitos, pontuação e espaços:
 * `normalizeCompanyName` descarta letras fora do latim, e caixa de letras como "ß" não é
 * reversível, o que tornaria a invariância a caixa indefinida fora desse domínio.
 */
import fc from 'fast-check';

export const COMPANY_SUFFIXES = ['ltda', 'me', 'eireli', 's/a', 'sa', 'epp'] as const;

/** Letra base -> variantes acentuadas usadas em português. */
const ACCENTS: Record<string, string[]> = {
  a: ['á', 'à', 'â', 'ã'],
  e: ['é', 'ê'],
  i: ['í'],
  o: ['ó', 'ô', 'õ'],
  u: ['ú', 'ü'],
  c: ['ç'],
};

const BASE_CHARS = 'abcdefghijklmnopqrstuvwxyz0123456789'.split('');
const PUNCT_CHARS = ['.', ',', '-', '/', '&', "'", '(', ')', '!'];
const SPACE_CHARS = [' ', ' ', '  ', '\t'];

/** Caractere "base" (sem acento): letra, dígito, pontuação ou espaço. */
const arbBaseChar = fc.oneof(
  { weight: 6, arbitrary: fc.constantFrom(...BASE_CHARS) },
  { weight: 1, arbitrary: fc.constantFrom(...PUNCT_CHARS) },
  { weight: 2, arbitrary: fc.constantFrom(...SPACE_CHARS) },
);

/**
 * Par (texto sem acentos, mesmo texto com acentos aleatórios em letras acentuáveis).
 * Ambos em minúsculas.
 */
export const arbAccentPair: fc.Arbitrary<{ plain: string; accented: string }> = fc
  .array(fc.tuple(arbBaseChar, fc.nat()), { maxLength: 30 })
  .map((chars) => ({
    plain: chars.map(([c]) => c).join(''),
    accented: chars
      .map(([c, k]) => {
        const variants = ACCENTS[c];
        // k par mantém a letra original; ímpar usa uma variante acentuada.
        return variants && k % 2 === 1 ? variants[k % variants.length] : c;
      })
      .join(''),
  }));

/** Aplica caixa aleatória caractere a caractere. */
const randomCase = (s: string, mask: boolean[]): string =>
  s
    .split('')
    .map((c, i) => (mask[i % Math.max(mask.length, 1)] ? c.toUpperCase() : c))
    .join('');

/** Texto latino com acentos e caixa mista. */
export const arbLatinText: fc.Arbitrary<string> = fc
  .tuple(arbAccentPair, fc.array(fc.boolean(), { minLength: 1, maxLength: 8 }))
  .map(([{ accented }, mask]) => randomCase(accented, mask));

/** Sufixo societário com caixa aleatória (ex.: "LTDA", "S/A", "Me"). */
export const arbCompanySuffix: fc.Arbitrary<string> = fc
  .tuple(fc.constantFrom(...COMPANY_SUFFIXES), fc.array(fc.boolean(), { minLength: 1, maxLength: 6 }))
  .map(([suffix, mask]) => randomCase(suffix, mask));

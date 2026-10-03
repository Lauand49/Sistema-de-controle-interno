/**
 * **Validates: Requirements 11.1**
 */
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { cnpjCheckDigits, isValidCnpj } from '@/lib/leads/cnpj';

// Feature: lead-miner-enrichment, Property 28: For any string (CNPJs numéricos e alfanuméricos com DV correto, DV alterado, caracteres fora de 0–9A–Z, tamanho ≠ 14, todos iguais, com pontuação e espaços), isValidCnpj coincide com um modelo de referência independente do módulo 11 (valor = código ASCII − 48); todo CNPJ gerado como 12 alfanuméricos + DVs calculados é aceito, e trocar qualquer um dos 2 DVs por outro dígito o torna inválido.

// ---------------------------------------------------------------------------
// Modelo de referência (independente de lib/leads/cnpj.ts)
// ---------------------------------------------------------------------------
const ALNUM = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
/** Tabela explícita: '0'..'9' → 0..9, 'A'..'Z' → 17..42 (código ASCII − 48). */
const VALUE: Record<string, number> = Object.fromEntries(
  ALNUM.split('').map((ch, i) => [ch, i < 10 ? i : 17 + (i - 10)]),
);
/** Pesos oficiais escritos por extenso (esquerda → direita). */
const W1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
const W2 = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];

function refDv(chars: string[], weights: number[]): number {
  const sum = chars.reduce((acc, ch, i) => acc + VALUE[ch] * weights[i], 0);
  const r = sum % 11;
  return r === 0 || r === 1 ? 0 : 11 - r;
}

function refNormalize(raw: string): string {
  let out = '';
  for (const ch of raw) {
    if (ch === '.' || ch === '/' || ch === '-' || /\s/.test(ch)) continue;
    out += ch;
  }
  return out.toUpperCase();
}

function refIsValid(raw: string): boolean {
  const s = refNormalize(raw);
  if (s.length !== 14) return false;
  const chars = s.split('');
  for (let i = 0; i < 14; i++) {
    const ok = i < 12 ? ALNUM.includes(chars[i]) : chars[i] >= '0' && chars[i] <= '9';
    if (!ok) return false;
  }
  if (chars.every((c) => c === chars[0])) return false;
  const base = chars.slice(0, 12);
  const d1 = refDv(base, W1);
  const d2 = refDv([...base, String(d1)], W2);
  return chars[12] === String(d1) && chars[13] === String(d2);
}

function refCheckDigits(base: string): string {
  const b = base.split('');
  const d1 = refDv(b, W1);
  const d2 = refDv([...b, String(d1)], W2);
  return `${d1}${d2}`;
}

// ---------------------------------------------------------------------------
// Geradores
// ---------------------------------------------------------------------------
const base12 = fc.oneof(fc.stringMatching(/^[0-9]{12}$/), fc.stringMatching(/^[0-9A-Z]{12}$/));
const validCnpj = base12.map((b) => b + refCheckDigits(b));

/** Sujeira: minúsculas, máscara e espaços em posições arbitrárias. */
const dirty = fc
  .tuple(validCnpj, fc.boolean(), fc.boolean(), fc.array(fc.nat(), { maxLength: 3 }))
  .map(([c, lower, punct, spaces]) => {
    let s = lower ? c.toLowerCase() : c;
    if (punct) s = `${s.slice(0, 2)}.${s.slice(2, 5)}.${s.slice(5, 8)}/${s.slice(8, 12)}-${s.slice(12)}`;
    for (const p of spaces) {
      const i = p % (s.length + 1);
      s = `${s.slice(0, i)} ${s.slice(i)}`;
    }
    return s;
  });

/** DV alterado (posição 12 ou 13 trocada por outro dígito). */
const wrongDv = fc
  .tuple(validCnpj, fc.integer({ min: 12, max: 13 }), fc.integer({ min: 1, max: 9 }))
  .map(([c, pos, delta]) => c.slice(0, pos) + String((Number(c[pos]) + delta) % 10) + c.slice(pos + 1));

/** Um caractere fora de 0–9A–Z (ou letra nos DVs) em posição qualquer. */
const badChar = fc
  .tuple(validCnpj, fc.integer({ min: 0, max: 13 }), fc.constantFrom('#', '_', 'Ç', 'é', '*', '+', 'A', 'Z', 'ı', 'ſ'))
  .map(([c, pos, ch]) => c.slice(0, pos) + ch + c.slice(pos + 1));

const wrongLength = fc.oneof(
  fc.stringMatching(/^[0-9A-Z]{0,13}$/),
  fc.stringMatching(/^[0-9A-Z]{15,20}$/),
  validCnpj.map((c) => c.slice(0, 13)),
  validCnpj.map((c) => c + '0'),
);

const allEqual = fc.constantFrom(...ALNUM.split('')).map((ch) => ch.repeat(14));

const anyInput = fc.oneof(
  validCnpj,
  dirty,
  wrongDv,
  badChar,
  wrongLength,
  allEqual,
  fc.string({ maxLength: 24 }),
  fc.stringMatching(/^[0-9A-Za-z./\- ]{10,20}$/),
);

// ---------------------------------------------------------------------------
describe('Property 28: Validador_CNPJ segue o modelo de referência', () => {
  it('isValidCnpj coincide com o modelo de referência para qualquer string', () => {
    fc.assert(
      fc.property(anyInput, (s) => {
        expect(isValidCnpj(s)).toBe(refIsValid(s));
      }),
      { numRuns: 500 },
    );
  });

  it('cnpjCheckDigits coincide com o modelo e todo CNPJ base + DVs é aceito (salvo todos iguais)', () => {
    fc.assert(
      fc.property(base12, (b) => {
        const dv = cnpjCheckDigits(b);
        expect(dv).toBe(refCheckDigits(b));
        const c = b + dv;
        expect(isValidCnpj(c)).toBe(!/^(.)\1{13}$/.test(c));
      }),
      { numRuns: 200 },
    );
  });

  it('trocar qualquer um dos 2 DVs por outro dígito torna o CNPJ inválido', () => {
    fc.assert(
      fc.property(validCnpj, fc.integer({ min: 12, max: 13 }), fc.integer({ min: 1, max: 9 }), (c, pos, delta) => {
        const altered = c.slice(0, pos) + String((Number(c[pos]) + delta) % 10) + c.slice(pos + 1);
        expect(isValidCnpj(altered)).toBe(false);
      }),
      { numRuns: 200 },
    );
  });
});

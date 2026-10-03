/**
 * **Validates: Requirements 1.2**
 */
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  GEMINI_MONTHLY_LIMIT_DEFAULT,
  PAGESPEED_MONTHLY_LIMIT_DEFAULT,
  PLACES_MONTHLY_LIMIT_DEFAULT,
  geminiMonthlyLimit,
  monthlyLimit,
  pagespeedMonthlyLimit,
  placesMonthlyLimit,
} from '@/lib/leads/config';

// Feature: lead-miner-enrichment, Property 1: For any string (ou ausência) em PLACES_MONTHLY_LIMIT ou PAGESPEED_MONTHLY_LIMIT, placesMonthlyLimit/pagespeedMonthlyLimit devolvem o inteiro representado quando ele é um inteiro positivo seguro (após trim) e, caso contrário, 1.000 e 5.000 respectivamente; geminiMonthlyLimit continua devolvendo o mesmo que na Etapa 1 para toda entrada.

/**
 * Modelo de referência independente da implementação: percorre os caracteres (sem regex)
 * e usa BigInt para decidir se o valor é um inteiro positivo seguro.
 */
function refLimit(env: string | undefined, fallback: number): number {
  if (env === undefined) return fallback;
  const t = env.trim();
  if (t.length === 0) return fallback;
  for (const ch of t) if (ch < '0' || ch > '9') return fallback;
  const big = BigInt(t);
  if (big <= 0n || big > BigInt(Number.MAX_SAFE_INTEGER)) return fallback;
  return Number(big);
}

/** Cópia literal de `geminiMonthlyLimit` da Etapa 1 (commit 1bff05d). */
function geminiEtapa1(env?: string): number {
  if (typeof env !== 'string') return GEMINI_MONTHLY_LIMIT_DEFAULT;
  const trimmed = env.trim();
  if (!/^\d+$/.test(trimmed)) return GEMINI_MONTHLY_LIMIT_DEFAULT;
  const n = Number(trimmed);
  return Number.isSafeInteger(n) && n > 0 ? n : GEMINI_MONTHLY_LIMIT_DEFAULT;
}

const ws = fc.constantFrom('', ' ', '  ', '\t', '\n', ' \t\n', '\u00a0', '\r\n');
const digits = fc.stringOf(fc.constantFrom('0', '1', '2', '3', '4', '5', '6', '7', '8', '9'), {
  minLength: 1,
  maxLength: 20,
});
const numericLike = fc.oneof(
  digits,
  fc.integer({ min: 1, max: 100_000 }).map(String),
  fc.constantFrom(
    '0',
    '00',
    '007',
    '-1',
    '+5',
    '1.5',
    '1e3',
    '0x10',
    '1_000',
    '1 000',
    String(Number.MAX_SAFE_INTEGER),
    String(Number.MAX_SAFE_INTEGER + 1),
    '99999999999999999999',
    'Infinity',
    'NaN',
    '١٢٣',
  ),
  fc.bigInt({ min: -(10n ** 20n), max: 10n ** 20n }).map(String),
);
const padded = fc.tuple(ws, numericLike, ws).map(([a, s, b]) => `${a}${s}${b}`);
const arbEnv: fc.Arbitrary<string | undefined> = fc.oneof(
  { weight: 1, arbitrary: fc.constant(undefined) },
  { weight: 4, arbitrary: padded },
  { weight: 2, arbitrary: fc.string({ maxLength: 12 }) },
  { weight: 1, arbitrary: fc.fullUnicodeString({ maxLength: 8 }) },
);

describe('Property 1: Limites mensais lidos do ambiente', () => {
  it('placesMonthlyLimit segue o modelo de referência com padrão 1.000', () => {
    expect(PLACES_MONTHLY_LIMIT_DEFAULT).toBe(1_000);
    fc.assert(
      fc.property(arbEnv, (env) => {
        expect(placesMonthlyLimit(env)).toBe(refLimit(env, 1_000));
      }),
      { numRuns: 300 },
    );
  });

  it('pagespeedMonthlyLimit segue o modelo de referência com padrão 5.000', () => {
    expect(PAGESPEED_MONTHLY_LIMIT_DEFAULT).toBe(5_000);
    fc.assert(
      fc.property(arbEnv, (env) => {
        expect(pagespeedMonthlyLimit(env)).toBe(refLimit(env, 5_000));
      }),
      { numRuns: 300 },
    );
  });

  it('monthlyLimit aplica a mesma regra para qualquer padrão', () => {
    fc.assert(
      fc.property(arbEnv, fc.integer({ min: 1, max: 1_000_000 }), (env, fallback) => {
        expect(monthlyLimit(env, fallback)).toBe(refLimit(env, fallback));
      }),
      { numRuns: 300 },
    );
  });

  it('geminiMonthlyLimit devolve o mesmo que na Etapa 1', () => {
    fc.assert(
      fc.property(arbEnv, (env) => {
        expect(geminiMonthlyLimit(env)).toBe(geminiEtapa1(env));
        expect(geminiMonthlyLimit(env)).toBe(refLimit(env, GEMINI_MONTHLY_LIMIT_DEFAULT));
      }),
      { numRuns: 300 },
    );
  });
});

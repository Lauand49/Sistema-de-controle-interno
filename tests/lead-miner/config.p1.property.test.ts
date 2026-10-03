/**
 * **Validates: Requirements 1.9**
 */
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { GEMINI_MONTHLY_LIMIT_DEFAULT, geminiMonthlyLimit } from '@/lib/leads/config';
import { arbInvalidIntEnv, arbPositiveIntEnv } from './support/arb-env';

// Feature: lead-miner, Property 1: For any string (ou ausência) em GEMINI_MONTHLY_LIMIT, geminiMonthlyLimit retorna o inteiro representado quando a string é um inteiro positivo e GEMINI_MONTHLY_LIMIT_DEFAULT em qualquer outro caso.
describe('Property 1: Limite mensal do Gemini', () => {
  it('retorna o inteiro representado quando é inteiro positivo', () => {
    fc.assert(
      fc.property(arbPositiveIntEnv, ({ raw, value }) => {
        expect(geminiMonthlyLimit(raw)).toBe(value);
      }),
      { numRuns: 100 },
    );
  });

  it('retorna o padrão em qualquer outro caso', () => {
    fc.assert(
      fc.property(arbInvalidIntEnv, (raw) => {
        expect(geminiMonthlyLimit(raw)).toBe(GEMINI_MONTHLY_LIMIT_DEFAULT);
      }),
      { numRuns: 100 },
    );
  });
});

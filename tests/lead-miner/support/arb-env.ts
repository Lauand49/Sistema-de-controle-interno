/**
 * Geradores de valores de variáveis de ambiente (GEMINI_MONTHLY_LIMIT).
 */
import fc from 'fast-check';

/** Inteiro positivo seguro e sua representação canônica em string. */
export const arbPositiveIntEnv: fc.Arbitrary<{ raw: string; value: number }> = fc
  .integer({ min: 1, max: Number.MAX_SAFE_INTEGER })
  .map((value) => ({ raw: String(value), value }));

/** Valores que não representam um inteiro positivo (ausência incluída). */
export const arbInvalidIntEnv: fc.Arbitrary<string | undefined> = fc.oneof(
  fc.constant(undefined),
  fc.constantFrom('', ' ', '0', '00', '-0', '+', '-', '1e3', 'NaN', 'Infinity'),
  fc.integer({ min: 1, max: 1_000_000 }).map((n) => `-${n}`),
  fc
    .tuple(fc.integer({ min: 0, max: 1_000_000 }), fc.integer({ min: 1, max: 999 }))
    .map(([a, b]) => `${a}.${b}`),
  // Strings arbitrárias que não são só dígitos (com espaços ao redor).
  fc.string().filter((s) => !/^\s*\d+\s*$/.test(s)),
);

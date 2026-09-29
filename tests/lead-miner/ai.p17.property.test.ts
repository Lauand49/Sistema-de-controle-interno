// Feature: lead-miner, Property 17: Validação da resposta da IA
/**
 * **Validates: Requirements 7.2, 7.3**
 */
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { parseAiResponse } from '@/lib/leads/ai';

const arbText = (max: number) =>
  fc.oneof(
    fc.constantFrom('', '   ', 'a', ' ok ', 'x'.repeat(max), 'x'.repeat(max + 1), ` ${'y'.repeat(max)} `),
    fc.string({ maxLength: 40 }),
  );

const arbScore = fc.oneof(
  fc.double({ min: -100, max: 100, noNaN: true }),
  fc.integer({ min: -10, max: 50 }),
  fc.constantFrom(0.5, 34.5, 35.49, -0.5, 1e308, Number.MAX_VALUE),
);

const arbField = (valid: fc.Arbitrary<unknown>) =>
  fc.oneof(
    { weight: 4, arbitrary: valid },
    { weight: 1, arbitrary: fc.constantFrom(undefined, null, true, 12, '20', [], {}) },
  );

const arbObject = fc.record({
  score: arbField(arbScore),
  oportunidade: arbField(arbText(500)),
  justificativa: arbField(arbText(1000)),
  extra: fc.option(fc.jsonValue(), { nil: undefined }),
});

const arbRaw = fc.oneof(
  { weight: 5, arbitrary: arbObject.map((o) => ({ raw: JSON.stringify(o), obj: o as Record<string, unknown> | null })) },
  { weight: 2, arbitrary: arbObject.map((o) => ({ raw: '```json\n' + JSON.stringify(o) + '\n```', obj: o as Record<string, unknown> | null })) },
  { weight: 1, arbitrary: arbObject.map((o) => ({ raw: JSON.stringify(o).slice(0, -1), obj: null })) },
  { weight: 1, arbitrary: fc.string().filter((s) => !/^\s*[{`]/.test(s)).map((s) => ({ raw: s, obj: null })) },
);

function okText(v: unknown, max: number): v is string {
  return typeof v === 'string' && v.trim().length > 0 && v.trim().length <= max;
}

describe('Property 17: Validação da resposta da IA', () => {
  it('sucesso sse score finito e textos válidos; score = clamp(roundHalfUp(score), 0, 35)', () => {
    fc.assert(
      fc.property(arbRaw, ({ raw, obj }) => {
        const out = parseAiResponse(raw);
        // JSON.stringify converte números não finitos em null; o objeto serializado é a referência.
        const parsed = obj === null ? null : (JSON.parse(JSON.stringify(obj)) as Record<string, unknown>);
        const expectedOk =
          parsed !== null &&
          typeof parsed.score === 'number' &&
          Number.isFinite(parsed.score) &&
          okText(parsed.oportunidade, 500) &&
          okText(parsed.justificativa, 1000);
        expect(out.ok).toBe(expectedOk);
        if (out.ok && parsed) {
          const s = parsed.score as number;
          expect(out.result.score).toBe(Math.min(35, Math.max(0, Math.floor(s + 0.5))));
          expect(Number.isInteger(out.result.score)).toBe(true);
          expect(out.result.oportunidade).toBe((parsed.oportunidade as string).trim());
          expect(out.result.justificativa).toBe((parsed.justificativa as string).trim());
        }
        if (!out.ok) expect(out.reason).toBe('resposta inválida');
      }),
      { numRuns: 100 },
    );
  });
});

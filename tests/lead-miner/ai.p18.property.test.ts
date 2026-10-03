// Feature: lead-miner, Property 18: Uso de cota do Gemini
/**
 * **Validates: Requirements 7.1, 7.4, 7.6**
 */
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { analyzeWithAi, type AiInput } from '@/lib/leads/ai';
import { monthKey } from '@/lib/leads/usage';
import { fakeGemini, immediateTimer, memoryUsageGate, type FakeGeminiBehavior } from './support/fake-ai';
import { arbSiteAnalysis } from './support/arb-site';

const VALID = JSON.stringify({ score: 12, oportunidade: 'Criar site', justificativa: 'Sem presença digital' });

const arbBehavior: fc.Arbitrary<FakeGeminiBehavior> = fc.oneof(
  fc.constant<FakeGeminiBehavior>({ kind: 'ok', text: VALID }),
  fc.string({ maxLength: 20 }).map<FakeGeminiBehavior>((text) => ({ kind: 'ok', text })),
  fc.constant<FakeGeminiBehavior>({ kind: 'error' }),
  fc.constant<FakeGeminiBehavior>({ kind: 'throw' }),
  fc.constant<FakeGeminiBehavior>({ kind: 'hang' }),
);

const arbInput: fc.Arbitrary<AiInput> = fc.record({
  nome: fc.string({ minLength: 1, maxLength: 30 }),
  nicho: fc.constantFrom('padaria', 'academia', 'clinica_odontologica'),
  bairro: fc.option(fc.string({ maxLength: 20 }), { nil: null }),
  cidade: fc.option(fc.string({ maxLength: 20 }), { nil: null }),
  site: arbSiteAnalysis,
});

const arbNow = fc.date({ min: new Date(2020, 0, 1), max: new Date(2035, 11, 31), noInvalidDate: true });

describe('Property 18: Uso de cota do Gemini', () => {
  it('reserva 1 antes de 1 chamada quando c < L; não chama nem incrementa quando c ≥ L; nunca lança', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 1, max: 50 }),
        fc.integer({ min: 0, max: 60 }),
        arbBehavior,
        arbInput,
        arbNow,
        async (limit, c, behavior, input, now) => {
          const month = monthKey(now);
          const log: string[] = [];
          const usage = memoryUsageGate({ [`gemini:${month}`]: c }, log);
          const client = fakeGemini(behavior, log);

          const out = await analyzeWithAi(input, {
            client,
            usage,
            limit,
            now: () => now,
            timeoutMs: 20_000,
            setTimer: immediateTimer,
          });

          if (c < limit) {
            expect(usage.peek('gemini', month)).toBe(c + 1);
            expect(log).toEqual(['reserve:ok', 'generate']);
            expect(client.prompts).toHaveLength(1);
            const prompt = client.prompts[0];
            const s = input.site;
            for (const fragment of [
              `"nome":${JSON.stringify(input.nome)}`,
              `"nicho":${JSON.stringify(input.nicho)}`,
              `"bairro":${JSON.stringify(input.bairro)}`,
              `"cidade":${JSON.stringify(input.cidade)}`,
              `"statusHttp":${JSON.stringify(s.statusCode)}`,
              `"https":${s.isHttps}`,
              `"sslValido":${s.sslValid}`,
              `"latenciaMs":${JSON.stringify(s.responseTimeMs)}`,
              `"disponivel":${s.online}`,
            ]) {
              expect(prompt).toContain(fragment);
            }
            if (behavior.kind !== 'ok') expect(out).toEqual({ ok: false, reason: 'sem resposta' });
          } else {
            expect(out).toEqual({ ok: false, reason: 'cota esgotada' });
            expect(client.prompts).toHaveLength(0);
            expect(usage.peek('gemini', month)).toBe(c);
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});

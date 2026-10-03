/**
 * Geradores de `ScoreInput` para os testes do Pontuador.
 *
 * O resultado de IA cobre: ausência (null), falhas com cada motivo e sucessos com score
 * válido (inteiro, fracionário, .5, fronteiras 0 e 35) ou inválido (NaN, ±Infinity, fora de 0–35).
 */
import fc from 'fast-check';
import type { ScoreInput } from '@/lib/leads/scorer';
import type { AiFailureReason, AiOutcome, NicheTier } from '@/lib/leads/types';
import { arbSiteAnalysis } from './arb-site';

export const arbTier: fc.Arbitrary<NicheTier> = fc.constantFrom<NicheTier>(1, 2, 3);

export const arbValidAiScore: fc.Arbitrary<number> = fc.oneof(
  fc.constantFrom(0, 0.5, 17.5, 34.49, 34.5, 35),
  fc.integer({ min: 0, max: 35 }),
  fc.double({ min: 0, max: 35, noNaN: true }),
);

export const arbInvalidAiScore: fc.Arbitrary<number> = fc.oneof(
  fc.constantFrom(Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, -0.01, -1, 35.01, 36, 100),
  fc.double({ min: 35.000001, max: 1e6, noNaN: true }),
  fc.double({ min: -1e6, max: -0.000001, noNaN: true }),
);

const FAILURE_REASONS: AiFailureReason[] = ['IA desabilitada', 'sem resposta', 'resposta inválida', 'cota esgotada'];

export const arbAiOutcome: fc.Arbitrary<AiOutcome | null> = fc.oneof(
  fc.constant(null),
  fc.constantFrom(...FAILURE_REASONS).map((reason): AiOutcome => ({ ok: false, reason })),
  fc
    .oneof(arbValidAiScore, arbInvalidAiScore)
    .map((score): AiOutcome => ({ ok: true, result: { score, oportunidade: 'Oportunidade', justificativa: 'Justificativa' } })),
);

export const arbScoreInput: fc.Arbitrary<ScoreInput> = fc.record({
  analysis: arbSiteAnalysis,
  tier: arbTier,
  iaEnabled: fc.boolean(),
  ai: arbAiOutcome,
});

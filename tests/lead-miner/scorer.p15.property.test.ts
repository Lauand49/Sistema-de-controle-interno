// Feature: lead-miner, Property 15: Fórmula do Score_Final
/**
 * **Validates: Requirements 6.4, 6.5, 6.6**
 */
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { roundHalfUp, score, type ScoreInput } from '@/lib/leads/scorer';
import { arbScoreInput } from './support/arb-score';

/** Motivo esperado do descarte, derivado do Req. 6.6 (cota esgotada → sem resposta). */
function expectedReason(input: ScoreInput): string {
  const { iaEnabled, ai } = input;
  if (!iaEnabled) return 'IA desabilitada';
  if (ai === null) return 'sem resposta';
  if (ai.ok) return 'resposta inválida';
  if (ai.reason === 'cota esgotada') return 'sem resposta';
  return ai.reason;
}

describe('Property 15: Fórmula do Score_Final', () => {
  it('objetivo + IA quando a IA é válida; senão reescala e registra o motivo', () => {
    fc.assert(
      fc.property(arbScoreInput, (input) => {
        const r = score(input);
        const s = input.ai?.ok ? input.ai.result.score : undefined;
        const iaValida = input.iaEnabled && s !== undefined && Number.isFinite(s) && s >= 0 && s <= 35;
        if (iaValida) {
          expect(r.formula).toBe('OBJETIVO_MAIS_IA');
          expect(r.final).toBe(r.objetivo + roundHalfUp(s));
          expect(r.ia).not.toBeNull();
          expect(r.iaNaoUsadaMotivo).toBeNull();
        } else {
          expect(r.formula).toBe('OBJETIVO_REESCALADO');
          expect(r.final).toBe(roundHalfUp((r.objetivo * 100) / 65));
          expect(r.ia).toBeNull();
          expect(r.iaNaoUsadaMotivo).toBe(expectedReason(input));
        }
      }),
      { numRuns: 100 },
    );
  });
});

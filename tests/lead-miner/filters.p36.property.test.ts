import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { buildRankingQuery, companyFiltersSchema, searchParamsToObject } from '@/lib/leads/filters';
import { arbRankingUiState } from './support/arb-filters';

const OTHER_KEYS = [
  'q', 'cidade', 'bairro', 'uf', 'nicho', 'categoria', 'prioridade', 'hasSite', 'isHttps',
  'fonte', 'assignedTo', 'leadStatus', 'analyzedFrom', 'analyzedTo', 'runId',
] as const;

/** Oráculo do campo de score da UI: `null` = vazio, `NaN` = inválido. */
function uiScore(raw: string | undefined): number | null {
  const s = (raw ?? '').trim();
  if (s === '') return null;
  if (!/^[0-9]+$/.test(s)) return Number.NaN;
  const n = parseInt(s, 10);
  return n <= 100 ? n : Number.NaN;
}

// Feature: lead-miner, Property 36: Faixa de score inválida ignora só esse filtro
// **Validates: Requirements 12.9, 12.10, 12.11**
describe('Property 36: Faixa de score inválida ignora só esse filtro', () => {
  it('omite só a faixa inválida, preserva os demais filtros e gera query aceita pelo schema', () => {
    fc.assert(
      fc.property(arbRankingUiState, (ui) => {
        const { query, invalid } = buildRankingQuery(ui);

        const min = uiScore(ui.scoreMin);
        const max = uiScore(ui.scoreMax);
        const bad = Number.isNaN(min) || Number.isNaN(max) || (min !== null && max !== null && min > max);

        expect(invalid).toEqual(bad ? ['score'] : []);
        if (bad) {
          expect(query.has('scoreMin')).toBe(false);
          expect(query.has('scoreMax')).toBe(false);
        } else {
          expect(query.get('scoreMin')).toBe(min === null ? null : String(min));
          expect(query.get('scoreMax')).toBe(max === null ? null : String(max));
        }

        for (const key of OTHER_KEYS) {
          const value = ui[key];
          const filled = value !== undefined && value.trim() !== '';
          expect(query.get(key)).toBe(filled ? value : null);
        }

        expect(companyFiltersSchema.safeParse(searchParamsToObject(query)).success).toBe(true);
      }),
      { numRuns: 100 },
    );
  });
});

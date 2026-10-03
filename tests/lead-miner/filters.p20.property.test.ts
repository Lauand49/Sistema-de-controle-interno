import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { MSG, bulkIdsSchema, companyFiltersSchema, runsListSchema } from '@/lib/leads/filters';
import { arbDateString, arbInvalidDateString, arbScoreParam } from './support/arb-filters';

/** Oráculo do score: ausente/vazio = sem filtro; senão inteiro em [0, 100]. */
function scoreOf(v: unknown): { ok: boolean; n?: number } {
  if (v === undefined || v === null || (typeof v === 'string' && v.trim() === '')) return { ok: true };
  if (typeof v === 'number') return Number.isInteger(v) && v >= 0 && v <= 100 ? { ok: true, n: v } : { ok: false };
  if (typeof v === 'string' && /^\s*\d+\s*$/.test(v)) {
    const n = Number(v);
    return n <= 100 ? { ok: true, n } : { ok: false };
  }
  return { ok: false };
}

const arbDateParam = fc.oneof(
  { weight: 1, arbitrary: fc.constant<string | undefined>(undefined) },
  { weight: 3, arbitrary: arbDateString.map((d) => ({ d, valid: true })) },
  { weight: 1, arbitrary: arbInvalidDateString.map((d) => ({ d, valid: false })) },
);

const arbIds = fc
  .tuple(
    fc.oneof(
      { weight: 3, arbitrary: fc.integer({ min: 0, max: 5 }) },
      { weight: 2, arbitrary: fc.integer({ min: 195, max: 205 }) },
      { weight: 1, arbitrary: fc.integer({ min: 0, max: 260 }) },
    ),
    fc.constantFrom('none', 'none', 'dup', 'bad'),
  )
  .chain(([n, mutation]) =>
    fc.uniqueArray(fc.uuid(), { minLength: n, maxLength: n }).map((ids) => {
      if (mutation === 'dup' && ids.length > 0) return { ids: [...ids, ids[0]], mutation };
      if (mutation === 'bad') return { ids: [...ids, 'nao-e-uuid'], mutation };
      return { ids, mutation: 'none' as const };
    }),
  );

// Feature: lead-miner, Property 20: Validação de filtros e seleção em lote
// **Validates: Requirements 11.7, 15.12, 16.7, 18.5, 18.6**
describe('Property 20: Validação de filtros e seleção em lote', () => {
  it('aceita faixa de score, intervalo de datas e seleção em lote sse válidos', () => {
    fc.assert(
      fc.property(arbScoreParam, arbScoreParam, arbDateParam, arbDateParam, arbIds, (sMin, sMax, dFrom, dTo, bulk) => {
        // --- faixa de score e intervalo de datas (companyFiltersSchema) ---
        const raw: Record<string, unknown> = {};
        if (sMin !== undefined) raw.scoreMin = sMin;
        if (sMax !== undefined) raw.scoreMax = sMax;
        if (dFrom) raw.analyzedFrom = dFrom.d;
        if (dTo) raw.analyzedTo = dTo.d;

        const min = scoreOf(sMin);
        const max = scoreOf(sMax);
        const scoreOk =
          min.ok && max.ok && !(min.n !== undefined && max.n !== undefined && min.n > max.n);
        const datesEachOk = (!dFrom || dFrom.valid) && (!dTo || dTo.valid);
        const datesOk = datesEachOk && !(dFrom && dTo && dFrom.d > dTo.d);

        const parsed = companyFiltersSchema.safeParse(raw);
        expect(parsed.success).toBe(scoreOk && datesOk);
        if (parsed.success) {
          expect(parsed.data.scoreMin).toBe(min.n);
          expect(parsed.data.scoreMax).toBe(max.n);
        } else {
          const messages = parsed.error.issues.map((i) => i.message);
          // As regras entre campos (mín ≤ máx, inicial ≤ final) só rodam quando todo campo
          // isolado é válido (comportamento do `superRefine` do zod).
          const fieldsOk = min.ok && max.ok && datesEachOk;
          if (!min.ok || !max.ok || (!scoreOk && fieldsOk)) expect(messages).toContain(MSG.score);
          if (!datesEachOk || (!datesOk && fieldsOk)) {
            expect(messages.some((m) => m === MSG.data || m === MSG.intervaloDatas)).toBe(true);
          }
        }

        // --- intervalo de datas do histórico (runsListSchema) ---
        const runs = runsListSchema.safeParse({ from: dFrom?.d, to: dTo?.d });
        expect(runs.success).toBe(datesOk);

        // --- seleção em lote (bulkIdsSchema) ---
        const bulkOk = bulk.mutation === 'none' && bulk.ids.length >= 1 && bulk.ids.length <= 200;
        const b = bulkIdsSchema.safeParse(bulk.ids);
        expect(b.success).toBe(bulkOk);
        if (b.success) expect(b.data).toEqual(bulk.ids);
      }),
      { numRuns: 100 },
    );
  });
});

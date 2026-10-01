// Feature: dashboards, Property 5: Periodo e janela
/**
 * **Validates: Requirements 2.6, 2.7, 10.3**
 */
import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import {
  DEFAULT_PERIODO,
  PERIODS,
  PERIOD_DAYS,
  addDays,
  parsePeriodo,
  periodWindow,
  saoPauloDayKey,
  startOfSaoPauloDay,
} from '@/lib/dashboards/period';
import { arbNow, arbPeriodo } from './support/arb-facts';

/** Valores válidos, variações próximas (caixa, espaços, números) e strings arbitrárias. */
const arbRawPeriodo: fc.Arbitrary<string | null | undefined> = fc.oneof(
  fc.constant(null),
  fc.constant(undefined),
  fc.constant(''),
  fc.constantFrom(...PERIODS),
  fc.constantFrom(...PERIODS).map((p) => p.toUpperCase()),
  fc.constantFrom(...PERIODS).map((p) => ` ${p}`),
  fc.constantFrom(...PERIODS).map((p) => `${p} `),
  fc.integer({ min: 0, max: 400 }).map((n) => `${n}d`),
  fc.string({ maxLength: 8 }),
);

describe('Property 5: Periodo e janela', () => {
  it('parsePeriodo: ausência/vazio → 30d, valor válido → ele, outro → null', () => {
    fc.assert(
      fc.property(arbRawPeriodo, (raw) => {
        const result = parsePeriodo(raw);
        if (raw === null || raw === undefined || raw === '') {
          expect(result).toBe(DEFAULT_PERIODO);
          expect(result).toBe('30d');
        } else if ((PERIODS as readonly string[]).includes(raw)) {
          expect(result).toBe(raw);
        } else {
          expect(result).toBeNull();
        }
      }),
      { numRuns: 100 },
    );
  });

  it('periodWindow: to = now; Nd começa às 00:00 de São Paulo de (N − 1) dias antes; tudo sem from', () => {
    fc.assert(
      fc.property(arbNow, arbPeriodo, (now, periodo) => {
        const w = periodWindow(periodo, now);
        expect(w.key).toBe(periodo);
        expect(w.to.getTime()).toBe(now.getTime());

        if (periodo === 'tudo') {
          expect(w.from).toBeNull();
          return;
        }

        const n = PERIOD_DAYS[periodo];
        const firstDay = addDays(saoPauloDayKey(now), -(n - 1));
        expect(w.from).not.toBeNull();
        const from = w.from as Date;
        expect(from.getTime()).toBe(startOfSaoPauloDay(firstDay).getTime());
        expect(from.getTime()).toBeLessThanOrEqual(w.to.getTime());

        // Verificação independente: `from` é exatamente a virada do dia em São Paulo.
        expect(saoPauloDayKey(from)).toBe(firstDay);
        expect(saoPauloDayKey(new Date(from.getTime() - 1))).toBe(addDays(firstDay, -1));
      }),
      { numRuns: 100 },
    );
  });
});

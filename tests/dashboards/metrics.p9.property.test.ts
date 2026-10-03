// Feature: dashboards, Property 9: Classificação de tarefas segue o modelo
/**
 * **Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5**
 */
import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { computeTaskCounts, type TaskCounts, type TaskFact } from '@/lib/dashboards/metrics';
import {
  PERIODS,
  PERIOD_DAYS,
  addDays,
  buildMetricContext,
  saoPauloDayKey,
  type Periodo,
} from '@/lib/dashboards/period';
import { arbNow, arbPeriodo, arbTaskFact } from './support/arb-facts';

/**
 * Modelo de referência escrito sobre o glossário, sem reutilizar os predicados de
 * `metrics.ts` nem `periodWindow`/`inWindow`:
 * - aberta = TODO/IN_PROGRESS;
 * - atrasada = aberta com dueDate e Dia_Prazo (data UTC) < Dia_Referencia (dia em SP);
 * - concluída = DONE com completedAt ≤ now e, para 'Nd', dia de completedAt em SP ≥
 *   (Dia_Referencia − (N − 1)) — equivalente a completedAt ≥ início desse dia em SP.
 */
function modelTaskCounts(tasks: readonly TaskFact[], now: Date, periodo: Periodo): TaskCounts {
  const today = saoPauloDayKey(now);
  const firstDay = periodo === 'tudo' ? null : addDays(today, -(PERIOD_DAYS[periodo] - 1));
  const counts: TaskCounts = { open: 0, overdue: 0, doneInPeriod: 0 };
  for (const t of tasks) {
    const open = t.status === 'TODO' || t.status === 'IN_PROGRESS';
    if (open) counts.open++;
    if (open && t.dueDate !== null && t.dueDate.toISOString().slice(0, 10) < today) counts.overdue++;
    if (
      t.status === 'DONE' &&
      t.completedAt !== null &&
      t.completedAt.getTime() <= now.getTime() &&
      (firstDay === null || saoPauloDayKey(t.completedAt) >= firstDay)
    ) {
      counts.doneInPeriod++;
    }
  }
  return counts;
}

/** Status que nunca contam: CANCELLED ou strings fora do enum. */
const arbNonCountingStatus: fc.Arbitrary<string> = fc.oneof(
  fc.constant('CANCELLED'),
  fc
    .string({ maxLength: 12 })
    .filter((s) => !['TODO', 'IN_PROGRESS', 'DONE', 'CANCELLED'].includes(s)),
  fc.constantFrom('todo', 'done', 'Done', ' TODO', 'IN-PROGRESS'),
);

const arbCase = fc.tuple(arbNow, arbPeriodo).chain(([now, periodo]) =>
  fc.record({
    now: fc.constant(now),
    periodo: fc.constant(periodo),
    tasks: fc.array(arbTaskFact(now, periodo), { maxLength: 25 }),
    extra: fc.array(
      fc
        .tuple(arbTaskFact(now, periodo), arbNonCountingStatus)
        .map(([t, status]): TaskFact => ({ ...t, status })),
      { minLength: 1, maxLength: 10 },
    ),
  }),
);

describe('Property 9: Classificação de tarefas segue o modelo', () => {
  it('computeTaskCounts coincide com o modelo; canceladas/desconhecidas não contam; open/overdue independem do Periodo', () => {
    fc.assert(
      fc.property(arbCase, ({ now, periodo, tasks, extra }) => {
        const ctx = buildMetricContext(now, periodo);
        const counts = computeTaskCounts(tasks, ctx);

        // Igual ao modelo de referência (Req. 3.1, 3.2, 3.3, 3.5).
        expect(counts).toEqual(modelTaskCounts(tasks, now, periodo));

        // Acrescentar CANCELLED/fora do enum, em qualquer posição, não altera nada (Req. 3.4).
        expect(computeTaskCounts([...tasks, ...extra], ctx)).toEqual(counts);
        expect(computeTaskCounts([...extra, ...tasks], ctx)).toEqual(counts);

        // open/overdue não dependem do Periodo (Req. 3.1, 3.2).
        for (const other of PERIODS) {
          const c = computeTaskCounts(tasks, buildMetricContext(now, other));
          expect(c.open).toBe(counts.open);
          expect(c.overdue).toBe(counts.overdue);
        }
      }),
      { numRuns: 100 },
    );
  });
});

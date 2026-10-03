import { describe, expect, it } from 'vitest';
import { buildMetricContext } from '@/lib/dashboards/period';
import {
  computeTaskCounts,
  conversionFromCounts,
  isDoneInPeriod,
  isOverdueTask,
  type TaskFact,
} from '@/lib/dashboards/metrics';

const NOW = new Date('2026-10-05T15:00:00.000Z');
const ctx = buildMetricContext(NOW, '30d');

function task(overrides: Partial<TaskFact> = {}): TaskFact {
  return { status: 'TODO', dueDate: null, completedAt: null, assigneeId: null, unitCode: null, ...overrides };
}

describe('Tarefa_Atrasada (Req. 3.5)', () => {
  it('prazo ontem → atrasada', () => {
    expect(isOverdueTask(task({ dueDate: new Date('2026-10-04T00:00:00.000Z') }), ctx)).toBe(true);
  });

  it('prazo hoje → não atrasada', () => {
    expect(isOverdueTask(task({ dueDate: new Date('2026-10-05T00:00:00.000Z') }), ctx)).toBe(false);
  });

  it('sem prazo → não atrasada', () => {
    expect(isOverdueTask(task({ dueDate: null }), ctx)).toBe(false);
  });

  it('dueDate 2026-10-05T00:00Z não é atrasada nem às 22h de São Paulo (01:00Z do dia seguinte)', () => {
    const late = buildMetricContext(new Date('2026-10-06T01:00:00.000Z'), '30d');
    expect(late.todayKey).toBe('2026-10-05');
    expect(isOverdueTask(task({ dueDate: new Date('2026-10-05T00:00:00.000Z') }), late)).toBe(false);
  });
});

describe('Concluída no Periodo (Req. 3.3)', () => {
  const from = ctx.window.from!;

  it('1 ms antes de from → fora', () => {
    const t = task({ status: 'DONE', completedAt: new Date(from.getTime() - 1) });
    expect(isDoneInPeriod(t, ctx)).toBe(false);
  });

  it('exatamente em from → dentro', () => {
    const t = task({ status: 'DONE', completedAt: new Date(from.getTime()) });
    expect(isDoneInPeriod(t, ctx)).toBe(true);
  });
});

describe('CANCELLED (Req. 3.4)', () => {
  it('não entra em nenhuma contagem', () => {
    const cancelled = task({
      status: 'CANCELLED',
      dueDate: new Date('2026-10-01T00:00:00.000Z'),
      completedAt: new Date('2026-10-04T12:00:00.000Z'),
    });
    expect(computeTaskCounts([cancelled], ctx)).toEqual({ open: 0, overdue: 0, doneInPeriod: 0 });
  });
});

describe('Taxa_Conversao (Req. 6.2)', () => {
  it.each([
    [0, 0, null],
    [1, 8, 13],
    [1, 3, 33],
    [2, 3, 67],
  ])('%i de %i → %s', (converted, total, percent) => {
    expect(conversionFromCounts(converted, total)).toEqual({ converted, total, percent });
  });
});

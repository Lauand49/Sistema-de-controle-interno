import fc from 'fast-check';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_PERIODO,
  PERIODS,
  addDays,
  buildMetricContext,
  dueDayKey,
  inWindow,
  parsePeriodo,
  periodWindow,
  saoPauloDayKey,
  startOfSaoPauloDay,
} from '@/lib/dashboards/period';
import { arbNow, arbPeriodo, arbTaskFact } from './support/arb-facts';

const NOW = new Date('2026-10-05T15:00:00.000Z');

describe('parsePeriodo', () => {
  it('usa 30d quando ausente ou vazio', () => {
    expect(DEFAULT_PERIODO).toBe('30d');
    expect(parsePeriodo('')).toBe('30d');
    expect(parsePeriodo(null)).toBe('30d');
    expect(parsePeriodo(undefined)).toBe('30d');
  });

  it('aceita os quatro valores válidos', () => {
    for (const p of PERIODS) expect(parsePeriodo(p)).toBe(p);
  });

  it('rejeita variações de caixa e valores desconhecidos', () => {
    expect(parsePeriodo('30D')).toBeNull();
    expect(parsePeriodo('Tudo')).toBeNull();
    expect(parsePeriodo('15d')).toBeNull();
    expect(parsePeriodo(' 7d')).toBeNull();
  });
});

describe('dia de São Paulo', () => {
  it('startOfSaoPauloDay("2026-10-05") é 03:00 UTC', () => {
    expect(startOfSaoPauloDay('2026-10-05').toISOString()).toBe('2026-10-05T03:00:00.000Z');
  });

  it('saoPauloDayKey muda às 03:00 UTC', () => {
    expect(saoPauloDayKey(new Date('2026-10-05T02:59:59.999Z'))).toBe('2026-10-04');
    expect(saoPauloDayKey(new Date('2026-10-05T03:00:00.000Z'))).toBe('2026-10-05');
    expect(saoPauloDayKey(new Date('2026-10-06T01:00:00.000Z'))).toBe('2026-10-05');
  });

  it('dueDayKey lê a data em UTC, independente da hora', () => {
    expect(dueDayKey(new Date('2026-10-05T00:00:00.000Z'))).toBe('2026-10-05');
    expect(dueDayKey(new Date('2026-10-05T23:59:59.999Z'))).toBe('2026-10-05');
  });

  it('addDays atravessa meses e anos', () => {
    expect(addDays('2026-10-05', -6)).toBe('2026-09-29');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2028-03-01', -1)).toBe('2028-02-29');
  });
});

describe('periodWindow', () => {
  it('7d começa 6 dias antes do Dia_Referencia, à meia-noite de São Paulo', () => {
    const w = periodWindow('7d', NOW);
    expect(w.key).toBe('7d');
    expect(w.from?.toISOString()).toBe('2026-09-29T03:00:00.000Z');
    expect(w.to).toBe(NOW);
  });

  it('30d e 90d começam 29 e 89 dias antes', () => {
    expect(periodWindow('30d', NOW).from?.toISOString()).toBe('2026-09-06T03:00:00.000Z');
    expect(periodWindow('90d', NOW).from?.toISOString()).toBe('2026-07-08T03:00:00.000Z');
  });

  it('usa o dia de São Paulo quando o dia UTC já virou', () => {
    // 01:00 UTC de 06/10 ainda é 05/10 em São Paulo.
    const w = periodWindow('7d', new Date('2026-10-06T01:00:00.000Z'));
    expect(w.from?.toISOString()).toBe('2026-09-29T03:00:00.000Z');
  });

  it('tudo não tem início', () => {
    expect(periodWindow('tudo', NOW).from).toBeNull();
  });

  it('inWindow inclui as bordas e exclui ±1 ms fora delas', () => {
    const w = periodWindow('7d', NOW);
    const from = w.from!.getTime();
    expect(inWindow(new Date(from - 1), w)).toBe(false);
    expect(inWindow(new Date(from), w)).toBe(true);
    expect(inWindow(NOW, w)).toBe(true);
    expect(inWindow(new Date(NOW.getTime() + 1), w)).toBe(false);
    expect(inWindow(new Date(0), periodWindow('tudo', NOW))).toBe(true);
  });
});

describe('buildMetricContext', () => {
  it('overdueCutoff é a meia-noite UTC do Dia_Referencia', () => {
    const ctx = buildMetricContext(new Date('2026-10-06T01:00:00.000Z'), '30d');
    expect(ctx.todayKey).toBe('2026-10-05');
    expect(ctx.overdueCutoff.toISOString()).toBe('2026-10-05T00:00:00.000Z');
    expect(ctx.window.key).toBe('30d');
  });
});

describe('independência de process.env.TZ', () => {
  const originalTz = process.env.TZ;

  afterEach(() => {
    if (originalTz === undefined) delete process.env.TZ;
    else process.env.TZ = originalTz;
    vi.resetModules();
  });

  // Amostra fixa (seed) com viés para 00:00–03:00 UTC, mais casos conhecidos.
  const instants = [
    NOW,
    new Date('2026-10-05T02:59:59.999Z'),
    new Date('2026-10-05T03:00:00.000Z'),
    ...fc.sample(arbNow, { numRuns: 50, seed: 42 }),
  ];
  const periodos = fc.sample(arbPeriodo, { numRuns: instants.length, seed: 7 });

  async function snapshot(tz: string) {
    process.env.TZ = tz;
    vi.resetModules();
    const mod = await import('@/lib/dashboards/period');
    return instants.map((now, i) => {
      const ctx = mod.buildMetricContext(now, periodos[i]);
      return {
        todayKey: ctx.todayKey,
        cutoff: ctx.overdueCutoff.toISOString(),
        from: ctx.window.from?.toISOString() ?? null,
        start: mod.startOfSaoPauloDay(ctx.todayKey).toISOString(),
        due: mod.dueDayKey(now),
      };
    });
  }

  it('dá os mesmos resultados em UTC e Asia/Tokyo', async () => {
    const utc = await snapshot('UTC');
    const tokyo = await snapshot('Asia/Tokyo');
    expect(tokyo).toEqual(utc);
    // Sanidade: o início do dia sempre cai às 03:00 UTC (São Paulo sem horário de verão desde 2019).
    for (const s of utc) expect(s.start.slice(11)).toBe('03:00:00.000Z');
  });
});

describe('arb-facts', () => {
  it('gera fatos de tarefa com as formas do design', () => {
    const [facts] = fc.sample(
      fc.tuple(arbNow, arbPeriodo).chain(([now, p]) => fc.array(arbTaskFact(now, p), { minLength: 5 })),
      { numRuns: 1, seed: 1 },
    );
    for (const t of facts) {
      expect(typeof t.status).toBe('string');
      expect(t.dueDate === null || t.dueDate instanceof Date).toBe(true);
      expect(t.completedAt === null || t.completedAt instanceof Date).toBe(true);
    }
  });
});

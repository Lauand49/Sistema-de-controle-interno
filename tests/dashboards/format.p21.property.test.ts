// Feature: dashboards, Property 21: Formatação de datas e números
/**
 * **Validates: Requirements 4.5, 5.3, 8.8, 11.2**
 */
import { afterEach, describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { formatDayKey, formatInt } from '@/lib/dashboards/format';
import { dueDayKey } from '@/lib/dashboards/period';

const DAY_MS = 24 * 60 * 60 * 1000;
const MIN_DAY = Date.UTC(1900, 0, 1) / DAY_MS;
const MAX_DAY = Date.UTC(2199, 11, 31) / DAY_MS;

/** Chave 'AAAA-MM-DD' válida (inclui 29/02 de anos bissextos), gerada a partir de um dia UTC. */
const arbDayKey = fc
  .integer({ min: MIN_DAY, max: MAX_DAY })
  .map((day) => new Date(day * DAY_MS).toISOString().slice(0, 10));

/** Fusos variados do processo, para provar que o resultado não depende deles. */
const arbTz = fc.constantFrom(
  'UTC',
  'America/Sao_Paulo',
  'America/Noronha',
  'Pacific/Kiritimati',
  'Pacific/Pago_Pago',
  'Asia/Tokyo',
  'Asia/Kolkata',
);

const originalTz = process.env.TZ;
afterEach(() => {
  if (originalTz === undefined) delete process.env.TZ;
  else process.env.TZ = originalTz;
});

describe('Property 21: Formatação de datas e números', () => {
  it('formatDayKey devolve DD/MM/AAAA com os mesmos componentes e a inversão recupera a chave', () => {
    fc.assert(
      fc.property(arbDayKey, arbTz, (key, tz) => {
        process.env.TZ = tz;
        const out = formatDayKey(key);
        expect(out).toMatch(/^\d{2}\/\d{2}\/\d{4}$/);
        const [d, m, y] = out.split('/');
        const [ky, km, kd] = key.split('-');
        expect([y, m, d]).toEqual([ky, km, kd]);
        expect(`${y}-${m}-${d}`).toBe(key);
      }),
      { numRuns: 100 },
    );
  });

  it('formatDayKey(dueDayKey(due)) não depende do fuso do processo nem da hora do prazo', () => {
    fc.assert(
      fc.property(
        arbDayKey,
        fc.integer({ min: 0, max: DAY_MS - 1 }),
        arbTz,
        arbTz,
        (key, ms, tzA, tzB) => {
          const due = new Date(Date.parse(`${key}T00:00:00.000Z`) + ms);
          process.env.TZ = tzA;
          const a = formatDayKey(dueDayKey(due));
          process.env.TZ = tzB;
          const b = formatDayKey(dueDayKey(due));
          expect(a).toBe(b);
          expect(a).toBe(formatDayKey(key));
        },
      ),
      { numRuns: 100 },
    );
  });

  it('formatInt(n) é igual a Intl.NumberFormat("pt-BR").format(n) para inteiros não negativos', () => {
    fc.assert(
      fc.property(
        fc.oneof(fc.integer({ min: 0, max: 9_999 }), fc.integer({ min: 0, max: Number.MAX_SAFE_INTEGER })),
        (n) => {
          expect(formatInt(n)).toBe(new Intl.NumberFormat('pt-BR').format(n));
        },
      ),
      { numRuns: 100 },
    );
  });
});

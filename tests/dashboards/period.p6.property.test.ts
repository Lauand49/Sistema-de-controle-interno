// Feature: dashboards, Property 6: Dia de São Paulo (round-trip)
/**
 * **Validates: Requirements 3.5, 12.1**
 */
import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { addDays, dueDayKey, saoPauloDayKey, startOfSaoPauloDay } from '@/lib/dashboards/period';

const DAY_MS = 24 * 60 * 60 * 1000;
const MIN_DAY = Date.UTC(2000, 0, 1);
const MAX_DAY = Date.UTC(2099, 11, 31);

/**
 * Dias de início do horário de verão em São Paulo (a meia-noite local não existe:
 * 00:00 salta para 01:00) e de fim (23:00 do dia anterior se repete).
 * Um sorteio uniforme de 100 dias em um século quase nunca cai nessas datas.
 */
const DST_EDGE_DAYS = [
  '2000-10-08', '2001-02-18', '2002-11-03', '2004-11-02', '2006-11-05',
  '2008-10-19', '2009-02-15', '2011-10-16', '2012-02-26', '2013-10-20',
  '2014-02-16', '2015-10-18', '2016-02-21', '2016-10-16', '2017-02-19',
  '2017-10-15', '2018-02-18', '2018-11-04', '2019-02-17',
];

/** Chave 'AAAA-MM-DD' entre 2000-01-01 e 2099-12-31, com viés para dias de troca de horário. */
const arbDayKey: fc.Arbitrary<string> = fc.oneof(
  { weight: 3, arbitrary: fc.integer({ min: 0, max: (MAX_DAY - MIN_DAY) / DAY_MS }).map((n) =>
    new Date(MIN_DAY + n * DAY_MS).toISOString().slice(0, 10)) },
  { weight: 1, arbitrary: fc.constantFrom(...DST_EDGE_DAYS) },
);

/** Instante qualquer entre 2000 e 2099 (inclui horas próximas da meia-noite UTC). */
const arbInstant: fc.Arbitrary<Date> = fc
  .integer({ min: MIN_DAY, max: MAX_DAY + DAY_MS - 1 })
  .map((ms) => new Date(ms));

describe('Property 6: Dia de São Paulo (round-trip)', () => {
  it('startOfSaoPauloDay(k) pertence a k e o ms anterior pertence a k − 1', () => {
    fc.assert(
      fc.property(arbDayKey, (k) => {
        const start = startOfSaoPauloDay(k);
        expect(saoPauloDayKey(start)).toBe(k);
        expect(saoPauloDayKey(new Date(start.getTime() - 1))).toBe(addDays(k, -1));
      }),
      { numRuns: 100 },
    );
  });

  it('dueDayKey(d) = d.toISOString().slice(0, 10)', () => {
    fc.assert(
      fc.property(arbInstant, (d) => {
        expect(dueDayKey(d)).toBe(d.toISOString().slice(0, 10));
      }),
      { numRuns: 100 },
    );
  });

  it('addDays(addDays(k, n), −n) = k', () => {
    fc.assert(
      fc.property(arbDayKey, fc.integer({ min: -400, max: 400 }), (k, n) => {
        expect(addDays(addDays(k, n), -n)).toBe(k);
      }),
      { numRuns: 100 },
    );
  });
});

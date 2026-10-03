import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { CADASTRAL_FIELDS, mergeCompanyFields } from '@/lib/leads/dedup';

/** Vazio: nulo/ausente, string só com espaços ou número não finito. */
const isEmpty = (v: unknown) =>
  v === null ||
  v === undefined ||
  (typeof v === 'string' && v.trim() === '') ||
  (typeof v === 'number' && !Number.isFinite(v));

const PROTECTED_FIELDS = ['assignedTo', 'createdAt', 'googlePlaceId', 'osmId', 'cnpj', 'id'] as const;

const arbText = fc.oneof(
  fc.constantFrom<string | null>(null, '', '   ', 'A', 'B'),
  fc.string({ maxLength: 6 }),
);
const arbNum = fc.oneof(
  fc.constantFrom<number | null>(null, Number.NaN, Infinity, 0, -23.5),
  fc.double({ min: -90, max: 90, noNaN: true }),
);

const fieldArbs: Record<string, fc.Arbitrary<unknown>> = {};
for (const f of CADASTRAL_FIELDS) fieldArbs[f] = f === 'latitude' || f === 'longitude' ? arbNum : arbText;
fieldArbs.assignedTo = arbText;
fieldArbs.createdAt = fc.constantFrom(new Date(0), new Date(1_000), null);
fieldArbs.googlePlaceId = arbText;
fieldArbs.osmId = arbText;
fieldArbs.cnpj = arbText;
fieldArbs.id = fc.constantFrom('c1', 'c2');

const arbCurrent = fc.record(fieldArbs) as fc.Arbitrary<Record<string, unknown>>;
/** Dados recebidos: qualquer subconjunto dos campos (ausentes = não enviados). */
const arbIncoming = fc.record(fieldArbs, { requiredKeys: [] }) as fc.Arbitrary<Record<string, unknown>>;

describe('mergeCompanyFields', () => {
  // Feature: lead-miner, Property 23: Mescla de campos cadastrais
  // **Validates: Requirements 9.4**
  it('patch só com campos cadastrais; recebido não vazio vence, vazio mantém o atual', () => {
    fc.assert(
      fc.property(arbCurrent, arbIncoming, (current, incoming) => {
        const patch = mergeCompanyFields(current, incoming);
        const cadastral = new Set<string>(CADASTRAL_FIELDS);

        for (const k of Object.keys(patch)) expect(cadastral.has(k)).toBe(true);
        for (const k of PROTECTED_FIELDS) expect(Object.prototype.hasOwnProperty.call(patch, k)).toBe(false);

        const result = { ...current, ...patch };
        for (const f of CADASTRAL_FIELDS) {
          const sent = Object.prototype.hasOwnProperty.call(incoming, f) && !isEmpty(incoming[f]);
          expect(Object.is(result[f], sent ? incoming[f] : current[f])).toBe(true);
        }
      }),
      { numRuns: 100 },
    );
  });
});

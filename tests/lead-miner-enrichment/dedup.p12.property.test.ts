// Feature: lead-miner-enrichment, Property 12: Fonte derivada das origens e identificadores — effectiveSource devolve GOOGLE se todas as origens são GOOGLE, OSM se todas são OSM, MISTA caso contrário (vazio → OSM); companySource devolve MISTA ⇔ Place_ID (próprio ou alias) e osmId (próprio ou alias), GOOGLE ⇔ só Place_ID, OSM ⇔ só osmId (ou nenhum).
/**
 * **Validates: Requirements 4.7, 5.4**
 */
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { companySource, effectiveSource } from '@/lib/leads/dedup';
import type { SourceMode } from '@/lib/leads/types';

const arbOrigem: fc.Arbitrary<SourceMode> = fc.constantFrom('GOOGLE', 'OSM', 'MISTA');

/** Identificador preenchido (não vazio após trim). */
const arbFilled = fc
  .tuple(fc.constantFrom('', ' ', '  '), fc.stringMatching(/^[A-Za-z0-9/_-]{1,16}$/), fc.constantFrom('', ' '))
  .map(([a, b, c]) => `${a}${b}${c}`);
/** Identificador vazio: null, '' ou só espaços. */
const arbBlank = fc.constantFrom<string | null>(null, '', ' ', '   ');

/** Campo + lista de aliases com presença controlada. */
function arbIdent(present: boolean) {
  if (!present) {
    return fc.record({
      own: arbBlank,
      aliases: fc.option(fc.array(arbBlank.map((v) => v ?? ''), { maxLength: 3 }), { nil: undefined }),
    });
  }
  return fc.oneof(
    // Próprio preenchido; aliases quaisquer.
    fc.record({
      own: arbFilled as fc.Arbitrary<string | null>,
      aliases: fc.option(fc.array(fc.oneof(arbFilled, arbBlank.map((v) => v ?? '')), { maxLength: 3 }), {
        nil: undefined,
      }),
    }),
    // Próprio vazio; ao menos um alias preenchido.
    fc.record({
      own: arbBlank,
      aliases: fc
        .tuple(fc.array(arbBlank.map((v) => v ?? ''), { maxLength: 2 }), arbFilled)
        .map(([blanks, f]) => [...blanks, f]) as fc.Arbitrary<string[] | undefined>,
    }),
  );
}

describe('Property 12: Fonte derivada das origens e identificadores', () => {
  it('effectiveSource: GOOGLE/OSM se unânime, MISTA caso contrário, vazio → OSM', () => {
    fc.assert(
      fc.property(fc.array(arbOrigem, { maxLength: 12 }), (origens) => {
        const expected: SourceMode =
          origens.length === 0
            ? 'OSM'
            : origens.every((o) => o === 'GOOGLE')
              ? 'GOOGLE'
              : origens.every((o) => o === 'OSM')
                ? 'OSM'
                : 'MISTA';
        expect(effectiveSource(origens)).toBe(expected);
        // Aceita qualquer Iterable (ex.: Set) com o mesmo resultado.
        expect(effectiveSource(new Set(origens))).toBe(expected);
      }),
      { numRuns: 200 },
    );
  });

  it('companySource: MISTA ⇔ Place_ID e osmId; GOOGLE ⇔ só Place_ID; OSM caso contrário', () => {
    const arbCase = fc
      .tuple(fc.boolean(), fc.boolean())
      .chain(([hasGoogle, hasOsm]) =>
        fc.record({
          hasGoogle: fc.constant(hasGoogle),
          hasOsm: fc.constant(hasOsm),
          google: arbIdent(hasGoogle),
          osm: arbIdent(hasOsm),
        }),
      );
    fc.assert(
      fc.property(arbCase, ({ hasGoogle, hasOsm, google, osm }) => {
        const c = {
          googlePlaceId: google.own,
          googleAliases: google.aliases,
          osmId: osm.own,
          aliases: osm.aliases,
        };
        const expected: SourceMode = hasGoogle && hasOsm ? 'MISTA' : hasGoogle ? 'GOOGLE' : 'OSM';
        expect(companySource(c)).toBe(expected);
      }),
      { numRuns: 200 },
    );
  });
});

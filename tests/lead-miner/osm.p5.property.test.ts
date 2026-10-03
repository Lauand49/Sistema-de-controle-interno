// Feature: lead-miner, Property 5: For any coleção de listas de empresas por nicho, mergeByOsmId produz uma lista sem osmId repetido, cujo conjunto de osmId é a união das entradas e em que cada empresa carrega o nicho da primeira lista em que apareceu; e, com "excluir redes" marcado, o filtro remove exatamente as empresas com marcaRede não vazio.
/**
 * **Validates: Requirements 2.9, 2.12**
 */
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { excludeChains, mergeByOsmId } from '@/lib/leads/sources/osm';
import type { FoundCompany } from '@/lib/leads/types';

/** osmIds de um conjunto pequeno para forçar repetições entre nichos. */
const arbOsmId = fc
  .tuple(fc.constantFrom('node', 'way', 'relation'), fc.integer({ min: 1, max: 8 }))
  .map(([t, id]) => `${t}/${id}`);

const arbCompany = (nicho: string): fc.Arbitrary<FoundCompany> =>
  fc.record({
    osmId: arbOsmId,
    nome: fc.string({ minLength: 1, maxLength: 10 }),
    nicho: fc.constant(nicho),
    endereco: fc.constant(null),
    bairro: fc.constant(null),
    cidade: fc.constant(null),
    uf: fc.constant(null),
    telefone: fc.constant(null),
    website: fc.constant(null),
    latitude: fc.constant(null),
    longitude: fc.constant(null),
    marcaRede: fc.option(fc.oneof(fc.string({ maxLength: 8 }), fc.constantFrom(' ', '\t')), { nil: null }),
  });

/** Uma lista por nicho; dentro de uma lista, osmIds únicos (como no Overpass). */
const arbPerNiche: fc.Arbitrary<FoundCompany[][]> = fc
  .integer({ min: 0, max: 5 })
  .chain((n) =>
    fc.tuple(
      ...Array.from({ length: n }, (_, i) =>
        fc.uniqueArray(arbCompany(`nicho_${i}`), { maxLength: 8, selector: (c) => c.osmId }),
      ),
    ),
  );

describe('Property 5: Pré-processamento dos resultados da descoberta', () => {
  it('mergeByOsmId: sem repetição, união das entradas, primeiro nicho vence', () => {
    fc.assert(
      fc.property(arbPerNiche, (perNiche) => {
        const merged = mergeByOsmId(perNiche);
        const ids = merged.map((c) => c.osmId);
        expect(new Set(ids).size).toBe(ids.length);
        expect(new Set(ids)).toEqual(new Set(perNiche.flat().map((c) => c.osmId)));
        for (const c of merged) {
          const first = perNiche.flat().find((x) => x.osmId === c.osmId)!;
          expect(c).toBe(first);
          expect(c.nicho).toBe(first.nicho);
        }
      }),
      { numRuns: 100 },
    );
  });

  it('excludeChains remove exatamente as empresas com marcaRede não vazio', () => {
    fc.assert(
      fc.property(arbPerNiche, (perNiche) => {
        const merged = mergeByOsmId(perNiche);
        const kept = excludeChains(merged);
        const isChain = (c: FoundCompany) => c.marcaRede !== null && c.marcaRede.trim() !== '';
        expect(kept).toEqual(merged.filter((c) => !isChain(c)));
      }),
      { numRuns: 100 },
    );
  });
});

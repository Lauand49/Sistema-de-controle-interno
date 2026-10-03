// Feature: lead-miner-enrichment, Property 15: Idempotência da ingestão combinada — para qualquer base inicial e lista intercalada de lugares do Google e elementos do OSM, ingerir a lista duas vezes (ingestSourcesInMemory) produz as mesmas Empresas (identificadores, campos próprios, fonte), aliases e Vinculos_Mineracao (isNew, origem) que ingeri-la uma vez.
/**
 * **Validates: Requirements 5.6**
 */
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { ingestSourcesInMemory, type InMemoryBase, type SourceItem } from '@/lib/leads/dedup';
import type { FoundCompany, GooglePlace } from '@/lib/leads/types';

const DAY_MS = 24 * 60 * 60 * 1000;
const NOW = new Date('2025-06-15T12:00:00.000Z');
const RUN = 'run-1';

// Pools pequenos para forçar colisões de nomes e proximidade.
const arbNome = fc.constantFrom('Padaria Central', 'padaria central', 'Pet Shop Amigo', 'Café São José', '', ' ');
const arbNullableText = fc.option(fc.constantFrom('Rua A, 10', 'Centro', '', ' ', '11 99999-0000', 'https://ex.com'), {
  nil: null,
});
/** Coordenadas próximas (deslocamentos em torno do limite de 100 m) ou ausentes/inválidas. */
const arbCoords: fc.Arbitrary<[number | null, number | null]> = fc.oneof(
  { weight: 4, arbitrary: fc.constantFrom(0, 0.0004, 0.0008, 0.0009, 0.002).map((d): [number, number] => [-23.55 + d, -46.63]) },
  { weight: 1, arbitrary: fc.constant<[number | null, number | null]>([null, null]) },
  { weight: 1, arbitrary: fc.constant<[number | null, number | null]>([999, -46.63]) },
);
const arbNicho = fc.constantFrom('padaria', 'pet shop');

/** Dados de um elemento OSM (sem osmId/nicho). */
const arbOsmData = fc
  .record({
    nome: arbNome,
    endereco: arbNullableText,
    bairro: arbNullableText,
    cidade: fc.option(fc.constantFrom('São Paulo', ''), { nil: null }),
    uf: fc.option(fc.constantFrom('SP', ''), { nil: null }),
    telefone: arbNullableText,
    website: arbNullableText,
    coords: arbCoords,
    marcaRede: fc.option(fc.constantFrom('Rede X', ''), { nil: null }),
  })
  .map(({ coords, ...r }) => ({ ...r, latitude: coords[0], longitude: coords[1] }));

/** Dados de um lugar do Google (sem placeId/nicho). */
const arbPlaceData = fc
  .record({
    nome: arbNome,
    endereco: arbNullableText,
    bairro: arbNullableText,
    cidade: fc.option(fc.constantFrom('São Paulo', ''), { nil: null }),
    uf: fc.option(fc.constantFrom('SP', ''), { nil: null }),
    telefone: arbNullableText,
    website: arbNullableText,
    coords: arbCoords,
    mapsUri: fc.option(fc.constant('https://maps.google.com/?cid=1'), { nil: null }),
    businessStatus: fc.option(fc.constantFrom('OPERATIONAL', 'CLOSED_TEMPORARILY'), { nil: null }),
    tipos: fc.array(fc.constantFrom('bakery', 'store', 'pet_store'), { maxLength: 2 }),
  })
  .map(({ coords, ...r }) => ({ ...r, latitude: coords[0], longitude: coords[1] }));

/**
 * Resultado combinado realista de uma Mineracao: cada elemento OSM tem `osmId` não vazio e
 * cada lugar do Google tem Place_ID não vazio (o adaptador descarta lugares sem id); o mesmo
 * elemento/lugar pode reaparecer (ex.: em outro Nicho) com os mesmos dados, intercalado
 * com a outra fonte.
 */
const arbItems: fc.Arbitrary<SourceItem[]> = fc
  .record({
    osm: fc.array(arbOsmData, { maxLength: 4 }),
    google: fc.array(arbPlaceData, { maxLength: 4 }),
  })
  .chain(({ osm, google }) => {
    const total = osm.length + google.length;
    if (total === 0) return fc.constant<SourceItem[]>([]);
    return fc
      .array(fc.record({ idx: fc.nat({ max: total - 1 }), nicho: arbNicho }), { maxLength: 10 })
      .map((picks) =>
        picks.map(({ idx, nicho }): SourceItem => {
          if (idx < osm.length) {
            const found: FoundCompany = { ...osm[idx], osmId: `node/${idx + 1}`, nicho };
            return { kind: 'OSM', found };
          }
          const g = idx - osm.length;
          const place: GooglePlace = { ...google[g], placeId: `ChIJ-${g + 1}`, nicho };
          return { kind: 'GOOGLE', place };
        }),
      );
  });

/**
 * Base inicial realista: resultado de uma ingestão anterior (outra Mineracao ou a mesma,
 * retomada), em um instante cujo Cache_Google pode estar válido ou já expirado em NOW.
 */
const arbBase: fc.Arbitrary<InMemoryBase> = fc
  .record({
    prior: arbItems,
    priorRun: fc.constantFrom('run-0', RUN),
    ageDays: fc.constantFrom(0, 1, 29, 31, 60),
  })
  .map(({ prior, priorRun, ageDays }) =>
    ingestSourcesInMemory(
      { companies: [], links: [] },
      prior,
      priorRun,
      new Date(NOW.getTime() - ageDays * DAY_MS),
    ),
  );

/** Forma canônica (conjuntos ordenados) para comparar bases. */
function canonical(base: InMemoryBase) {
  return {
    companies: [...base.companies].sort((a, b) => a.id.localeCompare(b.id)),
    links: [...base.links].sort((a, b) =>
      `${a.runId}|${a.companyId}`.localeCompare(`${b.runId}|${b.companyId}`),
    ),
  };
}

describe('Property 15: Idempotência da ingestão combinada', () => {
  it('ingerir a mesma lista Google + OSM duas vezes equivale a ingeri-la uma vez', () => {
    fc.assert(
      fc.property(arbBase, arbItems, (base, items) => {
        const once = ingestSourcesInMemory(base, items, RUN, NOW);
        const twice = ingestSourcesInMemory(once, items, RUN, NOW);
        expect(canonical(twice)).toEqual(canonical(once));
        // Vínculo único por par (runId, companyId).
        const pairs = once.links.map((l) => `${l.runId}|${l.companyId}`);
        expect(new Set(pairs).size).toBe(pairs.length);
      }),
      { numRuns: 300 },
    );
  });
});

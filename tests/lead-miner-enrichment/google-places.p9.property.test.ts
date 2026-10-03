/**
 * **Validates: Requirements 3.6, 3.9**
 */
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { detectGoogleChains, mergeByPlaceId } from '@/lib/leads/sources/google-places';
import type { GooglePlace } from '@/lib/leads/types';
// Feature: lead-miner-enrichment, Property 9: For any lista de resultados por Nicho, mergeByPlaceId contém cada Place_ID uma única vez, associado ao primeiro Nicho que o retornou e na ordem da primeira ocorrência; e for any multiconjunto de pares (Place_ID, Nome_Normalizado), detectGoogleChains devolve exatamente os Place_IDs cujo Nome_Normalizado não vazio aparece em 3 ou mais Place_IDs distintos.

// Pool pequeno de ids/nomes para forçar repetições entre Nichos.
const arbPlaceId = fc.constantFrom('p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7', 'p8');
const arbNome = fc.constantFrom('', 'padaria pao', 'mercado sol', 'farmacia vida', 'bar ze');

function place(placeId: string, nicho: string, idx: number): GooglePlace {
  return {
    placeId,
    nome: `Lugar ${placeId}`,
    nicho,
    endereco: `Rua ${idx}`, // marca a ocorrência específica
    bairro: null,
    cidade: null,
    uf: null,
    telefone: null,
    website: null,
    latitude: null,
    longitude: null,
    mapsUri: null,
    businessStatus: 'OPERATIONAL',
    tipos: [],
  };
}

const arbPerNiche: fc.Arbitrary<GooglePlace[][]> = fc
  .array(fc.array(arbPlaceId, { maxLength: 8 }), { maxLength: 5 })
  .map((lists) => {
    let idx = 0;
    return lists.map((ids, n) => ids.map((id) => place(id, `nicho${n}`, idx++)));
  });

describe('Property 9: Pré-processamento dos lugares do Google', () => {
  it('mergeByPlaceId: cada Place_ID uma vez, 1ª ocorrência vence, ordem preservada', () => {
    fc.assert(
      fc.property(arbPerNiche, (perNiche) => {
        // Modelo de referência: primeira ocorrência na ordem achatada.
        const flat = perNiche.flat();
        const expected = flat.filter((p, i) => flat.findIndex((q) => q.placeId === p.placeId) === i);
        const out = mergeByPlaceId(perNiche);

        expect(out).toEqual(expected);
        expect(new Set(out.map((p) => p.placeId)).size).toBe(out.length);
        // Cobertura: todo Place_ID de entrada aparece na saída.
        expect(new Set(out.map((p) => p.placeId))).toEqual(new Set(flat.map((p) => p.placeId)));
        // Associado ao primeiro Nicho que o retornou.
        for (const p of out) {
          const firstNiche = perNiche.findIndex((list) => list.some((q) => q.placeId === p.placeId));
          expect(p.nicho).toBe(`nicho${firstNiche}`);
        }
      }),
      { numRuns: 200 },
    );
  });

  it('detectGoogleChains: exatamente os ids cujo nome não vazio aparece em ≥ 3 ids distintos', () => {
    const arbEntries = fc.array(fc.record({ placeId: arbPlaceId, nomeNormalizado: arbNome }), { maxLength: 30 });
    fc.assert(
      fc.property(arbEntries, (entries) => {
        const idsByName = new Map<string, Set<string>>();
        for (const e of entries) {
          if (e.nomeNormalizado === '') continue;
          const s = idsByName.get(e.nomeNormalizado) ?? new Set<string>();
          s.add(e.placeId);
          idsByName.set(e.nomeNormalizado, s);
        }
        const expected = new Set<string>();
        for (const e of entries) {
          if (e.nomeNormalizado !== '' && idsByName.get(e.nomeNormalizado)!.size >= 3) expected.add(e.placeId);
        }
        expect(detectGoogleChains(entries)).toEqual(expected);
      }),
      { numRuns: 200 },
    );
  });
});

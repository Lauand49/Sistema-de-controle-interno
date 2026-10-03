// Feature: lead-miner, Property 4: For any elemento Overpass gerado com qualquer subconjunto das tags conhecidas, mapElement retorna null se e somente se o name está ausente ou vazio após trim; caso contrário, cada campo de FoundCompany é igual ao valor da tag correspondente (ou null se a tag não existe) e osmId é "{type}/{id}".
/**
 * **Validates: Requirements 2.5, 2.6**
 */
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { mapElement } from '@/lib/leads/sources/osm';
import { arbOverpassElement } from './support/fake-osm';

/** Valor da tag após trim; ausente ou em branco → null. */
function tagOf(tags: Record<string, string> | undefined, key: string): string | null {
  const v = tags?.[key]?.trim();
  return v ? v : null;
}

describe('Property 4: Mapeamento de elementos OSM', () => {
  it('descarta sem nome e mapeia cada campo a partir da tag correspondente', () => {
    fc.assert(
      fc.property(arbOverpassElement, fc.string({ minLength: 1, maxLength: 20 }), (el, nicheId) => {
        const result = mapElement(el, nicheId);
        const t = el.tags;
        const nome = tagOf(t, 'name');
        if (nome === null) {
          expect(result).toBeNull();
          return;
        }
        const street = tagOf(t, 'addr:street');
        const number = tagOf(t, 'addr:housenumber');
        const lat = el.lat ?? el.center?.lat ?? null;
        const lon = el.lon ?? el.center?.lon ?? null;
        expect(result).toEqual({
          osmId: `${el.type}/${el.id}`,
          nome,
          nicho: nicheId,
          endereco: street === null ? null : number === null ? street : `${street}, ${number}`,
          bairro: tagOf(t, 'addr:suburb'),
          cidade: tagOf(t, 'addr:city'),
          uf: tagOf(t, 'addr:state'),
          telefone: tagOf(t, 'phone') ?? tagOf(t, 'contact:phone'),
          website: tagOf(t, 'website') ?? tagOf(t, 'contact:website'),
          latitude: lat,
          longitude: lon,
          marcaRede: tagOf(t, 'brand'),
          instagramOsm: null,
          whatsappOsm: null,
        });
      }),
      { numRuns: 100 },
    );
  });
});

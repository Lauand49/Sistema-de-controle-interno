/**
 * Mudanças da Etapa 3 em `lib/leads/sources/osm.ts` (Req. 3.1, 8.5):
 * - `geocode` preserva o `bbox` do Nominatim para relation/way/node;
 * - `mapElement` mapeia e normaliza as tags de contato (Instagram/WhatsApp).
 * Os testes da Etapa 1 (`tests/lead-miner/osm*.test.ts`) continuam valendo e rodam no `npm test`.
 */
import { describe, expect, it } from 'vitest';
import {
  RELATION_AREA_OFFSET,
  WAY_AREA_OFFSET,
  geocode,
  mapElement,
  type HttpJsonClient,
  type OsmDeps,
  type OverpassElement,
} from '@/lib/leads/sources/osm';
import type { RateLimiter } from '@/lib/leads/sources/rate-limit';

/** Limitador que executa imediatamente (sem espera real). */
const immediateLimiter: RateLimiter = { schedule: (fn) => fn() };

function depsReturning(body: unknown): OsmDeps {
  const http: HttpJsonClient = { getJson: async () => body };
  return { http, limiter: immediateLimiter, sleep: async () => {} };
}

// boundingbox do Nominatim = [south, north, west, east]
const BB = ['-23.60', '-23.50', '-46.70', '-46.60'];
const EXPECTED_BBOX = { south: -23.6, north: -23.5, west: -46.7, east: -46.6 };

describe('geocode: bbox do Nominatim (Req. 3.1)', () => {
  it('relation → área com bbox', async () => {
    const r = await geocode('Vila Mariana', 'São Paulo', 'SP', depsReturning([
      { osm_type: 'relation', osm_id: 123, boundingbox: BB },
    ]));
    expect(r).toEqual({ ok: true, area: { kind: 'area', areaId: RELATION_AREA_OFFSET + 123, bbox: EXPECTED_BBOX } });
  });

  it('way → área com bbox', async () => {
    const r = await geocode('Centro', 'Santos', 'SP', depsReturning([
      { osm_type: 'way', osm_id: '456', boundingbox: BB },
    ]));
    expect(r).toEqual({ ok: true, area: { kind: 'area', areaId: WAY_AREA_OFFSET + 456, bbox: EXPECTED_BBOX } });
  });

  it('node → retângulo do próprio bbox', async () => {
    const r = await geocode('Centro', 'Diadema', 'SP', depsReturning([
      { osm_type: 'node', osm_id: 789, boundingbox: BB },
    ]));
    expect(r).toEqual({ ok: true, area: { kind: 'bbox', ...EXPECTED_BBOX } });
  });

  it('relation sem boundingbox válido → área sem bbox (compatível com a Etapa 1)', async () => {
    const r = await geocode('X', 'Y', 'SP', depsReturning([
      { osm_type: 'relation', osm_id: 1, boundingbox: ['a', 'b'] },
    ]));
    expect(r).toEqual({ ok: true, area: { kind: 'area', areaId: RELATION_AREA_OFFSET + 1 } });
  });
});

describe('mapElement: tags de contato (Req. 8.5)', () => {
  const base = (tags: Record<string, string>): OverpassElement => ({
    type: 'node',
    id: 10,
    lat: -23.5,
    lon: -46.6,
    tags: { name: 'Clínica Exemplo', ...tags },
  });

  it('normaliza contact:instagram (URL) e contact:whatsapp (número formatado)', () => {
    const c = mapElement(base({
      'contact:instagram': 'https://www.instagram.com/clinica.exemplo/',
      'contact:whatsapp': '+55 (11) 98765-4321',
    }), 'saude');
    expect(c?.instagramOsm).toBe('clinica.exemplo');
    expect(c?.whatsappOsm).toBe('5511987654321');
  });

  it('usa as tags alternativas instagram/whatsapp e adiciona DDI 55', () => {
    const c = mapElement(base({ instagram: '@clinica_ex', whatsapp: '(11) 3333-4444' }), 'saude');
    expect(c?.instagramOsm).toBe('clinica_ex');
    expect(c?.whatsappOsm).toBe('551133334444');
  });

  it('contact:* tem precedência sobre a tag sem prefixo', () => {
    const c = mapElement(base({ 'contact:instagram': 'primeiro', instagram: 'segundo' }), 'saude');
    expect(c?.instagramOsm).toBe('primeiro');
  });

  it('sem tags de contato ou com valores inválidos → null', () => {
    expect(mapElement(base({}), 'saude')).toMatchObject({ instagramOsm: null, whatsappOsm: null });
    expect(mapElement(base({ 'contact:whatsapp': '123' }), 'saude')?.whatsappOsm).toBeNull();
  });
});

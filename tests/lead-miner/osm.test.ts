import { describe, expect, it } from 'vitest';
import { NICHES, OSM_USER_AGENT } from '@/lib/leads/config';
import {
  OVERPASS_URL,
  buildOverpassQuery,
  excludeChains,
  geocode,
  mapElement,
  searchNiche,
  type OsmDeps,
} from '@/lib/leads/sources/osm';
import { countingLimiter, fakeHttpJson, fakeSleep, type FakeHttpJson } from './support/fake-osm';

function deps(http: FakeHttpJson) {
  const limiter = countingLimiter();
  const s = fakeSleep();
  const d: OsmDeps = { http, limiter, sleep: s.sleep };
  return { d, limiter, sleeps: s.sleeps };
}

const dentist = NICHES.find((n) => n.id === 'clinica_odontologica')!;

describe('geocode', () => {
  it('relation → area 3600000000 + id, com URL codificada e User-Agent', async () => {
    const http = fakeHttpJson([[{ osm_type: 'relation', osm_id: 298285, boundingbox: ['0', '1', '0', '1'] }]]);
    const { d, limiter } = deps(http);
    const r = await geocode('Vila Mariana', 'São Paulo', 'SP', d);
    expect(r).toEqual({ ok: true, area: { kind: 'area', areaId: 3_600_298_285 } });
    expect(limiter.count).toBe(1);
    const url = new URL(http.calls[0].url);
    expect(url.searchParams.get('q')).toBe('Vila Mariana, São Paulo, SP');
    expect(url.searchParams.get('format')).toBe('jsonv2');
    expect(url.searchParams.get('limit')).toBe('1');
    expect(url.searchParams.get('countrycodes')).toBe('br');
    expect(http.calls[0].init.headers['User-Agent']).toBe(OSM_USER_AGENT);
    expect(http.calls[0].init.timeoutMs).toBe(15_000);
  });

  it('way → area 2400000000 + id', async () => {
    const { d } = deps(fakeHttpJson([[{ osm_type: 'way', osm_id: 42 }]]));
    expect(await geocode('B', 'C', 'SP', d)).toEqual({ ok: true, area: { kind: 'area', areaId: 2_400_000_042 } });
  });

  it('node → bbox do boundingbox [south, north, west, east]', async () => {
    const http = fakeHttpJson([[{ osm_type: 'node', osm_id: 7, boundingbox: ['-23.6', '-23.5', '-46.7', '-46.6'] }]]);
    const { d } = deps(http);
    expect(await geocode('B', 'C', 'SP', d)).toEqual({
      ok: true,
      area: { kind: 'bbox', south: -23.6, north: -23.5, west: -46.7, east: -46.6 },
    });
  });

  it('sem resultado → NAO_ENCONTRADO, sem retentar e sem chamar o Overpass', async () => {
    const http = fakeHttpJson([[]]);
    const { d, sleeps } = deps(http);
    expect(await geocode('X', 'Y', 'SP', d)).toEqual({ ok: false, reason: 'NAO_ENCONTRADO' });
    expect(http.calls).toHaveLength(1);
    expect(sleeps).toEqual([]);
    expect(http.calls.some((c) => c.url.startsWith(OVERPASS_URL))).toBe(false);
  });

  it('indisponível após 3 tentativas → INDISPONIVEL, com esperas 2 s/4 s e limitador em todas', async () => {
    const http = fakeHttpJson([new Error('503'), new Error('timeout'), new Error('503')]);
    const { d, sleeps, limiter } = deps(http);
    expect(await geocode('X', 'Y', 'SP', d)).toEqual({ ok: false, reason: 'INDISPONIVEL' });
    expect(http.calls).toHaveLength(3);
    expect(sleeps).toEqual([2000, 4000]);
    expect(limiter.count).toBe(3);
    for (const c of http.calls) expect(c.init.headers['User-Agent']).toBe(OSM_USER_AGENT);
  });

  it('recupera na segunda tentativa', async () => {
    const http = fakeHttpJson([new Error('503'), [{ osm_type: 'relation', osm_id: 1 }]]);
    const { d, sleeps } = deps(http);
    expect(await geocode('X', 'Y', 'SP', d)).toEqual({ ok: true, area: { kind: 'area', areaId: 3_600_000_001 } });
    expect(sleeps).toEqual([2000]);
  });
});

describe('buildOverpassQuery', () => {
  it('usa area(id:N) e as tags do nicho', () => {
    const q = buildOverpassQuery(NICHES.find((n) => n.id === 'clinica_medica')!, { kind: 'area', areaId: 3_600_000_001 });
    expect(q).toContain('[out:json][timeout:55];');
    expect(q).toContain('area(id:3600000001)->.a;');
    expect(q).toContain('nwr["amenity"="clinic"](area.a);');
    expect(q).toContain('nwr["healthcare"="clinic"](area.a);');
    expect(q).toContain('out center tags;');
  });

  it('usa filtro bbox (south,west,north,east)', () => {
    const q = buildOverpassQuery(dentist, { kind: 'bbox', south: -1, west: -2, north: 1, east: 2 });
    expect(q).toContain('nwr["amenity"="dentist"](-1,-2,1,2);');
    expect(q).not.toContain('area');
  });

  it('escapa aspas e barras invertidas dos valores de tag', () => {
    const niche = { ...dentist, tags: [{ key: 'na"me', value: 'a\\b"c' }] };
    const q = buildOverpassQuery(niche, { kind: 'area', areaId: 1 });
    expect(q).toContain('nwr["na\\"me"="a\\\\b\\"c"](area.a);');
  });
});

describe('mapElement', () => {
  it('mapeia tags, center e osmId', () => {
    const c = mapElement(
      {
        type: 'way',
        id: 99,
        center: { lat: -23.5, lon: -46.6 },
        tags: {
          name: '  Clínica Sorriso ',
          'addr:street': 'Rua A',
          'addr:housenumber': '10',
          'addr:city': 'São Paulo',
          'contact:phone': '+55 11 9999-0000',
          'contact:website': 'sorriso.com.br',
          brand: 'Rede X',
        },
      },
      'clinica_odontologica',
    );
    expect(c).toEqual({
      osmId: 'way/99',
      nome: 'Clínica Sorriso',
      nicho: 'clinica_odontologica',
      endereco: 'Rua A, 10',
      bairro: null,
      cidade: 'São Paulo',
      uf: null,
      telefone: '+55 11 9999-0000',
      website: 'sorriso.com.br',
      latitude: -23.5,
      longitude: -46.6,
      marcaRede: 'Rede X',
    });
  });

  it('descarta elemento sem nome ou com nome em branco', () => {
    expect(mapElement({ type: 'node', id: 1 }, 'x')).toBeNull();
    expect(mapElement({ type: 'node', id: 1, tags: { name: '   ' } }, 'x')).toBeNull();
  });
});

describe('searchNiche', () => {
  it('POST ao Overpass com query codificada; ignora elementos sem nome', async () => {
    const http = fakeHttpJson([
      { elements: [{ type: 'node', id: 1, lat: 1, lon: 2, tags: { name: 'A' } }, { type: 'node', id: 2 }] },
    ]);
    const { d } = deps(http);
    const r = await searchNiche(dentist, { kind: 'area', areaId: 5 }, d);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.companies.map((c) => c.osmId)).toEqual(['node/1']);
    const call = http.calls[0];
    expect(call.url).toBe(OVERPASS_URL);
    expect(call.init.method).toBe('POST');
    expect(call.init.timeoutMs).toBe(60_000);
    expect(new URLSearchParams(call.init.body).get('data')).toBe(buildOverpassQuery(dentist, { kind: 'area', areaId: 5 }));
  });

  it('falha após 3 tentativas → { ok: false }', async () => {
    const http = fakeHttpJson([new Error('504'), new Error('504'), { nope: true }]);
    const { d, sleeps } = deps(http);
    expect(await searchNiche(dentist, { kind: 'area', areaId: 5 }, d)).toEqual({ ok: false });
    expect(sleeps).toEqual([2000, 4000]);
  });
});

describe('excludeChains', () => {
  it('remove somente empresas com marcaRede preenchido', () => {
    const base = mapElement({ type: 'node', id: 1, tags: { name: 'A' } }, 'x')!;
    const list = [base, { ...base, osmId: 'node/2', marcaRede: 'R' }, { ...base, osmId: 'node/3', marcaRede: ' ' }];
    expect(excludeChains(list).map((c) => c.osmId)).toEqual(['node/1', 'node/3']);
  });
});

/**
 * T2 — localidades no servidor: cidades do IBGE (URL oficial, parsing, cache, falhas), bairros do
 * OpenStreetMap (consulta Overpass, nomes únicos, cache) e o carregador com TTL. Offline.
 */
import { describe, expect, it, vi } from 'vitest';
import { createCachedLoader } from '@/lib/leads/ttl-cache';
import {
  CITIES_NEGATIVE_TTL_MS,
  CITIES_TTL_MS,
  bairrosQuerySchema,
  cidadesQuerySchema,
  createCitiesService,
  ibgeCitiesUrl,
  parseIbgeCities,
} from '@/lib/leads/localidades';
import {
  NEIGHBORHOODS_MAX,
  NEIGHBORHOODS_NEGATIVE_TTL_MS,
  buildNeighborhoodsQuery,
  createNeighborhoodsService,
  parseNeighborhoodNames,
} from '@/lib/leads/sources/osm-bairros';
import { NOMINATIM_SEARCH_URL, OVERPASS_URL, type OsmDeps } from '@/lib/leads/sources/osm';
import { MSG } from '@/lib/leads/filters';

describe('IBGE: URL e parsing', () => {
  it('usa a URL oficial de municípios por UF, ordenada por nome', () => {
    expect(ibgeCitiesUrl('SP')).toBe('https://servicodados.ibge.gov.br/api/v1/localidades/estados/SP/municipios?orderBy=nome');
  });

  it('descarta itens fora da forma, remove repetidos e ordena em pt-BR', () => {
    const json = [
      { id: 3, nome: 'Santos' },
      { id: 1, nome: 'Águas de Lindóia' },
      { id: 3, nome: 'Santos (repetido)' },
      { id: '9', nome: 'Id como texto' },
      { id: 4, nome: '   ' },
      { nome: 'Sem id' },
      null,
      'texto',
      { id: 2, nome: 'Bauru' },
    ];
    expect(parseIbgeCities(json)).toEqual([
      { id: 1, nome: 'Águas de Lindóia' },
      { id: 2, nome: 'Bauru' },
      { id: 3, nome: 'Santos' },
    ]);
    expect(parseIbgeCities({ erro: true })).toEqual([]);
  });
});

describe('createCitiesService', () => {
  const ok = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });
  const CITIES = [
    { id: 2, nome: 'Santos' },
    { id: 1, nome: 'Bauru' },
  ];

  it('busca uma vez e serve o resto do cache (TTL de 24 h)', async () => {
    let t = 0;
    const fetchFn = vi.fn(async () => ok(CITIES));
    const svc = createCitiesService({ fetchFn, now: () => t });

    const a = await svc.list('SP');
    const b = await svc.list('SP');
    expect(a).toEqual({ ok: true, items: [{ id: 1, nome: 'Bauru' }, { id: 2, nome: 'Santos' }] });
    expect(b).toEqual(a);
    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(fetchFn.mock.calls[0][0]).toBe(ibgeCitiesUrl('SP'));

    t = CITIES_TTL_MS + 1;
    await svc.list('SP');
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  it('UF inválida não consulta a rede', async () => {
    const fetchFn = vi.fn();
    const svc = createCitiesService({ fetchFn });
    for (const uf of ['sp', 'XX', '', '../etc', 'São Paulo']) expect(await svc.list(uf)).toEqual({ ok: false });
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it.each([
    ['HTTP 500', async () => new Response('erro', { status: 500 })],
    ['rede/timeout', async () => Promise.reject(new Error('timeout'))],
    ['lista vazia', async () => ok([])],
    ['corpo inesperado', async () => ok({ x: 1 })],
  ])('falha (%s) → ok:false, com cache negativo curto', async (_n, impl) => {
    let t = 0;
    const fetchFn = vi.fn(impl as () => Promise<Response>);
    const svc = createCitiesService({ fetchFn, now: () => t });

    expect(await svc.list('SP')).toEqual({ ok: false });
    expect(await svc.list('SP')).toEqual({ ok: false });
    expect(fetchFn).toHaveBeenCalledTimes(1); // não martela o IBGE

    t = CITIES_NEGATIVE_TTL_MS + 1;
    await svc.list('SP');
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  it('não repassa chaves nem cabeçalhos sensíveis ao IBGE', async () => {
    const fetchFn = vi.fn(async () => ok(CITIES));
    await createCitiesService({ fetchFn }).list('RJ');
    const init = fetchFn.mock.calls[0][1] as RequestInit;
    expect(Object.keys(init.headers as Record<string, string>)).toEqual(['accept']);
  });
});

describe('schemas das rotas (UF validada no servidor)', () => {
  it('aceita só as 27 UFs em maiúsculas', () => {
    expect(cidadesQuerySchema.safeParse({ uf: 'SP' }).success).toBe(true);
    for (const uf of ['sp', 'XX', '', 'BR', 'S P', undefined, 42]) {
      const r = cidadesQuerySchema.safeParse({ uf });
      expect(r.success).toBe(false);
      if (!r.success) expect(r.error.issues[0].message).toBe(MSG.uf);
    }
  });

  it('bairros exige UF e cidade não vazia (até 100 caracteres)', () => {
    expect(bairrosQuerySchema.safeParse({ uf: 'SP', cidade: '  Santos ' })).toMatchObject({
      success: true,
      data: { uf: 'SP', cidade: 'Santos' },
    });
    expect(bairrosQuerySchema.safeParse({ uf: 'SP', cidade: '   ' }).success).toBe(false);
    expect(bairrosQuerySchema.safeParse({ uf: 'SP', cidade: 'x'.repeat(101) }).success).toBe(false);
    expect(bairrosQuerySchema.safeParse({ uf: 'XX', cidade: 'Santos' }).success).toBe(false);
  });
});

describe('ttl-cache', () => {
  it('junta chamadas simultâneas da mesma chave e respeita o limite de entradas', async () => {
    const load = vi.fn(async (k: string) => ({ ok: true as const, value: k.toUpperCase() }));
    const get = createCachedLoader(load, { ttlMs: 1000, negativeTtlMs: 10, maxEntries: 2 });

    await Promise.all([get('a'), get('a'), get('a')]);
    expect(load).toHaveBeenCalledTimes(1);

    await get('b');
    await get('c'); // estoura: 'a' (a mais antiga) sai
    await get('a');
    expect(load).toHaveBeenCalledTimes(4);
  });

  it('exceção do carregador vira falha (nunca propaga)', async () => {
    const get = createCachedLoader(async () => Promise.reject(new Error('x')), { ttlMs: 1, negativeTtlMs: 1 });
    expect(await get('k')).toEqual({ ok: false });
  });
});

describe('OSM: bairros', () => {
  const relation = { osm_type: 'relation', osm_id: 298, boundingbox: ['-24.0', '-23.9', '-46.4', '-46.3'] };

  it('consulta place=suburb|neighbourhood|quarter dentro da área (ou do retângulo)', () => {
    const q = buildNeighborhoodsQuery({ kind: 'area', areaId: 3_600_000_298 });
    expect(q).toContain('area(id:3600000298)->.a;');
    expect(q).toContain('nwr["place"~"^(suburb|neighbourhood|quarter)$"]["name"](area.a);');
    expect(q).toContain('out tags;');

    const b = buildNeighborhoodsQuery({ kind: 'bbox', south: -24, west: -46.4, north: -23.9, east: -46.3 });
    expect(b).not.toContain('area(id:');
    expect(b).toContain('(-24,-46.4,-23.9,-46.3)');
  });

  it('nomes únicos sem acento/caixa, ordenados em pt-BR, sem itens inválidos', () => {
    const els = [
      { tags: { name: 'Vila Mariana' } },
      { tags: { name: 'vila mariana' } }, // repetido ignorando caixa
      { tags: { name: 'Água Branca' } },
      { tags: { name: 'Agua Branca' } }, // repetido ignorando acento
      { tags: { name: '  ' } },
      { tags: {} },
      { tags: { name: 'x'.repeat(101) } },
      { nome: 'sem tags' },
      null,
      { tags: { name: 'Centro' } },
    ];
    expect(parseNeighborhoodNames(els)).toEqual(['Água Branca', 'Centro', 'Vila Mariana']);
    expect(parseNeighborhoodNames('nada')).toEqual([]);
    const many = Array.from({ length: NEIGHBORHOODS_MAX + 50 }, (_, i) => ({ tags: { name: `Bairro ${i}` } }));
    expect(parseNeighborhoodNames(many)).toHaveLength(NEIGHBORHOODS_MAX);
  });

  function osmDeps(handlers: { nominatim?: () => unknown; overpass?: () => unknown }) {
    const calls = { nominatim: 0, overpass: 0, urls: [] as string[], scheduled: 0 };
    const deps: OsmDeps = {
      http: {
        getJson: vi.fn(async (url: string) => {
          calls.urls.push(url);
          if (url.startsWith(NOMINATIM_SEARCH_URL)) {
            calls.nominatim++;
            return (handlers.nominatim ?? (() => [relation]))();
          }
          if (url === OVERPASS_URL) {
            calls.overpass++;
            return (handlers.overpass ?? (() => ({ elements: [] })))();
          }
          throw new Error(`URL inesperada: ${url}`);
        }),
      },
      // O limitador real é injetado em produção; aqui só confirmamos que o Nominatim passa por ele.
      limiter: {
        schedule: async <T,>(fn: () => Promise<T>) => {
          calls.scheduled++;
          return fn();
        },
      },
      sleep: async () => undefined,
    };
    return { deps, calls };
  }

  it('geocodifica a cidade (pelo limitador) e lista os bairros do Overpass; segunda chamada vem do cache', async () => {
    const { deps, calls } = osmDeps({
      overpass: () => ({ elements: [{ tags: { name: 'Gonzaga' } }, { tags: { name: 'Boqueirão' } }] }),
    });
    const svc = createNeighborhoodsService(deps);

    const a = await svc.list('SP', 'Santos');
    const b = await svc.list('SP', 'SANTOS'); // mesma cidade ignorando caixa
    expect(a).toEqual({ ok: true, items: ['Boqueirão', 'Gonzaga'] });
    expect(b).toEqual(a);
    expect(calls.nominatim).toBe(1);
    expect(calls.overpass).toBe(1);
    expect(calls.scheduled).toBe(1); // Nominatim passou pelo limitador existente
    expect(new URL(calls.urls[0]).searchParams.get('q')).toBe('Santos, SP');
  });

  it('cidade desconhecida pelo Nominatim → lista vazia (digitação livre), sem consultar o Overpass', async () => {
    const { deps, calls } = osmDeps({ nominatim: () => [] });
    expect(await createNeighborhoodsService(deps).list('SP', 'Lugar Inexistente')).toEqual({ ok: true, items: [] });
    expect(calls.overpass).toBe(0);
  });

  it.each([
    ['Overpass fora', { overpass: () => Promise.reject(new Error('503')) }],
    ['Overpass sem "elements"', { overpass: () => ({ remark: 'erro' }) }],
    ['Nominatim fora', { nominatim: () => Promise.reject(new Error('timeout')) }],
  ])('%s → ok:false, com cache negativo', async (_n, handlers) => {
    let t = 0;
    const { deps, calls } = osmDeps(handlers as never);
    const svc = createNeighborhoodsService(deps, { now: () => t, sleep: undefined } as never);
    expect(await svc.list('SP', 'Santos')).toEqual({ ok: false });
    const before = calls.nominatim + calls.overpass;
    expect(await svc.list('SP', 'Santos')).toEqual({ ok: false });
    expect(calls.nominatim + calls.overpass).toBe(before); // não repete dentro do TTL negativo

    t = NEIGHBORHOODS_NEGATIVE_TTL_MS + 1;
    await svc.list('SP', 'Santos');
    expect(calls.nominatim + calls.overpass).toBeGreaterThan(before);
  });
});

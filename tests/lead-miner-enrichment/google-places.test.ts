/**
 * Testes de exemplo da Fonte_Google (`lib/leads/sources/google-places.ts`).
 * Req. 3.2, 3.3, 3.5, 3.7, 3.8, 2.4, 2.5, 21.2.
 *
 * `searchGooglePage` cobre uma página; o encadeamento de até GOOGLE_MAX_PAGES páginas fica
 * nos testes do pipeline. Aqui conferimos o pageToken no corpo e a constante.
 */
import { describe, expect, it } from 'vitest';
import { GOOGLE_MAX_PAGES, NICHES, PLACES_TIMEOUT_MS } from '@/lib/leads/config';
import {
  DETAILS_FIELD_MASK,
  SEARCH_FIELD_MASK,
  SEARCH_TEXT_PATH,
  fetchPlaceDetails,
  placeDetailsPath,
  searchGooglePage,
  type GooglePlacesDeps,
  type Rect,
  type RunPlace,
} from '@/lib/leads/sources/google-places';
import { fakePlaces, rawPlace, searchPage, type FakePlaces } from './support/fake-places';
import { memoryUsageGate, type MemoryUsageGate, type UsageCounts } from './support/fake-usage';
import type { ScriptStep } from './support/scripted';
import type { PlacesRequest } from '@/lib/leads/sources/google-places';

const NOW = new Date('2025-05-15T12:00:00Z');
const MONTH = '2025-05';
const niche = NICHES[0];
const run: RunPlace = { bairro: 'Vila Mariana', cidade: 'São Paulo', uf: 'SP' };
const rect: Rect = {
  low: { latitude: -23.6, longitude: -46.65 },
  high: { latitude: -23.57, longitude: -46.62 },
};

function setup(
  script: ReadonlyArray<ScriptStep<PlacesRequest>>,
  opts: { initial?: UsageCounts; limit?: number } = {},
) {
  const log: string[] = [];
  const sleeps: number[] = [];
  const http: FakePlaces = fakePlaces(script, { log });
  const usage: MemoryUsageGate = memoryUsageGate(opts.initial ?? {}, log);
  const deps: GooglePlacesDeps = {
    http,
    usage,
    limit: opts.limit ?? 1_000,
    now: () => NOW,
    sleep: async (ms) => {
      sleeps.push(ms);
    },
  };
  return { http, usage, deps, log, sleeps };
}

describe('searchGooglePage', () => {
  it('envia a máscara de campos e o timeout em toda tentativa (Req. 3.2)', async () => {
    const { http, deps } = setup([{ status: 503 }, { status: 429 }, searchPage([rawPlace()])]);
    const out = await searchGooglePage(niche, run, rect, null, deps);
    expect(out.ok).toBe(true);
    expect(http.calls).toHaveLength(3);
    for (const c of http.calls) {
      expect(c.method).toBe('POST');
      expect(c.path).toBe(SEARCH_TEXT_PATH);
      expect(c.fieldMask).toBe(SEARCH_FIELD_MASK);
      expect(c.timeoutMs).toBe(PLACES_TIMEOUT_MS);
    }
    expect(SEARCH_FIELD_MASK).toContain('nextPageToken');
  });

  it('repassa o pageToken no corpo e devolve o próximo; limite de 3 páginas (Req. 3.3)', async () => {
    expect(GOOGLE_MAX_PAGES).toBe(3);
    const { http, deps } = setup([searchPage([rawPlace()], 'tok-2'), searchPage([rawPlace({ id: 'p2' })])]);

    const first = await searchGooglePage(niche, run, rect, null, deps);
    expect(first).toMatchObject({ ok: true, nextPageToken: 'tok-2' });
    expect((http.calls[0].body as Record<string, unknown>).pageToken).toBeUndefined();

    const second = await searchGooglePage(niche, run, rect, 'tok-2', deps);
    expect(second).toMatchObject({ ok: true, nextPageToken: null });
    expect((http.calls[1].body as Record<string, unknown>).pageToken).toBe('tok-2');
  });

  it('descarta CLOSED_PERMANENTLY e nome vazio (Req. 3.5)', async () => {
    const { deps } = setup([
      searchPage([
        rawPlace({ id: 'ok' }),
        rawPlace({ id: 'fechado', businessStatus: 'CLOSED_PERMANENTLY' }),
        rawPlace({ id: 'sem-nome', displayName: { text: '   ' } }),
        rawPlace({ id: 'temp', businessStatus: 'CLOSED_TEMPORARILY' }),
      ]),
    ]);
    const out = await searchGooglePage(niche, run, rect, null, deps);
    if (!out.ok) throw new Error('esperava ok');
    expect(out.places.map((p) => p.placeId)).toEqual(['ok', 'temp']);
    expect(out.places[0]).toMatchObject({ nome: 'Clínica Sorriso', nicho: niche.id, uf: 'SP', bairro: 'Vila Mariana' });
  });

  it('429/5xx: retenta com esperas de 2 s e 4 s, 1 reserva por tentativa (Req. 3.7, 2.4)', async () => {
    const { http, usage, sleeps, log, deps } = setup([{ status: 429 }, { status: 500 }, { status: 503 }]);
    const out = await searchGooglePage(niche, run, rect, null, deps);
    expect(out).toEqual({ ok: false, kind: 'RETRYABLE_EXHAUSTED' });
    expect(http.calls).toHaveLength(3);
    expect(sleeps).toEqual([2_000, 4_000]);
    expect(usage.peek('places', MONTH)).toBe(3);
    expect(log).toEqual([
      'reserve:places:ok',
      `places:${SEARCH_TEXT_PATH}`,
      'reserve:places:ok',
      `places:${SEARCH_TEXT_PATH}`,
      'reserve:places:ok',
      `places:${SEARCH_TEXT_PATH}`,
    ]);
  });

  it('erro de rede conta como retentável e recupera na tentativa seguinte', async () => {
    const { http, sleeps, usage, deps } = setup([{ error: 'network' }, searchPage([rawPlace()])]);
    const out = await searchGooglePage(niche, run, rect, null, deps);
    expect(out.ok).toBe(true);
    expect(http.calls).toHaveLength(2);
    expect(sleeps).toEqual([2_000]);
    expect(usage.peek('places', MONTH)).toBe(2);
  });

  it.each([400, 401, 403])('%i: falha sem retentativa (Req. 3.8)', async (status) => {
    const { http, sleeps, usage, deps } = setup([{ status, json: { error: { status: 'X' } } }]);
    const out = await searchGooglePage(niche, run, rect, null, deps);
    expect(out).toEqual({ ok: false, kind: 'FATAL' });
    expect(http.calls).toHaveLength(1);
    expect(sleeps).toEqual([]);
    expect(usage.peek('places', MONTH)).toBe(1);
  });

  it('cota recusada: nenhuma requisição (Req. 2.5)', async () => {
    const { http, usage, deps } = setup([], { initial: { 'places:2025-05': 10 }, limit: 10 });
    const out = await searchGooglePage(niche, run, rect, null, deps);
    expect(out).toEqual({ ok: false, kind: 'QUOTA' });
    expect(http.calls).toHaveLength(0);
    expect(usage.peek('places', MONTH)).toBe(10);
    expect(usage.reserveCalls).toEqual([{ provider: 'places', month: MONTH, limit: 10, granted: false }]);
  });

  it('cota esgota no meio das retentativas: para sem nova requisição', async () => {
    const { http, deps } = setup([{ status: 500 }], { initial: { 'places:2025-05': 9 }, limit: 10 });
    const out = await searchGooglePage(niche, run, rect, null, deps);
    expect(out).toEqual({ ok: false, kind: 'QUOTA' });
    expect(http.calls).toHaveLength(1);
  });

  it('sem cliente (sem chave): UNAVAILABLE sem reservar', async () => {
    const { usage, deps } = setup([]);
    const out = await searchGooglePage(niche, run, rect, null, { ...deps, http: null });
    expect(out).toEqual({ ok: false, kind: 'UNAVAILABLE' });
    expect(usage.reserveCalls).toHaveLength(0);
  });
});

describe('fetchPlaceDetails (Req. 21.2)', () => {
  it('200: devolve o lugar, com máscara de detalhes e caminho codificado', async () => {
    const { http, usage, deps } = setup([{ status: 200, json: rawPlace({ id: 'abc/1' }) }]);
    const out = await fetchPlaceDetails('abc/1', deps);
    if (!out.ok) throw new Error('esperava ok');
    expect(out.place).toMatchObject({ placeId: 'abc/1', nome: 'Clínica Sorriso', telefone: '(11) 3333-4444' });
    expect(http.calls[0]).toMatchObject({
      method: 'GET',
      path: placeDetailsPath('abc/1'),
      fieldMask: DETAILS_FIELD_MASK,
      timeoutMs: PLACES_TIMEOUT_MS,
    });
    expect(http.calls[0].path).toBe('/v1/places/abc%2F1');
    expect(DETAILS_FIELD_MASK).not.toContain('places.');
    expect(DETAILS_FIELD_MASK).not.toContain('nextPageToken');
    expect(usage.peek('places', MONTH)).toBe(1);
  });

  it('200 com lugar fechado: devolve com businessStatus', async () => {
    const { deps } = setup([{ status: 200, json: rawPlace({ businessStatus: 'CLOSED_PERMANENTLY' }) }]);
    const out = await fetchPlaceDetails('ChIJ-teste-1', deps);
    expect(out).toMatchObject({ ok: true, place: { businessStatus: 'CLOSED_PERMANENTLY' } });
  });

  it('404: NOT_FOUND', async () => {
    const { http, deps } = setup([{ status: 404 }]);
    expect(await fetchPlaceDetails('x', deps)).toEqual({ ok: false, kind: 'NOT_FOUND' });
    expect(http.calls).toHaveLength(1);
  });

  it.each<ScriptStep<PlacesRequest>>([{ status: 500 }, { status: 403 }, { error: 'timeout' }, { status: 200, json: {} }])(
    'erro (%o): ERRO sem retentativa',
    async (step) => {
      const { http, sleeps, deps } = setup([step]);
      expect(await fetchPlaceDetails('x', deps)).toEqual({ ok: false, kind: 'ERRO' });
      expect(http.calls).toHaveLength(1);
      expect(sleeps).toEqual([]);
    },
  );

  it('cota recusada: QUOTA sem requisição', async () => {
    const { http, deps } = setup([], { limit: 0 });
    expect(await fetchPlaceDetails('x', deps)).toEqual({ ok: false, kind: 'QUOTA' });
    expect(http.calls).toHaveLength(0);
  });
});

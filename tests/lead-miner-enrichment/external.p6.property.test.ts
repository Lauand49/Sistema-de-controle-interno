// Feature: lead-miner-enrichment, Property 6: Requisições externas bem formadas e com host fixo
/**
 * Para qualquer Nicho, bairro, cidade, UF e retângulo, `buildTextSearchBody` produz a
 * `textQuery` com o texto do Nicho, bairro, cidade e UF, o retângulo, `pt-BR`/`BR` e
 * `includedType` exatamente quando o Nicho define um; a requisição real leva `SEARCH_FIELD_MASK`.
 * Para qualquer Place_ID, CNPJ e URL (com `/`, `?`, `#`, `%`, `..` e espaços), as URLs de
 * Place Details, BrasilAPI e PageSpeed têm origem fixa e o valor aparece só como segmento ou
 * parâmetro codificado (valores `''`, `.` e `..` não geram requisição: Place Details
 * devolve `ERRO` e o CNPJ `INDISPONIVEL`, sem lançar); o PageSpeed usa `strategy=mobile` e as quatro categorias.
 *
 * **Validates: Requirements 3.1, 3.2, 10.2, 20.4**
 */
import { describe, expect, it, vi } from 'vitest';
import fc from 'fast-check';
vi.mock('server-only', () => ({}));
vi.mock('@/lib/prisma', () => ({ prisma: {} }));
import { createBrasilApiHttp, createPageSpeedHttp, createPlacesHttp, type FetchFn } from '@/lib/leads/deps';
import { GOOGLE_QUERIES, NICHES, type Niche } from '@/lib/leads/config';
import {
  buildPlacesUrl,
  buildTextSearchBody,
  fetchPlaceDetails,
  placeDetailsPath,
  rectFromArea,
  searchGooglePage,
  SEARCH_FIELD_MASK,
  type GooglePlacesDeps,
  type Rect,
} from '@/lib/leads/sources/google-places';
import { brasilApiPath, lookupCnpj } from '@/lib/leads/brasilapi';
import { buildPageSpeedQuery } from '@/lib/leads/pagespeed';
import { memoryUsageGate } from './support/fake-usage';

const NUM_RUNS = 100;
const PLACES_ORIGIN = 'https://places.googleapis.com';
const BRASILAPI_ORIGIN = 'https://brasilapi.com.br';
const PAGESPEED_ORIGIN = 'https://www.googleapis.com';
const CATEGORIES = ['PERFORMANCE', 'ACCESSIBILITY', 'BEST_PRACTICES', 'SEO'];

// Texto livre com caracteres especiais de URL, Unicode e sequências de path traversal.
const SPECIAL = ['/', '?', '#', '%', '..', ' ', '&', '=', '+', '@', ':', '\\', '%2e', '%2F', 'ç', 'ã', '\u00e9', '../'];
const textArb = fc
  .array(fc.oneof(fc.constantFrom(...SPECIAL), fc.string({ minLength: 1, maxLength: 4 })), {
    minLength: 1,
    maxLength: 8,
  })
  .map((p) => p.join(''));
const valueArb = fc.oneof(
  textArb,
  fc.constantFrom('', '..', '.', '../..', '../../etc/passwd', '%2e%2e', '.%2E', 'a/../b', '//evil.com', '@evil.com', '?x=1#y'),
  fc.stringMatching(/^[0-9]{14}$/),
  fc.stringMatching(/^ChIJ[A-Za-z0-9_-]{10,27}$/),
);

const lat = fc.double({ min: -90, max: 90, noNaN: true });
const lng = fc.double({ min: -180, max: 180, noNaN: true });
const rectArb: fc.Arbitrary<Rect> = fc
  .record({ south: lat, north: lat, west: lng, east: lng })
  .map((b) => rectFromArea({ kind: 'bbox', ...b }) as Rect);

const nicheArb: fc.Arbitrary<Niche> = fc.oneof(
  fc.constantFrom(...NICHES),
  fc.record({ id: fc.string({ minLength: 1, maxLength: 12 }), label: textArb }).map(
    ({ id, label }) => ({ ...NICHES[0], id: `x_${id}`, label }) as Niche,
  ),
);
const runArb = fc.record({ bairro: textArb, cidade: textArb, uf: fc.stringMatching(/^[A-Z]{2}$/) });

/** Valores que virariam segmento de ponto ou vazio: nenhuma requisição deve sair. */
const isDotOrEmpty = (v: string) => v === '' || v === '.' || v === '..';
interface Call {
  url: string;
  init: RequestInit;
}
function recordingFetch(body: unknown = {}) {
  const calls: Call[] = [];
  const fn: FetchFn = (url, init) => {
    calls.push({ url, init });
    return Promise.resolve(new Response(JSON.stringify(body), { status: 200 }));
  };
  return { fn, calls };
}
function placesDeps(fetchFn: FetchFn): GooglePlacesDeps {
  return {
    http: createPlacesHttp('test-key', fetchFn),
    usage: memoryUsageGate(),
    limit: 1_000_000,
    now: () => new Date('2025-05-10T12:00:00Z'),
    sleep: () => Promise.resolve(),
  };
}

/** O último segmento do pathname, decodificado, é o valor; os anteriores são o prefixo fixo. */
function expectSegment(url: string, origin: string, prefix: string[], value: string) {
  const u = new URL(url);
  expect(u.origin).toBe(origin);
  expect(u.hash).toBe('');
  const segs = u.pathname.split('/').slice(1);
  expect(segs.slice(0, -1)).toEqual(prefix);
  expect(decodeURIComponent(segs[segs.length - 1])).toBe(value);
}

describe('Property 6: Requisições externas bem formadas e com host fixo', () => {
  it('Text Search: corpo com textQuery, retângulo, idioma/região, includedType e field mask', async () => {
    await fc.assert(
      fc.asyncProperty(nicheArb, runArb, rectArb, async (niche, run, rect) => {
        const q = GOOGLE_QUERIES[niche.id];
        const text = q?.text ?? niche.label.toLowerCase();
        const body = buildTextSearchBody(niche, run, rect) as Record<string, unknown>;
        const tq = body.textQuery as string;
        for (const part of [text, run.bairro, run.cidade, run.uf]) expect(tq).toContain(part);
        expect(body.locationRestriction).toEqual({ rectangle: rect });
        expect(body.languageCode).toBe('pt-BR');
        expect(body.regionCode).toBe('BR');
        if (q?.includedType) expect(body.includedType).toBe(q.includedType);
        else expect('includedType' in body).toBe(false);

        // Cliente real: host fixo, máscara no cabeçalho e o mesmo corpo serializado.
        const f = recordingFetch({ places: [] });
        await searchGooglePage(niche, run, rect, null, placesDeps(f.fn));
        expect(f.calls).toHaveLength(1);
        const { url, init } = f.calls[0];
        expect(new URL(url).origin).toBe(PLACES_ORIGIN);
        expect(new URL(url).pathname).toBe('/v1/places:searchText');
        const headers = init.headers as Record<string, string>;
        expect(headers['x-goog-fieldmask']).toBe(SEARCH_FIELD_MASK);
        expect(JSON.parse(init.body as string)).toEqual(JSON.parse(JSON.stringify(body)));
      }),
      { numRuns: NUM_RUNS },
    );
  });

  it('Place Details: origem fixa e Place_ID só como segmento codificado', async () => {
    await fc.assert(
      fc.asyncProperty(valueArb, async (placeId) => {
        const f = recordingFetch({});
        const usage = memoryUsageGate();
        const deps = { ...placesDeps(f.fn), usage };
        if (isDotOrEmpty(placeId)) {
          // Nada é enviado nem reservado; o resultado é o erro genérico, sem lançar.
          expect(await fetchPlaceDetails(placeId, deps)).toEqual({ ok: false, kind: 'ERRO' });
          await expect(
            deps.http!.request({ method: 'GET', path: placeDetailsPath(placeId), fieldMask: 'id', timeoutMs: 1000 }),
          ).rejects.toThrow('erro de rede');
          expect(f.calls).toHaveLength(0);
          expect(usage.reserveCalls).toHaveLength(0);
          return;
        }
        expectSegment(buildPlacesUrl(placeDetailsPath(placeId)), PLACES_ORIGIN, ['v1', 'places'], placeId);
        await fetchPlaceDetails(placeId, deps);
        expect(f.calls).toHaveLength(1);
        expectSegment(f.calls[0].url, PLACES_ORIGIN, ['v1', 'places'], placeId);
      }),
      { numRuns: NUM_RUNS },
    );
  });

  it('BrasilAPI: origem fixa e CNPJ só como segmento codificado', async () => {
    await fc.assert(
      fc.asyncProperty(valueArb, async (cnpj) => {
        if (isDotOrEmpty(cnpj)) {
          const f = recordingFetch({});
          const http = createBrasilApiHttp(f.fn);
          await expect(http.getCnpj(cnpj, 1000)).rejects.toThrow('erro de rede');
          const out = await lookupCnpj(cnpj, {
            http,
            limiter: { schedule: (fn) => fn() },
            sleep: () => Promise.resolve(),
            now: () => new Date('2025-05-10T12:00:00Z'),
          });
          expect(out).toEqual({ ok: false, reason: 'INDISPONIVEL' });
          expect(f.calls).toHaveLength(0);
          return;
        }
        expectSegment(new URL(brasilApiPath(cnpj), BRASILAPI_ORIGIN).toString(), BRASILAPI_ORIGIN, ['api', 'cnpj', 'v1'], cnpj);
        const f = recordingFetch({});
        await createBrasilApiHttp(f.fn).getCnpj(cnpj, 1000);
        expect(f.calls).toHaveLength(1);
        expectSegment(f.calls[0].url, BRASILAPI_ORIGIN, ['api', 'cnpj', 'v1'], cnpj);
      }),
      { numRuns: NUM_RUNS },
    );
  });

  it('PageSpeed: origem fixa, url só como parâmetro, strategy=mobile e quatro categorias', async () => {
    await fc.assert(
      fc.asyncProperty(fc.oneof(valueArb, fc.webUrl({ withQueryParameters: true, withFragments: true })), async (target) => {
        const f = recordingFetch({});
        await createPageSpeedHttp(null, f.fn).run(buildPageSpeedQuery(target), 1000);
        expect(f.calls).toHaveLength(1);
        const u = new URL(f.calls[0].url);
        expect(u.origin).toBe(PAGESPEED_ORIGIN);
        expect(u.pathname).toBe('/pagespeedonline/v5/runPagespeed');
        expect(u.hash).toBe('');
        expect(u.searchParams.getAll('url')).toEqual([target]);
        expect(u.searchParams.get('strategy')).toBe('mobile');
        expect(u.searchParams.getAll('category')).toEqual(CATEGORIES);
        expect([...new Set(u.searchParams.keys())].sort()).toEqual(['category', 'strategy', 'url']);
      }),
      { numRuns: NUM_RUNS },
    );
  });
});

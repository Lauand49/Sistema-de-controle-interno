/**
 * Cliente HTTP JSON falso e geradores para testes da Fonte_OSM (sem rede).
 */
import fc from 'fast-check';
import type { HttpJsonClient, OverpassElement } from '@/lib/leads/sources/osm';
import type { RateLimiter } from '@/lib/leads/sources/rate-limit';

export type HttpInit = Parameters<HttpJsonClient['getJson']>[1];

export interface RecordedCall {
  url: string;
  init: HttpInit;
}

/** Passo do roteiro: valor JSON devolvido, ou `Error` (rejeição: erro HTTP, rede ou timeout). */
export type ScriptStep = unknown;

export interface FakeHttpJson extends HttpJsonClient {
  calls: RecordedCall[];
}

/**
 * Roteiro em array (consumido na ordem; esgotado → erro) ou função chamada a cada requisição.
 * Um passo que é `Error` faz a chamada rejeitar.
 */
export function fakeHttpJson(
  script: ScriptStep[] | ((call: RecordedCall, index: number) => ScriptStep),
): FakeHttpJson {
  const calls: RecordedCall[] = [];
  return {
    calls,
    async getJson(url, init) {
      const call = { url, init };
      const index = calls.length;
      calls.push(call);
      const step =
        typeof script === 'function'
          ? script(call, index)
          : index < script.length
            ? script[index]
            : new Error('fakeHttpJson: roteiro esgotado');
      if (step instanceof Error) throw step;
      return step;
    },
  };
}

/** Limitador que só conta quantas execuções passaram por ele. */
export function countingLimiter(): RateLimiter & { count: number } {
  const lim = {
    count: 0,
    async schedule<T>(fn: () => Promise<T>): Promise<T> {
      lim.count++;
      return fn();
    },
  };
  return lim;
}

/** `sleep` falso: registra as esperas pedidas e resolve imediatamente. */
export function fakeSleep(): { sleep: (ms: number) => Promise<void>; sleeps: number[] } {
  const sleeps: number[] = [];
  return { sleeps, sleep: async (ms) => void sleeps.push(ms) };
}

export const timeoutError = (): Error => Object.assign(new Error('timeout'), { name: 'TimeoutError' });

/** Tags conhecidas pelo mapeamento. */
export const KNOWN_TAGS = [
  'name',
  'addr:street',
  'addr:housenumber',
  'addr:suburb',
  'addr:city',
  'addr:state',
  'phone',
  'contact:phone',
  'website',
  'contact:website',
  'brand',
] as const;

/** Valor de tag: texto comum, vazio ou só espaços (e com espaços nas bordas). */
const arbTagValue = fc.oneof(
  { weight: 6, arbitrary: fc.string({ minLength: 1, maxLength: 20 }) },
  { weight: 1, arbitrary: fc.constantFrom('', ' ', '  \t') },
  { weight: 1, arbitrary: fc.string({ minLength: 1, maxLength: 10 }).map((s) => `  ${s} `) },
);

const arbLat = fc.double({ min: -90, max: 90, noNaN: true });
const arbLon = fc.double({ min: -180, max: 180, noNaN: true });

/** Elemento Overpass com qualquer subconjunto das tags conhecidas. */
export const arbOverpassElement: fc.Arbitrary<OverpassElement> = fc
  .record(
    {
      type: fc.constantFrom('node' as const, 'way' as const, 'relation' as const),
      id: fc.integer({ min: 1, max: 2_000_000_000 }),
      coords: fc.oneof(
        fc.record({ lat: arbLat, lon: arbLon }).map((c) => ({ lat: c.lat, lon: c.lon })),
        fc.record({ lat: arbLat, lon: arbLon }).map((c) => ({ center: c })),
        fc.constant({}),
      ),
      tags: fc.option(
        fc.dictionary(fc.constantFrom(...KNOWN_TAGS), arbTagValue, { maxKeys: KNOWN_TAGS.length }),
        { nil: undefined },
      ),
    },
    { requiredKeys: ['type', 'id', 'coords'] },
  )
  .map(({ type, id, coords, tags }) => ({ type, id, ...coords, ...(tags !== undefined ? { tags } : {}) }));

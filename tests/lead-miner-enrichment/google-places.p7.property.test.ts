// Feature: lead-miner-enrichment, Property 7: Paginação e retentativas da Fonte_Google
/**
 * **Validates: Requirements 1.4, 3.3, 3.7, 3.8**
 *
 * Para qualquer roteiro de respostas da Text Search por tentativa (sucesso com ou sem
 * `nextPageToken`, 429, 5xx, timeout, 400, 401, 403), a Fonte_Google solicita no máximo
 * GOOGLE_MAX_PAGES páginas por Nicho, segue o token só enquanto ele existe e o limite não foi
 * atingido, repete uma página no máximo 2 vezes após 429/5xx/timeout com esperas de 2.000 e
 * 4.000 ms, não repete após 400/401/403, e o desfecho coincide com um modelo sequencial.
 *
 * `searchGooglePage` cobre uma página; o encadeamento por `nextPageToken` é dirigido aqui.
 */
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { GOOGLE_MAX_PAGES, NICHES, RETRY_DELAYS_MS } from '@/lib/leads/config';
import {
  searchGooglePage,
  type GooglePlacesDeps,
  type PlacesRequest,
  type Rect,
  type RunPlace,
} from '@/lib/leads/sources/google-places';
import { fakePlaces, rawPlace, searchPage } from './support/fake-places';
import { memoryUsageGate } from './support/fake-usage';
import type { ScriptStep } from './support/scripted';

const NOW = new Date('2025-05-15T12:00:00Z');
const niche = NICHES[0];
const run: RunPlace = { bairro: 'Vila Mariana', cidade: 'São Paulo', uf: 'SP' };
const rect: Rect = {
  low: { latitude: -23.6, longitude: -46.65 },
  high: { latitude: -23.57, longitude: -46.62 },
};

type Step =
  | { kind: 'ok'; nPlaces: number; token: boolean }
  | { kind: 'retry'; how: 429 | 500 | 502 | 503 | 'timeout' | 'network' }
  | { kind: 'fatal'; status: 400 | 401 | 403 };

const stepArb: fc.Arbitrary<Step> = fc.oneof(
  fc.record({ kind: fc.constant('ok' as const), nPlaces: fc.integer({ min: 0, max: 3 }), token: fc.boolean() }),
  fc.record({
    kind: fc.constant('retry' as const),
    how: fc.constantFrom(429 as const, 500 as const, 502 as const, 503 as const, 'timeout' as const, 'network' as const),
  }),
  fc.record({ kind: fc.constant('fatal' as const), status: fc.constantFrom(400 as const, 401 as const, 403 as const) }),
);

const MAX_ATTEMPTS = RETRY_DELAYS_MS.length + 1;
/** Roteiro longo o bastante para nunca se esgotar (páginas × tentativas). */
const scriptArb = fc.array(stepArb, {
  minLength: GOOGLE_MAX_PAGES * MAX_ATTEMPTS,
  maxLength: GOOGLE_MAX_PAGES * MAX_ATTEMPTS,
});

/** Passo do roteiro → resposta do cliente falso; ids/tokens únicos por posição. */
function toScript(steps: Step[]): ScriptStep<PlacesRequest>[] {
  return steps.map((s, i) => {
    if (s.kind === 'ok') {
      const places = Array.from({ length: s.nPlaces }, (_, j) => rawPlace({ id: `p-${i}-${j}` }));
      return searchPage(places, s.token ? `tok-${i}` : undefined);
    }
    if (s.kind === 'fatal') return { status: s.status, json: { error: {} } };
    if (s.how === 'timeout' || s.how === 'network') return { error: s.how };
    return { status: s.how, json: { error: {} } };
  });
}

type Outcome = { ok: true; ids: string[] } | { ok: false; kind: 'RETRYABLE_EXHAUSTED' | 'FATAL' };

interface Trace {
  outcome: Outcome;
  requests: number;
  sleeps: number[];
  /** pageToken esperado em cada requisição (null = 1ª página). */
  tokens: (string | null)[];
  pages: number;
}

/** Modelo de referência sequencial. */
function model(steps: Step[]): Trace {
  let idx = 0;
  const ids: string[] = [];
  const sleeps: number[] = [];
  const tokens: (string | null)[] = [];
  let token: string | null = null;
  let pages = 0;
  while (pages < GOOGLE_MAX_PAGES) {
    pages++;
    let got: { next: string | null } | null = null;
    for (let a = 0; a < MAX_ATTEMPTS; a++) {
      if (a > 0) sleeps.push(a === 1 ? 2_000 : 4_000);
      const i = idx++;
      const s = steps[i];
      tokens.push(token);
      if (s.kind === 'ok') {
        for (let j = 0; j < s.nPlaces; j++) ids.push(`p-${i}-${j}`);
        got = { next: s.token ? `tok-${i}` : null };
        break;
      }
      if (s.kind === 'fatal') return { outcome: { ok: false, kind: 'FATAL' }, requests: idx, sleeps, tokens, pages };
    }
    if (got === null) {
      return { outcome: { ok: false, kind: 'RETRYABLE_EXHAUSTED' }, requests: idx, sleeps, tokens, pages };
    }
    if (got.next === null) break;
    token = got.next;
  }
  return { outcome: { ok: true, ids }, requests: idx, sleeps, tokens, pages };
}

/** Driver real: encadeia `searchGooglePage` por `nextPageToken` até GOOGLE_MAX_PAGES. */
async function drive(steps: Step[]) {
  const sleeps: number[] = [];
  const http = fakePlaces(toScript(steps));
  const usage = memoryUsageGate();
  const deps: GooglePlacesDeps = {
    http,
    usage,
    limit: 1_000_000,
    now: () => NOW,
    sleep: async (ms) => {
      sleeps.push(ms);
    },
  };
  const ids: string[] = [];
  let token: string | null = null;
  let pages = 0;
  let outcome: Outcome | null = null;
  while (pages < GOOGLE_MAX_PAGES) {
    pages++;
    const out = await searchGooglePage(niche, run, rect, token, deps);
    if (!out.ok) {
      if (out.kind !== 'FATAL' && out.kind !== 'RETRYABLE_EXHAUSTED') throw new Error(`desfecho inesperado ${out.kind}`);
      outcome = { ok: false, kind: out.kind };
      break;
    }
    ids.push(...out.places.map((p) => p.placeId));
    if (out.nextPageToken === null) break;
    token = out.nextPageToken;
  }
  outcome ??= { ok: true, ids };
  const tokens = http.calls.map((c) => {
    const t = (c.body as { pageToken?: string } | undefined)?.pageToken;
    return t ?? null;
  });
  return { outcome, requests: http.calls.length, sleeps, tokens, pages, reserves: usage.reserveCalls.length };
}

describe('Property 7: Paginação e retentativas da Fonte_Google', () => {
  it('coincide com o modelo sequencial (páginas, tokens, esperas, desfecho)', async () => {
    expect(RETRY_DELAYS_MS).toEqual([2_000, 4_000]);
    await fc.assert(
      fc.asyncProperty(scriptArb, async (steps) => {
        const expected = model(steps);
        const actual = await drive(steps);
        expect(actual.outcome).toEqual(expected.outcome);
        expect(actual.requests).toBe(expected.requests);
        expect(actual.sleeps).toEqual(expected.sleeps);
        expect(actual.tokens).toEqual(expected.tokens);
        expect(actual.pages).toBe(expected.pages);
        expect(actual.pages).toBeLessThanOrEqual(GOOGLE_MAX_PAGES);
        expect(actual.requests).toBeLessThanOrEqual(GOOGLE_MAX_PAGES * MAX_ATTEMPTS);
        // 1 cota reservada por tentativa enviada.
        expect(actual.reserves).toBe(actual.requests);
      }),
      { numRuns: 200 },
    );
  });
});

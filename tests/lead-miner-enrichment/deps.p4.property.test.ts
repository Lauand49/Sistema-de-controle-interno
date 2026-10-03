// Feature: lead-miner-enrichment, Property 4: Chaves de API nunca vazam
/**
 * Para qualquer chave (incluindo caracteres especiais de URL) usada nos clientes reais de
 * Places, PageSpeed e BrasilAPI sobre um `fetch` falso (status arbitrário, erro ou timeout),
 * a chave não aparece nas URLs requisitadas, nos erros lançados (mensagem, nome, stack),
 * nos valores devolvidos nem em `console.*`; aparece somente no cabeçalho `x-goog-api-key`.
 *
 * **Validates: Requirements 2.8**
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fc from 'fast-check';
vi.mock('server-only', () => ({}));
vi.mock('@/lib/prisma', () => ({ prisma: {} }));
import {
  createBrasilApiHttp,
  createPageSpeedHttp,
  createPlacesHttp,
  redactSecrets,
  type FetchFn,
} from '@/lib/leads/deps';

const NUM_RUNS = 100;

// Chave: 12–40 caracteres, misturando base64url com caracteres especiais de URL.
const KEY_CHARS = 'AIzaBcDeFgHiJkLmNoPqRsTuVwXyZ0123456789-_&?#=/%+ :@!$,;'.split('');
const keyArb = fc
  .array(fc.constantFrom(...KEY_CHARS), { minLength: 12, maxLength: 40 })
  .map((cs) => cs.join(''))
  .filter((k) => k.trim() !== '');

type Behavior =
  | { kind: 'response'; status: number; body: string }
  | { kind: 'error'; message: string }
  | { kind: 'timeout' };

const behaviorArb: fc.Arbitrary<Behavior> = fc.oneof(
  fc.record({
    kind: fc.constant('response' as const),
    status: fc.integer({ min: 200, max: 599 }),
    body: fc.oneof(fc.string(), fc.json(), fc.constant('')),
  }),
  fc.record({ kind: fc.constant('error' as const), message: fc.string() }),
  fc.constant({ kind: 'timeout' as const }),
);

interface Call {
  url: string;
  init: RequestInit;
}

/** fetch falso: o erro/abort lançado inclui a chave e a URL, para provar que não vaza. */
function fakeFetch(key: string, behavior: Behavior) {
  const calls: Call[] = [];
  const fn: FetchFn = (url, init) => {
    calls.push({ url, init });
    if (behavior.kind === 'response') {
      return Promise.resolve(new Response(behavior.body, { status: behavior.status }));
    }
    if (behavior.kind === 'error') {
      return Promise.reject(new Error(`${behavior.message} ${url} key=${key} ${encodeURIComponent(key)}`));
    }
    return new Promise<Response>((_, reject) => {
      const signal = init.signal;
      const fail = () => {
        const err = new Error(`aborted ${url} key=${key}`);
        err.name = 'AbortError';
        reject(err);
      };
      if (signal?.aborted) fail();
      else signal?.addEventListener('abort', fail, { once: true });
    });
  };
  return { calls, fn };
}

function forms(key: string): string[] {
  return [key, encodeURIComponent(key)];
}

function expectNoKey(text: string, key: string) {
  for (const f of forms(key)) expect(text.includes(f)).toBe(false);
}

function headersOf(init: RequestInit): Record<string, string> {
  return Object.fromEntries(new Headers(init.headers).entries());
}

/** Verifica chamadas, resultado/erro e logs; devolve as chamadas para checagens extras. */
async function checkCall(
  key: string,
  run: () => Promise<unknown>,
  calls: Call[],
  logs: string[],
  expectKeyHeader: boolean,
) {
  let result: unknown;
  let error: unknown;
  try {
    result = await run();
  } catch (e) {
    error = e;
  }

  expect(calls.length).toBe(1);
  for (const c of calls) {
    expectNoKey(c.url, key);
    expectNoKey(c.init.body == null ? '' : String(c.init.body), key);
    const headers = headersOf(c.init);
    for (const [name, value] of Object.entries(headers)) {
      if (name === 'x-goog-api-key') continue;
      expectNoKey(name, key);
      expectNoKey(value, key);
    }
    if (expectKeyHeader) expect(headers['x-goog-api-key']).toBeDefined();
    else expect(headers['x-goog-api-key']).toBeUndefined();
  }

  if (error !== undefined) {
    const err = error as Error;
    expectNoKey(String(err), key);
    expectNoKey(String(err.message ?? ''), key);
    expectNoKey(String(err.name ?? ''), key);
    expectNoKey(String(err.stack ?? ''), key);
  } else {
    expectNoKey(JSON.stringify(result) ?? '', key);
  }
  for (const line of logs) expectNoKey(line, key);
}

let logs: string[] = [];
beforeEach(() => {
  logs = [];
  for (const m of ['log', 'info', 'warn', 'error', 'debug'] as const) {
    vi.spyOn(console, m).mockImplementation((...args: unknown[]) => {
      logs.push(args.map((a) => (a instanceof Error ? `${a.message} ${a.stack}` : String(a))).join(' '));
    });
  }
});
afterEach(() => vi.restoreAllMocks());

/** Corpo devolvido pelo servidor não ecoa a chave (eco do servidor não é vazamento nosso). */
const noEcho = (key: string, b: Behavior) =>
  b.kind !== 'response' || forms(key).every((f) => !b.body.includes(f));

describe('Property 4: Chaves de API nunca vazam', () => {
  it('Places: chave só em x-goog-api-key, nunca em URL, erro, resultado ou log', async () => {
    await fc.assert(
      fc.asyncProperty(
        keyArb,
        behaviorArb,
        fc.constantFrom<'GET' | 'POST'>('GET', 'POST'),
        // Segmento vazio, '.' ou '..' é recusado antes de enviar (coberto pela Property 6).
        fc.string({ minLength: 1, maxLength: 30 }).filter((s) => s !== '.' && s !== '..'),
        fc.dictionary(fc.string({ minLength: 1, maxLength: 8 }), fc.string({ maxLength: 12 }), { maxKeys: 3 }),
        fc.integer({ min: 1, max: 5 }),
        async (key, behavior, method, placeId, query, timeoutMs) => {
          fc.pre(noEcho(key, behavior));
          fc.pre(!placeId.includes(key) && Object.entries(query).every(([k, v]) => !k.includes(key) && !v.includes(key)));
          logs.length = 0;
          const { calls, fn } = fakeFetch(key, behavior);
          const http = createPlacesHttp(key, fn);
          await checkCall(
            key,
            () =>
              http.request({
                method,
                path: method === 'POST' ? '/v1/places:searchText' : `/v1/places/${encodeURIComponent(placeId)}`,
                query: method === 'GET' ? query : undefined,
                fieldMask: 'places.id,places.displayName',
                body: method === 'POST' ? { textQuery: 'padaria' } : undefined,
                timeoutMs,
              }),
            calls,
            logs,
            true,
          );
          expect(headersOf(calls[0].init)['x-goog-api-key']).toBe(new Headers({ k: key }).get('k'));
        },
      ),
      { numRuns: NUM_RUNS },
    );
  });

  it('PageSpeed: chave só no cabeçalho, mesmo se a query trouxer `key`', async () => {
    await fc.assert(
      fc.asyncProperty(
        keyArb,
        behaviorArb,
        fc.webUrl(),
        fc.boolean(),
        fc.integer({ min: 1, max: 5 }),
        async (key, behavior, site, injectKey, timeoutMs) => {
          fc.pre(noEcho(key, behavior) && !site.includes(key) && !site.includes(encodeURIComponent(key)));
          logs.length = 0;
          const { calls, fn } = fakeFetch(key, behavior);
          const http = createPageSpeedHttp(key, fn);
          const q = new URLSearchParams({ url: site, strategy: 'mobile', category: 'performance' });
          if (injectKey) q.set('key', key);
          await checkCall(key, () => http.run(q, timeoutMs), calls, logs, true);
          expect(headersOf(calls[0].init)['x-goog-api-key']).toBe(new Headers({ k: key }).get('k'));
          expect(new URL(calls[0].url).searchParams.has('key')).toBe(false);
        },
      ),
      { numRuns: NUM_RUNS },
    );
  });

  it('BrasilAPI: nenhuma chave do Google é enviada nem vaza', async () => {
    await fc.assert(
      fc.asyncProperty(
        keyArb,
        behaviorArb,
        fc.stringMatching(/^\d{14}$/),
        fc.integer({ min: 1, max: 5 }),
        async (key, behavior, cnpj, timeoutMs) => {
          fc.pre(noEcho(key, behavior) && !cnpj.includes(key));
          logs.length = 0;
          const { calls, fn } = fakeFetch(key, behavior);
          const http = createBrasilApiHttp(fn);
          await checkCall(key, () => http.getCnpj(cnpj, timeoutMs), calls, logs, false);
        },
      ),
      { numRuns: NUM_RUNS },
    );
  });

  it('redactSecrets remove a chave (crua e codificada) de qualquer texto', () => {
    fc.assert(
      fc.property(
        keyArb,
        fc.array(fc.string({ maxLength: 20 }), { minLength: 1, maxLength: 5 }),
        fc.array(fc.boolean(), { minLength: 5, maxLength: 5 }),
        (key, pieces, encoded) => {
          const text = pieces
            .map((p, i) => p + (encoded[i] ? encodeURIComponent(key) : key))
            .join('');
          fc.pre(pieces.every((p) => !p.includes(key)));
          const out = redactSecrets(text, [key, null, undefined, '']);
          expectNoKey(out, key);
          expect(out.includes('[redacted]')).toBe(true);
        },
      ),
      { numRuns: NUM_RUNS },
    );
  });
});

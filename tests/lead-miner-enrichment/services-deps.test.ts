/**
 * `services.ts` (estado dos serviços) e clientes reais de `deps.ts` com `fetch` falso
 * (sem rede) — Req. 2.1, 2.2, 2.3, 2.6, 2.8, 20.4.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
import {
  createBrasilApiHttp,
  createPageSpeedHttp,
  createPlacesHttp,
  getApproachDeps,
  getPipelineDeps,
  redactSecrets,
  type FetchFn,
} from '@/lib/leads/deps';
import { PAGESPEED_MONTHLY_LIMIT_DEFAULT, PLACES_MONTHLY_LIMIT_DEFAULT } from '@/lib/leads/config';
import { buildPageSpeedQuery } from '@/lib/leads/pagespeed';
import { serviceState, serviceStatus } from '@/lib/leads/services';
import type { UsageGate } from '@/lib/leads/usage';

const KEY = 'AIza-chave-secreta-xyz';

function recorder(response: () => Response | Promise<Response>) {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  const fn: FetchFn = async (url, init) => {
    calls.push({ url, init });
    return response();
  };
  return { calls, fn };
}

afterEach(() => vi.unstubAllEnvs());

describe('serviceState', () => {
  it('sem chave exigida → SEM_CHAVE, mesmo com cota livre', () => {
    expect(serviceState({ requiresKey: true, hasKey: false, count: 0, limit: 10 })).toEqual({
      available: false, motivo: 'SEM_CHAVE', usados: 0, limite: 10,
    });
  });
  it('count >= limite → COTA_ESGOTADA; abaixo → disponível', () => {
    expect(serviceState({ requiresKey: true, hasKey: true, count: 10, limit: 10 }).motivo).toBe('COTA_ESGOTADA');
    expect(serviceState({ requiresKey: true, hasKey: true, count: 9, limit: 10 }).available).toBe(true);
  });
  it('PageSpeed não exige chave', () => {
    expect(serviceState({ requiresKey: false, hasKey: false, count: 0, limit: 5 }).available).toBe(true);
  });
});

describe('serviceStatus', () => {
  it('lê o uso do mês corrente de cada provedor', async () => {
    const months: string[] = [];
    const usage: UsageGate = {
      reserve: async () => { throw new Error('não deve reservar'); },
      count: async (p, m) => { months.push(m); return { places: 3, pagespeed: 5, gemini: 0 }[p]; },
    };
    const s = await serviceStatus({
      usage,
      now: () => new Date(2026, 9, 15),
      keys: { places: true, pagespeed: false, gemini: false },
      limits: { places: 3, pagespeed: 100, gemini: 10 },
    });
    expect(months).toEqual(['2026-10', '2026-10', '2026-10']);
    expect(s.places).toEqual({ available: false, motivo: 'COTA_ESGOTADA', usados: 3, limite: 3 });
    expect(s.pagespeed).toEqual({ available: true, motivo: null, usados: 5, limite: 100, semChave: true });
    expect(s.gemini.motivo).toBe('SEM_CHAVE');
  });
});

describe('redactSecrets', () => {
  it('remove a chave crua e codificada', () => {
    expect(redactSecrets(`a ${KEY} b ${encodeURIComponent('k/+=')}`, [KEY, 'k/+=', null, ''])).toBe('a [redacted] b [redacted]');
  });
});

describe('createPlacesHttp', () => {
  it('host fixo, chave e field mask só nos cabeçalhos; devolve status e JSON', async () => {
    const { calls, fn } = recorder(() => Response.json({ places: [] }, { status: 403 }));
    const http = createPlacesHttp(KEY, fn);
    const res = await http.request({ method: 'POST', path: '/v1/places:searchText', fieldMask: 'places.id', body: { q: 1 }, timeoutMs: 1000 });
    expect(res).toEqual({ status: 403, json: { places: [] } });
    const { url, init } = calls[0];
    expect(url).toBe('https://places.googleapis.com/v1/places:searchText');
    expect(url).not.toContain(KEY);
    const h = init.headers as Record<string, string>;
    expect(h['x-goog-api-key']).toBe(KEY);
    expect(h['x-goog-fieldmask']).toBe('places.id');
    expect(init.signal).toBeInstanceOf(AbortSignal);
    expect(init.cache).toBe('no-store');
  });
  it('erro de rede vira mensagem genérica sem chave nem URL', async () => {
    const http = createPlacesHttp(KEY, async () => { throw new Error(`falhou https://x?key=${KEY}`); });
    const err = await http.request({ method: 'GET', path: '/v1/places/abc', fieldMask: 'id', timeoutMs: 1000 }).catch((e) => e);
    expect(err.message).toBe('erro de rede');
  });
  it('timeout aborta e rejeita com TimeoutError genérico', async () => {
    const fn: FetchFn = (_u, init) => new Promise((_, reject) => {
      init.signal?.addEventListener('abort', () => reject(new Error(`abort ${KEY}`)));
    });
    const err = await createPlacesHttp(KEY, fn)
      .request({ method: 'GET', path: '/v1/places/abc', fieldMask: 'id', timeoutMs: 5 })
      .catch((e) => e);
    expect(err.name).toBe('TimeoutError');
    expect(err.message).toBe('timeout');
  });
});

describe('createPageSpeedHttp', () => {
  it('chave só no cabeçalho quando configurada; nunca na URL', async () => {
    const { calls, fn } = recorder(() => new Response('não-json', { status: 500 }));
    const q = buildPageSpeedQuery('https://exemplo.com.br/');
    q.set('key', KEY);
    expect(await createPageSpeedHttp(KEY, fn).run(q, 1000)).toEqual({ status: 500, json: null });
    await createPageSpeedHttp(null, fn).run(buildPageSpeedQuery('https://exemplo.com.br/'), 1000);
    expect(calls[0].url.startsWith('https://www.googleapis.com/pagespeedonline/v5/runPagespeed?')).toBe(true);
    expect(calls[0].url).not.toContain(KEY);
    expect((calls[0].init.headers as Record<string, string>)['x-goog-api-key']).toBe(KEY);
    expect((calls[1].init.headers as Record<string, string>)['x-goog-api-key']).toBeUndefined();
  });
});

describe('createBrasilApiHttp', () => {
  it('host fixo e CNPJ codificado como segmento', async () => {
    const { calls, fn } = recorder(() => Response.json({ cnpj: '1' }));
    await createBrasilApiHttp(fn).getCnpj('../../evil.com/x', 1000);
    const u = new URL(calls[0].url);
    expect(u.origin).toBe('https://brasilapi.com.br');
    expect(u.pathname.startsWith('/api/cnpj/v1/')).toBe(true);
  });
});

describe('getPipelineDeps / getApproachDeps', () => {
  it('sem chaves: google.http null, pagespeed sem chave, limites padrão', () => {
    vi.stubEnv('GOOGLE_PLACES_API_KEY', '');
    vi.stubEnv('PAGESPEED_API_KEY', '');
    vi.stubEnv('PLACES_MONTHLY_LIMIT', '');
    vi.stubEnv('PAGESPEED_MONTHLY_LIMIT', '');
    vi.stubEnv('GEMINI_API_KEY', '');
    const deps = getPipelineDeps();
    expect(deps.google.http).toBeNull();
    expect(deps.google.limit).toBe(PLACES_MONTHLY_LIMIT_DEFAULT);
    expect(deps.pagespeed.hasKey).toBe(false);
    expect(deps.pagespeed.limit).toBe(PAGESPEED_MONTHLY_LIMIT_DEFAULT);
    expect(deps.cnpj.http).toBeDefined();
    expect(getApproachDeps().client).toBeNull();
  });
  it('com chaves e limites configurados', () => {
    vi.stubEnv('GOOGLE_PLACES_API_KEY', KEY);
    vi.stubEnv('PAGESPEED_API_KEY', KEY);
    vi.stubEnv('PLACES_MONTHLY_LIMIT', '50');
    const deps = getPipelineDeps();
    expect(deps.google.http).not.toBeNull();
    expect(deps.google.limit).toBe(50);
    expect(deps.pagespeed.hasKey).toBe(true);
    expect(JSON.stringify(deps.google)).not.toContain(KEY);
  });
});

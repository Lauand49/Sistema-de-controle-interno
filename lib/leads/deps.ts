/**
 * Fábrica das dependências reais (produção) do Minerador de Leads.
 *
 * Único módulo que lê `GEMINI_API_KEY`, `GEMINI_MODEL`, `GEMINI_MONTHLY_LIMIT`,
 * `GOOGLE_PLACES_API_KEY`, `PLACES_MONTHLY_LIMIT`, `PAGESPEED_API_KEY` e
 * `PAGESPEED_MONTHLY_LIMIT` (Req. 1.9, 2, 7.1). As chaves vão só no cabeçalho
 * (`x-goog-api-key`), nunca em URL, mensagem de erro, log ou resposta (Req. 2.8, 20.4). Importa `server-only` para que nunca entre no bundle do cliente.
 * Os demais módulos recebem estas dependências por injeção, o que permite testá-los
 * sem rede (Req. 20.6).
 */
import 'server-only';
import { randomUUID } from 'node:crypto';
import { promises as dnsPromises } from 'node:dns';
import { prisma } from '@/lib/prisma';
import type { GeminiClient } from './ai';
import type { ApproachDeps } from './approach';
import type { EvaluationDeps } from './evaluation';
import { BRASILAPI_HOST, brasilApiPath, type BrasilApiHttp } from './brasilapi';
import { geminiMonthlyLimit, pagespeedMonthlyLimit, placesMonthlyLimit } from './config';
import { createNodeTransport } from './net/http-transport';
import { isSingleSegmentUnder } from './net/path-segment';
import type { Resolver } from './net/ssrf';
import { PAGESPEED_ENDPOINT, type PageSpeedHttp } from './pagespeed';
import type { PipelineDeps } from './pipeline';
import { serviceStatus, type ServicesStatus } from './services';
import { buildPlacesUrl, PLACES_HOST, SEARCH_TEXT_PATH, type PlacesHttp } from './sources/google-places';
import { createCitiesService, type CitiesService } from './localidades';
import type { HttpJsonClient, OsmDeps } from './sources/osm';
import { createNeighborhoodsService, type NeighborhoodsService } from './sources/osm-bairros';
import { brasilApiLimiter, nominatimLimiter } from './sources/rate-limit';
import { prismaUsageGate, type UsageGate } from './usage';

export const GEMINI_MODEL_DEFAULT = 'gemini-2.0-flash';
const GEMINI_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta/models';

export type { PipelineDeps };

// ---------------------------------------------------------------------------
// Rede
// ---------------------------------------------------------------------------

/** Resolve todos os endereços do host, na ordem devolvida pelo sistema. */
export const dnsResolver: Resolver = {
  async resolveAll(host) {
    const records = await dnsPromises.lookup(host, { all: true, verbatim: true });
    return records
      .filter((r) => r.family === 4 || r.family === 6)
      .map((r) => ({ address: r.address, family: r.family as 4 | 6 }));
  },
};

/** Cliente JSON com `fetch`: rejeita em HTTP != 2xx, erro de rede ou timeout. */
export const fetchJsonClient: HttpJsonClient = {
  async getJson(url, init) {
    const res = await fetch(url, {
      method: init.method ?? 'GET',
      headers: init.headers,
      body: init.body,
      signal: AbortSignal.timeout(init.timeoutMs),
      cache: 'no-store',
    });
    if (!res.ok) {
      // Descarta o corpo para liberar a conexão.
      await res.body?.cancel().catch(() => undefined);
      throw new Error(`HTTP ${res.status}`);
    }
    return res.json();
  },
};

const PLACES_DETAILS_PREFIX = '/v1/places/';
const BRASILAPI_CNPJ_PREFIX = '/api/cnpj/v1/';

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

// ---------------------------------------------------------------------------
// Gemini
// ---------------------------------------------------------------------------

function geminiApiKey(): string {
  return (process.env.GEMINI_API_KEY ?? '').trim();
}

function geminiModel(): string {
  const model = (process.env.GEMINI_MODEL ?? '').trim();
  return model || GEMINI_MODEL_DEFAULT;
}

/** true quando há `GEMINI_API_KEY` não vazia. */
export function isAiAvailable(): boolean {
  return geminiApiKey() !== '';
}

interface GeminiResponse {
  candidates?: Array<{ content?: { parts?: Array<{ text?: unknown }> } }>;
}

/**
 * Cliente do Gemini. A chave vai no cabeçalho `x-goog-api-key` (nunca na URL) e
 * nenhuma mensagem de erro a inclui.
 */
export function createGeminiClient(apiKey: string, model: string = GEMINI_MODEL_DEFAULT): GeminiClient {
  const url = `${GEMINI_BASE_URL}/${encodeURIComponent(model)}:generateContent`;
  return {
    async generate(prompt, { signal }) {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-goog-api-key': apiKey },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          generationConfig: { responseMimeType: 'application/json' },
        }),
        signal,
        cache: 'no-store',
      });
      if (!res.ok) {
        await res.body?.cancel().catch(() => undefined);
        throw new Error(`Gemini respondeu HTTP ${res.status}`);
      }
      const data = (await res.json()) as GeminiResponse;
      const parts = data?.candidates?.[0]?.content?.parts;
      if (!Array.isArray(parts)) throw new Error('Gemini: resposta sem conteúdo');
      return parts.map((p) => (typeof p?.text === 'string' ? p.text : '')).join('');
    },
  };
}

// ---------------------------------------------------------------------------
// Google Places, PageSpeed e BrasilAPI
// ---------------------------------------------------------------------------

/** Assinatura mínima de `fetch` aceita pelas fábricas (injetável nos testes). */
export type FetchFn = (input: string, init: RequestInit) => Promise<Response>;

function placesApiKey(): string {
  return (process.env.GOOGLE_PLACES_API_KEY ?? '').trim();
}

function pagespeedApiKey(): string {
  return (process.env.PAGESPEED_API_KEY ?? '').trim();
}

/** Substitui cada segredo não vazio (e sua forma codificada em URL) por `[redacted]`. */
export function redactSecrets(text: string, secrets: readonly (string | null | undefined)[]): string {
  let out = String(text);
  for (const secret of secrets) {
    if (!secret) continue;
    for (const form of [secret, encodeURIComponent(secret)]) {
      out = out.split(form).join('[redacted]');
    }
  }
  return out;
}

/** Erro genérico de cliente externo: sem URL, cabeçalhos nem chave. */
function genericError(timedOut: boolean): Error {
  const err = new Error(timedOut ? 'timeout' : 'erro de rede');
  if (timedOut) err.name = 'TimeoutError';
  return err;
}

/**
 * Envia a requisição com `AbortController` + timeout (inclui a leitura do corpo) e devolve
 * `{ status, json }` para qualquer status HTTP; `json = null` se o corpo não é JSON.
 * Rejeita só em rede/timeout, com mensagem genérica.
 */
async function requestJson(
  fetchFn: FetchFn,
  url: string,
  init: RequestInit,
  timeoutMs: number,
  external?: AbortSignal,
): Promise<{ status: number; json: unknown }> {
  const controller = new AbortController();
  let timedOut = false;
  const ms = Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : 0;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, ms);
  // Cancelamento da mineração (T1): encerra o fetch em curso (não conta como timeout).
  const onExternalAbort = () => controller.abort();
  if (external?.aborted) controller.abort();
  else external?.addEventListener('abort', onExternalAbort, { once: true });
  try {
    const res = await fetchFn(url, { ...init, signal: controller.signal, cache: 'no-store', redirect: 'error' });
    const text = await res.text();
    let json: unknown = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      json = null;
    }
    return { status: res.status, json };
  } catch {
    throw genericError(timedOut);
  } finally {
    clearTimeout(timer);
    external?.removeEventListener('abort', onExternalAbort);
  }
}

/** Cliente da Places API (New): host fixo `PLACES_HOST`, chave e field mask só em cabeçalhos. */
export function createPlacesHttp(apiKey: string, fetchFn: FetchFn = (u, i) => fetch(u, i)): PlacesHttp {
  const origin = new URL(PLACES_HOST).origin;
  return {
    async request(req) {
      const url = buildPlacesUrl(req.path, req.query);
      const parsed = new URL(url);
      if (parsed.origin !== origin) throw new Error('host não permitido');
      // O parser não pode ter normalizado o path ('.', '..', '//') e ele precisa ficar sob o prefixo fixo.
      const pathOk =
        parsed.pathname === req.path &&
        (parsed.pathname === SEARCH_TEXT_PATH || isSingleSegmentUnder(parsed.pathname, PLACES_DETAILS_PREFIX));
      if (!pathOk) throw genericError(false);
      const headers: Record<string, string> = {
        'x-goog-api-key': apiKey,
        'x-goog-fieldmask': req.fieldMask,
      };
      let body: string | undefined;
      if (req.method === 'POST') {
        headers['content-type'] = 'application/json';
        body = JSON.stringify(req.body ?? {});
      }
      return requestJson(fetchFn, url, { method: req.method, headers, body }, req.timeoutMs);
    },
  };
}

/** Cliente da PageSpeed Insights v5: endpoint fixo; a chave (opcional) só no cabeçalho. */
export function createPageSpeedHttp(
  apiKey: string | null,
  fetchFn: FetchFn = (u, i) => fetch(u, i),
): PageSpeedHttp {
  return {
    async run(query, timeoutMs, signal) {
      const params = new URLSearchParams(query);
      params.delete('key'); // a chave nunca vai na URL
      const url = `${PAGESPEED_ENDPOINT}?${params.toString()}`;
      const headers: Record<string, string> = { accept: 'application/json' };
      if (apiKey) headers['x-goog-api-key'] = apiKey;
      return requestJson(fetchFn, url, { method: 'GET', headers }, timeoutMs, signal);
    },
  };
}

/** Cliente da BrasilAPI: host fixo; o CNPJ entra só como segmento codificado do path. */
export function createBrasilApiHttp(fetchFn: FetchFn = (u, i) => fetch(u, i)): BrasilApiHttp {
  const origin = new URL(BRASILAPI_HOST).origin;
  return {
    async getCnpj(cnpj, timeoutMs, signal) {
      const path = brasilApiPath(cnpj);
      const url = new URL(path, BRASILAPI_HOST);
      if (url.origin !== origin) throw new Error('host não permitido');
      // Recusa CNPJ que vire segmento de ponto/vazio (o parser subiria no path).
      if (url.pathname !== path || !isSingleSegmentUnder(url.pathname, BRASILAPI_CNPJ_PREFIX)) throw genericError(false);
      return requestJson(
        fetchFn,
        url.toString(),
        { method: 'GET', headers: { accept: 'application/json' } },
        timeoutMs,
        signal,
      );
    },
  };
}

// ---------------------------------------------------------------------------
// Fábrica
// ---------------------------------------------------------------------------

let usageGate: UsageGate | null = null;
function sharedUsageGate(): UsageGate {
  usageGate ??= prismaUsageGate(prisma);
  return usageGate;
}

const nowDate = () => new Date();

/** Disponibilidade e uso do mês de Places, PageSpeed e Gemini (Req. 2.1, 2.2, 2.6). */
export function getServicesStatus(): Promise<ServicesStatus> {
  return serviceStatus({
    usage: sharedUsageGate(),
    now: nowDate,
    keys: { places: placesApiKey() !== '', pagespeed: pagespeedApiKey() !== '', gemini: geminiApiKey() !== '' },
    limits: {
      places: placesMonthlyLimit(process.env.PLACES_MONTHLY_LIMIT),
      pagespeed: pagespeedMonthlyLimit(process.env.PAGESPEED_MONTHLY_LIMIT),
      gemini: geminiMonthlyLimit(process.env.GEMINI_MONTHLY_LIMIT),
    },
  });
}

/** Dependências do Gerador_Abordagem: reutiliza o cliente e a cota do Gemini. */
export function getApproachDeps(): ApproachDeps {
  const apiKey = geminiApiKey();
  return {
    client: apiKey ? createGeminiClient(apiKey, geminiModel()) : null,
    usage: sharedUsageGate(),
    limit: geminiMonthlyLimit(process.env.GEMINI_MONTHLY_LIMIT),
    now: nowDate,
  };
}

/** Dependências da avaliação dos leads sem contato (T5): mesmo cliente e mesma cota do Gemini. */
export function getEvaluationDeps(): EvaluationDeps {
  return getApproachDeps();
}

/** Dependências da Fonte_OSM (Nominatim com limitador global + Overpass). */
export function getOsmDeps(): OsmDeps {
  return { http: fetchJsonClient, limiter: nominatimLimiter, sleep };
}

const globalForLocalidades = globalThis as unknown as {
  __leadMinerLocalidades?: { cities: CitiesService; bairros: NeighborhoodsService };
};

/**
 * Serviços de localidades do formulário (T2): cidades (IBGE) e bairros (OpenStreetMap), com cache
 * em memória compartilhado pelo processo (sobrevive ao hot reload). Nenhuma chave é necessária.
 */
export function getLocalidadesServices(): { cities: CitiesService; bairros: NeighborhoodsService } {
  globalForLocalidades.__leadMinerLocalidades ??= {
    cities: createCitiesService(),
    bairros: createNeighborhoodsService(getOsmDeps()),
  };
  return globalForLocalidades.__leadMinerLocalidades;
}

export function getPipelineDeps(): PipelineDeps {
  const now = () => Date.now();
  const apiKey = geminiApiKey();
  const placesKey = placesApiKey();
  const pagespeedKey = pagespeedApiKey();
  const usage = sharedUsageGate();
  return {
    db: prisma,
    osm: { http: fetchJsonClient, limiter: nominatimLimiter, sleep },
    google: {
      http: placesKey ? createPlacesHttp(placesKey) : null,
      usage,
      limit: placesMonthlyLimit(process.env.PLACES_MONTHLY_LIMIT),
      now: nowDate,
      sleep,
    },
    site: { resolver: dnsResolver, transport: createNodeTransport({ now }), now },
    ai: {
      client: apiKey ? createGeminiClient(apiKey, geminiModel()) : null,
      usage,
      limit: geminiMonthlyLimit(process.env.GEMINI_MONTHLY_LIMIT),
      now: nowDate,
    },
    pagespeed: {
      http: createPageSpeedHttp(pagespeedKey || null),
      usage,
      limit: pagespeedMonthlyLimit(process.env.PAGESPEED_MONTHLY_LIMIT),
      now: nowDate,
      hasKey: pagespeedKey !== '',
    },
    cnpj: { http: createBrasilApiHttp(), limiter: brasilApiLimiter, sleep, now: nowDate },
    now,
    newToken: () => randomUUID(),
  };
}

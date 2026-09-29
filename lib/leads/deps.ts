/**
 * Fábrica das dependências reais (produção) do Minerador de Leads.
 *
 * Único módulo que lê `GEMINI_API_KEY`, `GEMINI_MODEL` e `GEMINI_MONTHLY_LIMIT`
 * (Req. 1.9, 7.1). Importa `server-only` para que nunca entre no bundle do cliente.
 * Os demais módulos recebem estas dependências por injeção, o que permite testá-los
 * sem rede (Req. 20.6).
 */
import 'server-only';
import { randomUUID } from 'node:crypto';
import { promises as dnsPromises } from 'node:dns';
import { prisma } from '@/lib/prisma';
import type { GeminiClient } from './ai';
import { geminiMonthlyLimit } from './config';
import { createNodeTransport } from './net/http-transport';
import type { Resolver } from './net/ssrf';
import type { PipelineDeps } from './pipeline';
import type { HttpJsonClient } from './sources/osm';
import { nominatimLimiter } from './sources/rate-limit';
import { prismaUsageGate } from './usage';

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
// Fábrica
// ---------------------------------------------------------------------------

export function getPipelineDeps(): PipelineDeps {
  const now = () => Date.now();
  const apiKey = geminiApiKey();
  return {
    db: prisma,
    osm: { http: fetchJsonClient, limiter: nominatimLimiter, sleep },
    site: { resolver: dnsResolver, transport: createNodeTransport({ now }), now },
    ai: {
      client: apiKey ? createGeminiClient(apiKey, geminiModel()) : null,
      usage: prismaUsageGate(prisma),
      limit: geminiMonthlyLimit(process.env.GEMINI_MONTHLY_LIMIT),
      now: () => new Date(),
    },
    now,
    newToken: () => randomUUID(),
  };
}

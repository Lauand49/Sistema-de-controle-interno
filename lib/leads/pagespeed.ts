/**
 * Analisador_PageSpeed — PageSpeed Insights API v5 (Req. 10, 2.2, 2.4, 2.5).
 *
 * - `buildPageSpeedQuery`: parâmetros da requisição (url, strategy=mobile, 4 categorias). Puro.
 * - `parsePageSpeed`: converte `lighthouseResult` em `PageSpeedResult`. Puro.
 * - `runPageSpeed`: reserva 1 cota antes do envio e nunca lança.
 *
 * A chave nunca passa por aqui: o cliente real (`deps.ts`) a envia só no cabeçalho
 * `X-Goog-Api-Key` (Req. 2.2). Este módulo só recebe `site.finalUrl` de análises online,
 * já aceitas pela Guarda_SSRF (Req. 10.3).
 */
import { PAGESPEED_TIMEOUT_MS } from './config';
import type { PageSpeedOutcome, PageSpeedResult } from './types';
import { monthKey, type UsageGate } from './usage';

export interface PageSpeedHttp {
  /** Resolve `{ status, json }`; rejeita em erro de rede ou timeout (aborta no próprio `timeoutMs`). */
  run(query: URLSearchParams, timeoutMs: number): Promise<{ status: number; json: unknown }>;
}

export interface PageSpeedDeps {
  http: PageSpeedHttp;
  usage: UsageGate;
  limit: number;
  now: () => Date;
  /** Só informativo (sem chave a API funciona com cota reduzida). */
  hasKey: boolean;
}

export const PAGESPEED_ENDPOINT = 'https://www.googleapis.com/pagespeedonline/v5/runPagespeed';

const CATEGORIES = ['PERFORMANCE', 'ACCESSIBILITY', 'BEST_PRACTICES', 'SEO'] as const;

/** url, strategy=mobile, category=PERFORMANCE|ACCESSIBILITY|BEST_PRACTICES|SEO. Puro. */
export function buildPageSpeedQuery(finalUrl: string): URLSearchParams {
  const q = new URLSearchParams();
  q.set('url', finalUrl);
  q.set('strategy', 'mobile');
  for (const c of CATEGORIES) q.append('category', c);
  return q;
}

function asRecord(v: unknown): Record<string, unknown> | null {
  return v != null && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

/** Nota 0–1 → inteiro 0–100; ausente/inválida → null. */
function categoryScore(categories: Record<string, unknown> | null, key: string): number | null {
  const score = asRecord(categories?.[key])?.score;
  if (typeof score !== 'number' || !Number.isFinite(score)) return null;
  return Math.min(100, Math.max(0, Math.round(score * 100)));
}

function auditValue(audits: Record<string, unknown> | null, key: string): number | null {
  const v = asRecord(audits?.[key])?.numericValue;
  if (typeof v !== 'number' || !Number.isFinite(v) || v < 0) return null;
  return v;
}

const toMs = (v: number | null): number | null => (v == null ? null : Math.round(v));
const toCls = (v: number | null): number | null => (v == null ? null : Math.round(v * 1000) / 1000);

/** Notas round(score*100) limitadas a 0–100; LCP/TBT/FCP em ms inteiros; CLS com 3 casas. Sem desempenho → null. Puro. */
export function parsePageSpeed(json: unknown, finalUrl: string): PageSpeedResult | null {
  const lighthouse = asRecord(asRecord(json)?.lighthouseResult);
  if (!lighthouse) return null;
  const categories = asRecord(lighthouse.categories);
  const audits = asRecord(lighthouse.audits);
  const desempenho = categoryScore(categories, 'performance');
  if (desempenho == null) return null;
  return {
    desempenho,
    acessibilidade: categoryScore(categories, 'accessibility'),
    boasPraticas: categoryScore(categories, 'best-practices'),
    seo: categoryScore(categories, 'seo'),
    lcpMs: toMs(auditValue(audits, 'largest-contentful-paint')),
    cls: toCls(auditValue(audits, 'cumulative-layout-shift')),
    tbtMs: toMs(auditValue(audits, 'total-blocking-time')),
    fcpMs: toMs(auditValue(audits, 'first-contentful-paint')),
    urlAnalisada: finalUrl,
  };
}

class PageSpeedTimeoutError extends Error {}

function isTimeoutError(e: unknown): boolean {
  if (e instanceof PageSpeedTimeoutError) return true;
  const name = (e as { name?: unknown } | null)?.name;
  return name === 'TimeoutError' || name === 'AbortError';
}

/** Reserva 1 cota; 429 → COTA_ESGOTADA sem retentativa; erro → ERRO; timeout → TIMEOUT; sem nota → RESPOSTA_INVALIDA. */
export async function runPageSpeed(
  finalUrl: string,
  deps: PageSpeedDeps,
  opts: { timeoutMs?: number } = {},
): Promise<PageSpeedOutcome> {
  try {
    const timeoutMs = Math.min(opts.timeoutMs ?? PAGESPEED_TIMEOUT_MS, PAGESPEED_TIMEOUT_MS);
    // Sem tempo restante: não gasta cota nem envia.
    if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) return { ok: false, reason: 'TIMEOUT' };

    // Reserva antes do envio: o contador sobe também em erro/timeout (Req. 2.4, 2.5).
    const reserved = await deps.usage.reserve('pagespeed', monthKey(deps.now()), deps.limit);
    if (!reserved) return { ok: false, reason: 'COTA_ESGOTADA' };

    const query = buildPageSpeedQuery(finalUrl);
    let timer: ReturnType<typeof setTimeout> | undefined;
    // Proteção extra caso o cliente não respeite o próprio timeout.
    const backstop = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new PageSpeedTimeoutError('timeout')), timeoutMs);
    });
    let reply: { status: number; json: unknown };
    try {
      const call = Promise.resolve().then(() => deps.http.run(query, timeoutMs));
      call.catch(() => {});
      reply = await Promise.race([call, backstop]);
    } catch (e) {
      return { ok: false, reason: isTimeoutError(e) ? 'TIMEOUT' : 'ERRO' };
    } finally {
      clearTimeout(timer);
      backstop.catch(() => {});
    }

    // 429: cota do Google esgotada — não repete a requisição (Req. 10.6).
    if (reply.status === 429) return { ok: false, reason: 'COTA_ESGOTADA' };
    if (reply.status < 200 || reply.status >= 300) return { ok: false, reason: 'ERRO' };
    const result = parsePageSpeed(reply.json, finalUrl);
    return result ? { ok: true, result } : { ok: false, reason: 'RESPOSTA_INVALIDA' };
  } catch {
    return { ok: false, reason: 'ERRO' };
  }
}

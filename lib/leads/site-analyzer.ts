/**
 * Analisador_de_Site (Req. 3, 4).
 *
 * - Sem site ou URL inválida → resultado imediato, sem nenhuma chamada ao resolver ou ao transporte.
 * - Website sem esquema → tenta `https://` e, só se essa tentativa falhar por timeout do sub-limite,
 *   falha de conexão (DNS, recusa, encerramento) ou SSL, tenta `http://` (Req. 3.2).
 * - Orçamento total de `SITE_TIMEOUT_MS` para a análise inteira (resoluções, tentativas e
 *   redirecionamentos); a tentativa `https://` de um website sem esquema tem ainda um sub-limite
 *   de `HTTPS_ATTEMPT_TIMEOUT_MS`. Se o orçamento total se esgota, não há nova tentativa (Req. 3.9).
 * - Cada salto (URL original e destinos de redirecionamento) passa por `validateUrlShape` e
 *   `resolveAndValidate` antes de qualquer requisição; a conexão usa o IP validado (Req. 4).
 * - Só `GET`, sem corpo, cookies ou autenticação (o `TransportRequest` não carrega cabeçalhos).
 * - Nunca lança: toda falha vira `SiteAnalysis` offline com motivo.
 */
import {
  HTTPS_ATTEMPT_TIMEOUT_MS,
  MAX_BODY_BYTES,
  MAX_REDIRECTS,
  SITE_TIMEOUT_MS,
  SLOW_THRESHOLD_MS,
} from './config';
import { decodeHtml, isHtmlContentType } from './html';
import { mapNodeError, TransportError } from './net/http-transport';
import type { Transport, TransportResponse } from './net/http-transport';
import { resolveAndValidate, validateUrlShape } from './net/ssrf';
import type { Resolver } from './net/ssrf';
import type { FailureReason, SiteAnalysis, SslProblem } from './types';

/** Agenda `cb` após `ms` e devolve uma função que cancela o agendamento. */
export type SetTimer = (cb: () => void, ms: number) => () => void;

export interface SiteAnalyzerDeps {
  resolver: Resolver;
  transport: Transport;
  /** Mesmo relógio usado pelo transporte em `headersAt`. */
  now: () => number;
  /** Temporizador injetável (testes usam um falso); padrão: `setTimeout`. */
  setTimer?: SetTimer;
  /** Cancelamento da mineração (T1): aborta a análise em curso (mesmo efeito do orçamento total). */
  signal?: AbortSignal;
}

const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

const SSL_DETAIL: Record<SslProblem, string> = {
  NAO_CONFIAVEL: 'certificado não confiável',
  EXPIRADO: 'certificado expirado',
  DOMINIO_DIVERGENTE: 'domínio divergente',
};

const FAILURE_DETAIL: Record<Exclude<FailureReason, 'HTTP_ERRO' | 'SSL'>, string> = {
  TIMEOUT: 'timeout',
  DNS: 'falha de DNS',
  CONEXAO_RECUSADA: 'conexão recusada',
  CONEXAO_ENCERRADA: 'conexão encerrada',
  URL_INVALIDA: 'URL inválida',
  DESTINO_BLOQUEADO: 'destino bloqueado',
  EXCESSO_REDIRECIONAMENTOS: 'excesso de redirecionamentos',
};

const defaultSetTimer: SetTimer = (cb, ms) => {
  const handle = setTimeout(cb, ms);
  return () => clearTimeout(handle);
};

type Failure = {
  reason: Exclude<FailureReason, 'HTTP_ERRO'>;
  ssl?: SslProblem;
  /** Falha que permite o fallback `https://` → `http://` (Req. 3.2). */
  retryable: boolean;
};

type AttemptOutcome =
  | { ok: true; response: TransportResponse; url: URL }
  | ({ ok: false } & Failure);

function fail(reason: Failure['reason'], retryable: boolean, ssl?: SslProblem): AttemptOutcome {
  return ssl ? { ok: false, reason, retryable, ssl } : { ok: false, reason, retryable };
}

function detailOf(f: Failure): string {
  if (f.reason === 'SSL') return f.ssl ? SSL_DETAIL[f.ssl] : 'erro de certificado SSL';
  return FAILURE_DETAIL[f.reason];
}

/** Combina sinais (equivalente a `AbortSignal.any`, com remoção explícita dos listeners). */
function linkSignals(signals: AbortSignal[]): { signal: AbortSignal; dispose: () => void } {
  const ctl = new AbortController();
  const onAbort = () => ctl.abort();
  if (signals.some((s) => s.aborted)) {
    ctl.abort();
    return { signal: ctl.signal, dispose: () => { } };
  }
  for (const s of signals) s.addEventListener('abort', onAbort, { once: true });
  return {
    signal: ctl.signal,
    dispose: () => {
      for (const s of signals) s.removeEventListener('abort', onAbort);
    },
  };
}

/** Rejeita com TIMEOUT assim que `signal` abortar (o resolver não recebe sinal). */
function abortable<T>(p: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) return Promise.reject(new TransportError('TIMEOUT'));
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(new TransportError('TIMEOUT'));
    signal.addEventListener('abort', onAbort, { once: true });
    p.then(
      (v) => {
        signal.removeEventListener('abort', onAbort);
        resolve(v);
      },
      (e) => {
        signal.removeEventListener('abort', onAbort);
        reject(e);
      },
    );
  });
}

/** Uma tentativa completa (URL inicial + redirecionamentos), sob `signal`. */
async function runAttempt(
  start: URL,
  original: string,
  signal: AbortSignal,
  deps: SiteAnalyzerDeps,
): Promise<AttemptOutcome> {
  let current = start;
  let raw = original;
  let redirects = 0;

  for (; ;) {
    // Req. 4.1, 4.2: forma da URL antes de qualquer DNS ou conexão.
    const shape = validateUrlShape(current, raw);
    if (shape === 'URL_INVALIDA') return fail('URL_INVALIDA', false);
    if (shape !== null) return fail('DESTINO_BLOQUEADO', false);
    if (signal.aborted) return fail('TIMEOUT', true);

    // Req. 4.3, 4.11: resolve e valida todos os endereços.
    let guard: Awaited<ReturnType<typeof resolveAndValidate>>;
    try {
      guard = await abortable(resolveAndValidate(current, deps.resolver), signal);
    } catch {
      return fail(signal.aborted ? 'TIMEOUT' : 'DNS', true);
    }
    if (!guard.ok) {
      if (guard.reason === 'DNS') return fail('DNS', true);
      if (guard.reason === 'URL_INVALIDA') return fail('URL_INVALIDA', false);
      return fail('DESTINO_BLOQUEADO', false);
    }

    // Req. 4.4, 4.9: conexão só no IP validado; apenas GET, sem corpo nem cabeçalhos do sistema.
    let response: TransportResponse;
    try {
      response = await deps.transport.request({
        url: current,
        address: guard.address,
        family: guard.family,
        method: 'GET',
        signal,
        maxBodyBytes: MAX_BODY_BYTES,
        // Req. 7.1, 7.2: o corpo vem da mesma conexão validada, com o mesmo limite.
        captureBody: true,
      });
    } catch (err) {
      if (signal.aborted) return fail('TIMEOUT', true);
      const te = mapNodeError(err);
      return fail(te.kind, true, te.kind === 'SSL' ? te.ssl : undefined);
    }

    if (!REDIRECT_STATUSES.has(response.status) || response.location === null) {
      return { ok: true, response, url: current };
    }

    // Req. 4.5, 4.10: no máximo 3 redirecionamentos; o 4º não é seguido.
    if (redirects >= MAX_REDIRECTS) return fail('EXCESSO_REDIRECIONAMENTOS', false);
    const location = response.location;
    let next: URL;
    try {
      next = new URL(location, current);
    } catch {
      return fail('URL_INVALIDA', false);
    }
    // Destino relativo ao esquema (`//host`): mantém a authority original para detectar `@` vazio.
    raw = /^[\\/]{2}/.test(location) ? `${current.protocol}${location}` : location;
    current = next;
    redirects += 1;
  }
}

function noSiteResult(): SiteAnalysis {
  return {
    hasSite: false,
    online: false,
    statusCode: null,
    isHttps: false,
    sslValid: false,
    sslProblem: null,
    responseTimeMs: null,
    slow: false,
    failure: null,
    failureDetail: null,
    finalUrl: null,
  };
}

function offlineResult(f: Failure, sslProblem: SslProblem | null): SiteAnalysis {
  return {
    hasSite: true,
    online: false,
    statusCode: null,
    isHttps: false,
    sslValid: false,
    sslProblem,
    responseTimeMs: null,
    slow: false,
    failure: f.reason,
    failureDetail: detailOf(f),
    finalUrl: null,
  };
}

function responseResult(
  response: TransportResponse,
  url: URL,
  startedAt: number,
  sslProblem: SslProblem | null,
): SiteAnalysis {
  const status = response.status;
  const online = status >= 100 && status <= 399;
  const isHttps = url.protocol === 'https:';
  const elapsed = Math.max(0, Math.round(response.headersAt - startedAt));
  return {
    hasSite: true,
    online,
    statusCode: status,
    isHttps,
    // A resposta chegou por https com `rejectUnauthorized: true` → certificado validado.
    sslValid: isHttps,
    sslProblem,
    responseTimeMs: elapsed,
    slow: elapsed > SLOW_THRESHOLD_MS,
    failure: online ? null : 'HTTP_ERRO',
    failureDetail: online ? null : `HTTP ${status}`,
    finalUrl: url.href,
  };
}

/** Esquema explícito: `algo://`. Sem `//`, o texto é tratado como host (ex.: `exemplo.com.br:443`). */
const HAS_SCHEME = /^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//;

/** Resultado da análise com o Corpo_HTML decodificado (Req. 7.1, 7.3). Nunca persistido. */
export interface SiteFetch {
  analysis: SiteAnalysis;
  /** Corpo_HTML: só quando a resposta final está online, com `Content-Type` HTML e corpo. */
  html: string | null;
}

function withoutHtml(analysis: SiteAnalysis): SiteFetch {
  return { analysis, html: null };
}

/** Etapa 1, inalterado para quem já usa. */
export async function analyzeSite(website: string | null, deps: SiteAnalyzerDeps): Promise<SiteAnalysis> {
  return (await analyzeSiteWithBody(website, deps)).analysis;
}

/** Mesma lógica da Etapa 1; pede `captureBody` e devolve o Corpo_HTML decodificado. */
export async function analyzeSiteWithBody(website: string | null, deps: SiteAnalyzerDeps): Promise<SiteFetch> {
  const trimmed = (website ?? '').trim();
  // Req. 3.5: sem site → sem rede.
  if (trimmed === '') return withoutHtml(noSiteResult());

  const hasScheme = HAS_SCHEME.test(trimmed);
  const rawCandidates = hasScheme ? [trimmed] : [`https://${trimmed}`, `http://${trimmed}`];

  // Req. 3.8: URL inválida → sem rede.
  const candidates: { url: URL; raw: string }[] = [];
  for (const raw of rawCandidates) {
    try {
      candidates.push({ url: new URL(raw), raw });
    } catch {
      return withoutHtml(offlineResult({ reason: 'URL_INVALIDA', retryable: false }, null));
    }
  }

  const setTimer = deps.setTimer ?? defaultSetTimer;
  const startedAt = deps.now();
  const total = new AbortController();
  const cancelTimer = setTimer(() => total.abort(), SITE_TIMEOUT_MS);
  // Cancelamento externo encerra a análise como o orçamento total esgotado.
  const external = deps.signal;
  const onExternalAbort = () => total.abort();
  if (external?.aborted) total.abort();
  else external?.addEventListener('abort', onExternalAbort, { once: true });
  const cancelTotal = () => {
    cancelTimer();
    external?.removeEventListener('abort', onExternalAbort);
  };

  let sslProblem: SslProblem | null = null;
  let last: Failure = { reason: 'TIMEOUT', retryable: false };

  try {
    for (let i = 0; i < candidates.length; i++) {
      const { url, raw } = candidates[i];
      // Sub-limite só para a tentativa https:// de um website sem esquema.
      const withSubLimit = !hasScheme && i === 0;
      const sub = new AbortController();
      const cancelSub = withSubLimit ? setTimer(() => sub.abort(), HTTPS_ATTEMPT_TIMEOUT_MS) : () => { };
      const link = linkSignals(withSubLimit ? [total.signal, sub.signal] : [total.signal]);

      let outcome: AttemptOutcome;
      try {
        outcome = await runAttempt(url, raw, link.signal, deps);
      } finally {
        cancelSub();
        link.dispose();
      }

      if (outcome.ok) {
        const { response } = outcome;
        const analysis = responseResult(response, outcome.url, startedAt, sslProblem);
        // Req. 7.3: sem HTML se offline, sem Content-Type HTML ou sem corpo.
        const body = response.body ?? null;
        const html =
          analysis.online && body !== null && isHtmlContentType(response.contentType ?? null)
            ? decodeHtml(body, response.contentType ?? null)
            : null;
        return { analysis, html };
      }

      // Req. 3.4: problema de SSL (da tentativa https) é preservado no resultado final.
      if (outcome.ssl && sslProblem === null) sslProblem = outcome.ssl;
      last = outcome;
      // Req. 3.9: orçamento total esgotado → motivo da tentativa atual, sem nova tentativa.
      if (total.signal.aborted) break;
      if (!outcome.retryable) break;
    }
  } finally {
    cancelTotal();
  }

  // Req. 3.3: ambas falharam → motivo da última tentativa.
  return withoutHtml(offlineResult(last, sslProblem));
}

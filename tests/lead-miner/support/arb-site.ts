/**
 * Geradores de `SiteAnalysis` para os testes do Classificador e do Pontuador.
 *
 * Dão peso às fronteiras dos limites da configuração (status 399/400, latência 2500/2501)
 * e aos campos nulos (status ou tempo ausentes).
 */
import fc from 'fast-check';
import type { FailureReason, SiteAnalysis, SslProblem } from '@/lib/leads/types';

/** Análise de um site saudável: online, 200, HTTPS, SSL válido, 500 ms. */
export function goodSite(overrides: Partial<SiteAnalysis> = {}): SiteAnalysis {
  return {
    hasSite: true,
    online: true,
    statusCode: 200,
    isHttps: true,
    sslValid: true,
    sslProblem: null,
    responseTimeMs: 500,
    slow: false,
    failure: null,
    failureDetail: null,
    finalUrl: 'https://exemplo.com.br/',
    ...overrides,
  };
}

/** Análise de uma empresa sem site. */
export function noSite(overrides: Partial<SiteAnalysis> = {}): SiteAnalysis {
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
    ...overrides,
  };
}

const FAILURES: FailureReason[] = [
  'TIMEOUT',
  'DNS',
  'CONEXAO_RECUSADA',
  'CONEXAO_ENCERRADA',
  'URL_INVALIDA',
  'DESTINO_BLOQUEADO',
  'EXCESSO_REDIRECIONAMENTOS',
  'HTTP_ERRO',
  'SSL',
];
const SSL_PROBLEMS: SslProblem[] = ['NAO_CONFIAVEL', 'EXPIRADO', 'DOMINIO_DIVERGENTE'];

export const arbStatusCode: fc.Arbitrary<number | null> = fc.oneof(
  fc.constant(null),
  fc.constantFrom(200, 204, 301, 399, 400, 401, 404, 500, 503),
  fc.integer({ min: 100, max: 599 }),
);

export const arbResponseTimeMs: fc.Arbitrary<number | null> = fc.oneof(
  fc.constant(null),
  fc.constantFrom(0, 1, 2_499, 2_500, 2_501, 10_000),
  fc.integer({ min: 0, max: 20_000 }),
);

export const arbSiteAnalysis: fc.Arbitrary<SiteAnalysis> = fc.record({
  hasSite: fc.boolean(),
  online: fc.boolean(),
  statusCode: arbStatusCode,
  isHttps: fc.boolean(),
  sslValid: fc.boolean(),
  sslProblem: fc.option(fc.constantFrom(...SSL_PROBLEMS), { nil: null }),
  responseTimeMs: arbResponseTimeMs,
  slow: fc.boolean(),
  failure: fc.option(fc.constantFrom(...FAILURES), { nil: null }),
  failureDetail: fc.option(fc.constantFrom('HTTP 503', 'destino bloqueado', 'timeout', ''), { nil: null }),
  finalUrl: fc.option(fc.constantFrom('https://exemplo.com.br/', 'http://exemplo.com.br/'), { nil: null }),
});

import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { analyzeSite } from '@/lib/leads/site-analyzer';
import { TransportError } from '@/lib/leads/net/http-transport';
import type { Resolver } from '@/lib/leads/net/ssrf';
import type { FailureReason, SslProblem } from '@/lib/leads/types';
import { fakeTransport } from './support/fake-net';
import { fakeClock } from './support/fake-clock';
import { fakeTimers, hangUntilAbort } from './support/fake-timers';

type HttpsOutcome =
  | { kind: 'response'; status: number }
  | { kind: 'subTimeout' }
  | { kind: 'DNS' | 'CONEXAO_RECUSADA' | 'CONEXAO_ENCERRADA' }
  | { kind: 'SSL'; ssl: SslProblem };
type HttpOutcome = { kind: 'response'; status: number } | { kind: 'DNS' | 'CONEXAO_RECUSADA' | 'CONEXAO_ENCERRADA' };

const arbStatus = fc.integer({ min: 100, max: 599 });
const arbHttps: fc.Arbitrary<HttpsOutcome> = fc.oneof(
  arbStatus.map((status) => ({ kind: 'response' as const, status })),
  fc.constant({ kind: 'subTimeout' as const }),
  fc.constantFrom('DNS' as const, 'CONEXAO_RECUSADA' as const, 'CONEXAO_ENCERRADA' as const).map((kind) => ({ kind })),
  fc.constantFrom<SslProblem>('NAO_CONFIAVEL', 'EXPIRADO', 'DOMINIO_DIVERGENTE').map((ssl) => ({ kind: 'SSL' as const, ssl })),
);
const arbHttp: fc.Arbitrary<HttpOutcome> = fc.oneof(
  arbStatus.map((status) => ({ kind: 'response' as const, status })),
  fc.constantFrom('DNS' as const, 'CONEXAO_RECUSADA' as const, 'CONEXAO_ENCERRADA' as const).map((kind) => ({ kind })),
);
/** Quando (e em que etapa) o orçamento total de 10 s se esgota. */
const arbExhaust = fc.record({
  at: fc.constantFrom('https' as const, 'http' as const, 'never' as const),
  stage: fc.constantFrom('resolve' as const, 'request' as const),
});

describe('site-analyzer — Property 7', () => {
  it('fallback de esquema e falhas de conexão', async () => {
    // Feature: lead-miner, Property 7: For any website sem esquema, for any desfecho da tentativa https:// (resposta, estouro do sub-limite de 6 s, DNS, conexão recusada, conexão encerrada, SSL) e for any instante de esgotamento do orçamento total de 10 s (relógio falso), a tentativa http:// ocorre se e somente se o desfecho foi estouro do sub-limite, falha de conexão ou erro de SSL e o orçamento total ainda não se esgotou; se o orçamento se esgota durante a tentativa https://, o resultado é offline com o motivo da tentativa https:// (TIMEOUT) e nenhuma requisição http:// é feita; se ambas falham, o site fica offline, sem statusCode, com o motivo da última tentativa; e um sslProblem da tentativa https é preservado no resultado final.
    // **Validates: Requirements 3.2, 3.3, 3.4, 3.9**
    await fc.assert(
      fc.asyncProperty(
        fc.stringMatching(/^[a-z]{1,10}$/),
        arbHttps,
        arbHttp,
        arbExhaust,
        async (name, httpsOut, httpOut, exhaust) => {
          const host = `${name}.com.br`;
          const clock = fakeClock(0);
          const timers = fakeTimers();
          const exhaustIn = (attempt: 0 | 1) => (exhaust.at === 'https' && attempt === 0) || (exhaust.at === 'http' && attempt === 1);

          let resolveCalls = 0;
          const resolver: Resolver = {
            async resolveAll() {
              const attempt = resolveCalls++ as 0 | 1;
              if (exhaustIn(attempt)) {
                if (exhaust.stage === 'resolve') {
                  timers.fire(10_000);
                  return new Promise(() => {}); // nunca responde; o orçamento aborta
                }
                return [{ address: '93.184.216.34', family: 4 }];
              }
              const out = attempt === 0 ? httpsOut : httpOut;
              if (out.kind === 'DNS') throw Object.assign(new Error('ENOTFOUND'), { code: 'ENOTFOUND' });
              return [{ address: '93.184.216.34', family: 4 }];
            },
          };
          const transport = fakeTransport((r) => {
            const attempt = r.url.protocol === 'https:' ? 0 : 1;
            if (exhaustIn(attempt)) {
              timers.fire(10_000);
              return hangUntilAbort(r);
            }
            const out = attempt === 0 ? httpsOut : httpOut;
            switch (out.kind) {
              case 'response':
                return { status: out.status, location: null, headersAt: clock.now() + 100, bodyBytes: 0 };
              case 'subTimeout':
                timers.fire(6_000);
                return hangUntilAbort(r);
              case 'SSL':
                throw new TransportError('SSL', out.ssl);
              default:
                throw new TransportError(out.kind);
            }
          });

          const r = await analyzeSite(host, { resolver, transport, now: clock.now, setTimer: timers.setTimer });

          const httpRequests = transport.requests.filter((q) => q.url.protocol === 'http:').length;
          const httpsSsl = httpsOut.kind === 'SSL' && exhaust.at !== 'https' ? httpsOut.ssl : null;
          const expectFallback = exhaust.at !== 'https' && httpsOut.kind !== 'response';

          // A tentativa http:// ocorre sse fallback permitido e orçamento não esgotado no https.
          expect(resolveCalls).toBe(expectFallback ? 2 : 1);
          if (!expectFallback) expect(httpRequests).toBe(0);
          expect(r.sslProblem).toBe(httpsSsl);

          if (exhaust.at === 'https') {
            expect(r).toMatchObject({ online: false, statusCode: null, failure: 'TIMEOUT' });
            return;
          }
          if (httpsOut.kind === 'response') {
            expect(r.statusCode).toBe(httpsOut.status);
            expect(r.isHttps).toBe(true);
            return;
          }
          if (exhaust.at === 'http') {
            expect(r).toMatchObject({ online: false, statusCode: null, failure: 'TIMEOUT' });
            return;
          }
          if (httpOut.kind === 'response') {
            expect(r.statusCode).toBe(httpOut.status);
            expect(r.isHttps).toBe(false);
            expect(r.online).toBe(httpOut.status <= 399);
            return;
          }
          // Ambas falharam: motivo da última (http).
          expect(r).toMatchObject({ online: false, statusCode: null, failure: httpOut.kind as FailureReason });
        },
      ),
      { numRuns: 100 },
    );
  });
});

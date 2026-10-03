import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { analyzeSite } from '@/lib/leads/site-analyzer';
import { addr, fakeResolver, fakeTransport } from './support/fake-net';
import { fakeClock } from './support/fake-clock';
import { fakeTimers } from './support/fake-timers';

const REDIRECT = [301, 302, 303, 307, 308] as const;
const arbScheme = fc.constantFrom('https', 'http');

describe('site-analyzer — Property 6', () => {
  it('resultado da análise para uma resposta final', async () => {
    // Feature: lead-miner, Property 6: For any cadeia de respostas simulada que termina em uma resposta com status inteiro s (0–999), URL final com esquema e e latência t até os cabeçalhos, analyzeSite registra hasSite = true, statusCode = s, isHttps = (e = https), online = (100 ≤ s ≤ 399), failure = 'HTTP_ERRO' com motivo "HTTP s" se e somente se s está fora de 100–399, responseTimeMs = t e slow = (t > 2500).
    // **Validates: Requirements 3.1, 3.6, 3.7, 3.10, 1.5, 1.6**
    await fc.assert(
      fc.asyncProperty(
        fc.oneof(fc.integer({ min: 0, max: 999 }), fc.constantFrom(99, 100, 399, 400)),
        fc.oneof(fc.integer({ min: 0, max: 9_999 }), fc.constantFrom(0, 2_500, 2_501)),
        arbScheme,
        fc.array(fc.record({ scheme: arbScheme, status: fc.constantFrom(...REDIRECT) }), { maxLength: 3 }),
        async (s, t, firstScheme, hops) => {
          const clock = fakeClock(5_000);
          const timers = fakeTimers();
          const resolver = fakeResolver({ 'loja.com.br': [addr('93.184.216.34')] });
          let n = 0;
          const transport = fakeTransport(() => {
            const i = n++;
            if (i < hops.length) {
              return { status: hops[i].status, location: `${hops[i].scheme}://loja.com.br/p${i}`, headersAt: clock.now(), bodyBytes: 0 };
            }
            // Resposta final: 3xx sem Location também é final.
            return { status: s, location: null, headersAt: clock.now() + t, bodyBytes: 10 };
          });
          const finalScheme = hops.length > 0 ? hops[hops.length - 1].scheme : firstScheme;
          const r = await analyzeSite(`${firstScheme}://loja.com.br/`, {
            resolver,
            transport,
            now: clock.now,
            setTimer: timers.setTimer,
          });
          const online = s >= 100 && s <= 399;
          expect(r.hasSite).toBe(true);
          expect(r.statusCode).toBe(s);
          expect(r.isHttps).toBe(finalScheme === 'https');
          expect(r.online).toBe(online);
          expect(r.failure).toBe(online ? null : 'HTTP_ERRO');
          expect(r.failureDetail).toBe(online ? null : `HTTP ${s}`);
          expect(r.responseTimeMs).toBe(t);
          expect(r.slow).toBe(t > 2_500);
        },
      ),
      { numRuns: 100 },
    );
  });
});

import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { analyzeSite } from '@/lib/leads/site-analyzer';
import { fakeResolver, fakeTransport } from './support/fake-net';
import { fakeClock } from './support/fake-clock';
import { fakeTimers } from './support/fake-timers';

const arbWord = fc.stringMatching(/^[a-z][a-z0-9]{0,9}$/);
const arbPad = fc.stringOf(fc.constantFrom(' ', '\t', '\n', '\r'), { maxLength: 4 });

const arbEmpty: fc.Arbitrary<string | null> = fc.oneof(fc.constant(null), arbPad);

/** Websites não vazios que não formam URL válida (host ausente ou caracteres inválidos). */
const arbInvalid: fc.Arbitrary<string> = fc
  .tuple(
    arbPad,
    fc.oneof(
      fc.constantFrom('http://', 'https://', 'https://[::1', '://', 'http://:80'),
      fc.tuple(arbWord, arbWord).map(([a, b]) => `${a} ${b}.com.br`),
      arbWord.map((w) => `${w}.com.br:porta`),
      arbWord.map((w) => `https://${w}.com.br:99999`),
      fc.tuple(arbWord, fc.constantFrom('<', '>', '^', '|', '[', ']')).map(([w, c]) => `http://${w}${c}.com`),
    ),
    arbPad,
  )
  .map(([a, s, b]) => `${a}${s}${b}`);

describe('site-analyzer — Property 8', () => {
  it('entradas que não geram tráfego', async () => {
    // Feature: lead-miner, Property 8: For any website null, vazio ou composto só de espaços, analyzeSite retorna hasSite = false, isHttps = false, sslValid = false; for any website não vazio que não forma URL válida, retorna hasSite = true, offline, motivo "URL inválida"; em ambos os casos o resolver e o transporte falsos registram zero chamadas.
    // **Validates: Requirements 3.5, 3.8**
    await fc.assert(
      fc.asyncProperty(
        fc.oneof(
          arbEmpty.map((w) => ({ w, invalid: false })),
          arbInvalid.map((w) => ({ w, invalid: true })),
        ),
        async ({ w, invalid }) => {
          const clock = fakeClock();
          const timers = fakeTimers();
          const resolver = fakeResolver(() => [{ address: '93.184.216.34', family: 4 }]);
          const transport = fakeTransport(() => ({ status: 200, location: null, headersAt: 0, bodyBytes: 0 }));
          const r = await analyzeSite(w, { resolver, transport, now: clock.now, setTimer: timers.setTimer });
          if (invalid) {
            expect(r).toMatchObject({ hasSite: true, online: false, failure: 'URL_INVALIDA', failureDetail: 'URL inválida' });
          } else {
            expect(r).toMatchObject({ hasSite: false, isHttps: false, sslValid: false });
          }
          expect(resolver.calls).toHaveLength(0);
          expect(transport.requests).toHaveLength(0);
        },
      ),
      { numRuns: 100 },
    );
  });
});

import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { analyzeSite } from '@/lib/leads/site-analyzer';
import { isBlockedAddress } from '@/lib/leads/net/ssrf';
import { addr, fakeResolver, fakeTransport } from './support/fake-net';
import type { ResolvedAddress } from './support/fake-net';
import { fakeClock } from './support/fake-clock';
import { fakeTimers } from './support/fake-timers';
import { arbIpv4Blocked, arbIpv4Public } from './support/arb-ip';

/** Um salto da cadeia: destino do `Location` e se a Guarda_SSRF deve rejeitá-lo. */
type Hop = { location: string; blocked: boolean };

const arbScheme = fc.constantFrom('http', 'https');
const arbPath = fc.stringMatching(/^[a-z0-9]{1,8}$/);

// Hosts com resposta DNS fixa (resolvida no fakeResolver abaixo).
const DNS: Record<string, ResolvedAddress[]> = {
  'inicio.com.br': [addr('93.184.216.34')],
  'loja.com.br': [addr('93.184.216.35'), addr('2606:2800:220:1::1')],
  'cdn.com.br': [addr('151.101.1.1')],
  'interno.com.br': [addr('93.184.216.36'), addr('10.0.0.5')],
  'meta.com.br': [addr('169.254.169.254')],
};
const PUBLIC_HOSTS = ['inicio.com.br', 'loja.com.br', 'cdn.com.br'];

const arbHop: fc.Arbitrary<Hop> = fc.oneof(
  // Destinos aceitos
  fc.tuple(arbScheme, fc.constantFrom(...PUBLIC_HOSTS), arbPath).map(([s, h, p]) => ({ location: `${s}://${h}/${p}`, blocked: false })),
  arbPath.map((p) => ({ location: `/${p}`, blocked: false })),
  fc.tuple(fc.constantFrom(...PUBLIC_HOSTS), arbPath).map(([h, p]) => ({ location: `//${h}/${p}`, blocked: false })),
  fc.tuple(arbScheme, arbIpv4Public).map(([s, ip]) => ({ location: `${s}://${ip}/`, blocked: false })),
  // Bloqueados por forma
  fc.constantFrom(
    'ftp://loja.com.br/',
    'file:///etc/passwd',
    'http://loja.com.br:8080/',
    'https://user@loja.com.br/',
    'https://user:pass@loja.com.br/',
    'http://:@loja.com.br/',
    '//@loja.com.br/',
  ).map((location) => ({ location, blocked: true })),
  // Bloqueados por endereço
  fc.tuple(arbScheme, arbIpv4Blocked).map(([s, ip]) => ({ location: `${s}://${ip}/`, blocked: true })),
  fc.tuple(arbScheme, fc.constantFrom('interno.com.br', 'meta.com.br', 'localhost', 'metadata.google.internal', '[::1]', '[::ffff:127.0.0.1]')).map(
    ([s, h]) => ({ location: `${s}://${h}/`, blocked: true }),
  ),
);

// `captureBody` (Etapa 3, Req. 7.1) só controla a leitura do corpo da resposta; não envia nada.
const ALLOWED_KEYS = new Set(['url', 'address', 'family', 'method', 'signal', 'maxBodyBytes', 'captureBody']);

describe('site-analyzer — Property 11', () => {
  it('cadeia de redirecionamentos segura', async () => {
    // Feature: lead-miner, Property 11: For any cadeia de redirecionamentos simulada (0 a 6 saltos, destinos relativos ou absolutos, alguns bloqueados por forma ou por endereço), o transporte nunca recebe uma requisição para um destino rejeitado pela Guarda_SSRF, recebe no máximo 4 requisições, cada uma com address pertencente ao conjunto validado naquele salto, o resolver é chamado no máximo uma vez por salto, todas usam GET/HEAD sem corpo e sem cabeçalhos Cookie/Authorization, e o resultado é offline com "destino bloqueado" quando algum destino foi rejeitado ou com excesso de redirecionamentos quando há um 4º redirecionamento.
    // **Validates: Requirements 4.4, 4.5, 4.8, 4.9, 4.10**
    await fc.assert(
      fc.asyncProperty(
        fc.array(arbHop, { maxLength: 6 }),
        fc.constantFrom(301, 302, 303, 307, 308),
        async (hops, redirectStatus) => {
          const clock = fakeClock();
          const timers = fakeTimers();
          const resolver = fakeResolver((host) => DNS[host] ?? new Error('ENOTFOUND'));
          let n = 0;
          const transport = fakeTransport(() => {
            const i = n++;
            return i < hops.length
              ? { status: redirectStatus, location: hops[i].location, headersAt: clock.now(), bodyBytes: 0 }
              : { status: 200, location: null, headersAt: clock.now(), bodyBytes: 0 };
          });

          const r = await analyzeSite('https://inicio.com.br/', { resolver, transport, now: clock.now, setTimer: timers.setTimer });

          // Modelo: segue saltos até um bloqueado ou até o 4º redirecionamento.
          let expectedRequests = 1;
          let expected: 'ok' | 'bloqueado' | 'excesso' = 'ok';
          for (let i = 0; i < hops.length; i++) {
            if (i >= 3) {
              expected = 'excesso';
              break;
            }
            if (hops[i].blocked) {
              expected = 'bloqueado';
              break;
            }
            expectedRequests++;
          }

          expect(transport.requests.length).toBe(expectedRequests);
          expect(transport.requests.length).toBeLessThanOrEqual(4);
          // Resolver: no máximo uma chamada por salto tentado (inicial + redirecionamentos).
          expect(resolver.calls.length).toBeLessThanOrEqual(Math.min(hops.length, 3) + 1);

          for (const q of transport.requests) {
            const host = q.url.hostname.replace(/^\[|\]$/g, '');
            const validated = DNS[q.url.hostname]?.map((a) => a.address) ?? [host];
            expect(validated).toContain(q.address);
            expect(isBlockedAddress(q.address)).toBe(false);
            expect(validated.some((a) => isBlockedAddress(a))).toBe(false);
            expect(['http:', 'https:']).toContain(q.url.protocol);
            expect(['', '80', '443']).toContain(q.url.port);
            expect(q.url.username + q.url.password).toBe('');
            expect(['GET', 'HEAD']).toContain(q.method);
            for (const k of Object.keys(q)) expect(ALLOWED_KEYS.has(k)).toBe(true);
          }

          if (expected === 'ok') {
            expect(r).toMatchObject({ online: true, statusCode: 200 });
          } else if (expected === 'bloqueado') {
            expect(r).toMatchObject({ online: false, failure: 'DESTINO_BLOQUEADO', failureDetail: 'destino bloqueado' });
          } else {
            expect(r).toMatchObject({ online: false, failure: 'EXCESSO_REDIRECIONAMENTOS' });
          }
        },
      ),
      { numRuns: 100 },
    );
  });
});

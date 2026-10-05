// Feature: lead-miner-enrichment, Property 18: For any website e roteiro de respostas do transporte falso (status, redirecionamentos, Content-Type, corpo de até 2 MiB, falhas de DNS/TLS/timeout e endereços bloqueados), analyzeSiteWithBody faz exatamente as mesmas chamadas ao resolver e ao transporte (mesmos IPs validados, método GET, maxBodyBytes = 1.048.576) que o analyzeSite da Etapa 1, devolve analysis idêntico ao dele, e html é não nulo exatamente quando a resposta final está online com Content-Type HTML, tendo no máximo 1.048.576 bytes de origem.
// **Validates: Requirements 7.1, 7.2, 7.3, 7.6**
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { MAX_BODY_BYTES } from '@/lib/leads/config';
import { analyzeSite, analyzeSiteWithBody } from '@/lib/leads/site-analyzer';
import type { SiteAnalyzerDeps } from '@/lib/leads/site-analyzer';
import { addr, fakeResolver, fakeTransport } from '../lead-miner/support/fake-net';
import type { ResolverAnswer, TransportResponse } from '../lead-miner/support/fake-net';
import { fakeBodyTransport } from './support/fake-transport-body';
import type { BodyAnswer } from './support/fake-transport-body';

const HOSTS = ['a.com.br', 'b.com.br', 'c.com.br'] as const;
const PATHS = ['/', '/x'] as const;
const HREFS = HOSTS.flatMap((h) => (['https:', 'http:'] as const).flatMap((p) => PATHS.map((path) => `${p}//${h}${path}`)));

const HTML_TYPES = ['text/html', 'text/html; charset=utf-8', 'TEXT/HTML; charset=ISO-8859-1', 'application/xhtml+xml'];
const NON_HTML_TYPES = ['application/json', 'image/png', 'text/plain; charset=utf-8', 'text/htmlx'];

type Step =
  | { kind: 'response'; status: number; location: string | null; contentType: string | null; size: number; headersAt: number }
  | { kind: 'error'; code: string };

const arbStatus = fc.oneof(
  fc.constantFrom(100, 200, 204, 301, 302, 303, 307, 308, 399, 400, 404, 500, 503),
  fc.integer({ min: 100, max: 599 }),
);
const arbLocation = fc.option(
  fc.constantFrom(
    ...HREFS,
    '/x',
    '//b.com.br/',
    'http://localhost/',
    'http://127.0.0.1/',
    'ftp://a.com.br/',
    'https://user@a.com.br/',
    'http://a.com.br:8080/',
  ),
  { nil: null },
);
const arbSize = fc.oneof(
  fc.constantFrom(0, 1, MAX_BODY_BYTES - 1, MAX_BODY_BYTES, MAX_BODY_BYTES + 1, 2 * MAX_BODY_BYTES),
  fc.integer({ min: 0, max: 4096 }),
);
const arbStep: fc.Arbitrary<Step> = fc.oneof(
  {
    weight: 4, arbitrary: fc.record({
      kind: fc.constant('response' as const),
      status: arbStatus,
      location: arbLocation,
      contentType: fc.option(fc.constantFrom(...HTML_TYPES, ...NON_HTML_TYPES), { nil: null }),
      size: arbSize,
      headersAt: fc.integer({ min: 0, max: 9_000 }),
    })
  },
  {
    weight: 1, arbitrary: fc.record({
      kind: fc.constant('error' as const),
      code: fc.constantFrom('ETIMEDOUT', 'ECONNREFUSED', 'ECONNRESET', 'ENOTFOUND', 'CERT_HAS_EXPIRED', 'DEPTH_ZERO_SELF_SIGNED_CERT', 'ERR_TLS_CERT_ALTNAME_INVALID'),
    })
  },
);

type DnsAnswer = 'dns' | string[];
const arbDns: fc.Arbitrary<DnsAnswer> = fc.oneof(
  fc.constant('dns' as const),
  fc.array(fc.constantFrom('93.184.216.34', '200.147.67.142', '2606:2800:220:1::1', '10.0.0.1', '127.0.0.1', '169.254.169.254', '::1'), { minLength: 1, maxLength: 3 }),
);

const arbWebsite = fc.oneof(
  fc.constantFrom(...HREFS),
  fc.constantFrom(...HOSTS, ...HOSTS.map((h) => `${h}/x`)),
  fc.constantFrom('', '   ', 'localhost', 'http://10.0.0.1/', 'ftp://a.com.br/', 'https://a.com.br:8443/', 'http://[::1]/', 'https://exa mple.com/'),
);

const arbScenario = fc.record({
  website: fc.option(arbWebsite, { nil: null }),
  dns: fc.record(Object.fromEntries(HOSTS.map((h) => [h, arbDns])) as Record<(typeof HOSTS)[number], fc.Arbitrary<DnsAnswer>>),
  steps: fc.record(Object.fromEntries(HREFS.map((h) => [h, arbStep])) as Record<string, fc.Arbitrary<Step>>),
});

/** Corpo ASCII (1 byte por caractere) de `size` bytes, gerado sob demanda. */
function bodyOf(size: number): Uint8Array {
  return new Uint8Array(size).fill(0x61);
}
function errorOf(code: string): Error {
  return Object.assign(new Error(code), { code });
}
function resolverFor(dns: Record<string, DnsAnswer>) {
  return fakeResolver((host): ResolverAnswer => {
    const a = dns[host];
    if (a === undefined || a === 'dns') return errorOf('ENOTFOUND');
    return a.map(addr);
  });
}
const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);
/**
 * Etapa 3: transporte que devolve Content-Type e corpo (cortado em maxBodyBytes).
 * Segue o contrato de `net/http-transport.ts`: o corpo só não é capturado em
 * redirecionamento de fato (status 301/302/303/307/308 **com** `Location`). O
 * `fakeBodyTransport` compartilhado omite o corpo em qualquer 3xx, o que diverge
 * do transporte real para, p. ex., 308 sem `Location` (resposta final online).
 */
function bodyTransportFor(steps: Record<string, Step>) {
  const inner = fakeBodyTransport((r): BodyAnswer => {
    const s = steps[r.url.href];
    if (s === undefined) throw errorOf('ECONNREFUSED');
    if (s.kind === 'error') throw errorOf(s.code);
    return { status: s.status, location: s.location, headersAt: s.headersAt, contentType: s.contentType, body: bodyOf(s.size) };
  });
  return {
    requests: inner.requests,
    async request(r: Parameters<typeof inner.request>[0]) {
      const res = await inner.request(r);
      const s = steps[r.url.href];
      const realRedirect = REDIRECT_STATUSES.has(res.status) && res.location !== null;
      if (res.body === null && r.captureBody === true && !realRedirect && s?.kind === 'response') {
        return { ...res, body: bodyOf(Math.min(s.size, r.maxBodyBytes)) };
      }
      return realRedirect ? { ...res, body: null } : res;
    },
  };
}
/** Etapa 1: mesmas respostas, sem Content-Type nem corpo. */
function stage1TransportFor(steps: Record<string, Step>) {
  return fakeTransport((r): TransportResponse => {
    const s = steps[r.url.href];
    if (s === undefined) throw errorOf('ECONNREFUSED');
    if (s.kind === 'error') throw errorOf(s.code);
    return { status: s.status, location: s.location, headersAt: s.headersAt, bodyBytes: Math.min(s.size, r.maxBodyBytes) };
  });
}

const noTimer: SiteAnalyzerDeps['setTimer'] = () => () => { };
const isHtml = (ct: string | null) => ct !== null && HTML_TYPES.includes(ct);

describe('site-analyzer — Property 18', () => {
  it('captura do Corpo_HTML preserva a análise da Etapa 1', async () => {
    await fc.assert(
      fc.asyncProperty(arbScenario, async ({ website, dns, steps }) => {
        const r1 = resolverFor(dns);
        const t1 = stage1TransportFor(steps);
        const stage1 = await analyzeSite(website, {
          resolver: r1,
          transport: t1 as unknown as SiteAnalyzerDeps['transport'],
          now: () => 0,
          setTimer: noTimer,
        });

        const r3 = resolverFor(dns);
        const t3 = bodyTransportFor(steps);
        const { analysis, html } = await analyzeSiteWithBody(website, {
          resolver: r3,
          transport: t3 as unknown as SiteAnalyzerDeps['transport'],
          now: () => 0,
          setTimer: noTimer,
        });

        // Req. 7.6: análise idêntica à da Etapa 1.
        expect(analysis).toEqual(stage1);

        // Req. 7.2: mesmas chamadas ao resolver e ao transporte (mesmo IP validado, GET, limite).
        expect(r3.calls).toEqual(r1.calls);
        const shape = (rs: { url: URL; address: string; family: number; method: string; maxBodyBytes: number }[]) =>
          rs.map((q) => ({ href: q.url.href, address: q.address, family: q.family, method: q.method, maxBodyBytes: q.maxBodyBytes }));
        expect(shape(t3.requests)).toEqual(shape(t1.requests));
        for (const q of t3.requests) {
          expect(q.method).toBe('GET');
          expect(q.maxBodyBytes).toBe(MAX_BODY_BYTES);
          const answers = (dns as Record<string, DnsAnswer | undefined>)[q.url.hostname];
          expect(Array.isArray(answers) && answers.includes(q.address.replace(/^\[|\]$/g, ''))).toBe(true);
        }

        // Req. 7.1, 7.3: html só na resposta final online com Content-Type HTML.
        const finalStep = analysis.finalUrl !== null ? steps[analysis.finalUrl] : undefined;
        const expectHtml =
          analysis.online && finalStep !== undefined && finalStep.kind === 'response' && isHtml(finalStep.contentType);
        expect(html !== null).toBe(expectHtml);
        if (html !== null && finalStep?.kind === 'response') {
          // Corpo ASCII: um caractere por byte de origem, cortado em 1 MiB.
          expect(html.length).toBe(Math.min(finalStep.size, MAX_BODY_BYTES));
          expect(html.length).toBeLessThanOrEqual(MAX_BODY_BYTES);
        }
      }),
      { numRuns: 120 },
    );
  }, 120_000);
});

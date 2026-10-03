// Feature: lead-miner-enrichment, Property 26: For any Empresa e roteiro do transporte/resolver falsos, quando analyzeCompany chama o Analisador_PageSpeed a URL enviada é exatamente site.finalUrl de uma análise com online = true (portanto aceita pela Guarda_SSRF); com site offline, bloqueado, sem site ou PageSpeed desabilitado o cliente não é chamado e o motivo gravado é SITE_OFFLINE, SEM_SITE ou DESABILITADO_NA_MINERACAO.
// **Validates: Requirements 10.2, 10.3, 10.7**
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { analyzeCompany, targetWebsite, type AnalysisDeps, type AnalyzeTarget } from '@/lib/leads/analysis';
import { BLOCKED_HOSTNAMES, isBlockedAddress, validateUrlShape } from '@/lib/leads/net/ssrf';
import { intervalLimiter } from '@/lib/leads/sources/rate-limit';
import type { SiteAnalyzerDeps } from '@/lib/leads/site-analyzer';
import { addr, fakeResolver, type ResolverAnswer } from '../lead-miner/support/fake-net';
import { fakeBrasilApi } from './support/fake-brasilapi';
import { fakePageSpeed, lighthouseJson } from './support/fake-pagespeed';
import { fakeBodyTransport, type BodyAnswer } from './support/fake-transport-body';
import { memoryUsageGate } from './support/fake-usage';

const NOW = new Date('2025-06-01T12:00:00.000Z');
const NOW_MS = 1_000_000;
const DEADLINE = NOW_MS + 60_000;

const HOSTS = ['a.com.br', 'b.com.br', 'c.com.br'] as const;
const PATHS = ['/', '/x'] as const;
const HREFS = HOSTS.flatMap((h) => (['https:', 'http:'] as const).flatMap((p) => PATHS.map((path) => `${p}//${h}${path}`)));

type Step =
  | { kind: 'response'; status: number; location: string | null; html: boolean }
  | { kind: 'error'; code: string };

const arbLocation = fc.option(
  fc.constantFrom(
    ...HREFS,
    '/x',
    '//b.com.br/',
    'http://localhost/',
    'http://127.0.0.1/',
    'http://169.254.169.254/latest/meta-data/',
    'ftp://a.com.br/',
    'https://user@a.com.br/',
    'http://a.com.br:8080/',
  ),
  { nil: null },
);
const arbStep: fc.Arbitrary<Step> = fc.oneof(
  {
    weight: 4,
    arbitrary: fc.record({
      kind: fc.constant('response' as const),
      status: fc.oneof({ weight: 4, arbitrary: fc.constant(200) }, fc.constantFrom(200, 204, 301, 302, 307, 308, 404, 500, 503), fc.integer({ min: 100, max: 599 })),
      location: fc.oneof({ weight: 2, arbitrary: fc.constant(null) }, arbLocation),
      html: fc.boolean(),
    }),
  },
  {
    weight: 1,
    arbitrary: fc.record({
      kind: fc.constant('error' as const),
      code: fc.constantFrom('ETIMEDOUT', 'ECONNREFUSED', 'ECONNRESET', 'ENOTFOUND', 'CERT_HAS_EXPIRED'),
    }),
  },
);

type DnsAnswer = 'dns' | string[];
const arbDns: fc.Arbitrary<DnsAnswer> = fc.oneof(
  { weight: 3, arbitrary: fc.array(fc.constantFrom('93.184.216.34', '200.147.67.142', '2606:2800:220:1::1'), { minLength: 1, maxLength: 2 }) },
  fc.constant('dns' as const),
  fc.array(fc.constantFrom('93.184.216.34', '200.147.67.142', '2606:2800:220:1::1', '10.0.0.1', '127.0.0.1', '169.254.169.254', '::1'), {
    minLength: 1,
    maxLength: 3,
  }),
);

const arbWebsite = fc.oneof(
  { weight: 4, arbitrary: fc.constantFrom(...HREFS) },
  fc.constantFrom(...HOSTS, ...HOSTS.map((h) => `${h}/x`)),
  fc.constantFrom('', '   ', 'localhost', 'http://10.0.0.1/', 'http://169.254.169.254/', 'ftp://a.com.br/', 'https://a.com.br:8443/', 'http://[::1]/', 'https://user@a.com.br/'),
);

const arbScenario = fc.record({
  website: fc.option(arbWebsite, { nil: null, freq: 2 }),
  cacheWebsite: fc.option(arbWebsite, { nil: null, freq: 2 }),
  pagespeedEnabled: fc.boolean(),
  dns: fc.record(Object.fromEntries(HOSTS.map((h) => [h, arbDns])) as Record<(typeof HOSTS)[number], fc.Arbitrary<DnsAnswer>>),
  steps: fc.record(Object.fromEntries(HREFS.map((h) => [h, arbStep])) as Record<string, fc.Arbitrary<Step>>),
});

const errorOf = (code: string) => Object.assign(new Error(code), { code });

function target(website: string | null, cacheWebsite: string | null): AnalyzeTarget {
  return {
    companyId: 'c1',
    nicho: 'clinica_odontologica',
    nome: 'Clínica Sorriso',
    bairro: 'Vila Mariana',
    cidade: 'São Paulo',
    uf: 'SP',
    website,
    cacheWebsite,
    instagramOsm: null,
    whatsappOsm: null,
    cnpj: null,
    cnpjOrigem: null,
    cnpjCandidatos: [],
    cnpjDadosCnpj: null,
    cnpjConsultadoEm: null,
    cnpjAi: null,
  };
}

describe('analysis — Property 26', () => {
  it('PageSpeed só recebe a URL final de um site online aceito pela Guarda_SSRF', async () => {
    await fc.assert(
      fc.asyncProperty(arbScenario, async ({ website, cacheWebsite, pagespeedEnabled, dns, steps }) => {
        const resolver = fakeResolver((host): ResolverAnswer => {
          const a = (dns as Record<string, DnsAnswer>)[host];
          if (a === undefined || a === 'dns') return errorOf('ENOTFOUND');
          return a.map(addr);
        });
        const transport = fakeBodyTransport((r): BodyAnswer => {
          const s = steps[r.url.href];
          if (s === undefined) throw errorOf('ECONNREFUSED');
          if (s.kind === 'error') throw errorOf(s.code);
          return {
            status: s.status,
            location: s.location,
            contentType: s.html ? 'text/html; charset=utf-8' : 'application/json',
            body: s.html ? '<html><body>ok</body></html>' : '{}',
          };
        });
        // Roteiro com uma única resposta: uma 2ª chamada faria o fake lançar.
        const ps = fakePageSpeed([{ status: 200, json: lighthouseJson({ performance: 0.5 }) }]);
        const brasil = fakeBrasilApi([]);
        let t = NOW.getTime();
        const sleep = async (ms: number) => {
          t += ms;
        };
        const deps: AnalysisDeps = {
          site: {
            resolver,
            transport: transport as unknown as SiteAnalyzerDeps['transport'],
            now: () => 0,
            setTimer: () => () => {},
          },
          pagespeed: { http: ps, usage: memoryUsageGate(), limit: 100, now: () => NOW, hasKey: false },
          cnpj: { http: brasil, limiter: intervalLimiter(1000, { now: () => t, sleep }), sleep, now: () => new Date(t) },
          ai: { client: null, usage: memoryUsageGate(), limit: 100, now: () => NOW },
          now: () => NOW_MS,
        };

        const out = await analyzeCompany(
          target(website, cacheWebsite),
          { iaEnabled: false, pagespeedEnabled, cnpjEnabled: false, deadline: DEADLINE },
          deps,
        );
        const { site } = out;
        expect(brasil.calls).toHaveLength(0);

        const shouldCall = pagespeedEnabled && site.online && site.finalUrl !== null;
        if (shouldCall) {
          // Req. 10.2: uma requisição com a URL final da análise.
          expect(ps.calls).toHaveLength(1);
          const sent = ps.calls[0].query.get('url');
          expect(sent).toBe(site.finalUrl);
          expect(out.pagespeed).toMatchObject({ ok: true });

          // Req. 10.3: a URL enviada foi aceita pela Guarda_SSRF na análise do site.
          const u = new URL(sent as string);
          expect(validateUrlShape(u)).toBeNull();
          expect(BLOCKED_HOSTNAMES).not.toContain(u.hostname.toLowerCase());
          const hits = transport.requests.filter((q) => q.url.href === sent);
          expect(hits.length).toBeGreaterThan(0);
          const answers = (dns as Record<string, DnsAnswer>)[u.hostname];
          for (const q of hits) {
            const ip = q.address.replace(/^\[|\]$/g, '');
            expect(isBlockedAddress(ip)).toBe(false);
            expect(Array.isArray(answers) && answers.includes(ip)).toBe(true);
          }
        } else {
          // Req. 10.7: nenhuma chamada e motivo da ausência gravado.
          expect(ps.calls).toHaveLength(0);
          const reason = !pagespeedEnabled ? 'DESABILITADO_NA_MINERACAO' : !site.hasSite ? 'SEM_SITE' : 'SITE_OFFLINE';
          expect(out.pagespeed).toEqual({ ok: false, reason });
          if (targetWebsite({ website, cacheWebsite }) === null) expect(site.hasSite).toBe(false);
        }
      }),
      { numRuns: 150 },
    );
  }, 120_000);
});

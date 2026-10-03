// Feature: lead-miner-enrichment, Property 27: Cada Empresa cabe no Lote
/**
 * **Validates: Requirements 10.8**
 *
 * Para qualquer combinação de IA, PageSpeed e CNPJ habilitados:
 * - `perCompanyMarginMs` ≥ 10 s (site) + o maior pior caso dos serviços habilitados + 2 s
 *   (gravação), e uma Empresa iniciada no último instante permitido do Lote
 *   (`BATCH_BUDGET_MS − margem`) termina em no máximo 60 s;
 * - para qualquer roteiro de latências dos fakes (site, PageSpeed, BrasilAPI e IA respondendo,
 *   falhando ou esgotando o timeout), com timers falsos, `analyzeCompany` iniciada como o Lote
 *   inicia (`now + margem <= deadline`) conclui dentro da margem e antes de `deadline − 2 s`.
 *
 * Toda I/O é falsa; o relógio (`Date`/`setTimeout`) é o do vitest. Nada sai para a rede.
 */
import fc from 'fast-check';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { analyzeCompany, ANALYSIS_WRITE_MARGIN_MS, type AnalysisDeps, type AnalyzeTarget } from '@/lib/leads/analysis';
import { formatCnpj } from '@/lib/leads/cnpj';
import {
  BATCH_BUDGET_MS,
  BRASILAPI_RETRY_DELAY_MS,
  BRASILAPI_TIMEOUT_MS,
  GEMINI_TIMEOUT_MS,
  PAGESPEED_TIMEOUT_MS,
  SITE_TIMEOUT_MS,
} from '@/lib/leads/config';
import { perCompanyMarginMs } from '@/lib/leads/pipeline';
import { intervalLimiter } from '@/lib/leads/sources/rate-limit';
import type { SiteAnalyzerDeps } from '@/lib/leads/site-analyzer';
import { addr, fakeResolver } from '../lead-miner/support/fake-net';
import { brasilApiJson, fakeBrasilApi, type BrasilApiCall } from './support/fake-brasilapi';
import { fakeGemini, type GeminiStep } from './support/fake-gemini';
import { fakePageSpeed, lighthouseJson, type PageSpeedCall } from './support/fake-pagespeed';
import { fakeBodyTransport, type BodyAnswer, type BodyTransportRequest } from './support/fake-transport-body';
import { memoryUsageGate } from './support/fake-usage';
import { realSleep, type ScriptStep } from './support/scripted';

const LIMITE_LOTE_MS = 60_000;
const SITE = 'https://clinica.example.com.br/';
const CNPJ_A = '11222333000181';

const flagsArb = fc.record({ iaEnabled: fc.boolean(), pagespeedEnabled: fc.boolean(), cnpjEnabled: fc.boolean() });

/** Pior caso de cada serviço do bloco paralelo, derivado só das constantes de `config.ts`. */
function expectedWorstParallel(f: { iaEnabled: boolean; pagespeedEnabled: boolean; cnpjEnabled: boolean }): number {
  return Math.max(
    0,
    f.pagespeedEnabled ? PAGESPEED_TIMEOUT_MS : 0,
    f.cnpjEnabled ? BRASILAPI_TIMEOUT_MS + BRASILAPI_RETRY_DELAY_MS + BRASILAPI_TIMEOUT_MS : 0,
    f.iaEnabled ? GEMINI_TIMEOUT_MS : 0,
  );
}

describe('Property 27: Cada Empresa cabe no Lote — margem', () => {
  it('margem cobre site + maior serviço habilitado + gravação e cabe nos 60 s', () => {
    fc.assert(
      fc.property(flagsArb, (f) => {
        const margin = perCompanyMarginMs(f);
        expect(margin).toBeGreaterThanOrEqual(SITE_TIMEOUT_MS + expectedWorstParallel(f) + ANALYSIS_WRITE_MARGIN_MS);
        // Ao menos uma Empresa pode iniciar num Lote novo.
        expect(margin).toBeLessThanOrEqual(BATCH_BUDGET_MS);
        // Última Empresa iniciada em BATCH_BUDGET_MS − margem termina dentro do limite.
        expect(BATCH_BUDGET_MS - margin + margin).toBeLessThanOrEqual(LIMITE_LOTE_MS);
      }),
      { numRuns: 50 },
    );
  });
});

// ---------------------------------------------------------------------------
// Roteiros de latência
// ---------------------------------------------------------------------------

/** Site: responde após `ms` ou nunca responde (só termina no abort do Analisador_de_Site). */
const siteArb = fc.oneof(
  fc.record({ hang: fc.constant(true as const) }),
  fc.record({ ms: fc.integer({ min: 0, max: 15_000 }), hasCnpj: fc.boolean() }),
);

const replyArb = <Req>(okJson: unknown): fc.Arbitrary<ScriptStep<Req>> =>
  fc.oneof(
    fc.record({ status: fc.constantFrom(200, 404, 429, 503), delayMs: fc.integer({ min: 0, max: 45_000 }) }).map(
      (s): ScriptStep<Req> => (s.status === 200 ? { ...s, json: okJson } : s),
    ),
    fc.record({ error: fc.constantFrom('timeout' as const, 'network' as const), delayMs: fc.integer({ min: 0, max: 45_000 }) }),
  );

const geminiArb: fc.Arbitrary<GeminiStep> = fc.oneof(
  fc.constant({ hang: true } as const),
  fc.record({ delayMs: fc.integer({ min: 0, max: 30_000 }) }).map((s) => ({ text: '{}', ...s })),
);

const scenarioArb = fc.record({
  flags: flagsArb,
  /** Folga do deadline além da margem; 0 = Empresa iniciada no último instante permitido. */
  slack: fc.oneof(fc.constant(0), fc.integer({ min: 0, max: 30_000 })),
  site: siteArb,
  pagespeed: replyArb<PageSpeedCall>(lighthouseJson()),
  brasil: fc.tuple(replyArb<BrasilApiCall>(brasilApiJson(CNPJ_A)), replyArb<BrasilApiCall>(brasilApiJson(CNPJ_A))),
  gemini: geminiArb,
});

type Scenario = typeof scenarioArb extends fc.Arbitrary<infer T> ? T : never;

function abortError(): Error {
  return Object.assign(new Error('aborted'), { name: 'AbortError' });
}

/** Resposta do site após `ms` (timer falso), rejeitando se o sinal abortar antes. */
function delayedSite(s: Scenario['site']) {
  return (r: BodyTransportRequest) =>
    new Promise<BodyAnswer>((resolve, reject) => {
      if (r.signal.aborted) return reject(abortError());
      r.signal.addEventListener('abort', () => reject(abortError()), { once: true });
      if ('hang' in s) return;
      const body = `<html><body>${s.hasCnpj ? `<footer>CNPJ ${formatCnpj(CNPJ_A)}</footer>` : ''}</body></html>`;
      setTimeout(() => resolve({ status: 200, contentType: 'text/html; charset=utf-8', body }), s.ms);
    });
}

function target(): AnalyzeTarget {
  return {
    companyId: 'c1',
    nicho: 'clinica_odontologica',
    nome: 'Clínica Sorriso',
    bairro: 'Vila Mariana',
    cidade: 'São Paulo',
    uf: 'SP',
    website: SITE,
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

function depsFor(s: Scenario): AnalysisDeps {
  const now = () => Date.now();
  const sleep = realSleep; // usa o setTimeout falso
  return {
    site: {
      resolver: fakeResolver({ 'clinica.example.com.br': [addr('93.184.216.34')] }),
      transport: fakeBodyTransport(delayedSite(s.site)) as unknown as SiteAnalyzerDeps['transport'],
      now,
    },
    pagespeed: {
      http: fakePageSpeed([s.pagespeed], { sleep }),
      usage: memoryUsageGate(),
      limit: 1_000,
      now: () => new Date(now()),
      hasKey: false,
    },
    cnpj: {
      http: fakeBrasilApi(s.brasil, { sleep }),
      limiter: intervalLimiter(1_000, { now, sleep }),
      sleep,
      now: () => new Date(now()),
    },
    ai: { client: fakeGemini([s.gemini], { sleep }), usage: memoryUsageGate(), limit: 1_000, now: () => new Date(now()) },
    now,
  };
}

describe('Property 27: Cada Empresa cabe no Lote — analyzeCompany com timers falsos', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
    vi.setSystemTime(new Date('2025-06-01T12:00:00.000Z'));
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('conclui dentro da margem e antes de deadline − gravação, mesmo com timeouts esgotados', async () => {
    await fc.assert(
      fc.asyncProperty(scenarioArb, async (s) => {
        const margin = perCompanyMarginMs(s.flags);
        const start = Date.now();
        const deadline = start + margin + s.slack;
        // O Lote só inicia a Empresa se now + margem <= deadline.
        expect(start + margin).toBeLessThanOrEqual(deadline);

        let finishedAt: number | null = null;
        let failure: unknown = null;
        analyzeCompany(target(), { ...s.flags, deadline }, depsFor(s)).then(
          () => {
            finishedAt = Date.now();
          },
          (e) => {
            failure = e;
            finishedAt = Date.now();
          },
        );

        // Avança o relógio falso até a análise terminar (teto bem acima de qualquer margem).
        const hardStop = start + 5 * LIMITE_LOTE_MS;
        while (finishedAt === null && Date.now() < hardStop) {
          await vi.advanceTimersByTimeAsync(250);
        }
        vi.clearAllTimers();

        expect(failure).toBeNull();
        expect(finishedAt).not.toBeNull();
        const elapsed = (finishedAt as unknown as number) - start;
        expect(elapsed).toBeLessThanOrEqual(margin - ANALYSIS_WRITE_MARGIN_MS);
        expect(finishedAt as unknown as number).toBeLessThanOrEqual(deadline - ANALYSIS_WRITE_MARGIN_MS);
      }),
      { numRuns: 100 },
    );
  }, 60_000);
});

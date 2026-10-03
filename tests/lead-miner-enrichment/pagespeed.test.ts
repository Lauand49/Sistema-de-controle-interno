import { describe, expect, it } from 'vitest';
import { PAGESPEED_TIMEOUT_MS } from '@/lib/leads/config';
import { buildPageSpeedQuery, parsePageSpeed, runPageSpeed, type PageSpeedDeps } from '@/lib/leads/pagespeed';
import { monthKey } from '@/lib/leads/usage';
import { fakePageSpeed, lighthouseJson, type PageSpeedCall } from './support/fake-pagespeed';
import { memoryUsageGate, type UsageCounts } from './support/fake-usage';
import type { ScriptStep } from './support/scripted';

const URL_ = 'https://clinica.example.com.br/';
const NOW = new Date('2025-06-15T12:00:00.000Z');
const MONTH = monthKey(NOW);
const LIMIT = 100;

function setup(
  script: ReadonlyArray<ScriptStep<PageSpeedCall>>,
  opts: { hasKey?: boolean; initial?: UsageCounts; limit?: number } = {},
) {
  const log: string[] = [];
  const http = fakePageSpeed(script, { log });
  const usage = memoryUsageGate(opts.initial ?? {}, log);
  const deps: PageSpeedDeps = {
    http,
    usage,
    limit: opts.limit ?? LIMIT,
    now: () => NOW,
    hasKey: opts.hasKey ?? false,
  };
  return { http, usage, deps, log };
}

describe('buildPageSpeedQuery', () => {
  it('monta url, strategy=mobile e as 4 categorias, sem chave', () => {
    const q = buildPageSpeedQuery(URL_);
    expect(q.get('url')).toBe(URL_);
    expect(q.get('strategy')).toBe('mobile');
    expect(q.getAll('category')).toEqual(['PERFORMANCE', 'ACCESSIBILITY', 'BEST_PRACTICES', 'SEO']);
    expect(q.has('key')).toBe(false);
  });
});

describe('parsePageSpeed', () => {
  it('sem lighthouseResult → null', () => {
    expect(parsePageSpeed({}, URL_)).toBeNull();
    expect(parsePageSpeed(null, URL_)).toBeNull();
  });
});

describe('runPageSpeed', () => {
  it('sucesso: converte notas para 0–100, métricas em ms inteiros e CLS com 3 casas', async () => {
    const { deps, http, usage, log } = setup([{ status: 200, json: lighthouseJson() }]);
    const out = await runPageSpeed(URL_, deps);
    expect(out).toEqual({
      ok: true,
      result: {
        desempenho: 42,
        acessibilidade: 90,
        boasPraticas: 80,
        seo: 75,
        lcpMs: 4200,
        cls: 0.123,
        tbtMs: 351,
        fcpMs: 1800,
        urlAnalisada: URL_,
      },
    });
    expect(http.calls).toHaveLength(1);
    expect(http.calls[0].timeoutMs).toBe(PAGESPEED_TIMEOUT_MS);
    // Reserva acontece antes do envio.
    expect(log).toEqual(['reserve:pagespeed:ok', `pagespeed:${URL_}`]);
    expect(usage.peek('pagespeed', MONTH)).toBe(1);
  });

  it('categorias secundárias ausentes viram null sem invalidar o resultado', async () => {
    const json = lighthouseJson({ accessibility: null, seo: null, lcp: null });
    const { deps } = setup([{ status: 200, json }]);
    const out = await runPageSpeed(URL_, deps);
    expect(out.ok).toBe(true);
    if (out.ok) {
      expect(out.result.acessibilidade).toBeNull();
      expect(out.result.seo).toBeNull();
      expect(out.result.lcpMs).toBeNull();
      expect(out.result.desempenho).toBe(42);
    }
  });

  it('erro HTTP (500) → ERRO, com cota já consumida', async () => {
    const { deps, http, usage } = setup([{ status: 500, json: { error: {} } }]);
    expect(await runPageSpeed(URL_, deps)).toEqual({ ok: false, reason: 'ERRO' });
    expect(http.calls).toHaveLength(1);
    expect(usage.peek('pagespeed', MONTH)).toBe(1);
  });

  it('erro de rede → ERRO', async () => {
    const { deps } = setup([{ error: 'network' }]);
    expect(await runPageSpeed(URL_, deps)).toEqual({ ok: false, reason: 'ERRO' });
  });

  it('timeout → TIMEOUT, com cota consumida', async () => {
    const { deps, usage } = setup([{ status: 200, json: lighthouseJson(), delayMs: PAGESPEED_TIMEOUT_MS + 1 }]);
    expect(await runPageSpeed(URL_, deps)).toEqual({ ok: false, reason: 'TIMEOUT' });
    expect(usage.peek('pagespeed', MONTH)).toBe(1);
  });

  it('429 → COTA_ESGOTADA sem retentativa', async () => {
    const { deps, http } = setup([{ status: 429, json: {} }]);
    expect(await runPageSpeed(URL_, deps)).toEqual({ ok: false, reason: 'COTA_ESGOTADA' });
    expect(http.calls).toHaveLength(1);
    expect(http.remaining()).toBe(0);
  });

  it('resposta sem nota de desempenho → RESPOSTA_INVALIDA', async () => {
    const { deps } = setup([{ status: 200, json: lighthouseJson({ performance: null }) }]);
    expect(await runPageSpeed(URL_, deps)).toEqual({ ok: false, reason: 'RESPOSTA_INVALIDA' });
  });

  it('cota local recusada → COTA_ESGOTADA e nada é enviado', async () => {
    const { deps, http, log } = setup([], { initial: { [`pagespeed:${MONTH}`]: LIMIT } });
    expect(await runPageSpeed(URL_, deps)).toEqual({ ok: false, reason: 'COTA_ESGOTADA' });
    expect(http.calls).toHaveLength(0);
    expect(log).toEqual(['reserve:pagespeed:negada']);
  });

  it('chave ausente ou presente: a requisição é idêntica e nunca contém a chave', async () => {
    const queries: string[] = [];
    for (const hasKey of [false, true]) {
      const { deps, http } = setup([{ status: 200, json: lighthouseJson() }], { hasKey });
      const out = await runPageSpeed(URL_, deps);
      expect(out.ok).toBe(true);
      const q = http.calls[0].query;
      expect(q.has('key')).toBe(false);
      expect(q.toString().toLowerCase()).not.toContain('key');
      queries.push(q.toString());
    }
    expect(queries[0]).toBe(queries[1]);
  });
});

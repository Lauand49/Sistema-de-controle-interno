// Feature: lead-miner-enrichment, Property 25: Resultado do PageSpeed
/**
 * **Validates: Requirements 10.4, 10.5, 10.6, 10.7**
 *
 * Para qualquer JSON gerado (notas 0–1 ou ausentes, métricas numéricas ou ausentes) e
 * qualquer desfecho do cliente falso (2xx, 429, outro erro, timeout, rede), `runPageSpeed`
 * nunca lança e devolve: `ok` com notas inteiras 0–100 (round(score×100)), LCP/TBT/FCP em
 * ms inteiros e CLS com no máximo 3 casas quando há nota de desempenho; `RESPOSTA_INVALIDA`
 * sem a nota; `COTA_ESGOTADA` para 429 com uma única requisição; `TIMEOUT`/`ERRO` nos demais.
 */
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { runPageSpeed, type PageSpeedDeps } from '@/lib/leads/pagespeed';
import { fakePageSpeed, lighthouseJson, type LighthouseValues, type PageSpeedCall } from './support/fake-pagespeed';
import { memoryUsageGate } from './support/fake-usage';
import type { ScriptStep } from './support/scripted';

const URL_ = 'https://clinica.example.com.br/';
const NOW = new Date('2025-06-15T12:00:00.000Z');

const score = fc.option(fc.double({ min: 0, max: 1, noNaN: true }), { nil: null });
const ms = fc.option(fc.double({ min: 0, max: 120_000, noNaN: true }), { nil: null });
const clsArb = fc.option(fc.double({ min: 0, max: 10, noNaN: true }), { nil: null });

const valuesArb: fc.Arbitrary<LighthouseValues> = fc.record({
  performance: score,
  accessibility: score,
  bestPractices: score,
  seo: score,
  lcp: ms,
  cls: clsArb,
  tbt: ms,
  fcp: ms,
});

type Outcome =
  | { kind: 'ok'; status: number }
  | { kind: '429' }
  | { kind: 'http-error'; status: number }
  | { kind: 'timeout' }
  | { kind: 'network' };

const outcomeArb: fc.Arbitrary<Outcome> = fc.oneof(
  fc.integer({ min: 200, max: 299 }).map((status) => ({ kind: 'ok' as const, status })),
  fc.constant({ kind: '429' as const }),
  fc
    .oneof(fc.integer({ min: 300, max: 428 }), fc.integer({ min: 430, max: 599 }))
    .map((status) => ({ kind: 'http-error' as const, status })),
  fc.constant({ kind: 'timeout' as const }),
  fc.constant({ kind: 'network' as const }),
);

function step(o: Outcome, json: unknown): ScriptStep<PageSpeedCall> {
  switch (o.kind) {
    case 'ok':
      return { status: o.status, json };
    case '429':
      return { status: 429, json: { error: { code: 429 } } };
    case 'http-error':
      return { status: o.status, json: { error: { code: o.status } } };
    case 'timeout':
      return { error: 'timeout' };
    case 'network':
      return { error: 'network' };
  }
}

const pct = (v: number | null | undefined) => (v == null ? null : Math.round(v * 100));
const intMs = (v: number | null | undefined) => (v == null ? null : Math.round(v));

describe('Property 25: Resultado do PageSpeed', () => {
  it('desfecho e conversões seguem o contrato para qualquer JSON e resposta', async () => {
    await fc.assert(
      fc.asyncProperty(valuesArb, outcomeArb, async (values, outcome) => {
        // Script com 1 passo extra: se houver retentativa, `calls` acusa.
        const http = fakePageSpeed([step(outcome, lighthouseJson(values)), { status: 200, json: lighthouseJson() }]);
        const usage = memoryUsageGate();
        const deps: PageSpeedDeps = { http, usage, limit: 100, now: () => NOW, hasKey: true };

        const out = await runPageSpeed(URL_, deps);

        // Uma única requisição em todos os casos (sem retentativa, inclusive no 429).
        expect(http.calls).toHaveLength(1);

        switch (outcome.kind) {
          case '429':
            expect(out).toEqual({ ok: false, reason: 'COTA_ESGOTADA' });
            return;
          case 'http-error':
          case 'network':
            expect(out).toEqual({ ok: false, reason: 'ERRO' });
            return;
          case 'timeout':
            expect(out).toEqual({ ok: false, reason: 'TIMEOUT' });
            return;
          case 'ok':
            break;
        }

        if (values.performance == null) {
          expect(out).toEqual({ ok: false, reason: 'RESPOSTA_INVALIDA' });
          return;
        }
        expect(out.ok).toBe(true);
        if (!out.ok) return;
        const r = out.result;

        for (const s of [r.desempenho, r.acessibilidade, r.boasPraticas, r.seo]) {
          if (s == null) continue;
          expect(Number.isInteger(s)).toBe(true);
          expect(s).toBeGreaterThanOrEqual(0);
          expect(s).toBeLessThanOrEqual(100);
        }
        expect(r.desempenho).toBe(pct(values.performance));
        expect(r.acessibilidade).toBe(pct(values.accessibility));
        expect(r.boasPraticas).toBe(pct(values.bestPractices));
        expect(r.seo).toBe(pct(values.seo));

        for (const m of [r.lcpMs, r.tbtMs, r.fcpMs]) {
          if (m != null) expect(Number.isInteger(m)).toBe(true);
        }
        expect(r.lcpMs).toBe(intMs(values.lcp));
        expect(r.tbtMs).toBe(intMs(values.tbt));
        expect(r.fcpMs).toBe(intMs(values.fcp));

        if (values.cls == null) {
          expect(r.cls).toBeNull();
        } else {
          expect(r.cls).not.toBeNull();
          const cls = r.cls as number;
          // No máximo 3 casas decimais e a no máximo 0,0005 do valor original.
          expect(Number((cls * 1000).toFixed(6)) % 1).toBe(0);
          expect(Math.abs(cls - values.cls)).toBeLessThanOrEqual(0.0005 + 1e-12);
        }
        expect(r.urlAnalisada).toBe(URL_);
      }),
      { numRuns: 200 },
    );
  });
});

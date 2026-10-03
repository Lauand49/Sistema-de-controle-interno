// Feature: lead-miner-enrichment, Property 33: For any sequência de desfechos por tentativa (200, 404, 429, 5xx, timeout), lookupCnpj faz uma tentativa e, somente após 429/5xx/timeout, uma segunda após exatamente 2.000 ms; devolve NAO_ENCONTRADO para 404 sem retentar, ok no primeiro sucesso e INDISPONIVEL após duas falhas retentáveis, sem lançar.
/**
 * **Validates: Requirements 12.5**
 */
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { lookupCnpj, type BrasilApiDeps, type BrasilApiHttp } from '@/lib/leads/brasilapi';
import { BRASILAPI_RETRY_DELAY_MS, BRASILAPI_TIMEOUT_MS } from '@/lib/leads/config';
import { intervalLimiter } from '@/lib/leads/sources/rate-limit';
import { brasilApiJson, fakeBrasilApi, type BrasilApiCall } from './support/fake-brasilapi';
import type { ScriptStep } from './support/scripted';

const CNPJ = '11222333000181';
const T0 = new Date('2025-06-01T12:00:00.000Z').getTime();

type Outcome =
  | { kind: 'OK'; delayMs: number }
  | { kind: 'NOT_FOUND'; delayMs: number }
  | { kind: 'RATE'; delayMs: number }
  | { kind: 'SERVER'; status: number; delayMs: number }
  | { kind: 'TIMEOUT'; viaDelay: boolean };

const delay = fc.integer({ min: 0, max: BRASILAPI_TIMEOUT_MS });
const outcome: fc.Arbitrary<Outcome> = fc.oneof(
  fc.record({ kind: fc.constant('OK' as const), delayMs: delay }),
  fc.record({ kind: fc.constant('NOT_FOUND' as const), delayMs: delay }),
  fc.record({ kind: fc.constant('RATE' as const), delayMs: delay }),
  fc.record({ kind: fc.constant('SERVER' as const), status: fc.integer({ min: 500, max: 599 }), delayMs: delay }),
  fc.record({ kind: fc.constant('TIMEOUT' as const), viaDelay: fc.boolean() }),
);

function toStep(o: Outcome): ScriptStep<BrasilApiCall> {
  switch (o.kind) {
    case 'OK':
      return { status: 200, json: brasilApiJson(CNPJ), delayMs: o.delayMs };
    case 'NOT_FOUND':
      return { status: 404, delayMs: o.delayMs };
    case 'RATE':
      return { status: 429, delayMs: o.delayMs };
    case 'SERVER':
      return { status: o.status, delayMs: o.delayMs };
    case 'TIMEOUT':
      // estoura o timeout pelo atraso ou rejeita diretamente com "timeout"
      return o.viaDelay ? { status: 200, json: brasilApiJson(CNPJ), delayMs: BRASILAPI_TIMEOUT_MS + 1 } : { error: 'timeout' };
  }
}

const retryable = (o: Outcome) => o.kind === 'RATE' || o.kind === 'SERVER' || o.kind === 'TIMEOUT';

describe('Property 33: Retentativa da BrasilAPI', () => {
  it('1 tentativa; 2ª só após 429/5xx/timeout, exatamente 2.000 ms depois; desfecho conforme o modelo', async () => {
    await fc.assert(
      fc.asyncProperty(fc.tuple(outcome, outcome), async ([first, second]) => {
        // Relógio virtual: `sleep` avança o tempo sem esperar.
        let t = T0;
        const sleeps: number[] = [];
        const sleep = async (ms: number) => {
          sleeps.push(ms);
          t += ms;
        };
        const fake = fakeBrasilApi([toStep(first), toStep(second)], { sleep });
        const spans: Array<{ start: number; end: number }> = [];
        const http: BrasilApiHttp = {
          async getCnpj(cnpj, timeoutMs) {
            const span = { start: t, end: t };
            spans.push(span);
            try {
              return await fake.getCnpj(cnpj, timeoutMs);
            } finally {
              span.end = t;
            }
          },
        };
        const deps: BrasilApiDeps = {
          http,
          limiter: intervalLimiter(1000, { now: () => t, sleep }),
          sleep,
          now: () => new Date(t),
        };

        let out: Awaited<ReturnType<typeof lookupCnpj>>;
        try {
          out = await lookupCnpj(CNPJ, deps);
        } catch (e) {
          throw new Error(`lookupCnpj lançou: ${String(e)}`);
        }

        // ---------- Modelo ----------
        const expCalls = retryable(first) ? 2 : 1;
        const decisive = retryable(first) ? second : first;
        const expected =
          decisive.kind === 'OK' ? 'OK' : decisive.kind === 'NOT_FOUND' ? 'NAO_ENCONTRADO' : 'INDISPONIVEL';

        expect(fake.calls).toHaveLength(expCalls);
        for (const c of fake.calls) expect(c).toEqual({ cnpj: CNPJ, timeoutMs: BRASILAPI_TIMEOUT_MS });

        if (expCalls === 2) {
          // a 2ª tentativa começa exatamente 2.000 ms após o fim da 1ª
          expect(spans[1].start - spans[0].end).toBe(BRASILAPI_RETRY_DELAY_MS);
          expect(sleeps).toContain(BRASILAPI_RETRY_DELAY_MS);
        }

        if (expected === 'OK') {
          expect(out.ok).toBe(true);
          if (out.ok) {
            expect(out.data.cnpj).toBe(CNPJ);
            expect(out.data.razaoSocial).toBe('CLINICA SORRISO LTDA');
          }
        } else {
          expect(out).toEqual({ ok: false, reason: expected });
        }
      }),
      { numRuns: 200 },
    );
  });
});

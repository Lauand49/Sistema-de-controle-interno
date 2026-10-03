// Feature: lead-miner-enrichment, Property 5: Espaçamento da BrasilAPI
/**
 * **Validates: Requirements 2.3**
 *
 * Para qualquer conjunto de consultas de CNPJ disparadas concorrentemente por várias
 * Mineracoes/Reanalises sobre o mesmo limitador global (relógio virtual), com respostas de
 * sucesso ou falha (2xx, 404, 4xx, 429, 5xx, erro de rede) e latências variadas, os instantes
 * de início de quaisquer duas requisições consecutivas à BrasilAPI diferem em pelo menos
 * 1.000 ms, e cada consulta é executada exatamente uma vez por tentativa.
 */
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { lookupCnpj, type BrasilApiDeps } from '@/lib/leads/brasilapi';
import { BRASILAPI_MIN_INTERVAL_MS } from '@/lib/leads/config';
import { intervalLimiter } from '@/lib/leads/sources/rate-limit';
import { brasilApiJson } from './support/fake-brasilapi';

/** Relógio virtual com temporizadores: o tempo só avança quando todos estão aguardando. */
function virtualClock(start: number) {
  let t = start;
  let seq = 0;
  const timers: { at: number; seq: number; resolve: () => void }[] = [];
  return {
    now: () => t,
    sleep: (ms: number) =>
      new Promise<void>((resolve) => {
        timers.push({ at: t + Math.max(0, ms), seq: seq++, resolve });
      }),
    /** Esvazia microtarefas e dispara o próximo temporizador; false quando não há nenhum. */
    async step(): Promise<boolean> {
      await new Promise<void>((r) => setImmediate(r));
      if (timers.length === 0) return false;
      timers.sort((a, b) => a.at - b.at || a.seq - b.seq);
      const next = timers.shift()!;
      t = Math.max(t, next.at);
      next.resolve();
      return true;
    },
  };
}

type Outcome = 'ok' | 'notFound' | 'badRequest' | 'tooMany' | 'server' | 'network';
const RETRYABLE: ReadonlySet<Outcome> = new Set(['tooMany', 'server', 'network']);

const attemptArb = fc.record({
  outcome: fc.constantFrom<Outcome>('ok', 'notFound', 'badRequest', 'tooMany', 'server', 'network'),
  latency: fc.integer({ min: 0, max: 3_000 }),
});
const lookupArb = fc.record({ first: attemptArb, second: attemptArb });
/** Cada Mineracao/Reanalise: atraso inicial e consultas feitas em série. */
const runArb = fc.record({
  startDelay: fc.integer({ min: 0, max: 5_000 }),
  lookups: fc.array(lookupArb, { minLength: 1, maxLength: 5 }),
});

describe('Property 5: Espaçamento da BrasilAPI', () => {
  it('inícios consecutivos ≥ 1000 ms e uma requisição por tentativa', async () => {
    await fc.assert(
      fc.asyncProperty(fc.array(runArb, { minLength: 1, maxLength: 5 }), async (runs) => {
        const clock = virtualClock(Date.parse('2025-06-01T12:00:00.000Z'));
        const starts: number[] = [];
        const callsByCnpj = new Map<string, number>();
        const plan = new Map<string, { first: { outcome: Outcome; latency: number }; second: { outcome: Outcome; latency: number } }>();

        let n = 0;
        const jobs = runs.map((run) => ({
          startDelay: run.startDelay,
          cnpjs: run.lookups.map((l) => {
            const cnpj = String(++n).padStart(14, '0');
            plan.set(cnpj, l);
            return cnpj;
          }),
        }));

        const deps: BrasilApiDeps = {
          http: {
            async getCnpj(cnpj) {
              starts.push(clock.now());
              const count = (callsByCnpj.get(cnpj) ?? 0) + 1;
              callsByCnpj.set(cnpj, count);
              const step = count === 1 ? plan.get(cnpj)!.first : plan.get(cnpj)!.second;
              await clock.sleep(step.latency);
              switch (step.outcome) {
                case 'ok':
                  return { status: 200, json: brasilApiJson(cnpj) };
                case 'notFound':
                  return { status: 404, json: {} };
                case 'badRequest':
                  return { status: 400, json: {} };
                case 'tooMany':
                  return { status: 429, json: {} };
                case 'server':
                  return { status: 503, json: {} };
                case 'network':
                  throw new Error('rede');
              }
            },
          },
          // Limitador único compartilhado por todas as execuções concorrentes.
          limiter: intervalLimiter(BRASILAPI_MIN_INTERVAL_MS, clock),
          sleep: clock.sleep,
          now: () => new Date(clock.now()),
        };

        let done = false;
        const all = Promise.all(
          jobs.map(async (job) => {
            await clock.sleep(job.startDelay);
            for (const cnpj of job.cnpjs) await lookupCnpj(cnpj, deps);
          }),
        ).then(() => {
          done = true;
        });

        while (!done) {
          const progressed = await clock.step();
          if (!progressed && !done) {
            await new Promise<void>((r) => setImmediate(r));
            if (!done) throw new Error('execução travada');
          }
        }
        await all;

        // Instantes de início em ordem: diferença ≥ 1000 ms entre consecutivos.
        for (let i = 1; i < starts.length; i++) {
          expect(starts[i] - starts[i - 1]).toBeGreaterThanOrEqual(BRASILAPI_MIN_INTERVAL_MS);
        }

        // Exatamente uma requisição por tentativa (1 ou 2 tentativas por consulta).
        for (const [cnpj, l] of plan) {
          const expected = RETRYABLE.has(l.first.outcome) ? 2 : 1;
          expect(callsByCnpj.get(cnpj) ?? 0).toBe(expected);
        }
        expect(starts.length).toBe([...callsByCnpj.values()].reduce((a, b) => a + b, 0));
      }),
      { numRuns: 100 },
    );
  });
});

/**
 * **Validates: Requirements 2.2**
 */
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { intervalLimiter } from '@/lib/leads/sources/rate-limit';
import { fakeClock } from './support/fake-clock';

// Feature: lead-miner, Property 2: For any conjunto de chamadas agendadas concorrentemente no intervalLimiter(1000) com relógio falso (incluindo chamadas que falham e são reagendadas como retentativa), os instantes de início de quaisquer duas execuções consecutivas diferem em pelo menos 1.000 ms.

/** Uma chamada: falhas antes do sucesso (reagendadas como retentativa) e duração de cada execução. */
const arbCall = fc.record({
  failures: fc.integer({ min: 0, max: 2 }),
  workMs: fc.integer({ min: 0, max: 2500 }),
});
type Call = { failures: number; workMs: number };

describe('Property 2: Espaçamento do Nominatim', () => {
  it('inícios consecutivos diferem em pelo menos 1.000 ms, inclusive com falhas e retentativas', async () => {
    await fc.assert(
      fc.asyncProperty(fc.array(arbCall, { minLength: 1, maxLength: 12 }), async (calls) => {
        const clock = fakeClock(1_000_000);
        const limiter = intervalLimiter(1000, clock);
        const starts: number[] = [];

        const runCall = async (call: Call) => {
          let attempt = 0;
          for (; ;) {
            try {
              return await limiter.schedule(async () => {
                starts.push(clock.now());
                const current = attempt++;
                if (call.workMs > 0) await clock.sleep(call.workMs);
                if (current < call.failures) throw new Error('falha simulada');
                return current;
              });
            } catch {
              // retentativa: reagenda no mesmo limitador
            }
          }
        };

        // Agendamento concorrente: nenhuma chamada espera a outra antes de agendar.
        const results = await Promise.all(calls.map((c) => runCall(c)));

        expect(results).toEqual(calls.map((c) => c.failures));
        expect(starts).toHaveLength(calls.reduce((sum, c) => sum + c.failures + 1, 0));
        for (let i = 1; i < starts.length; i++) {
          expect(starts[i] - starts[i - 1]).toBeGreaterThanOrEqual(1000);
        }
      }),
      { numRuns: 100 },
    );
  });
});

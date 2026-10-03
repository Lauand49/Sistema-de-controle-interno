/**
 * **Validates: Requirements 2.1, 2.2, 2.6**
 */
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { serviceState, serviceStatus } from '@/lib/leads/services';
import { monthKey } from '@/lib/leads/usage';
import { memoryUsageGate } from './support/fake-usage';

// Feature: lead-miner-enrichment, Property 2: For any combinação de chave configurada (sim/não), contagem do mês c ≥ 0 e limite L ≥ 1, serviceState marca Google Places disponível ⇔ há chave ∧ c < L; PageSpeed disponível ⇔ c < L (com semChave refletindo a ausência de chave); o motivo é SEM_CHAVE quando falta chave exigida, senão COTA_ESGOTADA quando c ≥ L, senão null; e usados/limite repetem c/L.

/** Modelo de referência do estado esperado. */
function expected(requiresKey: boolean, hasKey: boolean, c: number, L: number) {
  const motivo = requiresKey && !hasKey ? 'SEM_CHAVE' : c >= L ? 'COTA_ESGOTADA' : null;
  return { available: motivo === null, motivo, usados: c, limite: L };
}

// Contagens perto do limite são as interessantes; mistura valores pequenos e grandes.
const limitArb = fc.oneof(fc.integer({ min: 1, max: 10 }), fc.integer({ min: 1, max: 100_000 }));
const countFor = (L: number) =>
  fc.oneof(fc.integer({ min: 0, max: L + 2 }), fc.constantFrom(L - 1, L, L + 1).filter((c) => c >= 0), fc.integer({ min: 0, max: 200_000 }));
const caseArb = limitArb.chain((L) => fc.record({ L: fc.constant(L), c: countFor(L) }));

describe('Property 2: Disponibilidade dos serviços', () => {
  it('serviceState segue o modelo para qualquer chave/contagem/limite', () => {
    fc.assert(
      fc.property(fc.boolean(), fc.boolean(), caseArb, (requiresKey, hasKey, { c, L }) => {
        expect(serviceState({ requiresKey, hasKey, count: c, limit: L })).toEqual(
          expected(requiresKey, hasKey, c, L),
        );
      }),
      { numRuns: 200 },
    );
  });

  it('serviceStatus: Places exige chave, PageSpeed não (semChave reflete a ausência), usados/limite repetem c/L', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({ places: fc.boolean(), pagespeed: fc.boolean(), gemini: fc.boolean() }),
        caseArb,
        caseArb,
        caseArb,
        fc.date({ min: new Date('2020-01-01T00:00:00Z'), max: new Date('2035-12-31T23:59:59Z'), noInvalidDate: true }),
        async (keys, p, ps, g, now) => {
          const month = monthKey(now);
          const usage = memoryUsageGate({
            [`places:${month}`]: p.c,
            [`pagespeed:${month}`]: ps.c,
            [`gemini:${month}`]: g.c,
          });
          const status = await serviceStatus({
            usage,
            now: () => now,
            keys,
            limits: { places: p.L, pagespeed: ps.L, gemini: g.L },
          });

          expect(status.places).toEqual(expected(true, keys.places, p.c, p.L));
          expect(status.places.available).toBe(keys.places && p.c < p.L);

          expect(status.pagespeed).toEqual({
            ...expected(false, keys.pagespeed, ps.c, ps.L),
            semChave: !keys.pagespeed,
          });
          expect(status.pagespeed.available).toBe(ps.c < ps.L);

          expect(status.gemini).toEqual(expected(true, keys.gemini, g.c, g.L));
          // Só leitura: nenhuma reserva é feita para exibir o estado.
          expect(usage.reserveCalls).toHaveLength(0);
        },
      ),
      { numRuns: 200 },
    );
  });
});

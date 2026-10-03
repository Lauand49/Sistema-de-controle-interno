// Feature: dashboards, Property 20: Transições de Data_Conclusao
/**
 * **Validates: Requirements 3.8, 3.9**
 */
import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { completedAtUpdate } from '@/lib/task-completion';

const STATUSES = ['TODO', 'IN_PROGRESS', 'DONE', 'CANCELLED'] as const;

const arbStatus = fc.constantFrom(...STATUSES);
/** Status anterior: null = criação. */
const arbPrev = fc.option(arbStatus, { nil: null });
/** Status novo: undefined = ausente no payload. */
const arbNext = fc.option(arbStatus, { nil: undefined });
const arbNow = fc.date({ min: new Date('2000-01-01T00:00:00Z'), max: new Date('2100-01-01T00:00:00Z') });

describe('Property 20: Transições de Data_Conclusao', () => {
  it('completedAtUpdate segue as regras de entrada/saída de DONE', () => {
    fc.assert(
      fc.property(arbPrev, arbNext, arbNow, (prev, next, now) => {
        const result = completedAtUpdate(prev, next, now);

        if (prev === null) {
          // Criação: DONE → now; qualquer outro status (inclusive ausente/default) → null.
          if (next === 'DONE') expect(result).toBe(now);
          else expect(result).toBeNull();
          return;
        }

        if (next === undefined || next === prev) {
          // Status ausente ou inalterado: não mexe em completedAt.
          expect(result).toBeUndefined();
        } else if (next === 'DONE') {
          // Entra em DONE vindo de outro status.
          expect(result).toBe(now);
        } else if (prev === 'DONE') {
          // Sai de DONE para outro status.
          expect(result).toBeNull();
        } else {
          // Transição entre status não-DONE: não altera.
          expect(result).toBeUndefined();
        }
      }),
      { numRuns: 100 },
    );
  });
});

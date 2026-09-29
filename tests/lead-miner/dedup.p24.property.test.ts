import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { ingestInMemory, type InMemoryBase } from '@/lib/leads/dedup';
import { arbFoundCompanies, arbInMemoryBase } from './support/arb-company';

/** Forma canônica (conjuntos ordenados) para comparar bases. */
function canonical(base: InMemoryBase) {
  return {
    companies: [...base.companies].sort((a, b) => a.id.localeCompare(b.id)),
    links: [...base.links].sort((a, b) =>
      `${a.runId}|${a.companyId}`.localeCompare(`${b.runId}|${b.companyId}`),
    ),
  };
}

describe('ingestInMemory', () => {
  // Feature: lead-miner, Property 24: Idempotência da ingestão
  // **Validates: Requirements 9.6, 9.10, 9.16, 20.3**
  it('ingerir o mesmo resultado duas vezes equivale a ingerir uma vez', () => {
    fc.assert(
      fc.property(arbInMemoryBase, arbFoundCompanies, (base, found) => {
        const once = ingestInMemory(base, found, 'run-1');
        const twice = ingestInMemory(once, found, 'run-1');
        expect(canonical(twice)).toEqual(canonical(once));
        // Vínculo único por par (runId, companyId).
        const pairs = once.links.map((l) => `${l.runId}|${l.companyId}`);
        expect(new Set(pairs).size).toBe(pairs.length);
      }),
      { numRuns: 100 },
    );
  });
});

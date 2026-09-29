// Feature: lead-miner, Property 29: Lead de triagem derivado da empresa
/**
 * **Validates: Requirements 15.1, 15.2, 15.6**
 */
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { ACTION_PLAN_BY_CATEGORY, ACTION_PLAN_DEFAULT, NICHES } from '@/lib/leads/config';
import { buildTriageLead, type TriageSource } from '@/lib/leads/triage';
import type { CategoryCode } from '@/lib/leads/types';

const CATEGORIES: CategoryCode[] = ['CRIAR_SITE', 'OTIMIZACAO_SEGURANCA', 'ANALISE_DADOS_BI'];

const arbOptionalText = fc.oneof(
  fc.constant(null),
  fc.constantFrom('', '   ', '\t'),
  fc.string({ minLength: 1, maxLength: 20 }),
);

const arbTriageSource: fc.Arbitrary<TriageSource> = fc.record({
  id: fc.uuid(),
  nome: fc.string({ minLength: 1, maxLength: 40 }),
  nicho: fc.constantFrom(...NICHES.map((n) => n.id)),
  telefone: arbOptionalText,
  website: arbOptionalText,
  categoria: fc.option(fc.constantFrom(...CATEGORIES), { nil: null }),
  assignedTo: fc.option(fc.uuid(), { nil: null }),
});

describe('Property 29: Lead de triagem derivado da empresa', () => {
  it('deriva status, ids, contato, segmento, plano de ação e responsável da empresa', () => {
    fc.assert(
      fc.property(arbTriageSource, (c) => {
        const lead = buildTriageLead(c);

        expect(lead.status).toBe('RAW');
        expect(lead.companyId).toBe(c.id);
        expect(lead.companyName).toBe(c.nome);

        const contactParts = [c.telefone, c.website].map((v) => v?.trim() ?? '').filter((v) => v.length > 0);
        expect(lead.contactInfo).toBe(contactParts.length > 0 ? contactParts.join(' | ') : null);

        expect(lead.segment).toBe(NICHES.find((n) => n.id === c.nicho)!.label);
        expect(lead.actionPlan).toBe(c.categoria ? ACTION_PLAN_BY_CATEGORY[c.categoria] : ACTION_PLAN_DEFAULT);
        expect(lead.assignedTo ?? null).toBe(c.assignedTo);
      }),
      { numRuns: 100 },
    );
  });
});

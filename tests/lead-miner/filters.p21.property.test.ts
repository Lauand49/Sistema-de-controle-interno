import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { buildCompanyWhere, type CompanyFilters } from '@/lib/leads/filters';
import { arbCompanyFilters } from './support/arb-filters';

/** Percorre o `where` e devolve todo nó com `contains`/`equals` de string. */
function collectTextNodes(node: unknown, out: Record<string, unknown>[] = []): Record<string, unknown>[] {
  if (Array.isArray(node)) {
    for (const item of node) collectTextNodes(item, out);
  } else if (node !== null && typeof node === 'object' && !(node instanceof Date)) {
    const obj = node as Record<string, unknown>;
    if (typeof obj.contains === 'string' || typeof obj.equals === 'string') out.push(obj);
    for (const value of Object.values(obj)) collectTextNodes(value, out);
  }
  return out;
}

/** Filtros que produzem nó textual: q (3 campos), cidade, bairro, uf, nicho, leadStatus ≠ NONE. */
function expectedTextNodes(f: CompanyFilters): number {
  let n = 0;
  if (f.q) n += 5; // Etapa 3: nome, cnpjNomeFantasia, googleCache.nome, endereco, telefone
  if (f.cidade) n += 1;
  if (f.bairro) n += 1;
  if (f.uf) n += 1;
  if (f.nicho) n += 1;
  if (f.leadStatus && f.leadStatus !== 'NONE') n += 1;
  return n;
}

// Feature: lead-miner, Property 21: Busca textual sempre case-insensitive
// **Validates: Requirements 18.9, 12.3**
describe('Property 21: Busca textual sempre case-insensitive', () => {
  it('todo filtro contains/equals de string gerado por buildCompanyWhere usa mode insensitive', () => {
    fc.assert(
      fc.property(arbCompanyFilters, (filters) => {
        const where = buildCompanyWhere(filters as CompanyFilters);
        const nodes = collectTextNodes(where);
        expect(nodes.length).toBe(expectedTextNodes(filters as CompanyFilters));
        for (const node of nodes) expect(node.mode).toBe('insensitive');
      }),
      { numRuns: 100 },
    );
  });
});

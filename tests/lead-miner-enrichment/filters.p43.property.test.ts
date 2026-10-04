/**
 * **Validates: Requirements 18.1, 18.2**
 *
 * Property 43: os filtros novos da Etapa 3 (`temInstagram`, `temWhatsapp`, `temCnpj`, `situacao`,
 * `desempenhoRuim`) viram o nó correto em `buildCompanyWhere`, combinados por E lógico; e
 * `compareRanking` ordena por Score_Final desc (sem análise ao final), depois pelo Nome_Exibicao
 * e pelo id. Puro, offline.
 */
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { buildCompanyWhere, compareRanking, type CompanyFilters, type RankKey } from '@/lib/leads/filters';
import { arbRankKey } from '../lead-miner/support/arb-filters';

const NOW = new Date('2025-06-01T12:00:00Z');

/** Procura, nos nós de `AND`, o primeiro objeto que tem a chave dada no topo. */
function andNodes(where: Record<string, unknown>): Record<string, unknown>[] {
  const and = where.AND;
  return Array.isArray(and) ? (and as Record<string, unknown>[]) : [];
}

describe('Property 43: filtros novos', () => {
  it('temInstagram/temWhatsapp/desempenhoRuim viram igualdade booleana', () => {
    fc.assert(
      fc.property(
        fc.constantFrom<'temInstagram' | 'temWhatsapp' | 'desempenhoRuim'>('temInstagram', 'temWhatsapp', 'desempenhoRuim'),
        fc.boolean(),
        (campo, valor) => {
          const where = buildCompanyWhere({ [campo]: valor } as CompanyFilters, NOW);
          const nodes = andNodes(where);
          expect(nodes).toContainEqual({ [campo]: valor });
        },
      ),
      { numRuns: 60 },
    );
  });

  it('temCnpj=true → { cnpj: { not: null } }; false → { cnpj: null }', () => {
    const yes = andNodes(buildCompanyWhere({ temCnpj: true } as CompanyFilters, NOW));
    expect(yes).toContainEqual({ cnpj: { not: null } });
    const no = andNodes(buildCompanyWhere({ temCnpj: false } as CompanyFilters, NOW));
    expect(no).toContainEqual({ cnpj: null });
  });

  it('situacao → igualdade insensível a caixa em situacaoCadastral', () => {
    fc.assert(
      fc.property(fc.constantFrom('ATIVA', 'BAIXADA', 'INAPTA', 'SUSPENSA'), (s) => {
        const nodes = andNodes(buildCompanyWhere({ situacao: s } as CompanyFilters, NOW));
        expect(nodes).toContainEqual({ situacaoCadastral: { equals: s, mode: 'insensitive' } });
      }),
      { numRuns: 40 },
    );
  });

  it('filtros ausentes não geram nós (where vazio)', () => {
    expect(buildCompanyWhere({} as CompanyFilters, NOW)).toEqual({});
  });

  it('vários filtros combinam por E lógico (um nó cada)', () => {
    const where = buildCompanyWhere(
      { temInstagram: true, temCnpj: true, desempenhoRuim: false } as CompanyFilters,
      NOW,
    );
    const nodes = andNodes(where);
    expect(nodes).toContainEqual({ temInstagram: true });
    expect(nodes).toContainEqual({ cnpj: { not: null } });
    expect(nodes).toContainEqual({ desempenhoRuim: false });
  });
});

describe('Property 43: ordenação pelo Nome_Exibicao', () => {
  it('compareRanking: score desc (nulos ao final), depois nomeExibicao e id', () => {
    fc.assert(
      fc.property(fc.array(arbRankKey, { minLength: 2, maxLength: 25 }), (keysRaw) => {
        // Garante ids únicos para um critério de desempate determinístico.
        const keys: RankKey[] = keysRaw.map((k, i) => ({ ...k, id: `${i}-${k.id}` }));
        const sorted = [...keys].sort(compareRanking);
        for (let i = 1; i < sorted.length; i++) {
          const a = sorted[i - 1];
          const b = sorted[i];
          const aNull = a.scoreFinal === null;
          const bNull = b.scoreFinal === null;
          // Nunca um nulo antes de um não-nulo.
          if (aNull && !bNull) throw new Error('nulo veio antes de não-nulo');
          if (!aNull && !bNull && a.scoreFinal !== b.scoreFinal) {
            expect(a.scoreFinal as number).toBeGreaterThan(b.scoreFinal as number);
          } else if (aNull === bNull) {
            // Mesmo bucket de score: ordena por nomeExibicao, depois id.
            const byName = a.nomeExibicao < b.nomeExibicao ? -1 : a.nomeExibicao > b.nomeExibicao ? 1 : 0;
            if (byName !== 0) expect(byName).toBeLessThan(0);
            else expect(a.id <= b.id).toBe(true);
          }
        }
      }),
      { numRuns: 100 },
    );
  });
});

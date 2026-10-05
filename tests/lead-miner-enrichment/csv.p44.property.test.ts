/**
 * **Validates: Requirements 18.4, 18.5**
 *
 * Property 44: `toCsvRow` sempre produz uma linha com tantas células quanto `CSV_HEADER` (20),
 * e as 7 colunas novas da Etapa 3 (CNPJ, Situação cadastral, Instagram, WhatsApp, Desempenho
 * PageSpeed, Fonte, Link Google Maps) carregam os valores esperados, na ordem do cabeçalho.
 * Puro, offline.
 */
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { CSV_HEADER, toCsvRow, type ExportRow } from '@/lib/leads/csv';
import { NICHES } from '@/lib/leads/config';
import type { CategoryCode, PriorityCode, SourceMode } from '@/lib/leads/types';

const CATS: (CategoryCode | null)[] = ['CRIAR_SITE', 'OTIMIZACAO_SEGURANCA', 'ANALISE_DADOS_BI', null];
const PRIOS: (PriorityCode | null)[] = ['ALTA', 'MEDIA', 'BAIXA', null];
const SRC: (SourceMode | null)[] = ['OSM', 'GOOGLE', 'MISTA', null];

const optText = fc.oneof(fc.constant(null), fc.stringMatching(/^[A-Za-z0-9 ]{0,12}$/));

const arbRow: fc.Arbitrary<ExportRow> = fc.record({
  nome: fc.stringMatching(/^[A-Za-z0-9 ]{0,12}$/),
  nicho: fc.oneof(fc.constant(null), fc.constantFrom(...NICHES.map((n) => n.id))),
  endereco: optText,
  bairro: optText,
  cidade: optText,
  uf: optText,
  telefone: optText,
  website: optText,
  categoria: fc.constantFrom(...CATS),
  scoreFinal: fc.oneof(fc.constant(null), fc.integer({ min: 0, max: 100 })),
  prioridade: fc.constantFrom(...PRIOS),
  responsavelNome: optText,
  ultimaAnaliseEm: fc.oneof(fc.constant(null), fc.constant(new Date('2025-05-10T12:00:00Z'))),
  cnpj: fc.oneof(fc.constant(null), fc.constant('11.222.333/0001-81')),
  situacaoCadastral: fc.oneof(fc.constant(null), fc.constantFrom('ATIVA', 'BAIXADA')),
  instagram: fc.oneof(fc.constant(null), fc.stringMatching(/^[a-z0-9_.]{1,15}$/)),
  whatsapp: fc.oneof(fc.constant(null), fc.stringMatching(/^55[0-9]{10,11}$/)),
  desempenhoRuim: fc.oneof(fc.constant(null), fc.boolean()),
  fonte: fc.constantFrom(...SRC),
  googlePlaceId: fc.oneof(fc.constant(null), fc.stringMatching(/^[A-Za-z0-9_-]{1,20}$/)),
});

// Índices das colunas novas (0-based), na ordem do CSV_HEADER.
const COL = {
  cnpj: 13,
  situacao: 14,
  instagram: 15,
  whatsapp: 16,
  desempenho: 17,
  fonte: 18,
  maps: 19,
} as const;

describe('Property 44: CSV com as colunas novas', () => {
  it('sempre 20 células, uma por coluna do cabeçalho', () => {
    fc.assert(
      fc.property(arbRow, (row) => {
        const cells = toCsvRow(row);
        expect(cells).toHaveLength(CSV_HEADER.length);
        expect(CSV_HEADER.length).toBe(20);
      }),
      { numRuns: 200 },
    );
  });

  it('as 7 colunas novas carregam os valores esperados', () => {
    fc.assert(
      fc.property(arbRow, (row) => {
        const c = toCsvRow(row);
        expect(c[COL.cnpj]).toBe(row.cnpj ?? '');
        expect(c[COL.situacao]).toBe(row.situacaoCadastral ?? '');
        expect(c[COL.instagram]).toBe(row.instagram ? `@${row.instagram}` : '');
        expect(c[COL.whatsapp]).toBe(row.whatsapp ?? '');
        expect(c[COL.desempenho]).toBe(
          row.desempenhoRuim === null || row.desempenhoRuim === undefined ? '' : row.desempenhoRuim ? 'Ruim' : 'Bom',
        );
        expect(c[COL.fonte]).toBe(row.fonte ?? '');
        expect(c[COL.maps]).toBe(
          row.googlePlaceId ? `https://www.google.com/maps/place/?q=place_id:${row.googlePlaceId}` : '',
        );
      }),
      { numRuns: 200 },
    );
  });
});

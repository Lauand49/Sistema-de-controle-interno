import { describe, expect, it } from 'vitest';
import {
  applyAssignee,
  applyFilterPatch,
  assignSuccessMessage,
  buildRankingRequest,
  clearFilters,
  exportRequestFor,
  exportSuccessMessage,
  exportTruncationNotice,
  filtersKey,
  isSelectionValid,
  listQuery,
  pageSelectionState,
  parseRankingUrl,
  serializeRankingUrl,
  toggleId,
  togglePageSelection,
  triageSuccessMessage,
} from '@/components/lead-miner/ranking-helpers';

const RUN = '11111111-1111-4111-8111-111111111111';
const A = '22222222-2222-4222-8222-222222222222';
const B = '33333333-3333-4333-8333-333333333333';

describe('estado da Tela_Ranking na URL', () => {
  it('lê filtros, página e visão com padrões seguros', () => {
    const s = parseRankingUrl(new URLSearchParams(`runId=${RUN}&uf=SP&page=3&view=mapa&x=1&q=`));
    expect(s).toEqual({ ui: { runId: RUN, uf: 'SP' }, page: 3, view: 'mapa' });
    expect(parseRankingUrl(new URLSearchParams('page=abc&view=outra'))).toEqual({ ui: {}, page: 1, view: 'lista' });
    expect(parseRankingUrl(new URLSearchParams('page=0')).page).toBe(1);
  });

  it('serializa omitindo vazios, page=1 e view=lista (ida e volta)', () => {
    const state = { ui: { uf: 'RJ', scoreMin: '80', scoreMax: '20' }, page: 2, view: 'mapa' as const };
    const qs = serializeRankingUrl(state);
    expect(qs.get('page')).toBe('2');
    expect(qs.get('view')).toBe('mapa');
    expect(parseRankingUrl(qs)).toEqual(state);
    expect(serializeRankingUrl({ ui: {}, page: 1, view: 'lista' }).toString()).toBe('');
  });

  it('alterar filtro volta para a página 1 e valor vazio remove o filtro (Req. 12.4)', () => {
    const s = { ui: { uf: 'SP', cidade: 'Santos' }, page: 4, view: 'mapa' as const };
    const next = applyFilterPatch(s, { uf: '', prioridade: 'ALTA' });
    expect(next).toEqual({ ui: { cidade: 'Santos', prioridade: 'ALTA' }, page: 1, view: 'mapa' });
  });

  it('limpar filtros preserva só a mineração', () => {
    expect(clearFilters({ ui: { runId: RUN, uf: 'SP' }, page: 3, view: 'lista' }).ui).toEqual({ runId: RUN });
    expect(filtersKey({ uf: 'SP' })).toBe(filtersKey({ uf: 'SP' }));
    expect(filtersKey({ uf: 'SP' })).not.toBe(filtersKey({ uf: 'RJ' }));
  });
});

describe('buildRankingRequest', () => {
  it('omite só a faixa de score inválida e a sinaliza (Req. 12.9–12.11)', () => {
    const { query, invalid } = buildRankingRequest({ scoreMin: '80', scoreMax: '20', uf: 'SP', q: 'clinica' });
    expect(invalid).toEqual(['score']);
    expect(query.has('scoreMin')).toBe(false);
    expect(query.get('uf')).toBe('SP');
    expect(query.get('q')).toBe('clinica');
  });

  it('omite e sinaliza intervalo de datas invertido', () => {
    const { query, invalid } = buildRankingRequest({ analyzedFrom: '2026-02-01', analyzedTo: '2026-01-01', scoreMin: '10' });
    expect(invalid).toEqual(['datas']);
    expect(query.has('analyzedFrom')).toBe(false);
    expect(query.get('scoreMin')).toBe('10');
  });

  it('listQuery adiciona a página só quando > 1', () => {
    const q = new URLSearchParams('uf=SP');
    expect(listQuery(q, 1).toString()).toBe('uf=SP');
    expect(listQuery(q, 3).get('page')).toBe('3');
    expect(q.has('page')).toBe(false);
  });
});

describe('seleção em lote', () => {
  it('aceita de 1 a 200 empresas (Req. 12.5, 15.7)', () => {
    expect(isSelectionValid(0)).toBe(false);
    expect(isSelectionValid(1)).toBe(true);
    expect(isSelectionValid(200)).toBe(true);
    expect(isSelectionValid(201)).toBe(false);
  });

  it('alterna linha e página', () => {
    const s1 = toggleId(new Set(), A);
    expect([...s1]).toEqual([A]);
    expect(toggleId(s1, A).size).toBe(0);
    expect(pageSelectionState(s1, [A, B])).toBe('some');
    const all = togglePageSelection(s1, [A, B]);
    expect(pageSelectionState(all, [A, B])).toBe('all');
    expect(togglePageSelection(all, [A, B]).size).toBe(0);
    expect(pageSelectionState(new Set(), [])).toBe('none');
  });
});

describe('exportação', () => {
  it('com seleção envia os ids; sem seleção, os filtros tipados da lista (Req. 17.1)', () => {
    expect(exportRequestFor([A], new URLSearchParams('uf=SP'))).toEqual({ ids: [A] });
    const req = exportRequestFor([], new URLSearchParams('uf=SP&scoreMin=40&hasSite=true&page=2'));
    expect(req).toEqual({ filters: { uf: 'SP', scoreMin: 40, hasSite: true } });
  });

  it('avisa quando o limite de 5.000 linhas é atingido (Req. 17.7)', () => {
    expect(exportTruncationNotice({ total: 12000, truncated: false })).toBeNull();
    const msg = exportTruncationNotice({ total: 12000, truncated: true });
    expect(msg).toContain('5.000');
    expect(msg).toContain('12.000');
    expect(exportSuccessMessage({ total: 1, truncated: false })).toBe('CSV exportado com 1 empresa.');
  });
});

describe('triagem e atribuição', () => {
  it('toast de triagem com criados e ignorados (Req. 15.5)', () => {
    expect(triageSuccessMessage({ created: 3, ignored: 1 })).toBe(
      '3 leads criados na triagem; 1 empresa ignorada (já enviadas).',
    );
  });

  it('toast de atribuição e atualização das linhas afetadas (Req. 16.9)', () => {
    expect(assignSuccessMessage(2, 'Ana')).toBe('2 empresas atribuídas a Ana.');
    const rows = [
      { id: A, assignedUser: null },
      { id: B, assignedUser: { id: 'x', name: 'Beto' } },
    ];
    const out = applyAssignee(rows, [A], { id: 'u1', name: 'Ana' });
    expect(out[0].assignedUser).toEqual({ id: 'u1', name: 'Ana' });
    expect(out[1]).toBe(rows[1]);
  });
});

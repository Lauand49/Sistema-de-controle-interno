import { describe, expect, it } from 'vitest';
import {
  EMPTY_RUNS_UI,
  buildRunsApiParams,
  changeFilter,
  checkDateRange,
  formatRunDateTime,
  parseRunsUiState,
  resolveAppliedDates,
  runLocation,
  runsParamsKey,
  runsUiToSearch,
} from '@/components/lead-miner/runs-helpers';
import { MSG } from '@/lib/leads/filters';

describe('Tela_Mineracoes helpers', () => {
  it('formata a data de criação como DD/MM/AAAA HH:mm no fuso de Brasília (Req. 11.1)', () => {
    expect(formatRunDateTime('2025-03-05T12:07:00.000Z')).toBe('05/03/2025 09:07');
    // Virada de dia: 02:30 UTC ainda é o dia anterior em Brasília.
    expect(formatRunDateTime('2025-01-01T02:30:00.000Z')).toBe('31/12/2024 23:30');
    expect(formatRunDateTime('não é data')).toBe('—');
  });

  it('monta o local como "Bairro, Cidade/UF"', () => {
    expect(runLocation({ bairro: 'Vila Mariana', cidade: 'São Paulo', uf: 'SP' })).toBe('Vila Mariana, São Paulo/SP');
  });

  it('valida as datas localmente: formato e início ≤ fim (Req. 11.3, 11.7)', () => {
    expect(checkDateRange('', '')).toEqual({ errors: {}, valid: true });
    expect(checkDateRange('2025-01-10', '2025-01-10').valid).toBe(true);
    expect(checkDateRange('2025-01-11', '2025-01-10')).toEqual({ errors: { range: MSG.intervaloDatas }, valid: false });
    expect(checkDateRange('2025-02-30', '').errors.from).toBe(MSG.data);
    expect(checkDateRange('', '10/01/2025').errors.to).toBe(MSG.data);
  });

  it('intervalo inválido não é aplicado: mantém as últimas datas válidas (Req. 11.7)', () => {
    const last = { from: '2025-01-01', to: '2025-01-31' };
    expect(resolveAppliedDates({ from: '2025-02-10', to: '2025-02-01' }, last)).toEqual(last);
    expect(resolveAppliedDates({ from: '2025-02-01', to: '' }, last)).toEqual({ from: '2025-02-01', to: '' });
  });

  it('qualquer mudança de filtro ou busca volta para a página 1 (Req. 11.4)', () => {
    const onPage3 = { ...EMPTY_RUNS_UI, page: 3 };
    expect(changeFilter(onPage3, { uf: 'SP' })).toEqual({ ...EMPTY_RUNS_UI, uf: 'SP', page: 1 });
    expect(changeFilter(onPage3, { q: 'vila' }).page).toBe(1);
    expect(changeFilter(onPage3, { from: '2025-01-01' }).page).toBe(1);
    // Sem mudança real, o estado é o mesmo objeto.
    expect(changeFilter(onPage3, { uf: '' })).toBe(onPage3);
    // Datas que tornam o intervalo inválido não mudam a lista exibida (nem a página).
    const withTo = { ...onPage3, to: '2025-01-10' };
    expect(changeFilter(withTo, { from: '2025-01-20' })).toEqual({ ...withTo, from: '2025-01-20', page: 3 });
  });

  it('monta os parâmetros da API omitindo vazios e combinando todos os filtros', () => {
    const ui = { q: '  Vila  ', uf: 'SP', status: 'CONCLUIDA', fonte: 'OSM', from: 'x', to: 'y', page: 2 };
    expect(buildRunsApiParams(ui, { from: '2025-01-01', to: '' })).toEqual({
      q: 'Vila',
      uf: 'SP',
      status: 'CONCLUIDA',
      fonte: 'OSM',
      from: '2025-01-01',
      page: 2,
    });
    expect(buildRunsApiParams({ ...EMPTY_RUNS_UI, q: '   ' }, { from: '', to: '' })).toEqual({ page: 1 });
    expect(runsParamsKey({ page: 1 })).toBe(runsParamsKey({ page: 1, q: undefined }));
    expect(runsParamsKey({ page: 1 })).not.toBe(runsParamsKey({ page: 2 }));
  });

  it('sincroniza com a query string (ida e volta) e descarta valores desconhecidos', () => {
    const ui = { q: 'vila', uf: 'RJ', status: 'ERRO', fonte: 'MISTA', from: '2025-01-01', to: '2025-01-31', page: 4 };
    expect(parseRunsUiState(new URLSearchParams(runsUiToSearch(ui)))).toEqual(ui);
    expect(runsUiToSearch(EMPTY_RUNS_UI)).toBe('');
    expect(parseRunsUiState(new URLSearchParams('uf=XX&status=FOO&fonte=BAR&page=-2'))).toEqual(EMPTY_RUNS_UI);
    expect(parseRunsUiState(new URLSearchParams('page=abc')).page).toBe(1);
  });
});

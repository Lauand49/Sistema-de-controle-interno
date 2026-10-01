import { describe, expect, it } from 'vitest';
import {
  LEAD_STATUS_LABEL,
  PERIOD_LABEL,
  REQUEST_STATUS_LABEL,
  formatConversion,
  formatDayKey,
  formatInt,
  matchesMemberSearch,
} from '@/lib/dashboards/format';
import { conversionFromCounts } from '@/lib/dashboards/metrics';

// Requisitos 4.3, 6.1, 6.2, 10.1, 11.2
describe('rótulos', () => {
  it('rótulos exatos de status de solicitação', () => {
    expect(REQUEST_STATUS_LABEL).toEqual({
      PENDING: 'Pendente',
      APPROVED: 'Aprovada',
      REJECTED: 'Recusada',
      IN_PROGRESS: 'Em andamento',
      COMPLETED: 'Concluída',
    });
  });

  it('rótulos exatos de status de lead', () => {
    expect(LEAD_STATUS_LABEL).toEqual({
      RAW: 'Importado',
      PENDING: 'Pendente',
      IN_PROGRESS: 'Em andamento',
      CONVERTED_TO_PIPE: 'Convertido em card',
      DISCARDED: 'Descartado',
    });
  });

  it('rótulos exatos de período', () => {
    expect(PERIOD_LABEL).toEqual({
      '7d': 'Últimos 7 dias',
      '30d': 'Últimos 30 dias',
      '90d': 'Últimos 90 dias',
      tudo: 'Todo o período',
    });
  });
});

describe('formatDayKey', () => {
  it("converte 'AAAA-MM-DD' em 'DD/MM/AAAA'", () => {
    expect(formatDayKey('2026-10-01')).toBe('01/10/2026');
    expect(formatDayKey('2025-12-31')).toBe('31/12/2025');
  });
});

describe('formatInt', () => {
  it('usa separador de milhar pt-BR', () => {
    expect(formatInt(0)).toBe('0');
    expect(formatInt(1234)).toBe('1.234');
  });
});

describe('formatConversion', () => {
  it('formata porcentagem com contagens', () => {
    expect(formatConversion({ converted: 5, total: 20, percent: 25 })).toBe('25% (5 de 20)');
    expect(formatConversion(conversionFromCounts(5, 20))).toBe('25% (5 de 20)');
  });

  it('exibe "—" quando não há denominador', () => {
    expect(formatConversion({ converted: 0, total: 0, percent: null })).toBe('— (0 de 0)');
    expect(formatConversion(conversionFromCounts(0, 0))).toBe('— (0 de 0)');
  });

  it('exibe 0% quando há total mas nenhuma conversão', () => {
    expect(formatConversion(conversionFromCounts(0, 3))).toBe('0% (0 de 3)');
  });
});

describe('matchesMemberSearch', () => {
  it('ignora caixa e acentos', () => {
    expect(matchesMemberSearch('João Vaz', 'joao')).toBe(true);
    expect(matchesMemberSearch('João Vaz', 'VAZ')).toBe(true);
    expect(matchesMemberSearch('João Vaz', 'maria')).toBe(false);
  });
});

/**
 * Testes unitários da Configuracao_Minerador (lib/leads/config.ts).
 * **Validates: Requirements 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 1.8**
 */
import { describe, expect, it } from 'vitest';
import {
  CATEGORY_LABEL,
  DIGITAL_POINTS,
  HTTP_ERROR_MIN_STATUS,
  ICP_POINTS,
  NICHES,
  PRESETS,
  SITE_TIMEOUT_MS,
  SLOW_THRESHOLD_MS,
  geminiMonthlyLimit,
  GEMINI_MONTHLY_LIMIT_DEFAULT,
} from '@/lib/leads/config';

describe('NICHES', () => {
  it('define exatamente 22 nichos com ids únicos', () => {
    expect(NICHES).toHaveLength(22);
    expect(new Set(NICHES.map((n) => n.id)).size).toBe(22);
  });

  it('cada nicho tem rótulo não vazio, tier 1–3 e ao menos 1 tag OSM', () => {
    for (const n of NICHES) {
      expect(n.label.trim().length).toBeGreaterThan(0);
      expect([1, 2, 3]).toContain(n.tier);
      expect(n.tags.length).toBeGreaterThanOrEqual(1);
      for (const t of n.tags) {
        expect(t.key.length).toBeGreaterThan(0);
        expect(t.value.length).toBeGreaterThan(0);
      }
    }
  });

  it('cada tier tem ao menos 1 nicho e a soma dos três é 22', () => {
    const counts = [1, 2, 3].map((tier) => NICHES.filter((n) => n.tier === tier).length);
    for (const c of counts) expect(c).toBeGreaterThanOrEqual(1);
    expect(counts.reduce((a, b) => a + b, 0)).toBe(22);
  });
});

describe('PRESETS', () => {
  const ids = new Set(NICHES.map((n) => n.id));

  it('define exatamente icp, produto, servico e todos', () => {
    expect(Object.keys(PRESETS).sort()).toEqual(['icp', 'produto', 'servico', 'todos']);
  });

  it('cada preset é não vazio, sem repetição e só referencia nichos existentes', () => {
    for (const list of Object.values(PRESETS)) {
      expect(list.length).toBeGreaterThanOrEqual(1);
      expect(new Set(list).size).toBe(list.length);
      for (const id of list) expect(ids.has(id)).toBe(true);
    }
  });

  it('todos contém os 22 nichos', () => {
    expect(PRESETS.todos).toHaveLength(22);
    expect(new Set(PRESETS.todos)).toEqual(ids);
  });
});

describe('categorias', () => {
  it('tem exatamente as três categorias com rótulos exatos', () => {
    expect(CATEGORY_LABEL).toEqual({
      CRIAR_SITE: 'Criar Site do Zero',
      OTIMIZACAO_SEGURANCA: 'Otimização / Segurança',
      ANALISE_DADOS_BI: 'Análise de Dados / BI',
    });
  });
});

describe('constantes de análise e pontuação', () => {
  it('timeout de site de 10 s, lentidão acima de 2.500 ms, erro a partir de 400', () => {
    expect(SITE_TIMEOUT_MS).toBe(10_000);
    expect(SLOW_THRESHOLD_MS).toBe(2_500);
    expect(HTTP_ERROR_MIN_STATUS).toBe(400);
  });

  it('ICP_POINTS[1] = 25 e pontos não crescentes por tier', () => {
    expect(ICP_POINTS[1]).toBe(25);
    expect(ICP_POINTS[2]).toBeLessThanOrEqual(ICP_POINTS[1]);
    expect(ICP_POINTS[3]).toBeLessThanOrEqual(ICP_POINTS[2]);
  });

  it('pontos de presença digital são inteiros positivos', () => {
    for (const v of Object.values(DIGITAL_POINTS)) {
      expect(Number.isInteger(v)).toBe(true);
      expect(v).toBeGreaterThan(0);
    }
  });
});

describe('geminiMonthlyLimit', () => {
  it('usa o valor quando é inteiro positivo', () => {
    expect(geminiMonthlyLimit('250')).toBe(250);
  });

  it('usa o padrão quando ausente, vazio, zero, negativo ou não inteiro', () => {
    for (const v of [undefined, '', '0', '-5', '1.5', 'abc', '1e3']) {
      expect(geminiMonthlyLimit(v)).toBe(GEMINI_MONTHLY_LIMIT_DEFAULT);
    }
  });
});

import { describe, expect, it } from 'vitest';
import { NICHES, PRESETS, UFS } from '@/lib/leads/config';
import {
  buildCreateRunInput,
  canSubmit,
  formatDayMonth,
  INITIAL_FORM_VALUES,
  lookupKey,
  lookupParams,
  matchingPreset,
  nichesByTier,
  pendingFields,
  PENDING_MESSAGES,
  presetNiches,
  previousRunMessage,
  splitFieldErrors,
  toggleNiche,
  toggleTier,
  type MiningFormValues,
} from '@/components/lead-miner/mining-form-helpers';

const filled: MiningFormValues = {
  bairro: ' Vila Mariana ',
  cidade: 'São Paulo',
  uf: 'SP',
  nichos: ['advocacia'],
  excluirRedes: false,
  iaEnabled: true,
  fonte: 'MISTA',
  pagespeedEnabled: true,
  cnpjEnabled: true,
};

describe('Tela_Minerar: helpers do formulário', () => {
  it('oferece 27 UFs e agrupa os 22 nichos por tier (Req. 10.1)', () => {
    expect(UFS).toHaveLength(27);
    const groups = nichesByTier();
    expect(groups.map((g) => g.tier)).toEqual([1, 2, 3]);
    expect(groups.flatMap((g) => g.niches)).toHaveLength(NICHES.length);
    expect(groups.every((g) => g.niches.every((n) => n.tier === g.tier))).toBe(true);
  });

  it('preset marca exatamente os nichos da configuração e permite ajustes (Req. 10.2)', () => {
    for (const id of ['icp', 'produto', 'servico', 'todos'] as const) {
      expect(new Set(presetNiches(id))).toEqual(new Set(PRESETS[id]));
      expect(matchingPreset(presetNiches(id))).toBe(id);
    }
    const icp = presetNiches('icp');
    const adjusted = toggleNiche(icp, 'padaria', true);
    expect(adjusted).toContain('padaria');
    expect(matchingPreset(adjusted)).toBeNull();
    expect(toggleNiche(adjusted, 'padaria', false)).toEqual(icp);
  });

  it('toggleTier marca/desmarca só o tier indicado, sem duplicar', () => {
    const t1 = toggleTier([], 1, true);
    expect(t1).toEqual(presetNiches('icp'));
    expect(toggleTier(toggleTier(t1, 1, true), 1, false)).toEqual([]);
    expect(toggleNiche(['advocacia', 'advocacia'], 'advocacia', true)).toEqual(['advocacia']);
  });

  it('indica cada campo pendente e desabilita o envio (Req. 10.3)', () => {
    expect(pendingFields(INITIAL_FORM_VALUES)).toEqual(PENDING_MESSAGES);
    expect(canSubmit(INITIAL_FORM_VALUES, false)).toBe(false);
    const spaces = { ...filled, bairro: '   ', cidade: '\t', uf: 'XX', nichos: [] };
    expect(Object.keys(pendingFields(spaces)).sort()).toEqual(['bairro', 'cidade', 'nichos', 'uf']);
    expect(pendingFields(filled)).toEqual({});
    expect(canSubmit(filled, false)).toBe(true);
    // Durante o envio o botão fica desabilitado (Req. 10.6).
    expect(canSubmit(filled, true)).toBe(false);
  });

  it('monta o corpo do POST com textos aparados e IA só quando disponível (Req. 7.5)', () => {
    expect(buildCreateRunInput(filled, true)).toEqual({
      bairro: 'Vila Mariana',
      cidade: 'São Paulo',
      uf: 'SP',
      nichos: ['advocacia'],
      excluirRedes: false,
      iaEnabled: true,
      // Campos da Etapa 3, repassados como estão no formulário.
      fonte: 'MISTA',
      pagespeedEnabled: true,
      cnpjEnabled: true,
    });
    expect(buildCreateRunInput(filled, false).iaEnabled).toBe(false);
  });

  it('só consulta o lookup com bairro, cidade e UF completos (Req. 10.4)', () => {
    expect(lookupParams({ bairro: 'x', cidade: '', uf: 'SP' })).toBeNull();
    expect(lookupParams({ bairro: 'x', cidade: 'y', uf: '' })).toBeNull();
    expect(lookupParams({ bairro: 'a'.repeat(101), cidade: 'y', uf: 'SP' })).toBeNull();
    const p = lookupParams(filled);
    expect(p).toEqual({ bairro: 'Vila Mariana', cidade: 'São Paulo', uf: 'SP' });
    expect(lookupKey(p)).toBe(lookupKey(lookupParams({ ...filled, bairro: 'Vila Mariana' })));
    expect(lookupKey(null)).toBe('');
  });

  it('formata o aviso "Bairro já minerado em DD/MM por Fulano (N leads)" (Req. 10.4)', () => {
    const date = new Date(2024, 2, 5, 14, 30); // 05/03 no fuso local
    expect(formatDayMonth(date)).toBe('05/03');
    expect(formatDayMonth('inválida')).toBe('');
    expect(previousRunMessage({ createdAt: date.toISOString(), total: 42, createdBy: { name: 'Fulano' } })).toBe(
      'Bairro já minerado em 05/03 por Fulano (42 leads)',
    );
  });

  it('separa erros 400 por campo e gerais (Req. 10.10)', () => {
    expect(splitFieldErrors({ bairro: 'b', nichos: 'n', _: 'geral', preset: 'geral' })).toEqual({
      byField: { bairro: 'b', nichos: 'n' },
      general: ['geral'],
    });
    expect(splitFieldErrors(undefined)).toEqual({ byField: {}, general: [] });
  });
});

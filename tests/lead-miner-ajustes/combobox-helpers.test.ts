/**
 * T2 — helpers puros do combobox e da cascata UF → Cidade → Bairro.
 */
import { describe, expect, it } from 'vitest';
import {
  MAX_SUGGESTIONS,
  filterOptions,
  findExactOption,
  moveActive,
  suggestionsAnnouncement,
} from '@/components/lead-miner/combobox-helpers';
import {
  INITIAL_FORM_VALUES,
  applyCidadeChange,
  applyUfChange,
  bairroEnabled,
  buildCreateRunInput,
  cidadeEnabled,
  type MiningFormValues,
} from '@/components/lead-miner/mining-form-helpers';

describe('filterOptions (sem acento e sem diferenciar maiúsculas)', () => {
  const CITIES = ['São Paulo', 'Santos', 'São José dos Campos', 'Bauru', 'Mogi das Cruzes', 'Ourinhos'];

  it('"sao" casa "São ..." ignorando o acento; "SAO" e "sÃo" também', () => {
    for (const q of ['sao', 'SAO', 'sÃo', 'São']) {
      expect(filterOptions(CITIES, q)).toEqual(['São Paulo', 'São José dos Campos']);
    }
  });

  it('quem COMEÇA com o termo vem antes de quem só o contém', () => {
    // "os" aparece no meio de "Ourinhos"/"São José dos Campos"/"Mogi das Cruzes"? só os que contêm.
    expect(filterOptions(['Rio Branco', 'Bosque', 'Osasco', 'Pirassununga'], 'os')).toEqual(['Osasco', 'Bosque']);
  });

  it('termo vazio devolve as primeiras opções; sem casamento devolve vazio', () => {
    expect(filterOptions(CITIES, '  ')).toEqual(CITIES);
    expect(filterOptions(CITIES, 'xyz')).toEqual([]);
  });

  it('respeita o limite de sugestões', () => {
    const many = Array.from({ length: 200 }, (_, i) => `Bairro ${i}`);
    expect(filterOptions(many, '')).toHaveLength(MAX_SUGGESTIONS);
    expect(filterOptions(many, 'bairro', 5)).toHaveLength(5);
  });

  it('findExactOption devolve a grafia canônica ignorando acento/caixa', () => {
    expect(findExactOption(CITIES, 'sao paulo')).toBe('São Paulo');
    expect(findExactOption(CITIES, '  SANTOS ')).toBe('Santos');
    expect(findExactOption(CITIES, 'san')).toBeNull();
    expect(findExactOption(CITIES, '')).toBeNull();
  });
});

describe('navegação por teclado', () => {
  it('↓ e ↑ circulam; Home/End vão às pontas; lista vazia → −1', () => {
    expect(moveActive(-1, 3, 'ArrowDown')).toBe(0);
    expect(moveActive(0, 3, 'ArrowDown')).toBe(1);
    expect(moveActive(2, 3, 'ArrowDown')).toBe(0);
    expect(moveActive(-1, 3, 'ArrowUp')).toBe(2);
    expect(moveActive(0, 3, 'ArrowUp')).toBe(2);
    expect(moveActive(2, 3, 'ArrowUp')).toBe(1);
    expect(moveActive(1, 3, 'Home')).toBe(0);
    expect(moveActive(1, 3, 'End')).toBe(2);
    for (const k of ['ArrowDown', 'ArrowUp', 'Home', 'End'] as const) expect(moveActive(0, 0, k)).toBe(-1);
  });

  it('anúncio de sugestões em português', () => {
    expect(suggestionsAnnouncement(0)).toBe('Nenhuma sugestão');
    expect(suggestionsAnnouncement(1)).toBe('1 sugestão');
    expect(suggestionsAnnouncement(7)).toBe('7 sugestões');
  });
});

describe('cascata UF → Cidade → Bairro', () => {
  const filled: MiningFormValues = { ...INITIAL_FORM_VALUES, uf: 'SP', cidade: 'Santos', bairro: 'Gonzaga' };

  it('cada campo só habilita depois do anterior', () => {
    expect(cidadeEnabled({ uf: '' })).toBe(false);
    expect(cidadeEnabled({ uf: 'XX' })).toBe(false); // UF fora das 27
    expect(cidadeEnabled({ uf: 'SP' })).toBe(true);
    expect(bairroEnabled({ uf: 'SP', cidade: '' })).toBe(false);
    expect(bairroEnabled({ uf: 'SP', cidade: '   ' })).toBe(false);
    expect(bairroEnabled({ uf: '', cidade: 'Santos' })).toBe(false);
    expect(bairroEnabled({ uf: 'SP', cidade: 'Santos' })).toBe(true);
  });

  it('trocar a UF limpa cidade e bairro; repetir a mesma UF não limpa nada', () => {
    expect(applyUfChange(filled, 'RJ')).toMatchObject({ uf: 'RJ', cidade: '', bairro: '' });
    expect(applyUfChange(filled, 'SP')).toBe(filled);
  });

  it('trocar a cidade limpa o bairro; a mesma cidade mantém', () => {
    expect(applyCidadeChange(filled, 'Santo André')).toMatchObject({ cidade: 'Santo André', bairro: '' });
    expect(applyCidadeChange(filled, 'Santos')).toBe(filled);
  });

  it('a entrada da mineração continua a mesma (digitação livre vale)', () => {
    const input = buildCreateRunInput({ ...filled, nichos: ['clinica_odontologica'] }, false);
    expect(input).toMatchObject({ uf: 'SP', cidade: 'Santos', bairro: 'Gonzaga' });
  });
});

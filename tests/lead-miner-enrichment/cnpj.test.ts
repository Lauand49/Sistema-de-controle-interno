/**
 * Exemplos do Validador_CNPJ (lib/leads/cnpj.ts).
 * **Validates: Requirements 11.1, 11.2, 11.3, 21.4**
 */
import { describe, expect, it } from 'vitest';
import {
  CNPJ_STATUS,
  cnpjCheckDigits,
  extractCnpjs,
  formatCnpj,
  isValidCnpj,
  normalizeCnpj,
  planCnpj,
  resolveSiteCnpj,
} from '@/lib/leads/cnpj';
import type { CnpjData } from '@/lib/leads/types';

const NUM_A = '11222333000181';
const NUM_B = '11444777000161';
const ALFA = '12ABC34501DE35'; // exemplo oficial da Receita: 12.ABC.345/01DE-35

describe('isValidCnpj', () => {
  it('aceita CNPJs numéricos válidos conhecidos, com e sem máscara', () => {
    expect(isValidCnpj(NUM_A)).toBe(true);
    expect(isValidCnpj('11.222.333/0001-81')).toBe(true);
    expect(isValidCnpj(NUM_B)).toBe(true);
    expect(isValidCnpj('11.444.777/0001-61')).toBe(true);
  });

  it('aceita o exemplo alfanumérico oficial da Receita (inclusive em minúsculas)', () => {
    expect(isValidCnpj('12.ABC.345/01DE-35')).toBe(true);
    expect(isValidCnpj(ALFA)).toBe(true);
    expect(isValidCnpj('12.abc.345/01de-35')).toBe(true);
    expect(cnpjCheckDigits('12ABC34501DE')).toBe('35');
  });

  it('rejeita DV errado', () => {
    expect(isValidCnpj('11222333000182')).toBe(false);
    expect(isValidCnpj('11222333000191')).toBe(false);
    expect(isValidCnpj('12ABC34501DE36')).toBe(false);
  });

  it('rejeita caracteres inválidos e letras nos DVs', () => {
    expect(isValidCnpj('11222333#00181')).toBe(false);
    expect(isValidCnpj('12ÁBC34501DE35')).toBe(false);
    expect(isValidCnpj('12ABC34501DEA5')).toBe(false);
    expect(isValidCnpj('')).toBe(false);
  });

  it('rejeita tamanho errado', () => {
    expect(isValidCnpj('1122233300018')).toBe(false);
    expect(isValidCnpj('112223330001810')).toBe(false);
  });

  it('rejeita todos os caracteres iguais', () => {
    expect(isValidCnpj('00000000000000')).toBe(false);
    expect(isValidCnpj('11111111111111')).toBe(false);
  });
});

describe('normalizeCnpj / formatCnpj', () => {
  it('normaliza removendo máscara e espaços, em maiúsculas', () => {
    expect(normalizeCnpj(' 12.abc.345/01de-35 ')).toBe(ALFA);
  });

  it('formata como AA.AAA.AAA/AAAA-DD', () => {
    expect(formatCnpj(NUM_A)).toBe('11.222.333/0001-81');
    expect(formatCnpj('12abc34501de35')).toBe('12.ABC.345/01DE-35');
  });

  it('lança para CNPJ inválido', () => {
    expect(() => formatCnpj('11222333000182')).toThrow();
    expect(() => cnpjCheckDigits('123')).toThrow();
  });
});

describe('extractCnpjs', () => {
  it('retorna vazio sem CNPJ válido', () => {
    expect(extractCnpjs('')).toEqual([]);
    expect(extractCnpjs('<p>Fale conosco: (11) 99999-9999</p>')).toEqual([]);
    expect(extractCnpjs('<p>CNPJ 11.222.333/0001-82</p>')).toEqual([]);
  });

  it('encontra um CNPJ no texto visível', () => {
    expect(extractCnpjs('<footer>Padaria Boa LTDA — CNPJ: 11.222.333/0001-81</footer>')).toEqual([NUM_A]);
  });

  it('encontra vários CNPJs distintos na ordem, sem repetir, incluindo alfanumérico', () => {
    const html = `
      <p>Matriz: 11.444.777/0001-61</p>
      <p>Filial: 12.ABC.345/01DE-35</p>
      <p>Repetido: 11444777000161</p>
      <p>CNPJ 11222333000181</p>`;
    expect(extractCnpjs(html)).toEqual([NUM_B, ALFA, NUM_A]);
  });
});

const cnpjData = (uf: string | null): CnpjData => ({
  cnpj: NUM_A,
  razaoSocial: 'PADARIA BOA LTDA',
  nomeFantasia: 'Padaria Boa',
  situacao: 'ATIVA',
  situacaoData: '2005-01-01',
  cnaeCodigo: '1091102',
  cnaeDescricao: 'Padaria e confeitaria',
  porte: 'ME',
  naturezaJuridica: 'Sociedade Empresária Limitada',
  mei: false,
  inicioAtividade: '2005-01-01',
  municipio: 'SAO PAULO',
  uf,
  consultadoEm: '2026-10-01T00:00:00.000Z',
});

describe('planCnpj', () => {
  const empty = { cnpj: null, cnpjOrigem: null, cnpjCandidatos: [] };

  it('nada a fazer sem CNPJ válido encontrado', () => {
    expect(planCnpj(empty, [], { enrich: true })).toEqual({ kind: 'NONE' });
    expect(planCnpj(empty, ['11222333000182'], { enrich: true })).toEqual({ kind: 'NONE' });
  });

  it('um CNPJ e Empresa sem CNPJ → aplica o do site', () => {
    expect(planCnpj(empty, ['11.222.333/0001-81'], { enrich: true })).toEqual({ kind: 'APPLY_SITE', cnpj: NUM_A });
  });

  it('dois ou mais distintos → todos candidatos MULTIPLOS', () => {
    expect(planCnpj(empty, [NUM_A, NUM_B], { enrich: true })).toEqual({
      kind: 'CANDIDATES',
      candidates: [
        { cnpj: NUM_A, motivo: 'MULTIPLOS' },
        { cnpj: NUM_B, motivo: 'MULTIPLOS' },
      ],
    });
  });

  it('CNPJ MANUAL é preservado e vence a consulta desabilitada', () => {
    const manual = { cnpj: NUM_A, cnpjOrigem: 'MANUAL' as const, cnpjCandidatos: [] };
    expect(planCnpj(manual, [NUM_A, NUM_B], { enrich: false })).toEqual({
      kind: 'CANDIDATES',
      candidates: [{ cnpj: NUM_B, motivo: 'MANUAL_PRESERVADO' }],
    });
    expect(planCnpj(manual, [NUM_A], { enrich: true })).toEqual({ kind: 'NONE' });
  });

  it('consulta desabilitada → nada aplicado, candidatos CONSULTA_DESABILITADA', () => {
    expect(planCnpj(empty, [NUM_A], { enrich: false })).toEqual({
      kind: 'CANDIDATES',
      candidates: [{ cnpj: NUM_A, motivo: 'CONSULTA_DESABILITADA' }],
    });
  });

  it('Empresa já com CNPJ SITE mantém o atual; outro vira MULTIPLOS', () => {
    const site = { cnpj: NUM_A, cnpjOrigem: 'SITE' as const, cnpjCandidatos: [] };
    expect(planCnpj(site, [NUM_B], { enrich: true })).toEqual({
      kind: 'CANDIDATES',
      candidates: [{ cnpj: NUM_B, motivo: 'MULTIPLOS' }],
    });
  });
});

describe('resolveSiteCnpj', () => {
  it('consulta ok com mesma UF → aplica com dados', () => {
    const data = cnpjData('SP');
    expect(resolveSiteCnpj({ cnpj: NUM_A }, 'sp', { ok: true, data })).toEqual({
      apply: true,
      data,
      candidate: null,
      status: null,
    });
  });

  it('UF divergente → não aplica, candidato UF_DIVERGENTE', () => {
    expect(resolveSiteCnpj({ cnpj: NUM_A }, 'RJ', { ok: true, data: cnpjData('SP') })).toEqual({
      apply: false,
      data: null,
      candidate: { cnpj: NUM_A, motivo: 'UF_DIVERGENTE' },
      status: CNPJ_STATUS.UF_DIVERGENTE,
    });
  });

  it('não encontrado → não aplica, candidato NAO_ENCONTRADO', () => {
    expect(resolveSiteCnpj({ cnpj: NUM_A }, 'SP', { ok: false, reason: 'NAO_ENCONTRADO' })).toEqual({
      apply: false,
      data: null,
      candidate: { cnpj: NUM_A, motivo: 'NAO_ENCONTRADO' },
      status: CNPJ_STATUS.NAO_ENCONTRADO,
    });
  });

  it('indisponível → aplica sem dados', () => {
    expect(resolveSiteCnpj({ cnpj: NUM_A }, 'SP', { ok: false, reason: 'INDISPONIVEL' })).toEqual({
      apply: true,
      data: null,
      candidate: null,
      status: CNPJ_STATUS.INDISPONIVEL,
    });
  });
});

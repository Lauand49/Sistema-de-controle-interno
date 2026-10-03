import { describe, expect, it } from 'vitest';
import { buildPrompt, cnpjAiFields, promptData, type AiInput } from '@/lib/leads/ai';
import type { CnpjData, SinaisDigitais } from '@/lib/leads/types';
import { goodSite } from '../lead-miner/support/arb-site';

const cnpjData: CnpjData = {
  cnpj: '11222333000181',
  razaoSocial: 'RAZAO SECRETA LTDA',
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
  uf: 'SP',
  consultadoEm: '2026-10-01T00:00:00.000Z',
};

const sinais: SinaisDigitais = {
  instagram: 'padariaboa',
  instagramOrigem: 'SITE',
  whatsapp: '5511987654321',
  whatsappOrigem: 'SITE',
  tecnologias: [{ id: 'wordpress', label: 'WordPress', group: 'CMS' }],
};

const base: AiInput = { nome: 'Padaria', nicho: 'padaria', bairro: null, cidade: 'São Paulo', site: goodSite() };

describe('cnpjAiFields', () => {
  it('mantém só os campos permitidos, sem razão social', () => {
    const out = cnpjAiFields(cnpjData);
    expect(out).toEqual({
      nomeFantasia: 'Padaria Boa',
      cnaeCodigo: '1091102',
      cnaeDescricao: 'Padaria e confeitaria',
      porte: 'ME',
      situacao: 'ATIVA',
      inicioAtividade: '2005-01-01',
    });
    expect(cnpjAiFields(null)).toBeNull();
  });
});

describe('promptData com dados novos', () => {
  it('sem sinais/cnpj mantém o formato da Etapa 1', () => {
    const d = promptData(base);
    expect(d).not.toHaveProperty('presencaDigital');
    expect(d).not.toHaveProperty('cnpj');
  });

  it('inclui presença digital (sem perfil/número) e campos de CNPJ', () => {
    // Mesmo que o chamador passe o objeto completo, nada além dos campos permitidos vaza.
    const input: AiInput = { ...base, sinais, cnpj: cnpjData };
    const d = promptData(input);
    expect(d.presencaDigital).toEqual({ instagram: true, whatsapp: true, tecnologias: ['WordPress'] });
    expect(d.cnpj).toEqual(cnpjAiFields(cnpjData));
    const prompt = buildPrompt(input);
    for (const secret of ['RAZAO SECRETA', '5511987654321', 'padariaboa', '11222333000181', 'razaoSocial']) {
      expect(prompt).not.toContain(secret);
    }
  });
});

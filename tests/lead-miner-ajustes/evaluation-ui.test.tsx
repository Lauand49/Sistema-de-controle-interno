// @vitest-environment jsdom
/** T5 — interface: alvos do botão "Avaliar", mensagens, coluna "Avaliação" e seção da Ficha. */
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';

vi.mock('next/link', () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a>,
}));

import type { CompanyRow } from '@/lib/leads/client-api';
import type { EvaluationDto } from '@/lib/leads/evaluation';
import { RankingTable } from '@/components/lead-miner/RankingTable';
import { EvaluationView } from '@/components/lead-miner/EvaluationView';
import { BasicEvaluation } from '@/components/lead-miner/ficha/BasicEvaluation';
import { evaluationMessage, evaluationTargets } from '@/components/lead-miner/ranking-helpers';

afterEach(cleanup);

const ia: EvaluationDto = { resumo: 'Sem site próprio.', sugestao: 'Procure no Instagram.', fonte: 'IA', avaliadoEm: '2026-10-20T12:00:00Z' };
const regra: EvaluationDto = { ...ia, fonte: 'REGRA' };

const row = (id: string, avaliacao: EvaluationDto | null): CompanyRow =>
  ({
    id,
    nome: `Empresa ${id}`,
    googleFields: [],
    nicho: 'clinica_odontologica',
    bairro: null,
    cidade: null,
    uf: null,
    telefone: null,
    website: null,
    hasSite: null,
    isHttps: null,
    categoria: null,
    scoreFinal: null,
    prioridade: null,
    lastAnalyzedAt: null,
    contatoWhatsapp: false,
    contatoInstagram: false,
    contatoEmail: false,
    situacaoCadastral: null,
    assignedUser: null,
    prospectLead: null,
    avaliacao,
  }) as unknown as CompanyRow;

describe('evaluationTargets', () => {
  const rows = [row('a', null), row('b', ia), row('c', regra), row('d', null)];

  it('sem seleção: leads da página sem avaliação ou só com a de regras', () => {
    expect(evaluationTargets(rows, new Set())).toEqual(['a', 'c', 'd']);
  });

  it('com seleção: só os selecionados', () => {
    expect(evaluationTargets(rows, new Set(['b', 'd']))).toEqual(['b', 'd']);
  });

  it('limita a 30 por pedido', () => {
    const big = Array.from({ length: 50 }, (_, i) => row(`x${i}`, null));
    expect(evaluationTargets(big, new Set())).toHaveLength(30);
    expect(evaluationTargets(big, new Set(), 5)).toHaveLength(5);
  });
});

describe('evaluationMessage', () => {
  const base = { avaliados: 0, porIa: 0, porRegra: 0, restantes: 0, motivoSemIa: null };

  it('nenhum pendente, tudo por IA, tudo por regras e misto', () => {
    expect(evaluationMessage(base)).toMatchObject({ kind: 'info' });
    expect(evaluationMessage({ ...base, avaliados: 3, porIa: 3 })).toEqual({ kind: 'success', text: '3 leads avaliados por IA.' });
    expect(evaluationMessage({ ...base, avaliados: 1, porRegra: 1, motivoSemIa: 'IA_SEM_CHAVE' }).text).toBe(
      '1 lead avaliado por regras (sem IA): a IA não está configurada.',
    );
    const mixed = evaluationMessage({ ...base, avaliados: 12, porIa: 10, porRegra: 2, motivoSemIa: 'IA_COTA_ESGOTADA' });
    expect(mixed.text).toContain('10 por IA e 2 por regras (sem IA)');
    expect(mixed.text).toContain('a cota mensal da IA acabou');
  });
});

describe('RankingTable — coluna Avaliação', () => {
  const props = { selected: new Set<string>(), onToggle: vi.fn(), onTogglePage: vi.fn(), offset: 0 };

  it('só aparece na aba Sem contato, com o selo de origem', () => {
    const { rerender } = render(<RankingTable {...props} rows={[row('a', ia), row('b', regra), row('c', null)]} />);
    expect(screen.queryByRole('columnheader', { name: 'Avaliação' })).toBeNull();

    rerender(<RankingTable {...props} showEvaluation rows={[row('a', ia), row('b', regra), row('c', null)]} />);
    expect(screen.getByRole('columnheader', { name: 'Avaliação' })).toBeTruthy();
    expect(screen.getByText('Avaliado por IA')).toBeTruthy();
    expect(screen.getByText('Avaliação por regras (sem IA)')).toBeTruthy();
    expect(screen.getByText('Ainda não avaliado')).toBeTruthy();
    expect(screen.getAllByText('Sem site próprio.')).toHaveLength(2);
  });
});

describe('EvaluationView / Ficha', () => {
  it('mostra resumo, sugestão e selo', () => {
    render(<EvaluationView avaliacao={ia} />);
    expect(screen.getByText('Sem site próprio.')).toBeTruthy();
    expect(screen.getByText(/Procure no Instagram\./)).toBeTruthy();
    expect(screen.getByText('Avaliado por IA')).toBeTruthy();
  });

  it('a seção da Ficha mostra a avaliação e some sem ela', () => {
    const { container, rerender } = render(<BasicEvaluation avaliacao={regra} />);
    expect(screen.getByRole('heading', { name: 'Avaliação básica' })).toBeTruthy();
    expect(screen.getByText('Ação sugerida')).toBeTruthy();
    expect(screen.getByText('Avaliação por regras (sem IA)')).toBeTruthy();
    rerender(<BasicEvaluation avaliacao={null} />);
    expect(container.textContent).toBe('');
  });
});

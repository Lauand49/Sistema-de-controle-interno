// @vitest-environment jsdom
/**
 * Seções: link do Resumo_Membro e estado vazio (Req. 7.5, 11.5); número e rótulo em texto
 * junto das barras (Req. 11.6); "no período" nas métricas dependentes do Periodo (Req. 10.4).
 */
import React from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import { MemberSummaryTable } from '@/components/dashboards/MemberSummaryTable';
import { PipePhases } from '@/components/dashboards/PipePhases';
import { LeadsSummary } from '@/components/dashboards/LeadsSummary';
import { TaskMetrics } from '@/components/dashboards/TaskMetrics';
import { RequestsSummary } from '@/components/dashboards/RequestsSummary';
import type { LeadStatusCounts, RequestStatusCounts } from '@/lib/dashboards/types';

afterEach(() => cleanup());

const zeroRequests: RequestStatusCounts = { PENDING: 0, APPROVED: 0, REJECTED: 0, IN_PROGRESS: 0, COMPLETED: 0 };

describe('MemberSummaryTable', () => {
  it('o nome do membro é link para o Painel_Membro', () => {
    render(
      <MemberSummaryTable
        members={[{ user: { id: 'u-1', name: 'Ana Souza', avatar: null }, open: 3, overdue: 1, doneInPeriod: 1234 }]}
      />,
    );
    const link = screen.getByRole('link', { name: /Ana Souza/ });
    expect(link.getAttribute('href')).toBe('/paineis/membros/u-1');
    expect(screen.getByText('1.234')).toBeTruthy();
    expect(screen.getByRole('columnheader', { name: 'Concluídas no período' })).toBeTruthy();
  });

  it('sem membros mostra o estado vazio', () => {
    render(<MemberSummaryTable members={[]} />);
    expect(screen.getByText('Nenhum membro para exibir')).toBeTruthy();
    expect(screen.queryByRole('table')).toBeNull();
  });
});

describe('PipePhases', () => {
  it('cada fase tem nome e número em texto, em ordem, incluindo zeros; barras aria-hidden', () => {
    const { container } = render(
      <PipePhases
        pipes={[
          {
            id: 'p1',
            name: 'Funil Comercial',
            phases: [
              { id: 'f2', name: 'Proposta', order: 2, isFinal: false, cards: 0 },
              { id: 'f1', name: 'Contato', order: 1, isFinal: false, cards: 5 },
              { id: 'f3', name: 'Fechado', order: 3, isFinal: true, cards: 2 },
            ],
          },
        ]}
      />,
    );
    const items = within(container.querySelector('ol') as HTMLElement).getAllByRole('listitem');
    expect(items.map((li) => li.textContent)).toEqual(['Contato5', 'Proposta0', 'Fechado(fase final)2']);
    for (const li of items) {
      const bar = li.querySelector('.rounded-full.bg-slate-800') as HTMLElement;
      expect(bar.getAttribute('aria-hidden')).toBe('true');
    }
    expect(screen.getByText('7 cards')).toBeTruthy();
  });

  it('sem funis mostra o estado vazio', () => {
    render(<PipePhases pipes={[]} />);
    expect(screen.getByText('Nenhum funil nesta unidade')).toBeTruthy();
  });
});

describe('LeadsSummary', () => {
  const byStatus: LeadStatusCounts = { RAW: 4, PENDING: 0, IN_PROGRESS: 2, CONVERTED_TO_PIPE: 1, DISCARDED: 3 };

  it('mostra status e número em texto e a conversão "no período"', () => {
    const { container } = render(
      <LeadsSummary
        byStatus={byStatus}
        conversion={{ converted: 1, total: 4, percent: 25 }}
        byAssignee={[
          { assignee: { id: 'u1', name: 'Bruno', avatar: null }, counts: byStatus },
          { assignee: null, counts: { RAW: 0, PENDING: 0, IN_PROGRESS: 0, CONVERTED_TO_PIPE: 0, DISCARDED: 0 } },
        ]}
      />,
    );
    const statusList = container.querySelector('ul') as HTMLElement;
    const items = within(statusList).getAllByRole('listitem').map((li) => li.textContent);
    expect(items).toEqual(['Importado4', 'Pendente0', 'Em andamento2', 'Convertido em card1', 'Descartado3']);
    expect(screen.getByText(/Taxa de conversão no período/).textContent).toContain('25% (1 de 4)');
    expect(screen.getByRole('rowheader', { name: 'Sem responsável' })).toBeTruthy();
  });

  it('sem leads mostra o estado vazio', () => {
    render(<LeadsSummary byStatus={{ RAW: 0, PENDING: 0, IN_PROGRESS: 0, CONVERTED_TO_PIPE: 0, DISCARDED: 0 }} />);
    expect(screen.getByText('Nenhum lead')).toBeTruthy();
  });
});

describe('"no período" nas métricas dependentes do Periodo', () => {
  it('TaskMetrics rotula as concluídas no período', () => {
    render(<TaskMetrics tasks={{ open: 2, overdue: 1, doneInPeriod: 5 }} />);
    expect(screen.getByText('Concluídas no período')).toBeTruthy();
    expect(screen.getByText('5')).toBeTruthy();
  });

  it('RequestsSummary rotula as solicitações concluídas no período', () => {
    render(
      <RequestsSummary
        requests={{ received: { ...zeroRequests, COMPLETED: 2 }, sent: zeroRequests, overdueReceived: 0 }}
      />,
    );
    expect(screen.getAllByText('Concluída no período').length).toBe(2);
  });
});

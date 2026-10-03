// @vitest-environment jsdom
/**
 * Hierarquia de cabeçalhos: `h1` do painel no `DashboardShell` e `h2` em cada seção,
 * com a seção rotulada pelo seu `h2` (Req. 11.8). Também confere o seletor de Periodo na moldura (Req. 10.1).
 */
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/paineis/unidades/NEG',
}));
// A navbar real busca o usuário via API; aqui basta um marcador.
vi.mock('@/components/navigation/SciTecNavbar', () => ({
  SciTecNavbar: () => <nav aria-label="Navegação principal" />,
}));

import { DashboardShell } from '@/components/dashboards/DashboardShell';
import { TaskMetrics } from '@/components/dashboards/TaskMetrics';
import { OverdueTaskList } from '@/components/dashboards/OverdueTaskList';
import { MemberSummaryTable } from '@/components/dashboards/MemberSummaryTable';

afterEach(() => cleanup());

describe('hierarquia h1/h2', () => {
  it('um h1 para o painel e um h2 por seção', () => {
    render(
      <DashboardShell title="Negócios" subtitle="Departamento">
        <TaskMetrics tasks={{ open: 1, overdue: 0, doneInPeriod: 0 }} />
        <OverdueTaskList tasks={[]} show="assignee" />
        <MemberSummaryTable members={[]} />
      </DashboardShell>,
    );

    const h1s = screen.getAllByRole('heading', { level: 1 });
    expect(h1s.map((h) => h.textContent)).toEqual(['Negócios']);
    const h2s = screen.getAllByRole('heading', { level: 2 });
    expect(h2s.map((h) => h.textContent)).toEqual(['Tarefas', 'Tarefas atrasadas', 'Membros']);

    // Cada seção é uma região nomeada pelo seu h2.
    for (const name of ['Tarefas', 'Tarefas atrasadas', 'Membros']) {
      expect(screen.getByRole('region', { name })).toBeTruthy();
    }
    expect(screen.getByText('Nenhuma tarefa atrasada')).toBeTruthy();
    expect((screen.getByLabelText('Período') as HTMLSelectElement).value).toBe('30d');
  });

  it('showPeriod=false omite o seletor', () => {
    render(
      <DashboardShell title="Painéis" showPeriod={false}>
        <p>conteúdo</p>
      </DashboardShell>,
    );
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('Painéis');
    expect(screen.queryByLabelText('Período')).toBeNull();
  });
});

// @vitest-environment jsdom
/**
 * `PeriodSelector` / `usePeriodo`: 4 opções, '30d' por padrão, rótulo associado e troca
 * refletida na URL via `router.replace` (Req. 10.1, 10.2, 11.7).
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

const nav = vi.hoisted(() => ({
  replace: vi.fn(),
  params: new URLSearchParams(),
}));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: nav.replace, push: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => nav.params,
}));

import { PeriodSelector } from '@/components/dashboards/PeriodSelector';

beforeEach(() => {
  nav.replace.mockClear();
  nav.params = new URLSearchParams();
});

afterEach(() => cleanup());

describe('PeriodSelector', () => {
  it('tem rótulo "Período" associado e as 4 opções em português', () => {
    render(<PeriodSelector />);
    const select = screen.getByLabelText('Período') as HTMLSelectElement;
    expect(select.tagName).toBe('SELECT');
    const options = Array.from(select.options).map((o) => [o.value, o.textContent]);
    expect(options).toEqual([
      ['7d', 'Últimos 7 dias'],
      ['30d', 'Últimos 30 dias'],
      ['90d', 'Últimos 90 dias'],
      ['tudo', 'Todo o período'],
    ]);
  });

  it('sem parâmetro na URL seleciona "Últimos 30 dias" e não reescreve a URL', () => {
    render(<PeriodSelector />);
    const select = screen.getByLabelText('Período') as HTMLSelectElement;
    expect(select.value).toBe('30d');
    expect(nav.replace).not.toHaveBeenCalled();
  });

  it('usa o periodo válido da URL', () => {
    nav.params = new URLSearchParams('periodo=90d');
    render(<PeriodSelector />);
    expect((screen.getByLabelText('Período') as HTMLSelectElement).value).toBe('90d');
  });

  it('periodo inválido na URL é corrigido para 30d com router.replace', () => {
    nav.params = new URLSearchParams('periodo=1ano');
    render(<PeriodSelector />);
    expect((screen.getByLabelText('Período') as HTMLSelectElement).value).toBe('30d');
    expect(nav.replace).toHaveBeenCalledWith('?periodo=30d');
  });

  it('trocar a opção chama router.replace com ?periodo=', () => {
    render(<PeriodSelector />);
    fireEvent.change(screen.getByLabelText('Período'), { target: { value: '7d' } });
    expect(nav.replace).toHaveBeenCalledWith('?periodo=7d');
    fireEvent.change(screen.getByLabelText('Período'), { target: { value: 'tudo' } });
    expect(nav.replace).toHaveBeenLastCalledWith('?periodo=tudo');
  });
});

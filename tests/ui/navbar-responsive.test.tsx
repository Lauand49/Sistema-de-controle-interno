// @vitest-environment jsdom
/** Regressão do comportamento responsivo da navbar (classes Tailwind) e do aria-current. */
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';

vi.mock('next/navigation', () => ({ usePathname: () => '/tasks', useRouter: () => ({ replace: vi.fn() }) }));
vi.mock('next/link', () => ({ default: ({ children, ...p }: any) => <a {...p}>{children}</a> }));
vi.mock('@/components/navigation/ProfileSwitcher', () => ({ ProfileSwitcher: () => null }));
vi.mock('@/components/modals/CreateRequestModal', () => ({ CreateRequestModal: () => null }));

import { SciTecNavbar } from '@/components/navigation/SciTecNavbar';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('SciTecNavbar', () => {
  it('rótulos a partir de xl, "Tarefas" curto entre xl e 2xl, Equipe/Painéis inline só em 2xl, aria-current na rota ativa', () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('[]')));
    render(<SciTecNavbar />);
    const nav = document.querySelector('nav.hidden.xl\\:flex') as HTMLElement;
    expect(nav).toBeTruthy();

    const tarefas = nav.querySelector('a[href="/tasks"]') as HTMLElement;
    expect(tarefas.getAttribute('aria-current')).toBe('page');
    expect(tarefas.getAttribute('aria-label')).toBe('Minhas Tarefas');
    const spans = Array.from(tarefas.querySelectorAll('span'));
    const curto = spans.find((x) => x.textContent === 'Tarefas')!;
    const longo = spans.find((x) => x.textContent === 'Minhas Tarefas')!;
    expect(curto.className).toBe('hidden xl:inline 2xl:hidden');
    expect(longo.className).toBe('hidden 2xl:inline');

    const inicio = nav.querySelector('a[href="/"]') as HTMLElement;
    expect(inicio.getAttribute('aria-current')).toBeNull();
    expect(Array.from(inicio.querySelectorAll('span')).find((x) => x.textContent === 'Início')!.className).toBe('hidden xl:inline');

    for (const href of ['/team', '/paineis']) {
      const a = nav.querySelector(`a[href="${href}"]`) as HTMLElement;
      expect(a.className).toContain('hidden');
      expect(a.className).toContain('2xl:flex');
    }
    expect(screen.getByRole('button', { name: 'Mais' })).toBeTruthy();
  });
});

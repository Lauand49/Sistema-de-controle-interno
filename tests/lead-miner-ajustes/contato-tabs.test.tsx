// @vitest-environment jsdom
/** T4 — abas "Com contato (N)" / "Sem contato (M)": rótulos, seleção e teclado. */
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { ContatoTabs } from '@/components/lead-miner/ContatoTabs';

afterEach(cleanup);

describe('ContatoTabs', () => {
  it('mostra as contagens e marca a aba ativa', () => {
    render(<ContatoTabs active="com" counts={{ com: 12, sem: 3 }} onChange={vi.fn()} />);
    const com = screen.getByRole('tab', { name: 'Com contato (12)' });
    const sem = screen.getByRole('tab', { name: 'Sem contato (3)' });
    expect(com.getAttribute('aria-selected')).toBe('true');
    expect(sem.getAttribute('aria-selected')).toBe('false');
    expect(com.getAttribute('tabindex')).toBe('0');
    expect(sem.getAttribute('tabindex')).toBe('-1');
  });

  it('sem contagem ainda, mostra só os nomes', () => {
    render(<ContatoTabs active="sem" counts={null} onChange={vi.fn()} />);
    expect(screen.getByRole('tab', { name: 'Com contato' })).toBeTruthy();
    expect(screen.getByRole('tab', { name: 'Sem contato' }).getAttribute('aria-selected')).toBe('true');
  });

  it('clique e setas trocam de aba', () => {
    const onChange = vi.fn();
    render(<ContatoTabs active="com" counts={{ com: 1, sem: 1 }} onChange={onChange} />);
    fireEvent.click(screen.getByRole('tab', { name: /Sem contato/ }));
    expect(onChange).toHaveBeenLastCalledWith('sem');

    fireEvent.keyDown(screen.getByRole('tab', { name: /Com contato/ }), { key: 'ArrowRight' });
    expect(onChange).toHaveBeenLastCalledWith('sem');
    fireEvent.keyDown(screen.getByRole('tab', { name: /Com contato/ }), { key: 'ArrowLeft' });
    expect(onChange).toHaveBeenLastCalledWith('sem'); // circular
    fireEvent.keyDown(screen.getByRole('tab', { name: /Com contato/ }), { key: 'End' });
    expect(onChange).toHaveBeenLastCalledWith('sem');
    fireEvent.keyDown(screen.getByRole('tab', { name: /Sem contato/ }), { key: 'Home' });
    expect(onChange).toHaveBeenLastCalledWith('com');
  });
});

// @vitest-environment jsdom
/**
 * `ClaimLeadButton` (Req. 14.12, 14.13): aviso de demora após 2 s, 409 informa o Responsável,
 * erro comum mostra a mensagem e reabilita o botão.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';

const api = vi.hoisted(() => ({ claim: vi.fn() }));
const toastMock = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));

vi.mock('@/lib/leads/client-api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/leads/client-api')>();
  return { ...actual, leadMinerApi: { ...actual.leadMinerApi, ...api } };
});
vi.mock('sonner', () => ({ toast: toastMock }));

import { LeadMinerApiError } from '@/lib/leads/client-api';
import { ClaimLeadButton } from '@/components/lead-miner/ficha/ClaimLeadButton';
import { CLAIM_SLOW_TEXT } from '@/components/lead-miner/ficha/ficha-helpers';

function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.clearAllMocks();
});

const button = () => screen.getByRole('button') as HTMLButtonElement;

function renderButton() {
  const onClaimed = vi.fn();
  const onConflict = vi.fn();
  render(<ClaimLeadButton companyId="c1" onClaimed={onClaimed} onConflict={onConflict} />);
  return { onClaimed, onConflict };
}

describe('ClaimLeadButton', () => {
  it('mostra o aviso de demora só após 2 s e conclui com sucesso', async () => {
    const d = deferred<{ assignee: { id: string; name: string } }>();
    api.claim.mockReturnValue(d.promise);
    const { onClaimed } = renderButton();

    fireEvent.click(button());
    expect(button().disabled).toBe(true);
    expect(button().textContent).toContain('Assumindo…');

    act(() => vi.advanceTimersByTime(1_999));
    expect(screen.queryByText(CLAIM_SLOW_TEXT)).toBeNull();
    act(() => vi.advanceTimersByTime(1));
    expect(screen.getByText(CLAIM_SLOW_TEXT)).toBeTruthy();

    fireEvent.click(button()); // pendente: não chama de novo
    expect(api.claim).toHaveBeenCalledTimes(1);

    await act(async () => d.resolve({ assignee: { id: 'u1', name: 'Ana' } }));
    expect(onClaimed).toHaveBeenCalledWith({ id: 'u1', name: 'Ana' });
    expect(toastMock.success).toHaveBeenCalled();
    expect(screen.queryByText(CLAIM_SLOW_TEXT)).toBeNull();
  });

  it('409 informa o Responsável atual', async () => {
    api.claim.mockRejectedValue(
      new LeadMinerApiError(409, 'Conflito', { assignedTo: { id: 'u2', name: 'Maria' } }),
    );
    const { onConflict, onClaimed } = renderButton();
    await act(async () => {
      fireEvent.click(button());
    });
    expect(onConflict).toHaveBeenCalledWith({ id: 'u2', name: 'Maria' });
    expect(onClaimed).not.toHaveBeenCalled();
    expect(toastMock.error).toHaveBeenCalledWith('Este lead já foi assumido por Maria.');
  });

  it('erro comum mostra a mensagem e reabilita o botão', async () => {
    api.claim.mockRejectedValue(new LeadMinerApiError(500, 'Erro interno do servidor. Tente novamente.'));
    const { onConflict } = renderButton();
    await act(async () => {
      fireEvent.click(button());
    });
    expect(screen.getByRole('alert').textContent).toContain('O lead não foi assumido.');
    expect(button().disabled).toBe(false);
    expect(button().textContent).toContain('Assumir lead');
    expect(onConflict).not.toHaveBeenCalled();

    // O aviso de demora não aparece depois da falha (timer limpo).
    act(() => vi.advanceTimersByTime(5_000));
    expect(screen.queryByText(CLAIM_SLOW_TEXT)).toBeNull();
  });
});

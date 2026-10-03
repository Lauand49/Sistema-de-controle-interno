// @vitest-environment jsdom
/**
 * `BulkActionsBar` oculta "Atribuir" sem permissão (Req. 16.6); `FailedNichesNote` (Req. 2.14) e
 * `NoAiNote` (Req. 7.10) só aparecem quando há o que avisar.
 */
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { BulkActionsBar } from '@/components/lead-miner/BulkActionsBar';
import { FailedNichesNote } from '@/components/lead-miner/FailedNichesNote';
import { NO_AI_TEXT, NoAiNote } from '@/components/lead-miner/NoAiNote';

afterEach(cleanup);

function renderBar(canAssign: boolean) {
  return render(
    <BulkActionsBar
      count={3}
      canAssign={canAssign}
      busy={null}
      onTriage={vi.fn()}
      onAssign={vi.fn()}
      onExport={vi.fn()}
      onClearSelection={vi.fn()}
    />,
  );
}

it('o bloqueio global de rede também vale no ambiente jsdom', () => {
  expect(() => fetch('/api/tools/lead-miner/config')).toThrow('Acesso à rede proibido em testes');
});

describe('BulkActionsBar', () => {
  it('sem permissão de atribuir: não renderiza "Atribuir"', () => {
    renderBar(false);
    expect(screen.queryByRole('button', { name: /Atribuir/ })).toBeNull();
    expect(screen.getByRole('button', { name: /Enviar para triagem/ })).toBeTruthy();
  });

  it('com permissão de atribuir: renderiza "Atribuir"', () => {
    renderBar(true);
    expect(screen.getByRole('button', { name: /Atribuir/ })).toBeTruthy();
  });
});

describe('FailedNichesNote', () => {
  it('lista vazia ou nula não renderiza nada', () => {
    const { container, rerender } = render(<FailedNichesNote nichosFalhos={[]} />);
    expect(container.textContent).toBe('');
    rerender(<FailedNichesNote nichosFalhos={null} />);
    expect(container.textContent).toBe('');
  });

  it('mostra os rótulos dos nichos não consultados (ids desconhecidos como vieram)', () => {
    render(<FailedNichesNote nichosFalhos={['clinica_odontologica', 'xyz']} />);
    expect(screen.getByText('Nichos não consultados: Clínica odontológica, xyz')).toBeTruthy();
  });
});

describe('NoAiNote', () => {
  it('SEM_CHAVE mostra o aviso', () => {
    render(<NoAiNote iaDisabledReason="SEM_CHAVE" />);
    expect(screen.getByText(NO_AI_TEXT)).toBeTruthy();
  });

  it('sem motivo não renderiza nada', () => {
    const { container } = render(<NoAiNote iaDisabledReason={null} />);
    expect(container.textContent).toBe('');
  });
});

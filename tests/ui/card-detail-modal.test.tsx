// @vitest-environment jsdom
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('next/link', () => ({ default: (p: any) => <a {...p} /> }));

import { CardDetailModal } from '@/components/modals/CardDetailModal';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const field = (id: string, label: string, type: string, extra: object = {}) => ({ id, label, name: id, type, required: false, order: 0, phaseId: 'p1', ...extra });
const phase = {
  id: 'p1',
  name: 'Proposta',
  order: 0,
  isFinal: false,
  fields: [field('f-valor', 'Valor', 'CURRENCY'), field('f-data', 'Data da reunião', 'DATE'), field('f-obs', 'Observações', 'TEXT', { required: true })],
  cards: [],
};
const card: any = {
  id: 'c1',
  title: 'Projeto X',
  description: 'desc',
  phaseId: 'p1',
  phase,
  assigneeId: null,
  values: [{ fieldId: 'f-valor', value: '4' }],
  activities: [],
};

function setup(readOnly = false) {
  const fetchMock = vi.fn(async () => new Response('{}', { status: 200 }));
  vi.stubGlobal('fetch', fetchMock);
  const onClose = vi.fn();
  render(<CardDetailModal card={card} phases={[phase as any]} users={[]} onClose={onClose} onCardUpdated={() => {}} readOnly={readOnly} />);
  return { fetchMock, onClose };
}

describe('CardDetailModal (apresentação)', () => {
  it('abre como diálogo, todos os campos têm rótulo e o valor aparece em pt-BR', () => {
    setup();
    expect(screen.getByRole('dialog', { name: 'Detalhes do card' })).toBeTruthy();
    expect((screen.getByLabelText('Valor') as HTMLInputElement).value).toBe('4,00');
    expect((screen.getByLabelText('Data da reunião') as HTMLInputElement).type).toBe('date');
    expect(screen.getByLabelText(/Observações/)).toBeTruthy();
    expect(screen.getByLabelText('Descrição geral do projeto / card')).toBeTruthy();
    expect(screen.getByRole('tab', { name: /Campos da fase/ }).getAttribute('aria-selected')).toBe('true');
  });

  it('salvar grava exatamente os mesmos dados de antes (valor como texto com ponto decimal)', async () => {
    const { fetchMock } = setup();
    const valor = screen.getByLabelText('Valor');
    fireEvent.focus(valor);
    fireEvent.change(valor, { target: { value: '1.234,5' } });
    fireEvent.blur(valor);
    fireEvent.change(screen.getByLabelText('Data da reunião'), { target: { value: '2026-10-05' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar Alterações' }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('/api/cards/c1');
    expect(init.method).toBe('PATCH');
    expect(JSON.parse(init.body as string)).toEqual({
      title: 'Projeto X',
      description: 'desc',
      assigneeId: null,
      fieldValues: { 'f-valor': '1234.5', 'f-data': '2026-10-05' },
    });
  });

  it('Esc fecha; em somente leitura não há botão Salvar', () => {
    const { onClose } = setup(true);
    expect(screen.queryByRole('button', { name: 'Salvar Alterações' })).toBeNull();
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();
  });
});

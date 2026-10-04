// @vitest-environment jsdom
/**
 * `ApproachMessages` (Req. 15.6, 15.7, 15.9, 15.4): cliques repetidos geram uma só requisição;
 * a mensagem gerada aparece com "Copiar" (navigator.clipboard) e, no WhatsApp, "Abrir no WhatsApp";
 * mensagens de modelo mostram a nota de fallback.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

const api = vi.hoisted(() => ({ generateApproach: vi.fn() }));
const toastMock = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn(), info: vi.fn() }));

vi.mock('@/lib/leads/client-api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/leads/client-api')>();
  return { ...actual, leadMinerApi: { ...actual.leadMinerApi, ...api } };
});
vi.mock('sonner', () => ({ toast: toastMock }));

import type { ApproachMessageDto } from '@/lib/leads/client-api';
import { ApproachMessages } from '@/components/lead-miner/ficha/ApproachMessages';

function deferred<T>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

const dto = (over: Partial<ApproachMessageDto> = {}): ApproachMessageDto => ({
  id: 'm1',
  canal: 'WHATSAPP',
  origem: 'IA',
  assunto: null,
  texto: 'Olá! Mensagem de teste.',
  fallback: null,
  analysisId: 'a1',
  author: { id: 'u1', name: 'Ana' },
  createdAt: '2026-05-01T12:00:00.000Z',
  whatsappLink: 'https://wa.me/5511999998888?text=Ol%C3%A1',
  ...over,
});

beforeEach(() => {
  Object.assign(navigator, { clipboard: { writeText: vi.fn().mockResolvedValue(undefined) } });
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const generateButton = () => screen.getByRole('button', { name: /Gerar mensagem/i }) as HTMLButtonElement;

describe('ApproachMessages', () => {
  it('cliques repetidos durante a geração resultam em uma só requisição', async () => {
    const d = deferred<{ message: ApproachMessageDto }>();
    api.generateApproach.mockReturnValue(d.promise);
    render(<ApproachMessages companyId="c1" initialMessages={[]} />);

    const btn = generateButton(); // referência estável; o rótulo muda para "Gerando…" após o clique
    fireEvent.click(btn);
    expect(btn.disabled).toBe(true);
    fireEvent.click(btn);
    fireEvent.click(btn);
    expect(api.generateApproach).toHaveBeenCalledTimes(1);

    await act(async () => d.resolve({ message: dto() }));
    expect(screen.getByText('Olá! Mensagem de teste.')).toBeTruthy();
  });

  it('mensagem WhatsApp mostra "Copiar" e "Abrir no WhatsApp"', async () => {
    render(<ApproachMessages companyId="c1" initialMessages={[dto()]} />);
    const copiar = screen.getByRole('button', { name: /Copiar/i });
    fireEvent.click(copiar);
    await waitFor(() => expect(navigator.clipboard.writeText).toHaveBeenCalledWith('Olá! Mensagem de teste.'));
    const whats = screen.getByRole('link', { name: /Abrir no WhatsApp/i }) as HTMLAnchorElement;
    expect(whats.href).toContain('wa.me/5511999998888');
  });

  it('mensagem de modelo exibe a nota de fallback', () => {
    render(<ApproachMessages companyId="c1" initialMessages={[dto({ origem: 'MODELO', fallback: 'IA_SEM_CHAVE' })]} />);
    expect(screen.getByText(/Mensagem gerada pelo modelo padrão/i)).toBeTruthy();
  });

  it('e-mail não mostra "Abrir no WhatsApp"', () => {
    render(
      <ApproachMessages
        companyId="c1"
        initialMessages={[dto({ canal: 'EMAIL', assunto: 'Proposta', whatsappLink: null })]}
      />,
    );
    expect(screen.queryByRole('link', { name: /Abrir no WhatsApp/i })).toBeNull();
    expect(screen.getByText(/Assunto: Proposta/)).toBeTruthy();
  });
});

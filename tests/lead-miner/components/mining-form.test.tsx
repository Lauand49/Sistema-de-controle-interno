// @vitest-environment jsdom
/**
 * `MiningForm` (Req. 10.3, 10.10): "Iniciar" desabilitado com campo pendente e durante o envio;
 * após erro os valores digitados são mantidos e o botão volta a ficar habilitado.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';

const api = vi.hoisted(() => ({
  getConfig: vi.fn(),
  lookupRun: vi.fn(),
  createRun: vi.fn(),
  listCities: vi.fn(),
  listNeighborhoods: vi.fn(),
}));

vi.mock('@/lib/leads/client-api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/leads/client-api')>();
  return { ...actual, leadMinerApi: { ...actual.leadMinerApi, ...api } };
});
vi.mock('sonner', () => ({
  toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn(), info: vi.fn() }),
}));
vi.mock('next/link', () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a>,
}));

import { LeadMinerApiError } from '@/lib/leads/client-api';
import { MiningForm } from '@/components/lead-miner/MiningForm';
import { RUN_NOT_STARTED_TEXT } from '@/components/lead-miner/mining-form-helpers';
import { clearLocalidadesCache } from '@/hooks/lead-miner/useLocalidades';

beforeEach(() => {
  clearLocalidadesCache();
  api.getConfig.mockResolvedValue({ iaAvailable: false });
  api.lookupRun.mockResolvedValue({ run: null });
  api.createRun.mockReset();
  // Listas indisponíveis: digitação livre (T2). O comportamento das listas é testado em mining-form-cascade.
  api.listCities.mockResolvedValue({ items: [], indisponivel: true });
  api.listNeighborhoods.mockResolvedValue({ items: [], indisponivel: true });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const submitButton = () => screen.getByRole('button', { name: /Iniciar mineração|Iniciando/ }) as HTMLButtonElement;

function fillForm() {
  fireEvent.change(screen.getByLabelText('UF'), { target: { value: 'SP' } });
  fireEvent.change(screen.getByLabelText('Cidade'), { target: { value: 'São Paulo' } });
  fireEvent.change(screen.getByLabelText('Bairro'), { target: { value: 'Vila Mariana' } });
  fireEvent.click(screen.getByLabelText('Clínica odontológica'));
}

async function renderForm(onRunStarted = vi.fn()) {
  render(<MiningForm onRunStarted={onRunStarted} />);
  await act(async () => { }); // resolve getConfig
  return onRunStarted;
}

describe('MiningForm', () => {
  it('"Iniciar" fica desabilitado enquanto há campo pendente', async () => {
    await renderForm();
    expect(submitButton().disabled).toBe(true);
    fireEvent.change(screen.getByLabelText('UF'), { target: { value: 'SP' } });
    fireEvent.change(screen.getByLabelText('Cidade'), { target: { value: 'São Paulo' } });
    fireEvent.change(screen.getByLabelText('Bairro'), { target: { value: 'Vila Mariana' } });
    expect(submitButton().disabled).toBe(true); // falta o nicho
    fireEvent.click(screen.getByLabelText('Clínica odontológica'));
    expect(submitButton().disabled).toBe(false);
  });

  it('desabilita durante o envio e mantém os valores após erro', async () => {
    let reject!: (e: unknown) => void;
    api.createRun.mockReturnValue(new Promise((_, r) => (reject = r)));
    const onRunStarted = await renderForm();
    fillForm();

    fireEvent.click(submitButton());
    expect(submitButton().disabled).toBe(true);
    fireEvent.click(submitButton()); // clique repetido não cria outra mineração
    expect(api.createRun).toHaveBeenCalledTimes(1);

    await act(async () => reject(new LeadMinerApiError(500, 'Erro interno do servidor. Tente novamente.')));

    expect(screen.getByRole('alert').textContent).toContain(RUN_NOT_STARTED_TEXT);
    expect(onRunStarted).not.toHaveBeenCalled();
    expect((screen.getByLabelText('Bairro') as HTMLInputElement).value).toBe('Vila Mariana');
    expect((screen.getByLabelText('Cidade') as HTMLInputElement).value).toBe('São Paulo');
    expect((screen.getByLabelText('UF') as HTMLSelectElement).value).toBe('SP');
    expect((screen.getByLabelText('Clínica odontológica') as HTMLInputElement).checked).toBe(true);
    expect(submitButton().disabled).toBe(false);
  });

  it('400 com erro por campo: mostra a mensagem no campo e mantém os valores', async () => {
    api.createRun.mockRejectedValue(
      new LeadMinerApiError(400, 'Dados inválidos', {}, { bairro: 'Bairro não encontrado.' }),
    );
    await renderForm();
    fillForm();
    await act(async () => {
      fireEvent.click(submitButton());
    });
    expect(screen.getByText('Bairro não encontrado.')).toBeTruthy();
    expect((screen.getByLabelText('Bairro') as HTMLInputElement).value).toBe('Vila Mariana');
    expect(submitButton().disabled).toBe(false);
  });
});

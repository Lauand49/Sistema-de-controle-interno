// @vitest-environment jsdom
/**
 * T2: localização em cascata UF → Cidade → Bairro no `MiningForm`.
 * Ordem no DOM, habilitação encadeada, limpeza ao trocar o campo anterior, autocomplete sem acento,
 * teclado e digitação livre quando as listas estão indisponíveis.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';

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

import { MiningForm } from '@/components/lead-miner/MiningForm';
import { LOCALIDADE_HINTS } from '@/components/lead-miner/mining-form-helpers';
import { clearLocalidadesCache } from '@/hooks/lead-miner/useLocalidades';

const SP_CITIES = ['São Paulo', 'São José dos Campos', 'Santos', 'Campinas'];

const cityResponse = (names: string[]) => ({
  items: names.map((nome, i) => ({ id: i + 1, nome })),
});

beforeEach(() => {
  clearLocalidadesCache();
  api.getConfig.mockResolvedValue({ iaAvailable: false });
  api.lookupRun.mockResolvedValue({ run: null });
  api.createRun.mockReset();
  api.createRun.mockResolvedValue({ run: { id: 'r1' } });
  api.listCities.mockResolvedValue(cityResponse(SP_CITIES));
  api.listNeighborhoods.mockResolvedValue({ items: ['Vila Mariana', 'Moema', 'Pinheiros'] });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const uf = () => screen.getByLabelText('UF') as HTMLSelectElement;
const cidade = () => screen.getByLabelText('Cidade') as HTMLInputElement;
const bairro = () => screen.getByLabelText('Bairro') as HTMLInputElement;

async function renderForm() {
  render(<MiningForm onRunStarted={vi.fn()} />);
  await act(async () => { });
}

async function chooseUf(value: string) {
  await act(async () => {
    fireEvent.change(uf(), { target: { value } });
  });
}

describe('MiningForm — cascata UF → Cidade → Bairro', () => {
  it('mostra os campos na ordem UF, Cidade, Bairro', async () => {
    await renderForm();
    const order = [uf(), cidade(), bairro()];
    for (let i = 0; i < order.length - 1; i++) {
      // eslint-disable-next-line no-bitwise
      expect(order[i].compareDocumentPosition(order[i + 1]) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    }
  });

  it('cada campo só habilita depois do anterior', async () => {
    await renderForm();
    expect(uf().disabled).toBe(false);
    expect(cidade().disabled).toBe(true);
    expect(bairro().disabled).toBe(true);

    await chooseUf('SP');
    expect(cidade().disabled).toBe(false);
    expect(bairro().disabled).toBe(true);

    await act(async () => {
      fireEvent.change(cidade(), { target: { value: 'Santos' } });
    });
    expect(bairro().disabled).toBe(false);
  });

  it('a UF lista as 27 unidades federativas', async () => {
    await renderForm();
    const options = Array.from(uf().options).filter((o) => o.value !== '');
    expect(options).toHaveLength(27);
  });

  it('trocar a UF limpa cidade e bairro e desabilita os dependentes', async () => {
    await renderForm();
    await chooseUf('SP');
    await act(async () => {
      fireEvent.change(cidade(), { target: { value: 'Santos' } });
    });
    fireEvent.change(bairro(), { target: { value: 'Gonzaga' } });

    await chooseUf('RJ');
    expect(cidade().value).toBe('');
    expect(bairro().value).toBe('');
    expect(bairro().disabled).toBe(true);
  });

  it('trocar a cidade limpa o bairro', async () => {
    await renderForm();
    await chooseUf('SP');
    await act(async () => {
      fireEvent.change(cidade(), { target: { value: 'Santos' } });
    });
    fireEvent.change(bairro(), { target: { value: 'Gonzaga' } });
    await act(async () => {
      fireEvent.change(cidade(), { target: { value: 'Campinas' } });
    });
    expect(bairro().value).toBe('');
  });

  it('busca cidades da UF escolhida e filtra sem acento e sem diferenciar maiúsculas', async () => {
    await renderForm();
    await chooseUf('SP');
    expect(api.listCities).toHaveBeenCalledTimes(1);
    expect(api.listCities.mock.calls[0][0]).toBe('SP');

    await act(async () => {
      fireEvent.focus(cidade());
      fireEvent.change(cidade(), { target: { value: 'SAO JO' } });
    });
    const options = within(screen.getByRole('listbox')).getAllByRole('option').map((o) => o.textContent);
    expect(options).toEqual(['São José dos Campos']);
  });

  it('navega pelo teclado (seta para baixo + Enter) e escolhe a sugestão', async () => {
    await renderForm();
    await chooseUf('SP');
    await act(async () => {
      fireEvent.focus(cidade());
      fireEvent.change(cidade(), { target: { value: 'sao' } });
    });
    await act(async () => {
      fireEvent.keyDown(cidade(), { key: 'ArrowDown' });
    });
    await act(async () => {
      fireEvent.keyDown(cidade(), { key: 'ArrowDown' });
    });
    await act(async () => {
      fireEvent.keyDown(cidade(), { key: 'Enter' });
    });
    // "sao" sugere São Paulo e São José dos Campos (ordem da lista); a segunda seta escolhe a segunda.
    expect(cidade().value).toBe('São José dos Campos');
    expect(bairro().disabled).toBe(false);
  });

  it('só busca bairros depois de a cidade ser confirmada', async () => {
    await renderForm();
    await chooseUf('SP');
    await act(async () => {
      fireEvent.change(cidade(), { target: { value: 'Santos' } });
    });
    expect(api.listNeighborhoods).not.toHaveBeenCalled();

    await act(async () => {
      fireEvent.blur(cidade());
    });
    expect(api.listNeighborhoods).toHaveBeenCalledTimes(1);
    expect(api.listNeighborhoods.mock.calls[0].slice(0, 2)).toEqual(['SP', 'Santos']);
  });

  it('cidade fora da lista do IBGE: não consulta o OSM e avisa, mas permite digitar o bairro', async () => {
    await renderForm();
    await chooseUf('SP');
    await act(async () => {
      fireEvent.change(cidade(), { target: { value: 'Cidade Inexistente' } });
    });
    await act(async () => {
      fireEvent.blur(cidade());
    });
    expect(api.listNeighborhoods).not.toHaveBeenCalled();
    expect(screen.getByText(LOCALIDADE_HINTS.cidadeForaDaLista)).toBeTruthy();
    expect(bairro().disabled).toBe(false);
  });

  it('listas indisponíveis: digitação livre e a mineração ainda pode ser criada', async () => {
    api.listCities.mockResolvedValue({ items: [], indisponivel: true });
    api.listNeighborhoods.mockResolvedValue({ items: [], indisponivel: true });
    await renderForm();
    await chooseUf('SP');
    expect(screen.getByText(LOCALIDADE_HINTS.cidadesIndisponiveis)).toBeTruthy();

    await act(async () => {
      fireEvent.change(cidade(), { target: { value: 'Santos' } });
    });
    await act(async () => {
      fireEvent.blur(cidade());
    });
    await act(async () => {
      fireEvent.change(bairro(), { target: { value: 'Gonzaga' } });
    });
    fireEvent.click(screen.getByLabelText('Clínica odontológica'));

    const submit = screen.getByRole('button', { name: /Iniciar mineração|Iniciando/ }) as HTMLButtonElement;
    expect(submit.disabled).toBe(false);
    await act(async () => {
      fireEvent.click(submit);
    });
    expect(api.createRun).toHaveBeenCalledTimes(1);
    const body = api.createRun.mock.calls[0][0];
    expect(body).toMatchObject({ uf: 'SP', cidade: 'Santos', bairro: 'Gonzaga' });
  });

  it('falha de rede ao listar cidades também cai em digitação livre', async () => {
    api.listCities.mockRejectedValue(new Error('rede'));
    await renderForm();
    await chooseUf('SP');
    expect(cidade().disabled).toBe(false);
    await act(async () => {
      fireEvent.change(cidade(), { target: { value: 'Santos' } });
    });
    expect(cidade().value).toBe('Santos');
    expect(bairro().disabled).toBe(false);
  });
});

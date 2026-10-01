// @vitest-environment jsdom
/**
 * `useDashboard` + `DashboardStates`: carregando, acesso negado, não encontrado e erro com
 * "Tentar novamente" refazendo a leitura (Req. 9.6, 9.7, 11.3, 11.4).
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

const toastMock = vi.hoisted(() => ({ error: vi.fn(), success: vi.fn() }));
vi.mock('sonner', () => ({ toast: toastMock }));

import { useDashboard } from '@/components/dashboards/useDashboard';
import { DashboardStates } from '@/components/dashboards/DashboardStates';

interface Data {
  total: number;
}

/** Resposta mínima no formato usado por `fetchDashboard` (status, ok, json). */
function fakeResponse(status: number, body: unknown) {
  return { status, ok: status >= 200 && status < 300, json: async () => body };
}

function Harness({ url }: { url: string | null }) {
  const { state, reload } = useDashboard<Data>(url);
  return (
    <DashboardStates state={state} onRetry={reload}>
      {(data) => <p>Total de métricas: {data.total}</p>}
    </DashboardStates>
  );
}

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
  toastMock.error.mockClear();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('useDashboard + DashboardStates', () => {
  it('exibe "Carregando painel" enquanto a leitura não termina', () => {
    fetchMock.mockReturnValue(new Promise(() => {}));
    render(<Harness url="/api/dashboards/units/NEG?periodo=30d" />);
    expect(screen.getByRole('status').textContent).toContain('Carregando painel');
  });

  it('com url nula fica carregando sem chamar a API', () => {
    render(<Harness url={null} />);
    expect(screen.getByRole('status').textContent).toContain('Carregando painel');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('lê sem cache e renderiza os dados', async () => {
    fetchMock.mockResolvedValue(fakeResponse(200, { total: 7 }));
    render(<Harness url="/api/dashboards/units/NEG?periodo=30d" />);
    expect(await screen.findByText('Total de métricas: 7')).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/dashboards/units/NEG?periodo=30d',
      expect.objectContaining({ cache: 'no-store' }),
    );
  });

  it('403 → acesso negado, sem métricas', async () => {
    fetchMock.mockResolvedValue(fakeResponse(403, { total: 99 }));
    render(<Harness url="/api/dashboards/units/NEG?periodo=30d" />);
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('Acesso negado');
    expect(screen.queryByText(/Total de métricas/)).toBeNull();
    expect(screen.queryByText(/99/)).toBeNull();
  });

  it('404 → "Painel não encontrado" com link para a Tela_Hub', async () => {
    fetchMock.mockResolvedValue(fakeResponse(404, { error: 'x' }));
    render(<Harness url="/api/dashboards/units/XYZ?periodo=30d" />);
    expect(await screen.findByText('Painel não encontrado')).toBeTruthy();
    const link = screen.getByRole('link', { name: /Voltar para Painéis/ });
    expect(link.getAttribute('href')).toBe('/paineis');
    expect(screen.queryByText(/Total de métricas/)).toBeNull();
  });

  it('erro 500 → mensagem em português, toast.error e "Tentar novamente" refaz a leitura', async () => {
    fetchMock
      .mockResolvedValueOnce(fakeResponse(500, { error: 'Erro interno ao calcular o painel.' }))
      .mockResolvedValueOnce(fakeResponse(200, { total: 3 }));
    render(<Harness url="/api/dashboards/members/u1?periodo=7d" />);

    expect(await screen.findByText('Erro ao carregar o painel')).toBeTruthy();
    expect(screen.getByText('Erro interno ao calcular o painel.')).toBeTruthy();
    expect(toastMock.error).toHaveBeenCalledWith('Erro interno ao calcular o painel.');
    expect(fetchMock).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('button', { name: 'Tentar novamente' }));

    expect(await screen.findByText('Total de métricas: 3')).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('falha de conexão → erro com "Tentar novamente"', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));
    render(<Harness url="/api/dashboards?x=1" />);
    expect(await screen.findByRole('button', { name: 'Tentar novamente' })).toBeTruthy();
    await waitFor(() => expect(toastMock.error).toHaveBeenCalledTimes(1));
  });
});

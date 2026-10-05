// @vitest-environment jsdom
/**
 * T1 — botão "Parar": confirmação obrigatória, uma requisição por vez, 409 informativo, Esc fecha;
 * e a coluna "Ações" da tabela só mostra o botão a quem pode parar aquela mineração.
 */
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';

const api = vi.hoisted(() => ({ cancelRun: vi.fn() }));
const toastMock = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn(), info: vi.fn() }));

vi.mock('@/lib/leads/client-api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/leads/client-api')>();
  return { ...actual, leadMinerApi: { ...actual.leadMinerApi, ...api } };
});
vi.mock('sonner', () => ({ toast: toastMock }));
vi.mock('next/link', () => ({ default: ({ children, href }: { children: React.ReactNode; href: string }) => <a href={href}>{children}</a> }));

import { LeadMinerApiError, type RunListItem, type RunProgress } from '@/lib/leads/client-api';
import type { Person } from '@/lib/permissions';
import { StopRunButton } from '@/components/lead-miner/StopRunButton';
import { RunsTable } from '@/components/lead-miner/RunsTable';

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const cancelled = { id: 'r1', status: 'CANCELADA', processados: 3, total: 10 } as unknown as RunProgress;

function deferred<T>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

describe('StopRunButton', () => {
  it('abre o diálogo de confirmação sem chamar a API; "Continuar minerando" fecha', () => {
    render(<StopRunButton runId="r1" title="Centro, Santos/SP" />);
    fireEvent.click(screen.getByRole('button', { name: /Parar mineração Centro/ }));
    expect(screen.getByRole('alertdialog')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Continuar minerando' }));
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(api.cancelRun).not.toHaveBeenCalled();
  });

  it('Escape fecha o diálogo', () => {
    render(<StopRunButton runId="r1" />);
    fireEvent.click(screen.getByRole('button', { name: /Parar/ }));
    fireEvent.keyDown(screen.getByRole('alertdialog'), { key: 'Escape' });
    expect(screen.queryByRole('alertdialog')).toBeNull();
  });

  it('confirmar chama a API uma única vez, mesmo com cliques repetidos, e avisa o progresso', async () => {
    const d = deferred<RunProgress>();
    api.cancelRun.mockReturnValue(d.promise);
    const onStopped = vi.fn();
    render(<StopRunButton runId="r1" onStopped={onStopped} />);
    fireEvent.click(screen.getByRole('button', { name: /Parar/ }));

    const confirm = within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Parar mineração' });
    fireEvent.click(confirm);
    fireEvent.click(confirm);
    expect(api.cancelRun).toHaveBeenCalledTimes(1);

    await act(async () => d.resolve(cancelled));
    expect(onStopped).toHaveBeenCalledWith(cancelled);
    expect(toastMock.success).toHaveBeenCalledWith('Mineração cancelada', {
      description: 'Cancelada (3 de 10 processados)',
    });
    expect(screen.queryByRole('alertdialog')).toBeNull();
  });

  it('409 (já terminou) vira aviso informativo e não chama onStopped', async () => {
    api.cancelRun.mockRejectedValue(new LeadMinerApiError(409, 'A mineração já terminou e não pode ser cancelada.'));
    const onStopped = vi.fn();
    render(<StopRunButton runId="r1" onStopped={onStopped} />);
    fireEvent.click(screen.getByRole('button', { name: /Parar/ }));
    await act(async () => {
      fireEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Parar mineração' }));
    });
    expect(toastMock.info).toHaveBeenCalled();
    expect(onStopped).not.toHaveBeenCalled();
  });

  it('403 vira toast de erro', async () => {
    api.cancelRun.mockRejectedValue(new LeadMinerApiError(403, 'Sem permissão'));
    render(<StopRunButton runId="r1" />);
    fireEvent.click(screen.getByRole('button', { name: /Parar/ }));
    await act(async () => {
      fireEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Parar mineração' }));
    });
    expect(toastMock.error).toHaveBeenCalled();
  });
});

describe('RunsTable: coluna Ações', () => {
  const person = (over: Partial<Person> = {}): Person => ({
    id: 'u-outro',
    status: 'ATIVO',
    globalRole: null,
    departmentCode: 'NEGOCIOS',
    departmentRole: 'ASSESSOR',
    sectors: [],
    ...over,
  });

  const row = (over: Record<string, unknown> = {}): RunListItem =>
    ({
      id: 'r1',
      bairro: 'Centro',
      cidade: 'Santos',
      uf: 'SP',
      status: 'EM_ANDAMENTO',
      processados: 1,
      total: 4,
      novos: 1,
      existentes: 0,
      errorMessage: null,
      nichosFalhos: [],
      iaDisabledReason: null,
      fonteSolicitada: 'OSM',
      fonte: 'OSM',
      googleMotivo: null,
      createdAt: '2026-10-04T12:00:00.000Z',
      createdBy: { id: 'u-creator', name: 'Ana' },
      ...over,
    }) as unknown as RunListItem;

  it('mostra "Parar" ao criador e à gerência; esconde de quem não pode', () => {
    const { rerender } = render(<RunsTable items={[row()]} actor={person({ id: 'u-creator' })} />);
    expect(screen.getAllByRole('button', { name: /Parar mineração/ })).toHaveLength(1);

    rerender(<RunsTable items={[row()]} actor={person({ departmentRole: 'GERENTE' })} />);
    expect(screen.getAllByRole('button', { name: /Parar mineração/ })).toHaveLength(1);

    rerender(<RunsTable items={[row()]} actor={person()} />);
    expect(screen.queryByRole('button', { name: /Parar mineração/ })).toBeNull();
  });

  it('não mostra "Parar" em mineração terminada; CANCELADA exibe "Cancelada (N de M processados)"', () => {
    const creator = person({ id: 'u-creator' });
    render(
      <RunsTable
        items={[
          row({ id: 'a', status: 'CONCLUIDA' }),
          row({ id: 'b', status: 'CANCELADA', processados: 3, total: 10 }),
        ]}
        actor={creator}
      />,
    );
    expect(screen.queryByRole('button', { name: /Parar mineração/ })).toBeNull();
    expect(screen.getByText('Cancelada (3 de 10 processados)')).toBeTruthy();
  });
});

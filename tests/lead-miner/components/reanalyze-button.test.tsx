// @vitest-environment jsdom
/**
 * `ReanalyzeButton` (Req. 16.1, 16.7): desabilita durante a execução (uma requisição por vez),
 * 409 vira toast informativo (RECENTE/EM_CURSO), sucesso devolve a empresa atualizada.
 */
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';

const api = vi.hoisted(() => ({ reanalyze: vi.fn() }));
const toastMock = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn(), info: vi.fn() }));

vi.mock('@/lib/leads/client-api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/leads/client-api')>();
  return { ...actual, leadMinerApi: { ...actual.leadMinerApi, ...api } };
});
vi.mock('sonner', () => ({ toast: toastMock }));

import { LeadMinerApiError, type CompanyDetail } from '@/lib/leads/client-api';
import { ReanalyzeButton } from '@/components/lead-miner/ficha/ReanalyzeButton';

function deferred<T>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const button = () => screen.getByRole('button') as HTMLButtonElement;
const fakeCompany = { id: 'c1' } as unknown as CompanyDetail;

describe('ReanalyzeButton', () => {
  it('desabilita durante a execução e chama uma vez; sucesso devolve a empresa', async () => {
    const d = deferred<{ analysisId: string; semWebsite: boolean; googleRefresh: string | null; company: CompanyDetail }>();
    api.reanalyze.mockReturnValue(d.promise);
    const onReanalyzed = vi.fn();
    render(<ReanalyzeButton companyId="c1" onReanalyzed={onReanalyzed} />);

    fireEvent.click(button());
    expect(button().disabled).toBe(true);
    fireEvent.click(button());
    expect(api.reanalyze).toHaveBeenCalledTimes(1);

    await act(async () => d.resolve({ analysisId: 'a1', semWebsite: false, googleRefresh: null, company: fakeCompany }));
    expect(onReanalyzed).toHaveBeenCalledWith(fakeCompany);
    expect(toastMock.success).toHaveBeenCalled();
    expect(button().disabled).toBe(false);
  });

  it('409 RECENTE vira toast informativo e não altera a empresa', async () => {
    api.reanalyze.mockRejectedValue(new LeadMinerApiError(409, 'Empresa analisada há menos de 10 minutos', { reason: 'RECENTE' }));
    const onReanalyzed = vi.fn();
    render(<ReanalyzeButton companyId="c1" onReanalyzed={onReanalyzed} />);
    await act(async () => {
      fireEvent.click(button());
    });
    expect(toastMock.info).toHaveBeenCalledWith('Empresa analisada há menos de 10 minutos', expect.anything());
    expect(onReanalyzed).not.toHaveBeenCalled();
  });

  it('409 EM_CURSO vira toast informativo', async () => {
    api.reanalyze.mockRejectedValue(new LeadMinerApiError(409, 'Reanálise já em andamento', { reason: 'EM_CURSO' }));
    render(<ReanalyzeButton companyId="c1" onReanalyzed={vi.fn()} />);
    await act(async () => {
      fireEvent.click(button());
    });
    expect(toastMock.info).toHaveBeenCalledWith('Reanálise já em andamento para esta empresa');
  });
});

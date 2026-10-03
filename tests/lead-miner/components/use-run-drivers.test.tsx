// @vitest-environment jsdom
/**
 * `useRunDrivers` (Req. 8.15): nunca há duas requisições simultâneas para o mesmo `runId`, mesmo
 * com `add` repetido, novo `seed` e remontagem (StrictMode); minerações diferentes andam em paralelo.
 */
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import type { RunProgress } from '@/lib/leads/client-api';
import type { RunDriverApi } from '@/hooks/lead-miner/driveRun';

const push = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push, replace: vi.fn(), refresh: vi.fn() }) }));
vi.mock('sonner', () => ({ toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn(), info: vi.fn() }) }));

import { useRunDrivers } from '@/hooks/lead-miner/useRunDrivers';

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function prog(id: string, over: Partial<RunProgress> = {}): RunProgress {
  return {
    id,
    status: 'PENDENTE',
    processados: 0,
    total: 0,
    novos: 0,
    existentes: 0,
    errorMessage: null,
    nichosFalhos: [],
    iaDisabledReason: null,
    ...over,
  };
}

/** API em memória que respeita o `signal` (como o `fetch`) e mede a concorrência por mineração. */
function trackingApi(total = 3) {
  const state = new Map<string, RunProgress>();
  const inFlight = new Map<string, number>();
  const maxPerRun = new Map<string, number>();
  let inFlightTotal = 0;
  let maxTotal = 0;

  const call = (id: string, signal: AbortSignal, step: (cur: RunProgress) => RunProgress) =>
    new Promise<RunProgress>((resolve, reject) => {
      const n = (inFlight.get(id) ?? 0) + 1;
      inFlight.set(id, n);
      maxPerRun.set(id, Math.max(maxPerRun.get(id) ?? 0, n));
      inFlightTotal += 1;
      maxTotal = Math.max(maxTotal, inFlightTotal);
      const finish = () => {
        inFlight.set(id, inFlight.get(id)! - 1);
        inFlightTotal -= 1;
      };
      const t = setTimeout(() => {
        signal.removeEventListener('abort', onAbort);
        finish();
        const next = step(state.get(id) ?? prog(id));
        state.set(id, next);
        resolve(next);
      }, 5);
      function onAbort() {
        clearTimeout(t);
        finish();
        reject(Object.assign(new Error('aborted'), { name: 'AbortError' }));
      }
      signal.addEventListener('abort', onAbort, { once: true });
    });

  const api: RunDriverApi = {
    discover: (id, { signal }) =>
      call(id, signal, (cur) => (cur.status === 'PENDENTE' ? { ...cur, status: 'EM_ANDAMENTO', total } : cur)),
    batch: (id, { signal }) =>
      call(id, signal, (cur) => {
        const processados = Math.min(cur.total, cur.processados + 1);
        return { ...cur, processados, status: processados >= cur.total ? 'CONCLUIDA' : 'EM_ANDAMENTO' };
      }),
  };
  return { api, maxPerRun, maxTotal: () => maxTotal };
}

describe('useRunDrivers', () => {
  it('uma requisição por vez por runId, com add repetido e novo seed', async () => {
    const t = trackingApi(3);
    const seed = [prog('r1'), prog('r2')];
    const { result, rerender } = renderHook(({ s }) => useRunDrivers(s, { api: t.api }), {
      initialProps: { s: seed },
    });

    act(() => {
      result.current.add('r1');
      result.current.add(prog('r1'));
      result.current.add('r2');
    });
    rerender({ s: [prog('r1'), prog('r2')] }); // novo array com as mesmas minerações

    await waitFor(() => {
      expect(result.current.runs).toHaveLength(2);
      expect(result.current.runs.every((r) => r.done)).toBe(true);
    });
    expect(result.current.runs.map((r) => r.progress?.status)).toEqual(['CONCLUIDA', 'CONCLUIDA']);
    expect(t.maxPerRun.get('r1')).toBe(1);
    expect(t.maxPerRun.get('r2')).toBe(1);
    expect(t.maxTotal()).toBe(2); // minerações diferentes em paralelo
  });

  it('StrictMode (efeitos montados duas vezes) não duplica requisições', async () => {
    const t = trackingApi(2);
    const seed = [prog('r1')];
    const { result } = renderHook(() => useRunDrivers(seed, { api: t.api }), {
      wrapper: ({ children }) => <React.StrictMode>{children}</React.StrictMode>,
    });
    act(() => result.current.add('r1'));
    await waitFor(() => expect(result.current.runs[0]?.done).toBe(true));
    expect(t.maxPerRun.get('r1')).toBe(1);
  });
});

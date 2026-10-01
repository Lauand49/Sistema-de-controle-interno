'use client';

import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { fetchDashboard, isAbortError, DEFAULT_ERROR_MESSAGE } from '@/lib/dashboards/client-api';

export type DashboardState<T> =
  | { status: 'loading' }
  | { status: 'ok'; data: T }
  | { status: 'denied' }
  | { status: 'notFound' }
  | { status: 'error'; message: string };

export interface UseDashboardResult<T> {
  state: DashboardState<T>;
  /** Refaz a leitura (botão "Tentar novamente"). */
  reload: () => void;
}

/**
 * Lê um painel sem cache. `url === null` mantém o estado de carregamento sem chamar
 * a API (ex.: `periodo` inválido sendo corrigido na URL). Troca de URL ou desmontagem
 * cancela a leitura anterior via `AbortController`.
 */
export function useDashboard<T>(url: string | null): UseDashboardResult<T> {
  const [state, setState] = useState<DashboardState<T>>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    setState({ status: 'loading' });
    if (url === null) return;
    const controller = new AbortController();
    fetchDashboard<T>(url, controller.signal)
      .then((result) => {
        if (controller.signal.aborted) return;
        if (result.kind === 'ok') setState({ status: 'ok', data: result.data });
        else if (result.kind === 'denied') setState({ status: 'denied' });
        else if (result.kind === 'notFound') setState({ status: 'notFound' });
        else {
          setState({ status: 'error', message: result.message });
          toast.error(result.message);
        }
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted || isAbortError(err)) return;
        setState({ status: 'error', message: DEFAULT_ERROR_MESSAGE });
        toast.error(DEFAULT_ERROR_MESSAGE);
      });
    return () => controller.abort();
  }, [url, attempt]);

  const reload = useCallback(() => setAttempt((n) => n + 1), []);
  return { state, reload };
}

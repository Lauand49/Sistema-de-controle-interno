'use client';

/**
 * `useActiveRuns()`: `GET /runs/active` ao montar a Tela_Minerar/Tela_Mineracoes, para retomar
 * automaticamente as minerações `PENDENTE`/`EM_ANDAMENTO` do autor (Req. 8.6).
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { leadMinerApi, type RunProgress } from '@/lib/leads/client-api';

export interface UseActiveRunsResult {
  runs: RunProgress[];
  loading: boolean;
  error: string | null;
  reload: () => void;
}

const EMPTY: RunProgress[] = [];

export function useActiveRuns(options: { enabled?: boolean } = {}): UseActiveRunsResult {
  const enabled = options.enabled ?? true;
  const [runs, setRuns] = useState<RunProgress[]>(EMPTY);
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    if (!enabled) {
      setLoading(false);
      return;
    }
    const ac = new AbortController();
    setLoading(true);
    setError(null);
    leadMinerApi
      .activeRuns({ signal: ac.signal })
      .then((data) => {
        if (!ac.signal.aborted) setRuns(Array.isArray(data.runs) ? data.runs : EMPTY);
      })
      .catch((e: unknown) => {
        if (ac.signal.aborted) return;
        setError(e instanceof Error ? e.message : 'Não foi possível carregar as minerações em andamento.');
      })
      .finally(() => {
        if (!ac.signal.aborted && mounted.current) setLoading(false);
      });
    return () => ac.abort();
  }, [enabled, nonce]);

  const reload = useCallback(() => setNonce((n) => n + 1), []);

  return { runs, loading, error, reload };
}

export default useActiveRuns;

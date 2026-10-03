'use client';

/**
 * `useRunDriver(runId)`: acompanha e executa UMA mineração (Req. 8.15, 10.7–10.9).
 * Uma requisição por vez; o `AbortController` cancela o laço no unmount ou na troca de `runId`.
 */
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { leadMinerApi, type RunProgress } from '@/lib/leads/client-api';
import { driveRun, isActiveStatus, type RunDriverApi } from './driveRun';
import { applyDriveResult, initialRunState, notifyRunOutcome, type RunDriverState } from './runState';

export interface UseRunDriverOptions {
  /** Progresso já conhecido, evita uma chamada inicial só para descobrir o status. */
  initial?: RunProgress | null;
  /** API injetável (testes). */
  api?: RunDriverApi;
}

export function useRunDriver(runId: string | null | undefined, options: UseRunDriverOptions = {}): RunDriverState | null {
  const router = useRouter();
  const initialRef = useRef(options.initial ?? null);
  initialRef.current = options.initial ?? initialRef.current;
  const apiRef = useRef<RunDriverApi>(options.api ?? leadMinerApi);
  const [state, setState] = useState<RunDriverState | null>(() => (runId ? initialRunState(runId, initialRef.current) : null));

  useEffect(() => {
    if (!runId) {
      setState(null);
      return;
    }
    const initial = initialRef.current?.id === runId ? initialRef.current : null;
    const ac = new AbortController();
    let sawActive = !!initial && isActiveStatus(initial.status);
    setState(initialRunState(runId, initial));

    driveRun(runId, {
      api: apiRef.current,
      signal: ac.signal,
      initial,
      onProgress: (p) => {
        if (ac.signal.aborted) return;
        if (isActiveStatus(p.status)) sawActive = true;
        setState((s) => (s ? { ...s, progress: p } : s));
      },
      onReconnecting: (reconnecting) => {
        if (!ac.signal.aborted) setState((s) => (s ? { ...s, reconnecting } : s));
      },
    }).then((result) => {
      if (ac.signal.aborted) return;
      setState((s) => (s ? applyDriveResult(s, result) : s));
      if (sawActive || result.kind === 'failed') notifyRunOutcome(result, (href) => router.push(href));
    });

    return () => ac.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runId]);

  return state;
}

export default useRunDriver;

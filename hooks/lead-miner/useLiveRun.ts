'use client';

/**
 * T3 — acompanha a mineração filtrada na Tela_Ranking (`?runId=`).
 *
 * Carrega o detalhe uma vez e, enquanto a mineração estiver PENDENTE/EM_ANDAMENTO, repete a cada
 * `LIVE_POLL_MS` (pausando com a aba oculta). Cada resposta incrementa `tick`, que a tela usa para
 * recarregar a lista sem piscar. Ao terminar, faz uma última atualização e para de consultar.
 */
import { useEffect, useRef, useState } from 'react';
import { leadMinerApi, type RunDetail } from '@/lib/leads/client-api';
import { LIVE_POLL_MS, isRunLive } from '@/components/lead-miner/ranking-helpers';

export interface LiveRunState {
  run: RunDetail | null;
  /** Mineração ainda produzindo resultados. */
  live: boolean;
  error: string | null;
  /** Muda a cada resposta do servidor; dispara a atualização silenciosa da lista. */
  tick: number;
}

export function useLiveRun(runId: string | undefined, pollMs: number = LIVE_POLL_MS): LiveRunState {
  const [state, setState] = useState<LiveRunState>({ run: null, live: false, error: null, tick: 0 });
  const liveRef = useRef(false);

  useEffect(() => {
    liveRef.current = false;
    if (!runId) {
      setState({ run: null, live: false, error: null, tick: 0 });
      return undefined;
    }
    let disposed = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let ctrl: AbortController | null = null;
    setState({ run: null, live: false, error: null, tick: 0 });

    const schedule = () => {
      if (disposed || !liveRef.current) return;
      timer = setTimeout(() => void poll(false), pollMs);
    };

    const poll = async (first: boolean) => {
      // Aba oculta: não consulta; retoma no próximo ciclo.
      if (!first && typeof document !== 'undefined' && document.hidden) {
        schedule();
        return;
      }
      ctrl = new AbortController();
      try {
        const run = await leadMinerApi.getRun(runId, { signal: ctrl.signal });
        if (disposed) return;
        const live = isRunLive(run.status);
        liveRef.current = live;
        setState((s) => ({ run, live, error: null, tick: s.tick + 1 }));
      } catch (e) {
        if (disposed || ctrl.signal.aborted) return;
        const message = e instanceof Error ? e.message : 'Não foi possível carregar a mineração.';
        // Falha isolada no meio do acompanhamento: mantém o último estado e tenta de novo.
        setState((s) => ({ ...s, error: s.run ? null : message }));
        if (first) {
          liveRef.current = false;
          return;
        }
      }
      schedule();
    };

    void poll(true);
    return () => {
      disposed = true;
      if (timer) clearTimeout(timer);
      ctrl?.abort();
    };
  }, [runId, pollMs]);

  return state;
}

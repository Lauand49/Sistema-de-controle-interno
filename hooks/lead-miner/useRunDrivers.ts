'use client';

/**
 * `useRunDrivers(seed)`: um driver por mineração ativa do autor (Req. 8.6, 8.15, 10.7–10.9).
 *
 * `seed` normalmente vem de `useActiveRuns()`. Minerações criadas na tela (ou o `runId` de um
 * 409) entram com `add`. Os laços são cancelados no unmount.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { leadMinerApi, type RunProgress } from '@/lib/leads/client-api';
import type { RunDriverApi } from './driveRun';
import { RunDriverPool } from './runDriverPool';
import { notifyRunOutcome, type RunDriverState } from './runState';

export interface UseRunDriversResult {
  runs: RunDriverState[];
  add: (run: string | RunProgress) => void;
  /** Remove o card (e para o driver, se ainda estiver ativo). */
  dismiss: (runId: string) => void;
  /** Aplica um progresso recebido de fora (ex.: após parar a mineração). */
  applyProgress: (progress: RunProgress) => void;
}

/**
 * T5: ao concluir uma mineração acompanhada aqui, pede a avaliação automática dos leads sem contato
 * (até 30; o resto fica para o botão "Avaliar"). É melhor esforço e nunca afeta a mineração: erros
 * (inclusive 409/403) são ignorados.
 */
function requestAutoEvaluation(runId: string): void {
  void Promise.resolve()
    .then(() => leadMinerApi.evaluateRun(runId))
    .catch(() => undefined);
}

export function useRunDrivers(seed: readonly RunProgress[] = [], options: { api?: RunDriverApi } = {}): UseRunDriversResult {
  const router = useRouter();
  const routerRef = useRef(router);
  routerRef.current = router;
  const [runs, setRuns] = useState<RunDriverState[]>([]);
  const poolRef = useRef<RunDriverPool | null>(null);
  if (!poolRef.current) {
    poolRef.current = new RunDriverPool({
      api: options.api ?? leadMinerApi,
      onChange: setRuns,
      onOutcome: (result, sawActive) => {
        if (sawActive || result.kind === 'failed') notifyRunOutcome(result, (href) => routerRef.current.push(href));
        // Só com a API real (testes que injetam `api` não disparam chamadas extras).
        if (!options.api && sawActive && result.kind === 'finished' && result.progress.status === 'CONCLUIDA') {
          requestAutoEvaluation(result.progress.id);
        }
      },
    });
  }

  useEffect(() => {
    const pool = poolRef.current!;
    pool.resume();
    return () => pool.stopAll();
  }, []);

  useEffect(() => {
    poolRef.current!.sync(seed);
  }, [seed]);

  const add = useCallback((run: string | RunProgress) => poolRef.current!.add(run), []);
  const dismiss = useCallback((runId: string) => poolRef.current!.remove(runId), []);
  const applyProgress = useCallback((progress: RunProgress) => poolRef.current!.applyProgress(progress), []);

  return { runs, add, dismiss, applyProgress };
}

export default useRunDrivers;

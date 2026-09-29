'use client';

import React, { useCallback, useEffect, useReducer, useRef } from 'react';
import { Loader2, UserCheck } from 'lucide-react';
import { toast } from 'sonner';
import { leadMinerApi, type UserRef } from '@/lib/leads/client-api';
import { CLAIM_INITIAL, CLAIM_SLOW_MS, CLAIM_SLOW_TEXT, claimReducer, classifyClaimError } from './ficha-helpers';

/**
 * "Assumir lead" (Req. 14.7, 14.9, 14.10, 14.12, 14.13, 16.3, 16.4).
 * O pai só o renderiza enquanto a empresa não tem Responsável; ao sucesso/conflito o pai recebe o
 * Responsável e deixa de renderizá-lo. Após 2 s sem resposta exibe o aviso de demora; em falha
 * comum mostra o erro e reabilita a ação.
 */
export const ClaimLeadButton: React.FC<{
  companyId: string;
  onClaimed: (assignee: UserRef) => void;
  /** `assignee` null quando o servidor não informou o Responsável atual (o pai recarrega). */
  onConflict: (assignee: UserRef | null) => void;
}> = ({ companyId, onClaimed, onConflict }) => {
  const [state, dispatch] = useReducer(claimReducer, CLAIM_INITIAL);
  const abortRef = useRef<AbortController | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTimer = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = null;
  };

  useEffect(
    () => () => {
      clearTimer();
      abortRef.current?.abort();
    },
    [],
  );

  const pending = state.phase === 'pending';

  const handleClick = useCallback(async () => {
    if (pending) return;
    dispatch({ type: 'start' });
    const controller = new AbortController();
    abortRef.current = controller;
    timerRef.current = setTimeout(() => dispatch({ type: 'slow' }), CLAIM_SLOW_MS);
    try {
      const { assignee } = await leadMinerApi.claim(companyId, { signal: controller.signal });
      clearTimer();
      dispatch({ type: 'success' });
      toast.success(`Lead assumido por ${assignee.name || 'você'}.`);
      onClaimed(assignee);
    } catch (e) {
      clearTimer();
      if (controller.signal.aborted) return;
      const outcome = classifyClaimError(e);
      if (outcome.kind === 'conflict') {
        dispatch({ type: 'conflict' });
        toast.error(outcome.message);
        onConflict(outcome.assignee);
      } else {
        dispatch({ type: 'fail', message: outcome.message });
        toast.error(outcome.message);
      }
    }
  }, [companyId, onClaimed, onConflict, pending]);

  return (
    <div className="flex flex-col items-end gap-1.5">
      <button
        type="button"
        onClick={handleClick}
        disabled={pending}
        aria-busy={pending}
        className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 px-4 py-2.5 text-sm font-bold text-white hover:from-purple-500 hover:to-indigo-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-500 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {pending ? (
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
        ) : (
          <UserCheck className="h-4 w-4" aria-hidden="true" />
        )}
        {pending ? 'Assumindo…' : 'Assumir lead'}
      </button>
      <div aria-live="polite" className="text-right text-xs">
        {state.phase === 'pending' && state.slow && <p className="text-amber-300">{CLAIM_SLOW_TEXT}</p>}
      </div>
      {state.phase === 'idle' && state.error && (
        <p role="alert" className="max-w-xs text-right text-xs text-red-300">
          {state.error}
        </p>
      )}
    </div>
  );
};

export default ClaimLeadButton;

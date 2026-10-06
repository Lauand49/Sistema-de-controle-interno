'use client';
/**
 * Aviso "Bairro já minerado em DD/MM por Fulano (N leads)" (Req. 10.4–10.6).
 * Consulta `/runs/lookup` com debounce de 400 ms, cancelando consultas obsoletas.
 */
import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { History, RefreshCw } from 'lucide-react';
import { leadMinerApi, type RunLookup } from '@/lib/leads/client-api';
import { rankingHref } from '@/hooks/lead-miner/runState';
import { lookupKey, previousRunMessage } from './mining-form-helpers';
import { Button } from '@/components/ui/Button';

export const LOOKUP_DEBOUNCE_MS = 400;

export interface PreviousRunNoticeProps {
  /** Parâmetros completos do formulário, ou null enquanto incompletos. */
  params: { bairro: string; cidade: string; uf: string } | null;
  onRemine: () => void;
  remineDisabled?: boolean;
  /** Motivo exibido quando "Remineirar" está desabilitado. */
  remineHint?: string;
}

export const PreviousRunNotice: React.FC<PreviousRunNoticeProps> = ({
  params,
  onRemine,
  remineDisabled = false,
  remineHint,
}) => {
  const key = lookupKey(params);
  const [result, setResult] = useState<{ key: string; run: RunLookup } | null>(null);

  useEffect(() => {
    if (!key) return;
    const [bairro, cidade, uf] = JSON.parse(key) as [string, string, string];
    const ac = new AbortController();
    const timer = setTimeout(() => {
      leadMinerApi
        .lookupRun({ bairro, cidade, uf }, { signal: ac.signal })
        .then((data) => {
          if (ac.signal.aborted) return;
          setResult(data.run ? { key, run: data.run } : null);
        })
        .catch(() => {
          // O aviso é informativo: falhas na consulta apenas o ocultam.
          if (!ac.signal.aborted) setResult(null);
        });
    }, LOOKUP_DEBOUNCE_MS);
    return () => {
      clearTimeout(timer);
      ac.abort();
    };
  }, [key]);

  // Só exibe o aviso que corresponde aos parâmetros atuais.
  const run = result && result.key === key ? result.run : null;

  return (
    <div aria-live="polite">
      {run && (
        <div className="flex flex-col gap-3 rounded-2xl border border-amber-700/50 bg-amber-950/30 p-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="flex items-start gap-2 text-sm text-amber-200">
            <History className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <span>{previousRunMessage(run)}</span>
          </p>
          <div className="flex shrink-0 flex-col items-start gap-1 sm:items-end">
            <div className="flex gap-2">
              <Link
                href={rankingHref(run.id)}
                className="rounded-xl border border-slate-700 bg-slate-900 px-3 py-1.5 text-xs font-semibold text-slate-200 hover:border-purple-500 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-500"
              >
                Ver
              </Link>
              <Button size="sm" type="button" onClick={onRemine} disabled={remineDisabled}>
                <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
                Remineirar
              </Button>
            </div>
            {remineDisabled && remineHint && <span className="text-[11px] text-slate-400">{remineHint}</span>}
          </div>
        </div>
      )}
    </div>
  );
};

export default PreviousRunNotice;

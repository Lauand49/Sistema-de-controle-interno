import React from 'react';
import { BotOff } from 'lucide-react';
import type { IaDisabledReason } from '@/lib/leads/client-api';

export const NO_AI_TEXT = 'Executada sem IA: chave não configurada';

/** Aviso de mineração executada sem IA por falta de chave (Req. 7.10, 7.11). */
export const NoAiNote: React.FC<{ iaDisabledReason: IaDisabledReason | null | undefined; className?: string }> = ({
  iaDisabledReason,
  className = '',
}) => {
  if (iaDisabledReason !== 'SEM_CHAVE') return null;
  return (
    <p className={`flex items-center gap-1.5 text-xs text-slate-400 ${className}`}>
      <BotOff className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      <span>{NO_AI_TEXT}</span>
    </p>
  );
};

export default NoAiNote;

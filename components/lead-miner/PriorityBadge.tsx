import React from 'react';
import { PRIORITY_LABEL, type PriorityCode } from '@/lib/leads/config';

/** Cores por prioridade, alinhadas ao mapa (Alta verde, Média âmbar, Baixa cinza, sem análise roxo). */
const STYLES: Record<PriorityCode | 'SEM', { className: string; dot: string }> = {
  ALTA: { className: 'bg-green-500/15 text-green-300 border-green-500/40', dot: 'bg-green-500' },
  MEDIA: { className: 'bg-amber-500/15 text-amber-300 border-amber-500/40', dot: 'bg-amber-500' },
  BAIXA: { className: 'bg-slate-500/15 text-slate-300 border-slate-500/40', dot: 'bg-slate-400' },
  SEM: { className: 'bg-purple-500/15 text-purple-300 border-purple-500/40', dot: 'bg-purple-500' },
};

export const NO_PRIORITY_LABEL = 'Sem análise';

/** Selo de Prioridade: sempre texto junto da cor (Req. 19.7). */
export const PriorityBadge: React.FC<{ prioridade: PriorityCode | null | undefined; className?: string }> = ({
  prioridade,
  className = '',
}) => {
  const key = prioridade ?? 'SEM';
  const style = STYLES[key];
  const label = prioridade ? PRIORITY_LABEL[prioridade] : NO_PRIORITY_LABEL;
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-semibold ${style.className} ${className}`}
    >
      <span className={`h-2 w-2 rounded-full ${style.dot}`} aria-hidden="true" />
      {label}
    </span>
  );
};

export default PriorityBadge;

import React from 'react';
import { Bot, ListChecks } from 'lucide-react';
import type { EvaluationDto } from '@/lib/leads/evaluation';
import { evaluationSourceLabel } from '@/lib/leads/evaluation';

/** Selo de origem: "Avaliado por IA" ou "Avaliação por regras (sem IA)". */
export const EvaluationBadge: React.FC<{ fonte: EvaluationDto['fonte'] }> = ({ fonte }) => (
  <span
    className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold ${
      fonte === 'IA'
        ? 'border-purple-800/60 bg-purple-950/40 text-purple-200'
        : 'border-slate-700 bg-slate-800/60 text-slate-300'
    }`}
  >
    {fonte === 'IA' ? <Bot className="h-3 w-3" aria-hidden="true" /> : <ListChecks className="h-3 w-3" aria-hidden="true" />}
    {evaluationSourceLabel(fonte)}
  </span>
);

/** Resumo + sugestão de ação (ou aviso de que ainda não foi avaliado). */
export const EvaluationView: React.FC<{ avaliacao: EvaluationDto | null; className?: string }> = ({
  avaliacao,
  className = '',
}) => {
  if (!avaliacao) return <span className="text-xs text-slate-400">Ainda não avaliado</span>;
  return (
    <div className={`space-y-1 ${className}`}>
      <p className="text-xs text-slate-200">{avaliacao.resumo}</p>
      <p className="text-xs text-slate-400">
        <span className="font-semibold text-slate-300">Sugestão: </span>
        {avaliacao.sugestao}
      </p>
      <EvaluationBadge fonte={avaliacao.fonte} />
    </div>
  );
};

export default EvaluationView;

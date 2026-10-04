import React from 'react';
import { ClipboardCheck } from 'lucide-react';
import type { CompanyDetail } from '@/lib/leads/client-api';
import { EvaluationBadge } from '../EvaluationView';
import { formatDate } from '../ranking-helpers';
import { Section } from './Section';

/** Avaliação básica de leads sem contato (T5); nada é renderizado sem avaliação. */
export const BasicEvaluation: React.FC<{ avaliacao: CompanyDetail['avaliacao'] }> = ({ avaliacao }) => {
  if (!avaliacao) return null;
  return (
    <Section
      id="ficha-avaliacao"
      title="Avaliação básica"
      icon={<ClipboardCheck className="h-5 w-5 text-purple-400" aria-hidden="true" />}
      actions={<EvaluationBadge fonte={avaliacao.fonte} />}
    >
      <div className="space-y-3 text-sm text-slate-200">
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Resumo</h3>
          <p className="mt-0.5 whitespace-pre-line">{avaliacao.resumo}</p>
        </div>
        <div>
          <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Ação sugerida</h3>
          <p className="mt-0.5 whitespace-pre-line">{avaliacao.sugestao}</p>
        </div>
        <p className="text-xs text-slate-500">Avaliado em {formatDate(avaliacao.avaliadoEm)}</p>
      </div>
    </Section>
  );
};

export default BasicEvaluation;

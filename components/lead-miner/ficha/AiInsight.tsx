import React from 'react';
import { Sparkles } from 'lucide-react';
import type { CompanyAnalysis } from '@/lib/leads/client-api';
import { Section } from './Section';

/** Oportunidade e justificativa da IA; nada é renderizado sem resultado de IA (Req. 14.4). */
export const AiInsight: React.FC<{ analysis: CompanyAnalysis }> = ({ analysis: a }) => {
  const oportunidade = a.oportunidadeIa?.trim();
  const justificativa = a.justificativaIa?.trim();
  if (!a.iaAplicada || (!oportunidade && !justificativa)) return null;
  return (
    <Section id="ficha-ia" title="Análise da IA" icon={<Sparkles className="h-5 w-5 text-purple-400" aria-hidden="true" />}>
      <div className="space-y-3 text-sm text-slate-200">
        {oportunidade && (
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-400">Oportunidade</h3>
            <p className="mt-0.5 whitespace-pre-line">{oportunidade}</p>
          </div>
        )}
        {justificativa && (
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-400">Justificativa</h3>
            <p className="mt-0.5 whitespace-pre-line">{justificativa}</p>
          </div>
        )}
      </div>
    </Section>
  );
};

export default AiInsight;

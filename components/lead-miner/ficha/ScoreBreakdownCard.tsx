import React from 'react';
import { Gauge } from 'lucide-react';
import type { CompanyAnalysis } from '@/lib/leads/client-api';
import { PriorityBadge } from '@/components/lead-miner/PriorityBadge';
import { Muted, Section } from './Section';
import { AI_NOT_APPLIED, rescaledFormulaText, toDisplayBreakdown, type DisplayComponent } from './ficha-helpers';

const ComponentRow: React.FC<{ title: string; comp: DisplayComponent | null; hasCriteria: boolean; iaMotivo?: string | null }> = ({
  title,
  comp,
  hasCriteria,
  iaMotivo,
}) => (
  <li className="rounded-xl border border-slate-800 bg-slate-950/50 p-4">
    <div className="flex items-baseline justify-between gap-2">
      <h3 className="text-sm font-semibold text-slate-200">{title}</h3>
      {comp ? (
        <span className="text-sm font-bold text-white">
          {comp.value} <span className="font-normal text-slate-400">de {comp.max}</span>
        </span>
      ) : (
        <span className="text-sm font-semibold text-amber-300">{AI_NOT_APPLIED}</span>
      )}
    </div>
    {comp ? (
      <>
        <div
          className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-800"
          role="img"
          aria-label={`${comp.value} de ${comp.max} pontos`}
        >
          <div
            className="h-full bg-gradient-to-r from-purple-600 to-indigo-600"
            style={{ width: `${Math.min(100, Math.max(0, (comp.value / comp.max) * 100))}%` }}
          />
        </div>
        {hasCriteria ? (
          comp.criteria.length > 0 ? (
            <ul className="mt-2 space-y-0.5 text-xs text-slate-300">
              {comp.criteria.map((c) => (
                <li key={c.id} className="flex justify-between gap-2">
                  <span>{c.label}</span>
                  <span className="font-semibold text-slate-200">+{c.points}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-xs">
              <Muted>nenhum critério pontuado</Muted>
            </p>
          )
        ) : (
          <p className="mt-2 text-xs">
            <Muted>critérios não registrados</Muted>
          </p>
        )}
      </>
    ) : (
      iaMotivo && <p className="mt-1 text-xs text-slate-400">Motivo: {iaMotivo}</p>
    )}
  </li>
);

/** Componentes da pontuação, Score_Final e Prioridade da análise mais recente (Req. 14.3). */
export const ScoreBreakdownCard: React.FC<{ analysis: CompanyAnalysis }> = ({ analysis }) => {
  const b = toDisplayBreakdown(analysis);
  return (
    <Section
      id="ficha-score"
      title="Detalhamento do score"
      icon={<Gauge className="h-5 w-5 text-purple-400" aria-hidden="true" />}
      actions={
        <div className="flex items-center gap-3">
          <span className="text-2xl font-black text-white">
            {b.final}
            <span className="text-sm font-normal text-slate-400">/100</span>
            <span className="sr-only"> pontos de Score Final</span>
          </span>
          <PriorityBadge prioridade={b.prioridade} />
        </div>
      }
    >
      <ul className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <ComponentRow title="Presença digital" comp={b.digital} hasCriteria={b.hasCriteria} />
        <ComponentRow title="ICP" comp={b.icp} hasCriteria={b.hasCriteria} />
        <ComponentRow title="IA" comp={b.ia} hasCriteria={b.hasCriteria} iaMotivo={b.iaMotivo} />
      </ul>
      <p className="mt-4 text-xs text-slate-400">
        Score objetivo: <span className="font-semibold text-slate-200">{b.objetivo} de 65</span>
      </p>
      {b.rescaled && (
        <p className="mt-1 text-xs text-slate-400">
          IA não aplicada: o Score_Final foi calculado por{' '}
          <code className="rounded bg-slate-800 px-1 py-0.5 text-slate-200">{rescaledFormulaText(b.objetivo, b.final)}</code>
        </p>
      )}
    </Section>
  );
};

export default ScoreBreakdownCard;

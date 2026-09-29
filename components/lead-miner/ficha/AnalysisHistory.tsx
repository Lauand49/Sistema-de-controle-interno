import React from 'react';
import { History } from 'lucide-react';
import type { CompanyAnalysis } from '@/lib/leads/client-api';
import { PriorityBadge } from '@/components/lead-miner/PriorityBadge';
import { Section } from './Section';
import { NOT_INFORMED, categoryLabel, formatDateTime, sortByDateDesc } from './ficha-helpers';

/** Todas as análises, da mais recente para a mais antiga (Req. 14.5). */
export const AnalysisHistory: React.FC<{ analyses: readonly CompanyAnalysis[] }> = ({ analyses }) => {
  const rows = sortByDateDesc(analyses, (a) => a.createdAt);
  return (
    <Section id="ficha-historico" title="Histórico de análises" icon={<History className="h-5 w-5 text-purple-400" aria-hidden="true" />}>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <caption className="sr-only">Análises da empresa, da mais recente para a mais antiga</caption>
          <thead className="text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th scope="col" className="py-2 pr-4 font-semibold">Data</th>
              <th scope="col" className="py-2 pr-4 font-semibold">Score final</th>
              <th scope="col" className="py-2 pr-4 font-semibold">Prioridade</th>
              <th scope="col" className="py-2 font-semibold">Categoria</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800 text-slate-200">
            {rows.map((a) => (
              <tr key={a.id}>
                <td className="whitespace-nowrap py-2 pr-4">{formatDateTime(a.createdAt) ?? NOT_INFORMED}</td>
                <td className="py-2 pr-4 font-semibold">{a.scoreFinal}</td>
                <td className="py-2 pr-4">
                  <PriorityBadge prioridade={a.prioridade} />
                </td>
                <td className="py-2">{categoryLabel(a.categoria)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Section>
  );
};

export default AnalysisHistory;

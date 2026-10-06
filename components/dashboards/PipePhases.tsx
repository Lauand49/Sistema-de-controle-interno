'use client';

import React from 'react';
import { Kanban } from 'lucide-react';
import { formatInt } from '@/lib/dashboards/format';
import type { PhaseCountDTO } from '@/lib/dashboards/types';
import { DashboardSection, SectionEmpty } from './DashboardSection';

export interface PipePhasesItem {
  id: string;
  name: string;
  /** Unidade dona do funil (painel do membro). */
  unitName?: string;
  phases: PhaseCountDTO[];
}

/**
 * Cards por fase de cada funil, com as fases na ordem de `order`, incluindo fases com zero
 * cards (Req. 4.2, 5.2, 8.3). A barra é decorativa (`aria-hidden`); nome da fase e número
 * ficam sempre em texto (Req. 11.6).
 */
export function PipePhases({
  pipes,
  title = 'Funis',
  emptyMessage = 'Nenhum funil nesta unidade',
}: {
  pipes: PipePhasesItem[];
  title?: string;
  emptyMessage?: string;
}) {
  return (
    <DashboardSection title={title} icon={Kanban} description="Quantidade atual de cards em cada fase">
      {pipes.length === 0 ? (
        <SectionEmpty>{emptyMessage}</SectionEmpty>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {pipes.map((pipe) => (
            <PipeCard key={pipe.id} pipe={pipe} />
          ))}
        </div>
      )}
    </DashboardSection>
  );
}

function PipeCard({ pipe }: { pipe: PipePhasesItem }) {
  const phases = [...pipe.phases].sort((a, b) => a.order - b.order);
  const max = phases.reduce((m, p) => Math.max(m, p.cards), 0);
  const total = phases.reduce((s, p) => s + p.cards, 0);
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-950/40 p-4">
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <h3 className="truncate text-sm font-semibold text-slate-100">
          {pipe.name}
          {pipe.unitName ? <span className="ml-2 text-xs font-normal text-slate-400">{pipe.unitName}</span> : null}
        </h3>
        <span className="shrink-0 text-xs text-slate-400">{formatInt(total)} cards</span>
      </div>
      {phases.length === 0 ? (
        <p className="text-xs text-slate-400">Nenhuma fase neste funil</p>
      ) : (
        <ol className="space-y-2">
          {phases.map((phase) => (
            <li key={phase.id}>
              <div className="flex items-center justify-between gap-3 text-xs">
                <span className="truncate text-slate-300">
                  {phase.name}
                  {phase.isFinal ? <span className="ml-1.5 text-slate-400">(fase final)</span> : null}
                </span>
                <span className="shrink-0 font-semibold text-white">{formatInt(phase.cards)}</span>
              </div>
              <div aria-hidden="true" className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-800">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-purple-600 to-indigo-600"
                  style={{ width: max > 0 ? `${(phase.cards / max) * 100}%` : '0%' }}
                />
              </div>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

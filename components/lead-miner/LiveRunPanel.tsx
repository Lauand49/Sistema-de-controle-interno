'use client';

/**
 * T3 — contadores ao vivo da mineração filtrada no ranking: empresas encontradas, com contato e
 * analisadas. Os números são atualizados a cada poll, mas só a mudança de estado (em andamento →
 * terminou) é anunciada a leitores de tela, para não gerar ruído a cada 3 s.
 */
import React from 'react';
import { Loader2, CheckCircle2, OctagonX } from 'lucide-react';
import type { RunDetail } from '@/lib/leads/client-api';
import { liveCounters } from './ranking-helpers';

const nf = new Intl.NumberFormat('pt-BR');

interface LiveRunPanelProps {
  run: RunDetail;
  live: boolean;
  className?: string;
}

export const LiveRunPanel: React.FC<LiveRunPanelProps> = ({ run, live, className = '' }) => {
  const c = liveCounters(run);
  const discovering = run.status === 'PENDENTE';
  const stateText = live
    ? discovering
      ? 'Buscando empresas… os resultados aparecem conforme são encontrados.'
      : 'Analisando sites e dados das empresas… o score aparece conforme cada análise termina.'
    : run.status === 'CANCELADA'
      ? 'Mineração cancelada. Os resultados já obtidos foram mantidos.'
      : run.status === 'ERRO'
        ? 'A mineração terminou com erro. Os resultados já obtidos foram mantidos.'
        : 'Mineração concluída.';
  const Icon = live ? Loader2 : run.status === 'CONCLUIDA' ? CheckCircle2 : OctagonX;

  return (
    <section
      aria-label="Andamento da mineração"
      className={`rounded-2xl border border-slate-800 bg-slate-900/60 p-4 ${className}`}
    >
      <p className="flex items-center gap-2 text-sm text-slate-300">
        <Icon className={`h-4 w-4 ${live ? 'animate-spin text-purple-300' : 'text-slate-400'}`} aria-hidden="true" />
        <span role="status" aria-live="polite">
          {stateText}
        </span>
      </p>
      <dl className="mt-3 grid grid-cols-1 gap-3 text-sm sm:grid-cols-3">
        <div>
          <dt className="text-xs text-slate-400">Encontradas</dt>
          <dd className="text-lg font-bold text-white" data-testid="live-encontradas">
            {nf.format(c.encontradas)}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-slate-400">Com contato</dt>
          <dd className="text-lg font-bold text-white" data-testid="live-com-contato">
            {nf.format(c.comContato)}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-slate-400">Analisadas</dt>
          <dd className="text-lg font-bold text-white" data-testid="live-analisadas">
            {c.total === null ? nf.format(c.analisadas) : `${nf.format(c.analisadas)} de ${nf.format(c.total)}`}
          </dd>
        </div>
      </dl>
    </section>
  );
};

export default LiveRunPanel;

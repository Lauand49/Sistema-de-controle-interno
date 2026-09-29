import React from 'react';
import Link from 'next/link';
import { ArrowRight, Pickaxe } from 'lucide-react';
import type { CompanyRunEntry } from '@/lib/leads/client-api';
import { FailedNichesNote } from '@/components/lead-miner/FailedNichesNote';
import { Muted, Section } from './Section';
import { NOT_INFORMED, formatDateTime, rankingHrefForRun, sortByDateDesc } from './ficha-helpers';

/** Minerações que encontraram a empresa, da mais recente para a mais antiga (Req. 14.6, 2.17). */
export const CompanyRuns: React.FC<{ runs: readonly CompanyRunEntry[] }> = ({ runs }) => {
  const rows = sortByDateDesc(runs, (r) => r.run.createdAt);
  return (
    <Section id="ficha-mineracoes" title="Minerações" icon={<Pickaxe className="h-5 w-5 text-purple-400" aria-hidden="true" />}>
      {rows.length === 0 ? (
        <p className="text-sm">
          <Muted>Nenhuma mineração registrada para esta empresa.</Muted>
        </p>
      ) : (
        <ul className="space-y-3">
          {rows.map(({ run, isNew }) => {
            const place = `${run.bairro}, ${run.cidade}/${run.uf}`;
            return (
              <li key={run.id} className="rounded-xl border border-slate-800 bg-slate-950/50 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="space-y-1 text-sm">
                    <p className="font-semibold text-white">{place}</p>
                    <p className="text-xs text-slate-400">
                      {formatDateTime(run.createdAt) ?? NOT_INFORMED} · por {run.createdBy.name || NOT_INFORMED}
                    </p>
                    <span
                      className={`inline-block rounded-full border px-2 py-0.5 text-xs font-semibold ${
                        isNew
                          ? 'border-green-500/40 bg-green-500/15 text-green-300'
                          : 'border-slate-600 bg-slate-800 text-slate-300'
                      }`}
                    >
                      {isNew ? 'Nova nesta mineração' : 'Já conhecida nesta mineração'}
                    </span>
                  </div>
                  <Link
                    href={rankingHrefForRun(run.id)}
                    className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold text-purple-300 hover:text-purple-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-500"
                  >
                    Ver ranking<span className="sr-only"> da mineração em {place}</span>
                    <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                  </Link>
                </div>
                <FailedNichesNote nichosFalhos={run.nichosFalhos} className="mt-2" />
              </li>
            );
          })}
        </ul>
      )}
    </Section>
  );
};

export default CompanyRuns;

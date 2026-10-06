'use client';
/**
 * Tela_Minerar (Req. 7.5, 8.6, 8.15, 10.1–10.10): formulário de mineração, aviso de bairro já
 * minerado e um card de progresso por mineração ativa do autor.
 */
import React, { useCallback, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, History, ListOrdered, Loader2, Pickaxe } from 'lucide-react';
import { SciTecNavbar } from '@/components/navigation/SciTecNavbar';
import { LeadMinerGate } from '@/components/lead-miner/LeadMinerGate';
import { MiningForm } from '@/components/lead-miner/MiningForm';
import { RunProgressCard } from '@/components/lead-miner/RunProgressCard';
import { OdblAttribution } from '@/components/lead-miner/OdblAttribution';
import { useActiveRuns } from '@/hooks/lead-miner/useActiveRuns';
import { useRunDrivers } from '@/hooks/lead-miner/useRunDrivers';
import type { RunProgress } from '@/lib/leads/client-api';
import { PageHeader } from '@/components/ui/Display';

const navLinkClass =
  'inline-flex items-center gap-1.5 rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-xs font-semibold text-slate-200 hover:border-purple-500 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-500';

function LeadMinerHome() {
  const active = useActiveRuns();
  const { runs, add, dismiss, applyProgress } = useRunDrivers(active.runs);
  const [titles, setTitles] = useState<Record<string, string>>({});

  const onRunStarted = useCallback(
    (run: RunProgress | string, title: string) => {
      const id = typeof run === 'string' ? run : run.id;
      setTitles((t) => (t[id] ? t : { ...t, [id]: title }));
      add(run);
    },
    [add],
  );

  return (
    <div className="space-y-8">
      <MiningForm onRunStarted={onRunStarted} />

      <section aria-labelledby="active-runs-title" className="space-y-3">
        <h2 id="active-runs-title" className="text-sm font-bold uppercase tracking-wider text-slate-400">
          Minerações em acompanhamento
        </h2>
        {active.error && (
          <p role="alert" className="text-sm text-red-300">
            {active.error}{' '}
            <button
              type="button"
              onClick={active.reload}
              className="rounded font-semibold text-purple-300 underline hover:text-purple-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-500"
            >
              Tentar novamente
            </button>
          </p>
        )}
        {active.loading && runs.length === 0 ? (
          <p role="status" className="flex items-center gap-2 text-sm text-slate-400">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            Carregando minerações em andamento…
          </p>
        ) : runs.length === 0 ? (
          <p className="rounded-2xl border border-slate-800 bg-slate-900/40 p-4 text-sm text-slate-400">
            Nenhuma mineração em andamento.
          </p>
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {runs.map((r) => (
              <RunProgressCard
                key={r.runId}
                run={r}
                title={titles[r.runId]}
                onDismiss={dismiss}
                onStopped={applyProgress}
              />
            ))}
          </div>
        )}
      </section>

      <OdblAttribution />
    </div>
  );
}

export default function LeadMinerPage() {
  return (
    <div className="flex min-h-screen flex-col bg-slate-950 text-slate-100">
      <SciTecNavbar />
      <main className="flex-1 min-w-0 max-w-7xl w-full mx-auto p-4 md:p-6 space-y-6">
        <header className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div className="space-y-2">
            <Link
              href="/tools"
              className="inline-flex items-center gap-1 rounded text-xs font-semibold text-slate-400 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-500"
            >
              <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
              Ferramentas
            </Link>
            <PageHeader icon={Pickaxe} title="Minerador de Leads" subtitle="Escolha o bairro e os nichos para buscar empresas e analisar a presença digital delas." />
          </div>
          <nav aria-label="Minerador de Leads" className="flex gap-2">
            <Link href="/tools/lead-miner/runs" className={navLinkClass}>
              <History className="h-4 w-4" aria-hidden="true" />
              Minerações
            </Link>
            <Link href="/tools/lead-miner/leads" className={navLinkClass}>
              <ListOrdered className="h-4 w-4" aria-hidden="true" />
              Ranking de leads
            </Link>
          </nav>
        </header>

        <LeadMinerGate>
          <LeadMinerHome />
        </LeadMinerGate>
      </main>
    </div>
  );
}

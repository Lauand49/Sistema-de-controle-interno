'use client';

import React, { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { AlertTriangle, ArrowLeft, RefreshCw, SearchX } from 'lucide-react';
import { SciTecNavbar } from '@/components/navigation/SciTecNavbar';
import { LeadMinerGate, LEAD_MINER_ACCESS_DENIED } from '@/components/lead-miner/LeadMinerGate';
import { OdblAttribution } from '@/components/lead-miner/OdblAttribution';
import { CompanyHeader } from '@/components/lead-miner/ficha/CompanyHeader';
import { SiteDiagnosis } from '@/components/lead-miner/ficha/SiteDiagnosis';
import { ScoreBreakdownCard } from '@/components/lead-miner/ficha/ScoreBreakdownCard';
import { AiInsight } from '@/components/lead-miner/ficha/AiInsight';
import { AnalysisHistory } from '@/components/lead-miner/ficha/AnalysisHistory';
import { CompanyRuns } from '@/components/lead-miner/ficha/CompanyRuns';
import { ClaimLeadButton } from '@/components/lead-miner/ficha/ClaimLeadButton';
import { DigitalPresence } from '@/components/lead-miner/ficha/DigitalPresence';
import { PageSpeedCard } from '@/components/lead-miner/ficha/PageSpeedCard';
import { CnpjSection } from '@/components/lead-miner/ficha/CnpjSection';
import { BasicEvaluation } from '@/components/lead-miner/ficha/BasicEvaluation';
import { ApproachMessages } from '@/components/lead-miner/ficha/ApproachMessages';
import { ReanalyzeButton } from '@/components/lead-miner/ficha/ReanalyzeButton';
import { COMPANY_NOT_FOUND, NOT_ANALYZED, sortByDateDesc } from '@/components/lead-miner/ficha/ficha-helpers';
import { isLeadMinerApiError, leadMinerApi, type CompanyDetail, type UserRef } from '@/lib/leads/client-api';

type LoadState =
  | { kind: 'loading' }
  | { kind: 'ready'; company: CompanyDetail }
  | { kind: 'not-found' }
  | { kind: 'forbidden' }
  | { kind: 'error'; message: string };

const BACK_HREF = '/tools/lead-miner/leads';

function FichaContent({ id }: { id: string }) {
  const [state, setState] = useState<LoadState>({ kind: 'loading' });
  const [reloadKey, setReloadKey] = useState(0);
  const [conflictNotice, setConflictNotice] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    setState({ kind: 'loading' });
    leadMinerApi
      .getCompany(id, { signal: controller.signal })
      .then((company) => setState({ kind: 'ready', company }))
      .catch((e: unknown) => {
        if (controller.signal.aborted) return;
        if (isLeadMinerApiError(e) && e.status === 404) setState({ kind: 'not-found' });
        else if (isLeadMinerApiError(e) && e.status === 403) setState({ kind: 'forbidden' });
        else
          setState({
            kind: 'error',
            message: isLeadMinerApiError(e) ? e.message : 'Não foi possível carregar a empresa.',
          });
      });
    return () => controller.abort();
  }, [id, reloadKey]);

  const setAssignee = useCallback((assignee: UserRef) => {
    setState((s) => (s.kind === 'ready' ? { kind: 'ready', company: { ...s.company, assignedUser: assignee } } : s));
  }, []);

  /** Substitui a empresa carregada após reanálise ou mudança de CNPJ, sem recarregar a página. */
  const replaceCompany = useCallback((company: CompanyDetail) => {
    setState({ kind: 'ready', company });
  }, []);

  const handleClaimed = useCallback(
    (assignee: UserRef) => {
      setConflictNotice(null);
      setAssignee(assignee);
    },
    [setAssignee],
  );

  const handleConflict = useCallback(
    (assignee: UserRef | null) => {
      const who = assignee?.name?.trim();
      setConflictNotice(
        who ? `Este lead já foi assumido por ${who}.` : 'Este lead já foi assumido por outra pessoa.',
      );
      if (assignee) setAssignee(assignee);
      else setReloadKey((k) => k + 1); // servidor não informou: recarrega para mostrar o Responsável
    },
    [setAssignee],
  );

  if (state.kind === 'loading') {
    return (
      <div role="status" aria-live="polite" aria-busy="true" className="space-y-4 animate-pulse">
        <span className="sr-only">Carregando ficha da empresa…</span>
        <div className="h-40 rounded-2xl border border-slate-800 bg-slate-900/60" />
        <div className="h-48 rounded-2xl border border-slate-800 bg-slate-900/60" />
        <div className="h-48 rounded-2xl border border-slate-800 bg-slate-900/60" />
      </div>
    );
  }

  if (state.kind === 'not-found') {
    return (
      <div
        role="alert"
        className="mx-auto flex max-w-lg flex-col items-center gap-4 rounded-2xl border border-slate-800 bg-slate-900/60 p-8 text-center"
      >
        <SearchX className="h-10 w-10 text-slate-400" aria-hidden="true" />
        <h1 className="text-lg font-bold text-white">{COMPANY_NOT_FOUND}</h1>
        <p className="text-sm text-slate-400">A empresa solicitada não existe ou foi removida.</p>
      </div>
    );
  }

  if (state.kind === 'forbidden') {
    return (
      <div role="alert" className="mx-auto max-w-lg rounded-2xl border border-slate-800 bg-slate-900/60 p-8 text-center">
        <p className="text-base font-bold text-white">{LEAD_MINER_ACCESS_DENIED}</p>
      </div>
    );
  }

  if (state.kind === 'error') {
    return (
      <div
        role="alert"
        className="mx-auto flex max-w-lg flex-col items-center gap-4 rounded-2xl border border-red-900/60 bg-red-950/30 p-8 text-center"
      >
        <AlertTriangle className="h-8 w-8 text-red-400" aria-hidden="true" />
        <p className="text-sm text-red-200">{state.message}</p>
        <button
          type="button"
          onClick={() => setReloadKey((k) => k + 1)}
          className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 px-4 py-2 text-xs font-bold text-white hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-500"
        >
          <RefreshCw className="h-4 w-4" aria-hidden="true" /> Tentar novamente
        </button>
      </div>
    );
  }

  const { company } = state;
  const latest = sortByDateDesc(company.analyses, (a) => a.createdAt)[0] ?? null;
  const hasWebsite = !!company.website?.trim();

  return (
    <div className="space-y-6">
      <CompanyHeader
        company={company}
        claimSlot={
          <div className="flex flex-wrap items-center gap-2">
            <ReanalyzeButton companyId={company.id} onReanalyzed={replaceCompany} />
            {!company.assignedUser && (
              <ClaimLeadButton companyId={company.id} onClaimed={handleClaimed} onConflict={handleConflict} />
            )}
          </div>
        }
      />

      {conflictNotice && (
        <p
          role="alert"
          className="flex items-center gap-2 rounded-xl border border-amber-700/60 bg-amber-950/40 px-4 py-3 text-sm text-amber-200"
        >
          <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />
          {conflictNotice}
        </p>
      )}

      <CnpjSection company={company} onUpdated={replaceCompany} />
      <BasicEvaluation avaliacao={company.avaliacao} />

      {latest ? (
        <>
          <SiteDiagnosis analysis={latest} companyHasWebsite={hasWebsite} />
          <DigitalPresence sinais={latest.sinais} />
          <PageSpeedCard pagespeed={latest.pagespeed} motivo={latest.pagespeedMotivo} />
          <ScoreBreakdownCard analysis={latest} />
          <AiInsight analysis={latest} />
          <ApproachMessages companyId={company.id} initialMessages={company.mensagens} />
          <AnalysisHistory analyses={company.analyses} />
        </>
      ) : (
        <section className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6 text-center">
          <p className="text-sm font-semibold text-slate-300">{NOT_ANALYZED}</p>
        </section>
      )}

      <CompanyRuns runs={company.runs} />

      {company.fonte === 'OSM' && <OdblAttribution />}
    </div>
  );
}

export default function CompanyFichaPage() {
  const params = useParams<{ id: string }>();
  const raw = params?.id;
  const id = Array.isArray(raw) ? raw[0] : raw;

  return (
    <div className="flex min-h-screen flex-col bg-slate-950 text-slate-100">
      <SciTecNavbar />
      <main className="flex-1 min-w-0 max-w-7xl w-full mx-auto p-4 md:p-6 space-y-6">
        <Link
          href={BACK_HREF}
          className="inline-flex items-center gap-1.5 rounded-lg text-sm font-semibold text-purple-300 hover:text-purple-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-500"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Voltar para o ranking
        </Link>
        <LeadMinerGate>{id ? <FichaContent id={id} /> : null}</LeadMinerGate>
      </main>
    </div>
  );
}

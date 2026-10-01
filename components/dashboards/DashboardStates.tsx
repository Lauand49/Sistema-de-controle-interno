'use client';

import React from 'react';
import Link from 'next/link';
import { AlertTriangle, ArrowLeft, Loader2, RotateCcw, SearchX, ShieldAlert } from 'lucide-react';
import { dashboardPages } from '@/lib/dashboards/client-api';
import type { DashboardState } from './useDashboard';

const CARD = 'rounded-2xl border border-slate-800 bg-slate-900/60 p-8 text-center';
const FOCUS = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-500';

export function DashboardLoading() {
  return (
    <div role="status" className={`${CARD} flex items-center justify-center gap-2 text-sm text-slate-400`}>
      <Loader2 className="h-5 w-5 animate-spin text-purple-400" aria-hidden="true" />
      Carregando painel
    </div>
  );
}

export function DashboardDenied() {
  return (
    <div role="alert" className={CARD}>
      <ShieldAlert className="mx-auto mb-3 h-10 w-10 text-amber-400" aria-hidden="true" />
      <p className="text-lg font-semibold text-slate-100">Acesso negado</p>
      <p className="mt-1 text-sm text-slate-400">Você não tem permissão para ver este painel.</p>
      <BackToHub />
    </div>
  );
}

export function DashboardNotFound() {
  return (
    <div role="alert" className={CARD}>
      <SearchX className="mx-auto mb-3 h-10 w-10 text-slate-500" aria-hidden="true" />
      <p className="text-lg font-semibold text-slate-100">Painel não encontrado</p>
      <p className="mt-1 text-sm text-slate-400">O painel que você procura não existe ou foi removido.</p>
      <BackToHub />
    </div>
  );
}

export function DashboardError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div role="alert" className={CARD}>
      <AlertTriangle className="mx-auto mb-3 h-10 w-10 text-red-400" aria-hidden="true" />
      <p className="text-lg font-semibold text-slate-100">Erro ao carregar o painel</p>
      <p className="mt-1 text-sm text-slate-400">{message}</p>
      <button
        type="button"
        onClick={onRetry}
        className={`mt-5 inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:from-purple-500 hover:to-indigo-500 ${FOCUS}`}
      >
        <RotateCcw className="h-4 w-4" aria-hidden="true" />
        Tentar novamente
      </button>
    </div>
  );
}

function BackToHub() {
  return (
    <Link
      href={dashboardPages.hub}
      className={`mt-5 inline-flex items-center gap-1.5 rounded-lg text-sm font-semibold text-purple-300 hover:text-purple-200 ${FOCUS}`}
    >
      <ArrowLeft className="h-4 w-4" aria-hidden="true" />
      Voltar para Painéis
    </Link>
  );
}

/**
 * Renderiza o estado de `useDashboard`: carregando, acesso negado, não encontrado
 * ou erro; com dados, chama `children(data)`. Sem dados, nenhuma métrica é exibida.
 */
export function DashboardStates<T>({
  state,
  onRetry,
  children,
}: {
  state: DashboardState<T>;
  onRetry: () => void;
  children: (data: T) => React.ReactNode;
}) {
  switch (state.status) {
    case 'loading':
      return <DashboardLoading />;
    case 'denied':
      return <DashboardDenied />;
    case 'notFound':
      return <DashboardNotFound />;
    case 'error':
      return <DashboardError message={state.message} onRetry={onRetry} />;
    case 'ok':
      return <>{children(state.data)}</>;
  }
}

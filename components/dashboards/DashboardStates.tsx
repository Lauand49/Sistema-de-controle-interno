'use client';
import React from 'react';
import Link from 'next/link';
import { ArrowLeft, RotateCcw, SearchX, ShieldAlert } from 'lucide-react';
import { dashboardPages } from '@/lib/dashboards/client-api';
import { Button } from '@/components/ui/Button';
import { ErrorState, LoadingState } from '@/components/ui/Display';
import type { DashboardState } from './useDashboard';

export function DashboardLoading() {
  return <LoadingState label="Carregando painel" className="rounded-card border border-border bg-surface-raised" />;
}

export function DashboardDenied() {
  return (
    <ErrorState
      icon={ShieldAlert}
      tone="warning"
      title="Acesso negado"
      description="Você não tem permissão para ver este painel."
      action={<BackToHub />}
    />
  );
}

export function DashboardNotFound() {
  return (
    <ErrorState
      icon={SearchX}
      tone="warning"
      title="Painel não encontrado"
      description="O painel que você procura não existe ou foi removido."
      action={<BackToHub />}
    />
  );
}

export function DashboardError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <ErrorState
      title="Erro ao carregar o painel"
      description={message}
      action={
        <Button icon={RotateCcw} onClick={onRetry} className="mt-2">
          Tentar novamente
        </Button>
      }
    />
  );
}

function BackToHub() {
  return (
    <Link
      href={dashboardPages.hub}
      className="mt-2 inline-flex items-center gap-1.5 min-h-10 rounded-lg text-sm font-semibold text-primary-soft hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
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

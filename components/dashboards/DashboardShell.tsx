'use client';

import React from 'react';
import { LayoutDashboard, type LucideIcon } from 'lucide-react';
import { SciTecNavbar } from '@/components/navigation/SciTecNavbar';
import { PeriodSelector } from './PeriodSelector';

/**
 * Moldura das Telas_Paineis: navbar, `h1` do painel e, opcionalmente, o seletor de Periodo.
 * Com `showPeriod`, a página precisa estar dentro de `<Suspense>` (usa `useSearchParams`).
 */
export function DashboardShell({
  title,
  subtitle,
  icon: Icon = LayoutDashboard,
  showPeriod = true,
  actions,
  children,
}: {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  icon?: LucideIcon;
  showPeriod?: boolean;
  /** Conteúdo extra no cabeçalho (ex.: links). */
  actions?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen flex-col bg-slate-950 text-slate-100 selection:bg-purple-500 selection:text-white">
      <SciTecNavbar />
      <main className="mx-auto w-full max-w-7xl flex-1 space-y-6 p-6">
        <header className="flex flex-col gap-4 rounded-2xl border border-slate-800 bg-slate-900/60 p-6 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-purple-600 to-indigo-600 shadow-lg shadow-purple-900/40">
              <Icon className="h-6 w-6 text-white" aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <h1 className="truncate text-2xl font-bold text-white">{title}</h1>
              {subtitle ? <p className="mt-0.5 text-sm text-slate-400">{subtitle}</p> : null}
            </div>
          </div>
          {showPeriod || actions ? (
            <div className="flex flex-wrap items-center gap-3">
              {actions}
              {showPeriod ? <PeriodSelector /> : null}
            </div>
          ) : null}
        </header>
        {children}
      </main>
    </div>
  );
}

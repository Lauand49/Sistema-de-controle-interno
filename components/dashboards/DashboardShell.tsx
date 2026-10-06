'use client';

import React from 'react';
import { LayoutDashboard, type LucideIcon } from 'lucide-react';
import { SciTecNavbar } from '@/components/navigation/SciTecNavbar';
import { PeriodSelector } from './PeriodSelector';
import { PageHeader } from '@/components/ui/Display';

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
      <main className="flex-1 min-w-0 max-w-7xl w-full mx-auto p-4 md:p-6 space-y-6">
        <PageHeader
          icon={Icon}
          title={title}
          subtitle={subtitle}
          actions={
            showPeriod || actions ? (
              <>
                {actions}
                {showPeriod ? <PeriodSelector /> : null}
              </>
            ) : undefined
          }
        />
        {children}
      </main>
    </div>
  );
}

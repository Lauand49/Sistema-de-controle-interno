'use client';
import { ButtonLink } from '@/components/ui/Button';
import React from 'react';
import Link from 'next/link';
import { Building2, ChevronRight, Layers, LayoutDashboard, UserRound, Users } from 'lucide-react';
import { DashboardShell } from '@/components/dashboards/DashboardShell';
import { DashboardStates } from '@/components/dashboards/DashboardStates';
import { DashboardSection, FOCUS_RING, SectionEmpty } from '@/components/dashboards/DashboardSection';
import { MemberSearchList } from '@/components/dashboards/MemberSearchList';
import { useDashboard } from '@/components/dashboards/useDashboard';
import { dashboardPages, dashboardUrls } from '@/lib/dashboards/client-api';
import type { HubDTO, UnitRef } from '@/lib/dashboards/types';

/**
 * Tela_Hub: lista os painéis que o usuário da sessão pode abrir (Req. 9.1–9.3).
 * A API decide as permissões; a tela só exibe o que recebeu.
 */
export default function PaineisHubPage() {
  const { state, reload } = useDashboard<HubDTO>(dashboardUrls.hub());

  return (
    <DashboardShell
      title="Painéis"
      subtitle="Acompanhe departamentos, setores e membros"
      icon={LayoutDashboard}
      showPeriod={false}
      actions={
        state.status === 'ok' ? (
          <ButtonLink size="md" href={dashboardPages.member(state.data.me.id)}>
            <UserRound className="h-4 w-4" aria-hidden="true" />
            Meu painel
          </ButtonLink>
        ) : null
      }
    >
      <DashboardStates state={state} onRetry={reload}>
        {(data) => (
          <div className="space-y-6">
            <UnitSection
              title="Departamentos"
              icon={Building2}
              units={data.departments}
              emptyText="Nenhum painel de departamento disponível"
            />
            <UnitSection
              title="Setores"
              icon={Layers}
              units={data.sectors}
              emptyText="Nenhum painel de setor disponível"
            />
            {data.members !== null ? (
              <DashboardSection title="Membros" icon={Users} description="Painéis individuais dos membros ativos">
                <MemberSearchList members={data.members} />
              </DashboardSection>
            ) : null}
          </div>
        )}
      </DashboardStates>
    </DashboardShell>
  );
}

function UnitSection({
  title,
  icon,
  units,
  emptyText,
}: {
  title: string;
  icon: typeof Building2;
  units: UnitRef[];
  emptyText: string;
}) {
  return (
    <DashboardSection title={title} icon={icon}>
      {units.length === 0 ? (
        <SectionEmpty>{emptyText}</SectionEmpty>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {units.map((unit) => (
            <li key={unit.code}>
              <Link
                href={dashboardPages.unit(unit.code)}
                className={`group flex items-center justify-between gap-3 rounded-2xl border border-slate-800 bg-slate-950/40 px-4 py-3 transition-colors hover:border-purple-500/60 hover:bg-slate-900 ${FOCUS_RING}`}
              >
                <span className="truncate text-sm font-semibold text-slate-100">{unit.name}</span>
                <ChevronRight
                  className="h-4 w-4 shrink-0 text-slate-400 transition-colors group-hover:text-purple-300"
                  aria-hidden="true"
                />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </DashboardSection>
  );
}

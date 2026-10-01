'use client';

import React, { Suspense } from 'react';
import { useParams } from 'next/navigation';
import { Building2, UserCheck, Users } from 'lucide-react';
import { useProfile } from '@/contexts/ProfileContext';
import { canViewUnitDashboard, isUnitCode, unitName } from '@/lib/permissions';
import { dashboardUrls } from '@/lib/dashboards/client-api';
import { formatInt } from '@/lib/dashboards/format';
import type { SectorInfoDTO, UnitDashboardDTO } from '@/lib/dashboards/types';
import { DashboardShell } from '@/components/dashboards/DashboardShell';
import { usePeriodo } from '@/components/dashboards/PeriodSelector';
import { useDashboard } from '@/components/dashboards/useDashboard';
import {
  DashboardDenied,
  DashboardLoading,
  DashboardNotFound,
  DashboardStates,
} from '@/components/dashboards/DashboardStates';
import { DashboardSection, avatarUrl } from '@/components/dashboards/DashboardSection';
import { TaskMetrics } from '@/components/dashboards/TaskMetrics';
import { OverdueTaskList } from '@/components/dashboards/OverdueTaskList';
import { PipePhases } from '@/components/dashboards/PipePhases';
import { RequestsSummary } from '@/components/dashboards/RequestsSummary';
import { LeadsSummary } from '@/components/dashboards/LeadsSummary';
import { MemberSummaryTable } from '@/components/dashboards/MemberSummaryTable';

/** Painel_Unidade: departamento ou setor (Req. 4, 5, 6, 7, 10). */
export default function UnitDashboardPage() {
  return (
    <Suspense fallback={<FallbackShell />}>
      <UnitDashboardContent />
    </Suspense>
  );
}

function FallbackShell() {
  return (
    <DashboardShell title="Painel" icon={Building2} showPeriod={false}>
      <DashboardLoading />
    </DashboardShell>
  );
}

function UnitDashboardContent() {
  const params = useParams();
  const raw = params?.code;
  const code = (Array.isArray(raw) ? raw[0] : raw ?? '').toUpperCase();
  const { currentProfile, loading } = useProfile();

  // Código inexistente: nenhuma chamada à API (Req. 9.7).
  if (!isUnitCode(code)) {
    return (
      <DashboardShell title="Painel" icon={Building2} showPeriod={false}>
        <DashboardNotFound />
      </DashboardShell>
    );
  }

  if (loading) {
    return (
      <DashboardShell title={unitName(code)} icon={Building2} showPeriod={false}>
        <DashboardLoading />
      </DashboardShell>
    );
  }

  // Sem permissão: acesso negado sem chamar a API (a API segue sendo a decisão final, Req. 9.6).
  if (!canViewUnitDashboard(currentProfile, code)) {
    return (
      <DashboardShell title={unitName(code)} icon={Building2} showPeriod={false}>
        <DashboardDenied />
      </DashboardShell>
    );
  }

  return <AuthorizedUnitDashboard code={code} />;
}

function AuthorizedUnitDashboard({ code }: { code: string }) {
  const { periodo, ready } = usePeriodo();
  const { state, reload } = useDashboard<UnitDashboardDTO>(ready ? dashboardUrls.unit(code, periodo) : null);
  const title = state.status === 'ok' ? state.data.unit.name : unitName(code);

  return (
    <DashboardShell title={title} subtitle="Painel da unidade" icon={Building2}>
      <DashboardStates state={state} onRetry={reload}>
        {(dto) => (
          <div className="space-y-6">
            <TaskMetrics tasks={dto.tasks} />
            <div className="grid gap-6 lg:grid-cols-2">
              <OverdueTaskList tasks={dto.overdueTasks} show="assignee" />
              {dto.sector ? <SectorInfo sector={dto.sector} /> : null}
              {dto.requests ? <RequestsSummary requests={dto.requests} /> : null}
            </div>
            <PipePhases pipes={dto.pipes} />
            {dto.leads ? <LeadsSummary {...dto.leads} /> : null}
            <MemberSummaryTable members={dto.members} />
          </div>
        )}
      </DashboardStates>
    </DashboardShell>
  );
}

/** Bloco do setor: gerente e quantidade de membros ativos (Req. 5.4). */
function SectorInfo({ sector }: { sector: SectorInfoDTO }) {
  return (
    <DashboardSection title="Setor" icon={Users} description="Gerente e membros ativos">
      <dl className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-xl border border-slate-800 bg-slate-950/40 p-4">
          <dt className="flex items-center gap-1.5 text-xs text-slate-400">
            <UserCheck className="h-3.5 w-3.5" aria-hidden="true" />
            Gerente
          </dt>
          <dd className="mt-2 flex items-center gap-2 text-sm font-semibold text-slate-100">
            {sector.manager ? (
              <>
                <img src={avatarUrl(sector.manager)} alt="" className="h-6 w-6 rounded-full object-cover" />
                {sector.manager.name}
              </>
            ) : (
              <span className="font-normal text-slate-400">Sem gerente</span>
            )}
          </dd>
        </div>
        <div className="rounded-xl border border-slate-800 bg-slate-950/40 p-4">
          <dt className="flex items-center gap-1.5 text-xs text-slate-400">
            <Users className="h-3.5 w-3.5" aria-hidden="true" />
            Membros ativos
          </dt>
          <dd className="mt-2 text-2xl font-bold text-white">{formatInt(sector.activeMembers)}</dd>
        </div>
      </dl>
    </DashboardSection>
  );
}

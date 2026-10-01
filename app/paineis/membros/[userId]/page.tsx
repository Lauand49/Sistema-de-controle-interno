'use client';

import React, { Suspense } from 'react';
import { useParams } from 'next/navigation';
import { UserRound } from 'lucide-react';
import { DashboardShell } from '@/components/dashboards/DashboardShell';
import { DashboardLoading, DashboardStates } from '@/components/dashboards/DashboardStates';
import { usePeriodo } from '@/components/dashboards/PeriodSelector';
import { useDashboard } from '@/components/dashboards/useDashboard';
import { MemberHeader } from '@/components/dashboards/MemberHeader';
import { TaskMetrics } from '@/components/dashboards/TaskMetrics';
import { OverdueTaskList } from '@/components/dashboards/OverdueTaskList';
import { PipePhases } from '@/components/dashboards/PipePhases';
import { MemberRequestsSummary } from '@/components/dashboards/RequestsSummary';
import { LeadsSummary } from '@/components/dashboards/LeadsSummary';
import { dashboardUrls } from '@/lib/dashboards/client-api';
import type { MemberDashboardDTO } from '@/lib/dashboards/types';

/**
 * Painel_Membro (Req. 8, 10). A permissão é decidida pela API
 * (403 → acesso negado, 404 → não encontrado); a tela só exibe o que recebe.
 */
function MemberDashboardContent() {
  const params = useParams<{ userId: string }>();
  const userId = params?.userId ?? '';
  const { periodo, ready } = usePeriodo();
  const { state, reload } = useDashboard<MemberDashboardDTO>(
    ready && userId ? dashboardUrls.member(userId, periodo) : null
  );

  const title = state.status === 'ok' ? state.data.member.name : 'Painel do membro';

  return (
    <DashboardShell title={title} subtitle="Painel do membro" icon={UserRound}>
      <DashboardStates state={state} onRetry={reload}>
        {(dto) => (
          <div className="space-y-6">
            <MemberHeader member={dto.member} scope={dto.scope} />
            <TaskMetrics tasks={dto.tasks} />
            <OverdueTaskList tasks={dto.overdueTasks} show="unit" />
            <PipePhases
              title="Cards por funil"
              emptyMessage="Nenhum card atribuído"
              pipes={dto.cards.map((g) => ({
                id: g.pipe.id,
                name: g.pipe.name,
                unitName: g.pipe.unit.name,
                phases: g.phases,
              }))}
            />
            {dto.scope.kind === 'ALL' && dto.requests ? (
              <MemberRequestsSummary requests={dto.requests} />
            ) : null}
            {dto.scope.kind === 'ALL' && dto.leads ? <LeadsSummary byStatus={dto.leads.byStatus} /> : null}
          </div>
        )}
      </DashboardStates>
    </DashboardShell>
  );
}

export default function MemberDashboardPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-slate-950 p-6">
          <DashboardLoading />
        </div>
      }
    >
      <MemberDashboardContent />
    </Suspense>
  );
}

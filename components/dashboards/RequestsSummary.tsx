'use client';

import React from 'react';
import { AlertTriangle, Send } from 'lucide-react';
import { REQUEST_STATUS_LABEL, formatInt } from '@/lib/dashboards/format';
import { REQUEST_STATUSES, type RequestStatus } from '@/lib/dashboards/metrics';
import type { RequestStatusCounts, UnitRequestsDTO } from '@/lib/dashboards/types';
import { DashboardSection, SectionEmpty } from './DashboardSection';

/** "Concluída" depende do Periodo (Req. 4.6, 10.4). */
function requestStatusLabel(status: RequestStatus): string {
  return status === 'COMPLETED' ? `${REQUEST_STATUS_LABEL.COMPLETED} no período` : REQUEST_STATUS_LABEL[status];
}

function sumCounts(c: RequestStatusCounts): number {
  return REQUEST_STATUSES.reduce((s, st) => s + c[st], 0);
}

/**
 * Solicitações recebidas e enviadas pelo departamento por status, mais as atrasadas recebidas
 * (Req. 4.3, 4.4, 4.6).
 */
export function RequestsSummary({ requests }: { requests: UnitRequestsDTO }) {
  const empty = sumCounts(requests.received) === 0 && sumCounts(requests.sent) === 0 && requests.overdueReceived === 0;
  return (
    <DashboardSection title="Solicitações" icon={Send}>
      {empty ? (
        <SectionEmpty>Nenhuma solicitação</SectionEmpty>
      ) : (
        <div className="space-y-4">
          <p className="flex items-center gap-2 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
            <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span>
              Atrasadas recebidas: <strong className="font-bold text-white">{formatInt(requests.overdueReceived)}</strong>
            </span>
          </p>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <StatusList title="Recebidas" counts={requests.received} />
            <StatusList title="Enviadas" counts={requests.sent} />
          </div>
        </div>
      )}
    </DashboardSection>
  );
}

function StatusList({ title, counts }: { title: string; counts: RequestStatusCounts }) {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-950/40 p-4">
      <h3 className="mb-2 text-sm font-semibold text-slate-100">{title}</h3>
      <dl className="space-y-1.5">
        {REQUEST_STATUSES.map((status) => (
          <div key={status} className="flex items-center justify-between gap-3 text-sm">
            <dt className="text-slate-300">{requestStatusLabel(status)}</dt>
            <dd className="font-semibold text-white">{formatInt(counts[status])}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

/** Solicitações em que o Alvo é responsável, no Painel_Membro com escopo `'ALL'` (Req. 8.5). */
export function MemberRequestsSummary({ requests }: { requests: { open: number; overdue: number } }) {
  return (
    <DashboardSection title="Solicitações" icon={Send} description="Em que o membro é responsável">
      {requests.open === 0 && requests.overdue === 0 ? (
        <SectionEmpty>Nenhuma solicitação</SectionEmpty>
      ) : (
        <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="rounded-xl border border-slate-800 bg-slate-950/40 p-4">
            <dt className="text-xs font-medium uppercase tracking-wide text-slate-400">Abertas</dt>
            <dd className="mt-2 text-3xl font-bold text-white">{formatInt(requests.open)}</dd>
          </div>
          <div className="rounded-xl border border-slate-800 bg-slate-950/40 p-4">
            <dt className="text-xs font-medium uppercase tracking-wide text-slate-400">Atrasadas</dt>
            <dd className="mt-2 text-3xl font-bold text-white">{formatInt(requests.overdue)}</dd>
          </div>
        </dl>
      )}
    </DashboardSection>
  );
}

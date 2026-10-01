'use client';

import React from 'react';
import { Target, TrendingUp } from 'lucide-react';
import { LEAD_STATUS_LABEL, formatConversion, formatInt } from '@/lib/dashboards/format';
import { LEAD_STATUSES } from '@/lib/dashboards/metrics';
import type { Conversion, LeadStatusCounts, LeadsByAssigneeDTO } from '@/lib/dashboards/types';
import { DashboardSection, SectionEmpty } from './DashboardSection';

function sumLeads(c: LeadStatusCounts): number {
  return LEAD_STATUSES.reduce((s, st) => s + c[st], 0);
}

/**
 * Leads de triagem por status (com zeros), Taxa_Conversao no período com numerador e
 * denominador e, quando informado, leads por responsável com a linha "Sem responsável"
 * (Req. 6.1–6.3, 8.6, 10.4). Barras são `aria-hidden`; status e número ficam em texto (Req. 11.6).
 */
export function LeadsSummary({
  byStatus,
  conversion,
  byAssignee,
  title = 'Leads',
}: {
  byStatus: LeadStatusCounts;
  conversion?: Conversion;
  byAssignee?: LeadsByAssigneeDTO[];
  title?: string;
}) {
  const total = sumLeads(byStatus);
  const max = LEAD_STATUSES.reduce((m, st) => Math.max(m, byStatus[st]), 0);

  return (
    <DashboardSection title={title} icon={Target} description="Leads de triagem do minerador">
      {total === 0 && (!conversion || conversion.total === 0) ? (
        <SectionEmpty>Nenhum lead</SectionEmpty>
      ) : (
        <div className="space-y-4">
          {conversion ? (
            <p className="flex items-center gap-2 rounded-xl border border-purple-500/30 bg-purple-500/10 px-4 py-3 text-sm text-purple-100">
              <TrendingUp className="h-4 w-4 shrink-0 text-purple-300" aria-hidden="true" />
              <span>
                Taxa de conversão no período:{' '}
                <strong className="font-bold text-white">{formatConversion(conversion)}</strong>
              </span>
            </p>
          ) : null}

          <div className="rounded-xl border border-slate-800 bg-slate-950/40 p-4">
            <h3 className="mb-3 text-sm font-semibold text-slate-100">Por status</h3>
            <ul className="space-y-2">
              {LEAD_STATUSES.map((status) => (
                <li key={status}>
                  <div className="flex items-center justify-between gap-3 text-xs">
                    <span className="text-slate-300">{LEAD_STATUS_LABEL[status]}</span>
                    <span className="font-semibold text-white">{formatInt(byStatus[status])}</span>
                  </div>
                  <div aria-hidden="true" className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-800">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-purple-600 to-indigo-600"
                      style={{ width: max > 0 ? `${(byStatus[status] / max) * 100}%` : '0%' }}
                    />
                  </div>
                </li>
              ))}
            </ul>
          </div>

          {byAssignee ? <LeadsByAssigneeTable rows={byAssignee} /> : null}
        </div>
      )}
    </DashboardSection>
  );
}

function LeadsByAssigneeTable({ rows }: { rows: LeadsByAssigneeDTO[] }) {
  if (rows.length === 0) return null;
  return (
    <div className="overflow-x-auto rounded-xl border border-slate-800 bg-slate-950/40">
      <table className="w-full min-w-[640px] text-sm">
        <caption className="px-4 pt-4 text-left text-sm font-semibold text-slate-100">Por responsável</caption>
        <thead>
          <tr className="border-b border-slate-800 text-xs text-slate-400">
            <th scope="col" className="px-4 py-2 text-left font-medium">
              Responsável
            </th>
            {LEAD_STATUSES.map((status) => (
              <th key={status} scope="col" className="px-3 py-2 text-right font-medium">
                {LEAD_STATUS_LABEL[status]}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-800">
          {rows.map((row) => (
            <tr key={row.assignee?.id ?? 'sem-responsavel'}>
              <th scope="row" className="px-4 py-2 text-left font-medium text-slate-200">
                {row.assignee ? row.assignee.name : 'Sem responsável'}
              </th>
              {LEAD_STATUSES.map((status) => (
                <td key={status} className="px-3 py-2 text-right text-slate-100">
                  {formatInt(row.counts[status])}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

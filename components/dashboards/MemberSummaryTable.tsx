'use client';

import React from 'react';
import Link from 'next/link';
import { Users } from 'lucide-react';
import { dashboardPages } from '@/lib/dashboards/client-api';
import { formatInt } from '@/lib/dashboards/format';
import type { MemberSummaryDTO } from '@/lib/dashboards/types';
import { DashboardSection, FOCUS_RING, SectionEmpty, avatarUrl } from './DashboardSection';

/**
 * Resumos_Membro autorizados (a API já filtra, Req. 7.3); o nome leva ao Painel_Membro (Req. 7.5).
 */
export function MemberSummaryTable({ members }: { members: MemberSummaryDTO[] }) {
  return (
    <DashboardSection title="Membros" icon={Users} description="Tarefas desta unidade atribuídas a cada membro">
      {members.length === 0 ? (
        <SectionEmpty>Nenhum membro para exibir</SectionEmpty>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[520px] text-sm">
            <thead>
              <tr className="border-b border-slate-800 text-xs text-slate-400">
                <th scope="col" className="px-3 py-2 text-left font-medium">
                  Membro
                </th>
                <th scope="col" className="px-3 py-2 text-right font-medium">
                  Abertas
                </th>
                <th scope="col" className="px-3 py-2 text-right font-medium">
                  Atrasadas
                </th>
                <th scope="col" className="px-3 py-2 text-right font-medium">
                  Concluídas no período
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {members.map((m) => (
                <tr key={m.user.id}>
                  <th scope="row" className="px-3 py-2 text-left font-medium">
                    <Link
                      href={dashboardPages.member(m.user.id)}
                      className={`inline-flex items-center gap-2 rounded-lg text-slate-100 hover:text-purple-300 ${FOCUS_RING}`}
                    >
                      <img src={avatarUrl(m.user)} alt="" className="h-6 w-6 rounded-full object-cover" />
                      {m.user.name}
                    </Link>
                  </th>
                  <td className="px-3 py-2 text-right text-slate-100">{formatInt(m.open)}</td>
                  <td className={`px-3 py-2 text-right ${m.overdue > 0 ? 'font-semibold text-red-300' : 'text-slate-100'}`}>
                    {formatInt(m.overdue)}
                  </td>
                  <td className="px-3 py-2 text-right text-slate-100">{formatInt(m.doneInPeriod)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </DashboardSection>
  );
}

'use client';

import React from 'react';
import { Info, UserX } from 'lucide-react';
import type { MemberDashboardDTO } from '@/lib/dashboards/types';
import { SECTION_CARD, avatarUrl } from './DashboardSection';

const STATUS_LABEL: Record<MemberDashboardDTO['member']['status'], string> = {
  PENDENTE: 'Aguardando aprovação',
  ATIVO: 'Ativo',
  INATIVO: 'Conta desativada',
};

/**
 * Identificação do Alvo no Painel_Membro: avatar, nome, título e status, com "Conta desativada"
 * para INATIVO (Req. 8.10), e o aviso de escopo restrito a setores (Req. 8.7).
 * O `h1` fica no `DashboardShell`; aqui o nome é texto comum.
 */
export function MemberHeader({
  member,
  scope,
}: {
  member: MemberDashboardDTO['member'];
  scope: MemberDashboardDTO['scope'];
}) {
  const inactive = member.status === 'INATIVO';
  return (
    <div className="space-y-3">
      <div className={`${SECTION_CARD} flex items-center gap-4`}>
        <img
          src={avatarUrl(member)}
          alt={`Foto de ${member.name}`}
          className={`h-16 w-16 shrink-0 rounded-2xl border border-purple-500/30 object-cover ${inactive ? 'grayscale' : ''}`}
        />
        <div className="min-w-0">
          <p className="truncate text-lg font-semibold text-white">{member.name}</p>
          {member.title ? <p className="truncate text-sm text-purple-300">{member.title}</p> : null}
          <p className="mt-1">
            {inactive ? (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-red-500/30 bg-red-500/10 px-2.5 py-0.5 text-xs font-semibold text-red-300">
                <UserX className="h-3.5 w-3.5" aria-hidden="true" />
                Conta desativada
              </span>
            ) : (
              <span
                className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${
                  member.status === 'ATIVO'
                    ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
                    : 'border-amber-500/30 bg-amber-500/10 text-amber-300'
                }`}
              >
                {STATUS_LABEL[member.status]}
              </span>
            )}
          </p>
        </div>
      </div>

      {scope.kind === 'SECTORS' ? (
        <p
          role="note"
          className="flex items-start gap-2 rounded-2xl border border-indigo-500/30 bg-indigo-500/10 px-4 py-3 text-sm text-indigo-100"
        >
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-indigo-300" aria-hidden="true" />
          <span>Exibindo apenas atividades dos setores: {scope.sectors.map((s) => s.name).join(', ')}</span>
        </p>
      ) : null}
    </div>
  );
}

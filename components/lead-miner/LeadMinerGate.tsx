'use client';

import React from 'react';
import Link from 'next/link';
import { Lock } from 'lucide-react';
import { useProfile } from '@/contexts/ProfileContext';
import { canUseNegociosTools } from '@/lib/permissions';

export const LEAD_MINER_ACCESS_DENIED =
  'Acesso negado — o Minerador de Leads é exclusivo de Negócios e da Presidência.';

/**
 * Portão de acesso das telas do Minerador de Leads (Req. 19.4).
 * Enquanto a sessão carrega mostra um skeleton; sem `canUseNegociosTools` exibe a mensagem
 * de acesso negado e NÃO monta os filhos, portanto nenhuma requisição às rotas do minerador.
 */
export const LeadMinerGate: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { currentProfile, loading } = useProfile();

  if (loading) {
    return (
      <div role="status" aria-live="polite" aria-busy="true" className="space-y-4 animate-pulse">
        <span className="sr-only">Carregando…</span>
        <div className="h-8 w-64 rounded-xl bg-slate-800" />
        <div className="h-40 rounded-2xl border border-slate-800 bg-slate-900/60" />
        <div className="h-40 rounded-2xl border border-slate-800 bg-slate-900/60" />
      </div>
    );
  }

  if (!canUseNegociosTools(currentProfile)) {
    return (
      <div
        role="alert"
        className="mx-auto flex max-w-lg flex-col items-center gap-5 rounded-2xl border border-slate-800 bg-slate-900/60 p-8 text-center"
      >
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-amber-700/60 bg-amber-950/70 text-amber-400">
          <Lock className="h-7 w-7" aria-hidden="true" />
        </div>
        <p className="text-base font-bold text-white">{LEAD_MINER_ACCESS_DENIED}</p>
        <Link
          href="/tools"
          className="rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 px-5 py-2.5 text-xs font-bold text-white hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-500"
        >
          Voltar para Ferramentas
        </Link>
      </div>
    );
  }

  return <>{children}</>;
};

export default LeadMinerGate;

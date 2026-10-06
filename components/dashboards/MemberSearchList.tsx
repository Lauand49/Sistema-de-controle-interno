'use client';

import React, { useId, useMemo, useState } from 'react';
import Link from 'next/link';
import { ChevronRight, Search } from 'lucide-react';
import { dashboardPages } from '@/lib/dashboards/client-api';
import { matchesMemberSearch } from '@/lib/dashboards/format';
import type { PersonBrief } from '@/lib/dashboards/types';
import { FOCUS_RING, SectionEmpty, avatarUrl } from './DashboardSection';

/**
 * Lista de membros com busca por nome sem diferenciar caixa e acentos (Req. 9.3, 11.7).
 * Renderiza só o conteúdo; a página envolve com a seção e o `h2` "Membros".
 */
export function MemberSearchList({ members }: { members: (PersonBrief & { title: string })[] }) {
  const inputId = useId();
  const [query, setQuery] = useState('');
  const filtered = useMemo(
    () => (query.trim() ? members.filter((m) => matchesMemberSearch(m.name, query.trim())) : members),
    [members, query],
  );

  if (members.length === 0) return <SectionEmpty>Nenhum membro para exibir</SectionEmpty>;

  return (
    <div className="space-y-3">
      <div>
        <label htmlFor={inputId} className="mb-1 block text-xs font-medium text-slate-400">
          Buscar membro
        </label>
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden="true" />
          <input
            id={inputId}
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Digite um nome"
            autoComplete="off"
            className={`w-full rounded-xl border border-slate-800 bg-slate-950 py-2 pl-9 pr-3 text-sm text-slate-100 placeholder:text-slate-400 focus:border-purple-500 ${FOCUS_RING}`}
          />
        </div>
      </div>

      <p className="sr-only" aria-live="polite">
        {filtered.length === 1 ? '1 membro encontrado' : `${filtered.length} membros encontrados`}
      </p>

      {filtered.length === 0 ? (
        <SectionEmpty>Nenhum membro encontrado</SectionEmpty>
      ) : (
        <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((m) => (
            <li key={m.id}>
              <Link
                href={dashboardPages.member(m.id)}
                className={`flex items-center gap-3 rounded-xl border border-slate-800 bg-slate-950/40 p-3 hover:border-purple-500/50 hover:bg-slate-900 ${FOCUS_RING}`}
              >
                <img src={avatarUrl(m)} alt="" className="h-9 w-9 shrink-0 rounded-xl object-cover" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-slate-100">{m.name}</span>
                  {m.title ? <span className="block truncate text-xs text-slate-400">{m.title}</span> : null}
                </span>
                <ChevronRight className="h-4 w-4 shrink-0 text-slate-400" aria-hidden="true" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

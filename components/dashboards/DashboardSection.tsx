'use client';

import React, { useId } from 'react';
import type { LucideIcon } from 'lucide-react';

/** Classes compartilhadas pelas seções dos painéis. */
export const SECTION_CARD = 'rounded-2xl border border-slate-800 bg-slate-900/60 p-6';
export const FOCUS_RING = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-500';

/**
 * Seção de painel: `<section>` rotulada pelo seu `h2` (Req. 11.8), no estilo de card do sistema.
 */
export function DashboardSection({
  title,
  icon: Icon,
  description,
  actions,
  className = '',
  children,
}: {
  title: React.ReactNode;
  icon?: LucideIcon;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}) {
  const headingId = useId();
  return (
    <section aria-labelledby={headingId} className={`${SECTION_CARD} ${className}`}>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          {Icon ? (
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-purple-600 to-indigo-600">
              <Icon className="h-4 w-4 text-white" aria-hidden="true" />
            </div>
          ) : null}
          <div className="min-w-0">
            <h2 id={headingId} className="text-lg font-semibold text-white">
              {title}
            </h2>
            {description ? <p className="text-xs text-slate-400">{description}</p> : null}
          </div>
        </div>
        {actions}
      </div>
      {children}
    </section>
  );
}

/** Mensagem de estado vazio de uma seção (Req. 11.5). */
export function SectionEmpty({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-xl border border-dashed border-slate-800 bg-slate-950/40 px-4 py-6 text-center text-sm text-slate-400">
      {children}
    </p>
  );
}

/** URL do avatar com o mesmo fallback (iniciais) usado no restante do sistema. */
export function avatarUrl(person: { name: string; avatar: string | null }): string {
  return person.avatar || `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(person.name)}`;
}

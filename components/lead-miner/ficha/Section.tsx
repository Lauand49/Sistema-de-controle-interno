import React from 'react';

/** Cartão de seção da Ficha com título ligado via `aria-labelledby`. */
export const Section: React.FC<{
  id: string;
  title: string;
  icon?: React.ReactNode;
  actions?: React.ReactNode;
  children: React.ReactNode;
}> = ({ id, title, icon, actions, children }) => (
  <section aria-labelledby={id} className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6">
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
      <h2 id={id} className="flex items-center gap-2 text-base font-bold text-white">
        {icon}
        {title}
      </h2>
      {actions}
    </div>
    {children}
  </section>
);

/** Par rótulo/valor para listas `<dl>`. */
export const Field: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div className="min-w-0">
    <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</dt>
    <dd className="mt-0.5 break-words text-sm text-slate-200">{children}</dd>
  </div>
);

/** Valor com estilo apagado quando é um marcador de ausência ("não informado" etc.). */
export const Muted: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <span className="italic text-slate-500">{children}</span>
);

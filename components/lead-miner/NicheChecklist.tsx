'use client';
/**
 * Lista de nichos agrupada por tier (Req. 10.1, 10.2). Cada checkbox tem rótulo associado.
 */
import React from 'react';
import { nichesByTier, TIER_LABEL, toggleNiche, toggleTier } from './mining-form-helpers';

export interface NicheChecklistProps {
  selected: readonly string[];
  onChange: (nichos: string[]) => void;
  disabled?: boolean;
  /** id do elemento com a indicação de pendência/erro (aria-describedby). */
  describedBy?: string;
  invalid?: boolean;
}

const GROUPS = nichesByTier();

export const NicheChecklist: React.FC<NicheChecklistProps> = ({
  selected,
  onChange,
  disabled = false,
  describedBy,
  invalid = false,
}) => {
  const sel = new Set(selected);
  return (
    <fieldset className="space-y-3" aria-describedby={describedBy} aria-invalid={invalid || undefined}>
      <legend className="text-sm font-semibold text-slate-200">
        Nichos <span className="font-normal text-slate-400">({selected.length} selecionados)</span>
      </legend>
      <div className="grid gap-3 md:grid-cols-3">
        {GROUPS.map(({ tier, niches }) => {
          const count = niches.filter((n) => sel.has(n.id)).length;
          const all = count === niches.length;
          return (
            <div key={tier} className="rounded-xl border border-slate-800 bg-slate-950/60 p-3">
              <div className="mb-2 flex items-center justify-between gap-2">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-400">{TIER_LABEL[tier]}</span>
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => onChange(toggleTier(selected, tier, !all))}
                  className="rounded-md px-1.5 py-0.5 text-[11px] font-semibold text-purple-300 hover:text-purple-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-500 disabled:opacity-50"
                >
                  {all ? `Desmarcar ${TIER_LABEL[tier]}` : `Marcar ${TIER_LABEL[tier]}`}
                </button>
              </div>
              <ul className="space-y-1.5">
                {niches.map((n) => {
                  const id = `niche-${n.id}`;
                  return (
                    <li key={n.id} className="flex items-center gap-2">
                      <input
                        id={id}
                        type="checkbox"
                        checked={sel.has(n.id)}
                        disabled={disabled}
                        onChange={(e) => onChange(toggleNiche(selected, n.id, e.target.checked))}
                        className="h-4 w-4 rounded border-slate-600 bg-slate-900 accent-purple-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-500"
                      />
                      <label htmlFor={id} className="cursor-pointer text-sm text-slate-300">
                        {n.label}
                      </label>
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}
      </div>
    </fieldset>
  );
};

export default NicheChecklist;

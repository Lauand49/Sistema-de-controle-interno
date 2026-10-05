'use client';

/**
 * Abas "Com contato (N)" / "Sem contato (M)" da Tela_Ranking (T4). Padrão de abas WAI-ARIA:
 * setas esquerda/direita, Home e End movem o foco e ativam a aba.
 */
import React, { useRef } from 'react';
import { Phone, PhoneOff } from 'lucide-react';
import { CONTATO_TABS, type ContatoTab } from '@/lib/leads/contact';
import { contatoTabText } from './ranking-helpers';

export const CONTATO_PANEL_ID = 'ranking-contato-panel';
const tabId = (t: ContatoTab) => `ranking-contato-tab-${t}`;

interface ContatoTabsProps {
  active: ContatoTab;
  counts: { com: number; sem: number } | null;
  onChange: (tab: ContatoTab) => void;
}

export const ContatoTabs: React.FC<ContatoTabsProps> = ({ active, counts, onChange }) => {
  const refs = useRef<Record<ContatoTab, HTMLButtonElement | null>>({ com: null, sem: null });

  const move = (next: ContatoTab) => {
    onChange(next);
    refs.current[next]?.focus();
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>, tab: ContatoTab) => {
    const i = CONTATO_TABS.indexOf(tab);
    let next: ContatoTab | null = null;
    if (e.key === 'ArrowRight') next = CONTATO_TABS[(i + 1) % CONTATO_TABS.length];
    else if (e.key === 'ArrowLeft') next = CONTATO_TABS[(i - 1 + CONTATO_TABS.length) % CONTATO_TABS.length];
    else if (e.key === 'Home') next = CONTATO_TABS[0];
    else if (e.key === 'End') next = CONTATO_TABS[CONTATO_TABS.length - 1];
    if (next === null) return;
    e.preventDefault();
    move(next);
  };

  return (
    <div
      role="tablist"
      aria-label="Empresas por disponibilidade de contato"
      className="inline-flex gap-1 rounded-xl border border-slate-800 bg-slate-900 p-1"
    >
      {CONTATO_TABS.map((tab) => {
        const selected = tab === active;
        const Icon = tab === 'com' ? Phone : PhoneOff;
        return (
          <button
            key={tab}
            ref={(el) => {
              refs.current[tab] = el;
            }}
            type="button"
            role="tab"
            id={tabId(tab)}
            aria-selected={selected}
            aria-controls={CONTATO_PANEL_ID}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(tab)}
            onKeyDown={(e) => onKeyDown(e, tab)}
            className={`inline-flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs font-bold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-500 ${
              selected ? 'bg-gradient-to-r from-purple-600 to-indigo-600 text-white' : 'text-slate-300 hover:bg-slate-800'
            }`}
          >
            <Icon className="h-4 w-4" aria-hidden="true" />
            {contatoTabText(tab, counts ? counts[tab] : null)}
          </button>
        );
      })}
    </div>
  );
};

export { tabId as contatoTabId };

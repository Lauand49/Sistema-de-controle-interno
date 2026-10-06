'use client';

/**
 * Abas "Com contato (N)" / "Sem contato (M)" da Tela_Ranking (T4). Padrão de abas WAI-ARIA:
 * setas esquerda/direita, Home e End movem o foco e ativam a aba.
 */
import React from 'react';
import { Tabs } from '@/components/ui/Tabs';
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

export const ContatoTabs: React.FC<ContatoTabsProps> = ({ active, counts, onChange }) => (
  <Tabs<ContatoTab>
    ariaLabel="Empresas por disponibilidade de contato"
    value={active}
    onChange={onChange}
    className="inline-flex"
    tabs={CONTATO_TABS.map((tab) => ({
      id: tab,
      label: contatoTabText(tab, counts ? counts[tab] : null),
      icon: tab === 'com' ? Phone : PhoneOff,
      domId: tabId(tab),
      controls: CONTATO_PANEL_ID,
    }))}
  />
);
export { tabId as contatoTabId };

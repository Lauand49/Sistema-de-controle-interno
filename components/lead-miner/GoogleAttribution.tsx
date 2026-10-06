import React from 'react';
import { GOOGLE_ATTRIBUTION_TEXT } from '@/lib/leads/config';

/**
 * Atribuicao_Google: o texto "Google Maps" sem tradução (`translate="no"`), exibido junto do
 * Conteudo_Google conforme a política da Places API (Req. 6.4, 17.5).
 */
export const GoogleAttribution: React.FC<{ className?: string }> = ({ className = '' }) => (
  <span className={`inline-flex items-center text-xs text-slate-400 ${className}`}>
    Fonte:{' '}
    <span translate="no" className="ml-1 font-medium text-slate-400">
      {GOOGLE_ATTRIBUTION_TEXT}
    </span>
  </span>
);

export default GoogleAttribution;

import React from 'react';
import { ODBL_TEXT, ODBL_URL } from '@/lib/leads/config';

/** Atribuição ODbL dos dados do OpenStreetMap (Req. 12.6, 14.8). */
export const OdblAttribution: React.FC<{ className?: string }> = ({ className = '' }) => (
  <p className={`text-xs text-slate-400 ${className}`}>
    Dados de empresas:{' '}
    <a
      href={ODBL_URL}
      target="_blank"
      rel="noopener noreferrer"
      className="rounded text-purple-300 underline hover:text-purple-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-500"
    >
      {ODBL_TEXT}
      <span className="sr-only"> (abre em nova aba)</span>
    </a>
  </p>
);

export default OdblAttribution;

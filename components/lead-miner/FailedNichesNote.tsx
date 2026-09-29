import React from 'react';
import { AlertTriangle } from 'lucide-react';
import { NICHES } from '@/lib/leads/config';

const LABEL_BY_ID = new Map(NICHES.map((n) => [n.id, n.label]));

/** Rótulos dos nichos (ids desconhecidos aparecem como vieram). */
export function failedNicheLabels(ids: readonly string[]): string[] {
  return ids.map((id) => LABEL_BY_ID.get(id) ?? id);
}

/** "Nichos não consultados: …" — não renderiza nada com lista vazia (Req. 2.14–2.17). */
export const FailedNichesNote: React.FC<{ nichosFalhos: readonly string[] | null | undefined; className?: string }> = ({
  nichosFalhos,
  className = '',
}) => {
  if (!nichosFalhos || nichosFalhos.length === 0) return null;
  return (
    <p className={`flex items-start gap-1.5 text-xs text-amber-300 ${className}`}>
      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      <span>Nichos não consultados: {failedNicheLabels(nichosFalhos).join(', ')}</span>
    </p>
  );
};

export default FailedNichesNote;

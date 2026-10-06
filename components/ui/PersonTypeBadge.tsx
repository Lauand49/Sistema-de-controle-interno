import React from 'react';
import { Briefcase, Crown, Layers, Star, Users } from 'lucide-react';
import { PERSON_TYPE_LABEL, type PersonType } from '@/lib/permissions';

const STYLES: Record<PersonType, { className: string; Icon: typeof Crown }> = {
  PRESIDENTE: { className: 'bg-amber-500/20 text-amber-300 border-amber-500/50', Icon: Crown },
  VICE_PRESIDENTE: { className: 'bg-yellow-500/15 text-yellow-200 border-yellow-500/40', Icon: Star },
  GERENTE_DEPARTAMENTO: { className: 'bg-blue-500/20 text-blue-300 border-blue-500/40', Icon: Briefcase },
  GERENTE_SETOR: { className: 'bg-indigo-500/20 text-indigo-300 border-indigo-500/40', Icon: Users },
  ASSESSOR: { className: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40', Icon: Layers },
};

/** Selo com o tipo mais alto da pessoa (Presidente, Vice, Gerente de Depto/Setor, Assessor). */
export const PersonTypeBadge: React.FC<{ type: PersonType; className?: string }> = ({ type, className = '' }) => {
  const { className: style, Icon } = STYLES[type] ?? STYLES.ASSESSOR;
  return (
    <span
      className={`inline-flex items-center gap-1 text-[11px] font-bold uppercase px-2 py-0.5 rounded-full border ${style} ${className}`}
    >
      <Icon className="w-3 h-3" aria-hidden="true" /> {PERSON_TYPE_LABEL[type]}
    </span>
  );
};

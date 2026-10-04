import React from 'react';
import { MapPinOff } from 'lucide-react';
import { googleUnusedText, type GoogleUnusedReason } from './enrichment-helpers';

/**
 * Aviso de Google Places não usado numa Mineracao (Req. 4.9): um dos três textos
 * ("chave não configurada", "cota mensal esgotada" ou "falhou; concluídos pelo OpenStreetMap").
 */
export const GoogleUnusedNote: React.FC<{
  motivo: GoogleUnusedReason | null | undefined;
  className?: string;
}> = ({ motivo, className = '' }) => {
  const texto = googleUnusedText(motivo);
  if (!texto) return null;
  return (
    <p className={`flex items-center gap-1.5 text-xs text-amber-400/90 ${className}`}>
      <MapPinOff className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      <span>{texto}</span>
    </p>
  );
};

export default GoogleUnusedNote;

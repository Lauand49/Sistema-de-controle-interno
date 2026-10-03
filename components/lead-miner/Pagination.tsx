'use client';

import React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

interface PaginationProps {
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  disabled?: boolean;
  className?: string;
}

const BUTTON =
  'inline-flex items-center gap-1 rounded-xl border border-slate-800 bg-slate-900 px-3 py-1.5 text-xs font-semibold text-slate-200 hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-500';

/** Paginação simples "anterior / Página X de Y / próxima". */
export const Pagination: React.FC<PaginationProps> = ({ page, totalPages, onPageChange, disabled, className = '' }) => {
  const total = Math.max(1, totalPages);
  const current = Math.min(Math.max(1, page), total);
  return (
    <nav aria-label="Paginação" className={`flex items-center justify-center gap-3 ${className}`}>
      <button
        type="button"
        className={BUTTON}
        onClick={() => onPageChange(current - 1)}
        disabled={disabled || current <= 1}
        aria-label="Página anterior"
      >
        <ChevronLeft className="h-4 w-4" aria-hidden="true" />
        Anterior
      </button>
      <span className="text-xs text-slate-400" aria-live="polite">
        Página {current} de {total}
      </span>
      <button
        type="button"
        className={BUTTON}
        onClick={() => onPageChange(current + 1)}
        disabled={disabled || current >= total}
        aria-label="Próxima página"
      >
        Próxima
        <ChevronRight className="h-4 w-4" aria-hidden="true" />
      </button>
    </nav>
  );
};

export default Pagination;

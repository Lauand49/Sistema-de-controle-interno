'use client';

import React from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Card as CardType } from '@/types';
import { pluralize } from '@/lib/ui/format';
import { DollarSign, Building2, User, Sparkles } from 'lucide-react';

interface KanbanCardProps {
  card: CardType;
  onClick: (card: CardType) => void;
  isDragOverlay?: boolean;
  isHighlighted?: boolean;
  readOnly?: boolean;
}

export const KanbanCard: React.FC<KanbanCardProps> = ({
  card,
  onClick,
  isDragOverlay = false,
  isHighlighted = false,
  readOnly = false,
}) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: card.id,
    data: { card },
    disabled: readOnly,
  });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.35 : 1,
  };

  const currencyVal = card.values?.find(
    (v) => v.field?.type === 'CURRENCY' && v.value
  );
  const companyVal = card.values?.find(
    (v) => v.field?.name === 'company_name' && v.value
  );

  const isFromLeadSheet =
    card.activities?.some(
      (a) =>
        a.description?.toLowerCase().includes('planilha') ||
        a.metadata?.includes('LEAD_SHEET')
    ) || card.description?.includes('Lead importado');

  const pointerStartRef = React.useRef({ x: 0, y: 0 });

  const handlePointerDown = (e: React.PointerEvent) => {
    pointerStartRef.current = { x: e.clientX, y: e.clientY };
  };

  const handleClick = (e: React.MouseEvent) => {
    const dx = Math.abs(e.clientX - pointerStartRef.current.x);
    const dy = Math.abs(e.clientY - pointerStartRef.current.y);
    // If pointer moved more than 5px, it was a drag, not a click!
    if (dx > 5 || dy > 5) {
      e.stopPropagation();
      return;
    }
    onClick(card);
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...(readOnly ? {} : listeners)}
      onPointerDown={(e) => {
        handlePointerDown(e);
        if (!readOnly) {
          listeners?.onPointerDown?.(e);
        }
      }}
      onClick={handleClick}
      className={`group relative bg-slate-900/90 border rounded-xl p-4 shadow-md transition-all cursor-pointer ${
        isHighlighted
          ? 'ring-2 ring-purple-500 border-purple-400 shadow-xl shadow-purple-900/40 bg-slate-900 animate-pulse'
          : 'border-slate-800/80 hover:border-purple-500/60 hover:shadow-purple-900/20 hover:shadow-lg'
      } ${
        isDragOverlay ? 'shadow-2xl ring-2 ring-purple-500 scale-105 z-50 bg-slate-900 border-purple-500' : ''
      }`}
    >
      {/* Lead Sheet Origin Badge */}
      {isFromLeadSheet && (
        <div className="mb-2">
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-bold bg-indigo-950/80 text-indigo-300 border border-indigo-700/60 shadow-sm">
            <Sparkles className="w-3 h-3 text-indigo-400" /> Lead Triado na Planilha
          </span>
        </div>
      )}

      {/* Title */}
      <h4 className="text-sm font-bold text-slate-100 group-hover:text-purple-300 transition-colors line-clamp-2 leading-snug">
        {card.title}
      </h4>

      {/* Description / Company Name */}
      {companyVal ? (
        <p className="text-xs font-semibold text-purple-300/80 mt-1.5 flex items-center gap-1.5">
          <Building2 className="w-3.5 h-3.5 text-purple-400 shrink-0" />
          <span className="truncate">{companyVal.value}</span>
        </p>
      ) : card.description ? (
        <p className="text-xs text-slate-400 mt-1.5 line-clamp-2">
          {card.description}
        </p>
      ) : null}

      {/* Value Badge if available */}
      {currencyVal && (
        <div className="mt-3 inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-purple-950/70 text-purple-300 border border-purple-700/50 shadow-sm">
          <DollarSign className="w-3 h-3 text-purple-400" />
          R$ {Number(currencyVal.value).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
        </div>
      )}

      {/* Footer info: Assignee + Field Count */}
      <div className="mt-3.5 pt-2.5 border-t border-slate-800/80 flex items-center justify-between text-xs text-slate-400">
        <div className="flex items-center gap-1.5">
          {card.assignee ? (
            <div className="flex items-center gap-1.5 text-slate-300">
              {card.assignee.avatar ? (
                <img
                  src={card.assignee.avatar}
                  alt={card.assignee.name}
                  className="w-5 h-5 rounded-full object-cover ring-1 ring-purple-500/50"
                />
              ) : (
                <div className="w-5 h-5 rounded-full bg-purple-950 border border-purple-700 flex items-center justify-center text-[11px] font-bold text-purple-300">
                  {card.assignee.name.charAt(0)}
                </div>
              )}
              <span className="font-medium text-[11px] truncate max-w-[110px]" title={card.assignee.name}>
                {card.assignee.name}
              </span>
            </div>
          ) : (
            <span className="text-[11px] text-slate-400 italic">Sem responsável</span>
          )}
        </div>

        <span className="text-[11px] font-bold text-purple-300 bg-purple-950/50 border border-purple-800/40 px-2 py-0.5 rounded-md">
          {pluralize((card.values ?? []).filter((v) => v.value).length, 'campo preenchido', 'campos preenchidos')}
        </span>
      </div>
    </div>
  );
};

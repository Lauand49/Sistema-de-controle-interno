'use client';

import React from 'react';
import { useDroppable } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { Phase, Card } from '@/types';
import { KanbanCard } from './KanbanCard';
import { Plus, Settings2, ShieldAlert } from 'lucide-react';

interface KanbanColumnProps {
  phase: Phase;
  onCardClick: (card: Card) => void;
  onAddCardClick: (phaseId: string) => void;
  onAddFieldClick: (phaseId: string) => void;
  highlightCardId?: string | null;
  isFitMode?: boolean;
  readOnly?: boolean;
}

export const KanbanColumn: React.FC<KanbanColumnProps> = ({
  phase,
  onCardClick,
  onAddCardClick,
  onAddFieldClick,
  highlightCardId,
  isFitMode = false,
  readOnly = false,
}) => {
  const { setNodeRef, isOver } = useDroppable({
    id: phase.id,
    data: { phase },
    disabled: readOnly,
  });

  const cardIds = phase.cards.map((c) => c.id);
  const requiredCount = phase.fields.filter((f) => f.required).length;

  return (
    <div
      ref={setNodeRef}
      className={`flex flex-col ${isFitMode ? 'flex-1 min-w-[260px]' : 'w-80 shrink-0'} min-h-[calc(100vh-210px)] rounded-2xl bg-slate-900/60 border border-slate-800/80 backdrop-blur-sm transition-all ${
        isOver && !readOnly ? 'ring-2 ring-purple-500 bg-purple-950/20 border-purple-500/50 shadow-lg shadow-purple-900/20' : ''
      }`}
    >
      {/* Column Header */}
      <div className="p-3.5 border-b border-slate-800/80 flex items-center justify-between">
        <div className="flex items-center gap-2.5 min-w-0">
          <span
            className="w-3 h-3 rounded-full shrink-0 shadow-sm"
            style={{ backgroundColor: phase.color || '#7c3aed' }}
          />
          <h3 className="font-bold text-sm text-slate-100 truncate">
            {phase.name}
          </h3>
          <span className="text-xs font-bold text-purple-300 bg-purple-950/80 border border-purple-800/60 px-2 py-0.5 rounded-full shrink-0">
            {phase.cards.length}
          </span>
        </div>

        {!readOnly && (
          <div className="flex items-center gap-1">
            {/* Add Configurable Field Button */}
            <button
              onClick={() => onAddFieldClick(phase.id)}
              title="Adicionar campo configurável nesta fase"
              className="p-1.5 text-slate-400 hover:text-purple-300 rounded-lg hover:bg-slate-800 transition-colors"
            >
              <Settings2 className="w-4 h-4" />
            </button>

            {/* Quick Add Card */}
            <button
              onClick={() => onAddCardClick(phase.id)}
              title="Adicionar novo card nesta fase"
              className="p-1.5 text-slate-400 hover:text-purple-300 rounded-lg hover:bg-slate-800 transition-colors"
            >
              <Plus className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>

      {/* Required fields indicator info bar */}
      <div className="px-3.5 py-1.5 bg-slate-950/60 border-b border-slate-800/40 flex items-center justify-between text-[11px] text-slate-400">
        <span>{phase.fields.length} campos ativos</span>
        {requiredCount > 0 && (
          <span className="flex items-center gap-1 font-bold text-amber-400 bg-amber-950/40 px-2 py-0.5 rounded border border-amber-800/40">
            <ShieldAlert className="w-3 h-3" /> {requiredCount} obrigatório(s)
          </span>
        )}
      </div>

      {/* Droppable Cards Container */}
      <div className="p-3 flex-1 overflow-y-auto min-h-[220px] space-y-3 flex flex-col">
        <SortableContext items={cardIds} strategy={verticalListSortingStrategy}>
          {phase.cards.map((card) => (
            <KanbanCard
              key={card.id}
              card={card}
              onClick={onCardClick}
              isHighlighted={card.id === highlightCardId}
              readOnly={readOnly}
            />
          ))}
        </SortableContext>

        {phase.cards.length === 0 && (
          <div className="flex-1 min-h-[160px] border-2 border-dashed border-slate-800/80 rounded-xl flex flex-col items-center justify-center text-xs text-slate-500 italic p-4 text-center">
            <span>Nenhum projeto nesta fase</span>
            {!readOnly && (
              <span className="text-[10px] text-purple-400/70 mt-1 not-italic font-medium">
                Arraste um card para cá
              </span>
            )}
          </div>
        )}
      </div>

      {/* Bottom Quick Add Card */}
      {!readOnly && (
        <div className="p-2.5 border-t border-slate-800/80">
          <button
            onClick={() => onAddCardClick(phase.id)}
            className="w-full py-2 px-3 text-xs font-semibold text-slate-300 hover:text-white hover:bg-purple-950/40 hover:border-purple-600/50 rounded-xl border border-dashed border-slate-800 flex items-center justify-center gap-1.5 transition-all"
          >
            <Plus className="w-3.5 h-3.5 text-purple-400" /> Adicionar Card SciTec
          </button>
        </div>
      )}
    </div>
  );
};

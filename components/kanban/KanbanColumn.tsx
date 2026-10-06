'use client';

import React from 'react';
import { useDroppable } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { Phase, Card } from '@/types';
import { KanbanCard } from './KanbanCard';
import { Plus, Settings2, ShieldAlert } from 'lucide-react';
import { pluralize } from '@/lib/ui/format';

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
      className={`flex flex-col ${isFitMode ? 'flex-1 basis-0 min-w-[280px]' : 'w-80 shrink-0'} min-h-[calc(100vh-210px)] rounded-2xl bg-slate-900/60 border border-slate-800/80 backdrop-blur-sm transition-all ${
        isOver && !readOnly ? 'ring-2 ring-purple-500 bg-purple-950/20 border-purple-500/50 shadow-lg shadow-purple-900/20' : ''
      }`}
    >
      {/* Column Header */}
      <div className="px-3.5 h-14 border-b border-slate-800/80 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2.5 min-w-0">
          <span
            className="w-3 h-3 rounded-full shrink-0 shadow-sm"
            style={{ backgroundColor: phase.color || '#7c3aed' }}
            aria-hidden="true"
          />
          <h3 className="font-bold text-sm text-slate-100 truncate" title={phase.name}>
            {phase.name}
          </h3>
          <span className="text-xs font-bold text-purple-300 bg-purple-950/80 border border-purple-800/60 px-2 py-0.5 rounded-full shrink-0">
            {phase.cards.length}
          </span>
        </div>

        {!readOnly && (
          <div className="flex items-center shrink-0">
            {/* Add Configurable Field Button */}
            <button
              onClick={() => onAddFieldClick(phase.id)}
              title="Adicionar campo configurável nesta fase"
              aria-label={`Adicionar campo na fase ${phase.name}`}
              className="w-10 h-10 inline-flex items-center justify-center text-slate-400 hover:text-purple-300 rounded-lg hover:bg-slate-800 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
            >
              <Settings2 className="w-4 h-4" aria-hidden="true" />
            </button>

            {/* Quick Add Card */}
            <button
              onClick={() => onAddCardClick(phase.id)}
              title="Adicionar novo card nesta fase"
              aria-label={`Adicionar card na fase ${phase.name}`}
              className="w-10 h-10 inline-flex items-center justify-center text-slate-400 hover:text-purple-300 rounded-lg hover:bg-slate-800 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
            >
              <Plus className="w-4 h-4" aria-hidden="true" />
            </button>
          </div>
        )}
      </div>

      {/* Barra de campos da fase: altura fixa para todas as colunas ficarem alinhadas.
          "campos configurados" = campos definidos NESTA fase (os cards também guardam valores de fases anteriores). */}
      <div className="px-3.5 h-9 bg-slate-950/60 border-b border-slate-800/40 flex items-center justify-between gap-2 text-[11px] text-slate-400 whitespace-nowrap">
        <span className="truncate">{pluralize(phase.fields.length, 'campo configurado', 'campos configurados')}</span>
        {requiredCount > 0 && (
          <span
            className="flex items-center gap-1 font-bold text-amber-300 bg-amber-950/40 px-2 py-0.5 rounded border border-amber-800/40 shrink-0"
            title={pluralize(requiredCount, 'campo obrigatório', 'campos obrigatórios') + ' para avançar de fase'}
          >
            <ShieldAlert className="w-3 h-3" aria-hidden="true" /> {requiredCount} obrig.
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
          <div className="flex-1 min-h-[160px] border-2 border-dashed border-slate-800/80 rounded-xl flex flex-col items-center justify-center text-xs text-slate-400 p-4 text-center">
            <span>Nenhum projeto nesta fase</span>
            {!readOnly && (
              <span className="text-[11px] text-purple-300 mt-1 font-medium">
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
            className="w-full min-h-10 py-2 px-3 text-xs font-semibold text-slate-300 hover:text-white hover:bg-purple-950/40 hover:border-purple-600/50 rounded-xl border border-dashed border-slate-800 flex items-center justify-center gap-1.5 transition-all"
          >
            <Plus className="w-3.5 h-3.5 text-purple-400" aria-hidden="true" /> Adicionar card
          </button>
        </div>
      )}
    </div>
  );
};

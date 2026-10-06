'use client';

import React, { useState, useEffect, useRef } from 'react';
import {
  DndContext,
  DragOverlay,
  closestCorners,
  pointerWithin,
  rectIntersection,
  CollisionDetection,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragStartEvent,
  DragEndEvent,
} from '@dnd-kit/core';
import { sortableKeyboardCoordinates } from '@dnd-kit/sortable';
import { Pipe, Phase, Card, User, Field } from '@/types';
import { KanbanColumn } from './KanbanColumn';
import { KanbanCard } from './KanbanCard';
import { CardDetailModal } from '../modals/CardDetailModal';
import { CreateCardModal } from '../modals/CreateCardModal';
import { CreateFieldModal } from '../modals/CreateFieldModal';
import { PhaseTransitionModal } from '../modals/PhaseTransitionModal';
import { ClosedDealContractModal } from '../modals/ClosedDealContractModal';
import { toast } from 'sonner';
import { Check, ChevronsLeftRight } from 'lucide-react';

interface KanbanBoardProps {
  pipe: Pipe;
  users: User[];
  onRefresh: () => void;
  highlightCardId?: string | null;
  readOnly?: boolean;
}

// Composite collision detection strategy:
// 1. pointerWithin: accurately targets column or card directly under mouse cursor
// 2. rectIntersection: fallback when cursor is near edges
// 3. closestCorners: standard fallback
const collisionDetectionStrategy: CollisionDetection = (args) => {
  const pointerCollisions = pointerWithin(args);
  if (pointerCollisions.length > 0) {
    return pointerCollisions;
  }
  const rectCollisions = rectIntersection(args);
  if (rectCollisions.length > 0) {
    return rectCollisions;
  }
  return closestCorners(args);
};

export const KanbanBoard: React.FC<KanbanBoardProps> = ({
  pipe,
  users,
  onRefresh,
  highlightCardId,
  readOnly = false,
}) => {
  const [phases, setPhases] = useState<Phase[]>(pipe.phases);
  const [activeCard, setActiveCard] = useState<Card | null>(null);
  const [isFitMode, setIsFitMode] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [overflowing, setOverflowing] = useState(false);
  // Indica quando as colunas não cabem na largura e é preciso rolar para o lado.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const measure = () => setOverflowing(el.scrollWidth > el.clientWidth + 1);
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [isFitMode, phases.length]);

  // Modals state
  const [selectedCard, setSelectedCard] = useState<Card | null>(null);
  const [createCardPhaseId, setCreateCardPhaseId] = useState<string | null>(null);
  const [createFieldPhaseId, setCreateFieldPhaseId] = useState<string | null>(null);

  // Phase Gate Transition Modal state
  const [transitionGate, setTransitionGate] = useState<{
    card: Card;
    sourcePhase: Phase;
    targetPhase: Phase;
    missingFields: Field[];
    allTransitionFields: Field[];
  } | null>(null);

  // Phase Gate validation modal prompt state
  const [missingFieldsForGate, setMissingFieldsForGate] = useState<Field[]>([]);
  const [targetPhaseGateName, setTargetPhaseGateName] = useState<string>('');
  const [closedDealCard, setClosedDealCard] = useState<Card | null>(null);

  // Track if highlightCardId has already opened the modal once
  const hasOpenedHighlightRef = useRef(false);

  // Update phases state when pipe prop changes
  useEffect(() => {
    setPhases(pipe.phases);
  }, [pipe]);

  // Auto open modal when highlightCardId is passed (only once per mount/highlight)
  useEffect(() => {
    if (highlightCardId && phases.length > 0 && !hasOpenedHighlightRef.current) {
      for (const phase of phases) {
        const found = phase.cards.find((c) => c.id === highlightCardId);
        if (found) {
          hasOpenedHighlightRef.current = true;
          setSelectedCard(found);
          break;
        }
      }
    }
  }, [highlightCardId, phases]);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 5, // 5px movement required before drag starts to avoid accidental drags when clicking cards
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragStart = (event: DragStartEvent) => {
    if (readOnly) {
      toast.info('Modo somente leitura: alterações desabilitadas neste setor.');
      return;
    }
    const { active } = event;
    const card = active.data.current?.card as Card;
    if (card) {
      setActiveCard(card);
    }
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveCard(null);

    if (!over) return;

    const activeCardId = active.id as string;
    const overId = over.id as string;

    // Find source phase & card
    let sourcePhase: Phase | undefined;
    let draggedCard: Card | undefined;

    for (const p of phases) {
      const found = p.cards.find((c) => c.id === activeCardId);
      if (found) {
        sourcePhase = p;
        draggedCard = found;
        break;
      }
    }

    if (!sourcePhase || !draggedCard) return;

    // Determine target phase accurately from collision target
    let targetPhase: Phase | undefined = over.data?.current?.phase;

    // Direct match with phase id
    if (!targetPhase) {
      targetPhase = phases.find((p) => p.id === overId);
    }

    // Dropped onto a card that has phaseId in data
    const overCardPhaseId = over.data?.current?.card?.phaseId;
    if (!targetPhase && overCardPhaseId) {
      targetPhase = phases.find((p) => p.id === overCardPhaseId);
    }

    // Over might be a card id inside a phase
    if (!targetPhase) {
      for (const p of phases) {
        if (p.cards.some((c) => c.id === overId)) {
          targetPhase = p;
          break;
        }
      }
    }

    if (!targetPhase || sourcePhase.id === targetPhase.id) {
      return; // No phase change
    }

    // Save snapshot of previous state for rollback if server rejects 422
    const previousPhasesSnapshot = JSON.parse(JSON.stringify(phases));

    // 1. OPTIMISTIC UI UPDATE
    const updatedPhases = phases.map((p) => {
      if (p.id === sourcePhase!.id) {
        return { ...p, cards: p.cards.filter((c) => c.id !== activeCardId) };
      }
      if (p.id === targetPhase!.id) {
        return {
          ...p,
          cards: [...p.cards, { ...draggedCard!, phaseId: targetPhase!.id }],
        };
      }
      return p;
    });

    setPhases(updatedPhases);

    // 2. BACKEND API CALL WITH PHASE GATE VALIDATION
    try {
      const res = await fetch(`/api/cards/${activeCardId}/move`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          targetPhaseId: targetPhase.id,
        }),
      });

      if (res.status === 422) {
        // PHASE GATE REJECTION (HTTP 422)
        const errorPayload = await res.json();

        // Revert optimistic UI change
        setPhases(previousPhasesSnapshot);

        // Open focused Phase Transition Modal
        const fullCard = await (await fetch(`/api/cards/${activeCardId}`)).json();
        setTransitionGate({
          card: fullCard,
          sourcePhase,
          targetPhase,
          missingFields: errorPayload.missingFields || [],
          allTransitionFields:
            errorPayload.transitionRequiredFields || errorPayload.missingFields || [],
        });
        return;
      }

      if (!res.ok) {
        throw new Error('Erro ao mover card.');
      }

      const updatedCardFromBackend: Card = await res.json();
      toast.success(
        `Card movido para "${targetPhase.name}"!`
      );

      // Trigger automatic cross-dept contract request if moved to Fechado/Ganho in Negócios
      const isWon =
        targetPhase.name.toLowerCase().includes('fechado') ||
        targetPhase.name.toLowerCase().includes('ganho');
      const isNegocios = !pipe.department || pipe.department === 'NEGOCIOS';

      if (isWon && isNegocios) {
        setClosedDealCard(updatedCardFromBackend);
      }

      // Refresh server data
      onRefresh();
    } catch (err: any) {
      // Revert on unexpected network/server error
      setPhases(previousPhasesSnapshot);
      toast.error(err.message || 'Erro ao movimentar card.');
    }
  };

  return (
    <>
      {/* Board Mode & Info Bar */}
      <div className="px-4 md:px-6 py-2 flex items-center justify-between border-b border-slate-800/80 bg-slate-950/40 text-xs text-slate-400">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-slate-200">
            {phases.reduce((acc, p) => acc + p.cards.length, 0)} cards ativos
          </span>
          <span aria-hidden="true">•</span>
          <span>{phases.length} fases</span>
          {overflowing && (
            <span className="flex items-center gap-1 text-purple-300 font-medium">
              <ChevronsLeftRight className="w-3.5 h-3.5" aria-hidden="true" /> Role para o lado para ver todas as fases
            </span>
          )}
        </div>

        <button
          type="button"
          onClick={() => setIsFitMode(!isFitMode)}
          className={`px-2.5 min-h-10 rounded-lg text-[11px] font-semibold flex focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus items-center gap-1.5 transition-all ${
            isFitMode
              ? 'bg-purple-950/80 text-purple-300 border border-purple-700/50'
              : 'bg-slate-900 text-slate-400 border border-slate-800 hover:text-white'
          }`}
          aria-pressed={isFitMode}
          title={isFitMode ? 'Colunas dividem a largura da tela (mínimo de 280px cada; se não couberem, role para o lado)' : 'Colunas de largura fixa com rolagem horizontal'}
        >
          {isFitMode && <Check className="w-3 h-3" aria-hidden="true" />}
          <span>{isFitMode ? 'Dividir pela largura da tela' : 'Colunas largas'}</span>
        </button>
      </div>

      <DndContext
        sensors={sensors}
        collisionDetection={collisionDetectionStrategy}
        onDragStart={handleDragStart}
        onDragEnd={handleDragEnd}
      >
        <div ref={scrollRef} tabIndex={0} aria-label="Fases do funil (role para o lado para ver mais)" className={`flex gap-3 md:gap-4 overflow-x-auto focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-focus p-4 md:p-6 min-h-[calc(100vh-180px)] items-stretch max-w-full w-full ${isFitMode ? 'xl:justify-between' : ''}`}>
          {phases.map((phase) => (
            <KanbanColumn
              key={phase.id}
              phase={phase}
              isFitMode={isFitMode}
              onCardClick={(card) => {
                setMissingFieldsForGate([]);
                setTargetPhaseGateName('');
                setSelectedCard(card);
              }}
              onAddCardClick={(phaseId) => setCreateCardPhaseId(phaseId)}
              onAddFieldClick={(phaseId) => setCreateFieldPhaseId(phaseId)}
              highlightCardId={highlightCardId}
              readOnly={readOnly}
            />
          ))}
        </div>

        <DragOverlay>
          {activeCard ? (
            <KanbanCard
              card={activeCard}
              onClick={() => {}}
              isDragOverlay
            />
          ) : null}
        </DragOverlay>
      </DndContext>

      {/* Card Detail Modal */}
      {selectedCard && (
        <CardDetailModal
          card={selectedCard}
          phases={phases}
          users={users}
          missingFieldsForGate={missingFieldsForGate}
          targetPhaseGateName={targetPhaseGateName}
          readOnly={readOnly}
          onClose={() => {
            setSelectedCard(null);
            setMissingFieldsForGate([]);
            setTargetPhaseGateName('');
          }}
          onCardUpdated={() => {
            onRefresh();
            setSelectedCard(null);
          }}
        />
      )}

      {/* Create Card Modal */}
      {createCardPhaseId && (
        <CreateCardModal
          phaseId={createCardPhaseId}
          phases={phases}
          users={users}
          onClose={() => setCreateCardPhaseId(null)}
          onCardCreated={() => {
            onRefresh();
            setCreateCardPhaseId(null);
          }}
        />
      )}

      {/* Create Custom Field Modal */}
      {createFieldPhaseId && (
        <CreateFieldModal
          phaseId={createFieldPhaseId}
          phases={phases}
          onClose={() => setCreateFieldPhaseId(null)}
          onFieldCreated={() => {
            onRefresh();
            setCreateFieldPhaseId(null);
          }}
        />
      )}

      {/* Phase Gate Transition Modal */}
      {transitionGate && (
        <PhaseTransitionModal
          card={transitionGate.card}
          sourcePhase={transitionGate.sourcePhase}
          targetPhase={transitionGate.targetPhase}
          missingFields={transitionGate.missingFields}
          allTransitionFields={transitionGate.allTransitionFields}
          onClose={() => setTransitionGate(null)}
          onSuccess={() => {
            setTransitionGate(null);
            onRefresh();
          }}
        />
      )}

      {/* Automatic Contract Trigger Modal for Closed Deals */}
      <ClosedDealContractModal
        card={closedDealCard}
        isOpen={!!closedDealCard}
        onClose={() => setClosedDealCard(null)}
        onSuccess={() => {
          setClosedDealCard(null);
          onRefresh();
        }}
      />
    </>
  );
};

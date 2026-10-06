'use client';

import React, { useState } from 'react';
import { Card, Phase, Field } from '@/types';
import { DynamicField } from '../ui/DynamicField';
import {
  X,
  ArrowRight,
  Sparkles,
  Calendar,
  Layers,
  Cpu,
} from 'lucide-react';
import { toast } from 'sonner';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';

interface PhaseTransitionModalProps {
  card: Card;
  sourcePhase: Phase;
  targetPhase: Phase;
  missingFields: Field[];
  allTransitionFields?: Field[];
  onClose: () => void;
  onSuccess: () => void;
}

export const PhaseTransitionModal: React.FC<PhaseTransitionModalProps> = ({
  card,
  sourcePhase,
  targetPhase,
  missingFields,
  allTransitionFields = [],
  onClose,
  onSuccess,
}) => {
  // Use allTransitionFields if provided, otherwise missingFields
  const fieldsToDisplay = allTransitionFields.length > 0 ? allTransitionFields : missingFields;

  // Initialize field values from card values
  const [fieldValues, setFieldValues] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {};
    if (card.values) {
      for (const v of card.values) {
        if (v.value !== null && v.value !== undefined) {
          initial[v.fieldId] = v.value;
        }
      }
    }
    return initial;
  });

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [validationErrors, setValidationErrors] = useState<string[]>(
    missingFields.map((f) => f.id)
  );

  const handleFieldChange = (fieldId: string, val: string) => {
    setFieldValues((prev) => ({ ...prev, [fieldId]: val }));
    if (val && val.trim() !== '') {
      setValidationErrors((prev) => prev.filter((id) => id !== fieldId));
    }
  };

  const handleConfirmTransition = async () => {
    // Client-side quick check
    const stillMissing = fieldsToDisplay.filter((f) => {
      if (!f.required) return false;
      const val = fieldValues[f.id];
      return val === undefined || val === null || val.trim() === '';
    });

    if (stillMissing.length > 0) {
      setValidationErrors(stillMissing.map((f) => f.id));
      toast.error('Preencha todos os campos obrigatórios para avançar de fase.');
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await fetch(`/api/cards/${card.id}/move`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          targetPhaseId: targetPhase.id,
          fieldValues,
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.message || 'Erro ao movimentar card.');
      }

      toast.success(`Card avançado para "${targetPhase.name}" com sucesso!`);
      onSuccess();
      onClose();
    } catch (err: any) {
      toast.error(err.message || 'Erro ao concluir transição.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Determine context message based on source/target
  const isReuniaoToDiag =
    (sourcePhase.order === 0 || sourcePhase.name.toLowerCase().includes('reunião')) &&
    targetPhase.name.toLowerCase().includes('diagnóstico');

  const isDiagToProp =
    sourcePhase.name.toLowerCase().includes('diagnóstico') &&
    targetPhase.name.toLowerCase().includes('proposta');

  return (
    <Modal
      title={card.title}
      description={
        <span className="inline-flex flex-wrap items-center gap-2">
          <PhaseChip phase={sourcePhase} fallback="#0284c7" />
          <ArrowRight className="w-3.5 h-3.5 text-primary-soft" aria-label="para" />
          <PhaseChip phase={targetPhase} fallback="#7c3aed" />
        </span>
      }
      onClose={onClose}
      closeOnBackdrop={false}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={isSubmitting}>
            Cancelar
          </Button>
          <Button icon={isSubmitting ? undefined : ArrowRight} onClick={handleConfirmTransition} loading={isSubmitting}>
            {isSubmitting ? 'Avançando...' : `Confirmar & Avançar para ${targetPhase.name}`}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {/* Informative Context Banner */}
        <div className="px-3 py-3 rounded-control bg-primary-subtle border border-primary/30 flex items-center gap-2.5 text-xs text-purple-200">
          {isReuniaoToDiag ? (
            <>
              <Calendar className="w-4 h-4 text-purple-400 shrink-0" />
              <span>
                Para avançar para <strong>Diagnóstico</strong>, informe a data da reunião diagnóstica:
              </span>
            </>
          ) : isDiagToProp ? (
            <>
              <Sparkles className="w-4 h-4 text-purple-400 shrink-0" />
              <span>
                Para avançar para <strong>Proposta</strong>, preencha as conclusões do Diagnóstico:
              </span>
            </>
          ) : (
            <>
              <Layers className="w-4 h-4 text-purple-400 shrink-0" />
              <span>
                Preencha as pendências abaixo para avançar para <strong>{targetPhase.name}</strong>:
              </span>
            </>
          )}
        </div>

        <div className="space-y-4">
          {fieldsToDisplay.map((field) => (
            <div key={field.id} className="space-y-1">
              <DynamicField
                field={field}
                value={fieldValues[field.id] || ''}
                onChange={(val) => handleFieldChange(field.id, val)}
                isMissing={validationErrors.includes(field.id)}
              />
            </div>
          ))}
        </div>
      </div>
    </Modal>
  );
};

function PhaseChip({ phase, fallback }: { phase: Phase; fallback: string }) {
  const color = phase.color || fallback;
  return (
    <span
      className="px-2.5 py-0.5 rounded-full text-[11px] font-bold border"
      style={{ borderColor: color, color, backgroundColor: `${color}15` }}
    >
      {phase.name}
    </span>
  );
}

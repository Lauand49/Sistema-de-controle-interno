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
    <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto animate-in fade-in duration-200">
      <div className="bg-slate-900 border border-purple-800/50 rounded-2xl w-full max-w-xl shadow-2xl overflow-hidden flex flex-col">
        {/* Header */}
        <div className="p-6 border-b border-slate-800 bg-gradient-to-r from-purple-950/80 via-slate-900 to-indigo-950/80 flex items-start justify-between">
          <div className="space-y-1.5">
            <div className="flex items-center gap-2">
              <span
                className="px-2.5 py-0.5 rounded-full text-[11px] font-bold border"
                style={{
                  borderColor: sourcePhase.color || '#0284c7',
                  color: sourcePhase.color || '#0284c7',
                  backgroundColor: `${sourcePhase.color || '#0284c7'}15`,
                }}
              >
                {sourcePhase.name}
              </span>
              <ArrowRight className="w-3.5 h-3.5 text-purple-400" />
              <span
                className="px-2.5 py-0.5 rounded-full text-[11px] font-bold border"
                style={{
                  borderColor: targetPhase.color || '#7c3aed',
                  color: targetPhase.color || '#7c3aed',
                  backgroundColor: `${targetPhase.color || '#7c3aed'}15`,
                }}
              >
                {targetPhase.name}
              </span>
            </div>

            <h3 className="text-lg font-black text-white">{card.title}</h3>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Informative Context Banner */}
        <div className="px-6 py-3 bg-purple-950/40 border-b border-purple-900/30 flex items-center gap-2.5 text-xs text-purple-200">
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

        {/* Dynamic Fields List */}
        <div className="p-6 space-y-4 max-h-[60vh] overflow-y-auto">
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

        {/* Footer Actions */}
        <div className="p-4 border-t border-slate-800 bg-slate-950/60 flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="px-4 py-2 text-xs font-semibold text-slate-400 hover:text-white hover:bg-slate-800 rounded-xl transition-colors"
          >
            Cancelar
          </button>

          <button
            type="button"
            onClick={handleConfirmTransition}
            disabled={isSubmitting}
            className="px-5 py-2 text-xs font-bold text-white bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 rounded-xl shadow-lg shadow-purple-900/40 flex items-center gap-2 transition-all transform hover:-translate-y-0.5 disabled:opacity-50"
          >
            {isSubmitting ? (
              <>
                <Cpu className="w-3.5 h-3.5 animate-spin" />
                <span>Avançando...</span>
              </>
            ) : (
              <>
                <span>Confirmar & Avançar para {targetPhase.name}</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

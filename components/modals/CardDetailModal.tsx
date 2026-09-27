'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { Card, Phase, User, Field } from '@/types';
import { DynamicField } from '../ui/DynamicField';
import { ActivityTimeline } from '../timeline/ActivityTimeline';
import { X, Save, Trash2, AlertOctagon, CheckCircle2, ArrowRight, UserCheck, Sparkles, ExternalLink, ShieldAlert } from 'lucide-react';
import { toast } from 'sonner';

interface CardDetailModalProps {
  card: Card | null;
  phases: Phase[];
  users: User[];
  onClose: () => void;
  onCardUpdated: () => void;
  missingFieldsForGate?: Field[];
  targetPhaseGateName?: string;
  readOnly?: boolean;
}

export const CardDetailModal: React.FC<CardDetailModalProps> = ({
  card,
  phases,
  users,
  onClose,
  onCardUpdated,
  missingFieldsForGate = [],
  targetPhaseGateName = '',
  readOnly = false,
}) => {
  if (!card) return null;

  const [title, setTitle] = useState(card.title || '');
  const [description, setDescription] = useState(card.description || '');
  const [phaseId, setPhaseId] = useState(card.phaseId || '');
  const [assigneeId, setAssigneeId] = useState(card.assigneeId || '');
  const [fieldValues, setFieldValues] = useState<Record<string, string>>({});
  const [isSaving, setIsSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<'fields' | 'timeline'>('fields');
  const [gateErrors, setGateErrors] = useState<Field[]>(missingFieldsForGate);
  const [targetPhasePending, setTargetPhasePending] = useState<{ id: string; name: string } | null>(
    targetPhaseGateName ? { id: '', name: targetPhaseGateName } : null
  );
  const [gateErrorMessage, setGateErrorMessage] = useState<string>(
    targetPhaseGateName
      ? `A transição para a fase "${targetPhaseGateName}" exige o preenchimento dos campos abaixo.`
      : ''
  );

  useEffect(() => {
    if (card) {
      setTitle(card.title || '');
      setDescription(card.description || '');
      setPhaseId(card.phaseId || '');
      setAssigneeId(card.assigneeId || '');

      const initialValues: Record<string, string> = {};
      if (card.values) {
        card.values.forEach((v) => {
          initialValues[v.fieldId] = v.value || '';
        });
      }
      setFieldValues(initialValues);
    }
  }, [card]);

  useEffect(() => {
    if (missingFieldsForGate && missingFieldsForGate.length > 0) {
      setGateErrors(missingFieldsForGate);
      if (targetPhaseGateName) {
        setGateErrorMessage(
          `Erro de Validação Phase Gate: Preencha os campos obrigatórios para avançar para a fase "${targetPhaseGateName}".`
        );
      }
    }
  }, [missingFieldsForGate, targetPhaseGateName]);

  const currentPhase = phases.find((p) => p.id === phaseId) || card.phase;
  const currentPhaseFields = currentPhase?.fields || [];

  const isFromLeadSheet =
    card?.activities?.some(
      (a) =>
        a.description?.toLowerCase().includes('planilha') ||
        a.metadata?.includes('LEAD_SHEET')
    ) || card?.description?.includes('Lead importado');

  const handleFieldChange = (fieldId: string, val: string) => {
    setFieldValues((prev) => ({ ...prev, [fieldId]: val }));
    // Remove from gate error highlight if user filled it
    if (val && val.trim() !== '') {
      setGateErrors((prev) => prev.filter((f) => f.id !== fieldId));
    }
  };

  const handleSaveDetails = async () => {
    setIsSaving(true);
    try {
      const res = await fetch(`/api/cards/${card.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title,
          description,
          assigneeId: assigneeId || null,
          fieldValues,
        }),
      });

      if (!res.ok) throw new Error('Falha ao salvar card.');

      toast.success('Card atualizado com sucesso!');
      onCardUpdated();
    } catch (err: any) {
      toast.error(err.message || 'Erro ao atualizar.');
    } finally {
      setIsSaving(false);
    }
  };

  const handlePhaseChangeAttempt = async (newPhaseId: string) => {
    if (newPhaseId === card.phaseId) {
      setPhaseId(newPhaseId);
      setGateErrors([]);
      setTargetPhasePending(null);
      return;
    }

    const targetPhaseObj = phases.find((p) => p.id === newPhaseId);
    setIsSaving(true);

    try {
      const res = await fetch(`/api/cards/${card.id}/move`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          targetPhaseId: newPhaseId,
          fieldValues,
        }),
      });

      if (res.status === 422) {
        const errorData = await res.json();
        setGateErrors(errorData.missingFields || []);
        setGateErrorMessage(errorData.message || 'Existem campos obrigatórios não preenchidos.');
        setTargetPhasePending({ id: newPhaseId, name: targetPhaseObj?.name || '' });
        setPhaseId(card.phaseId); // keep source phase fields accessible
        toast.error('Preencha os campos obrigatórios da transição para avançar.');
        return;
      }

      if (!res.ok) {
        throw new Error('Erro ao mover card de fase.');
      }

      toast.success(`Card movido para "${targetPhaseObj?.name}" com sucesso!`);
      setPhaseId(newPhaseId);
      setGateErrors([]);
      setTargetPhasePending(null);
      onCardUpdated();
    } catch (err: any) {
      toast.error(err.message || 'Erro ao alterar fase.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteCard = async () => {
    if (!confirm(`Tem certeza que deseja excluir o card "${card.title}"?`)) return;

    try {
      const res = await fetch(`/api/cards/${card.id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Falha ao excluir card.');

      toast.success('Card excluído.');
      onCardUpdated();
      onClose();
    } catch (err: any) {
      toast.error(err.message || 'Erro ao excluir card.');
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto animate-in fade-in duration-200">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-4xl max-h-[90vh] shadow-2xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="p-6 border-b border-slate-200 dark:border-slate-800 flex items-start justify-between bg-slate-50/50 dark:bg-slate-900/50">
          <div className="flex-1 mr-4">
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Título do Card"
              disabled={readOnly}
              className={`w-full text-xl font-bold text-slate-900 dark:text-slate-100 bg-transparent border-b border-transparent ${
                readOnly ? 'cursor-default' : 'hover:border-slate-300 focus:border-blue-500'
              } focus:outline-none transition-colors px-1 py-0.5`}
            />
            <div className="mt-2 flex items-center gap-4 text-xs">
              <span className="flex items-center gap-1.5 text-slate-600 dark:text-slate-400">
                <span className="font-semibold">Fase Atual:</span>
                <select
                  value={phaseId}
                  onChange={(e) => handlePhaseChangeAttempt(e.target.value)}
                  disabled={readOnly}
                  className={`bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded px-2 py-1 font-semibold text-purple-700 dark:text-purple-300 ${
                    readOnly ? 'cursor-not-allowed opacity-80' : 'focus:ring-2 focus:ring-purple-500'
                  }`}
                >
                  {phases.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} {p.fields.some((f) => f.required) ? '🔒' : ''}
                    </option>
                  ))}
                </select>
              </span>

              <span className="flex items-center gap-1.5 text-slate-600 dark:text-slate-400">
                <UserCheck className="w-3.5 h-3.5" />
                <span className="font-semibold">Responsável:</span>
                <select
                  value={assigneeId}
                  onChange={(e) => setAssigneeId(e.target.value)}
                  disabled={readOnly}
                  className={`bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded px-2 py-1 text-slate-800 dark:text-slate-200 ${
                    readOnly ? 'cursor-not-allowed opacity-80' : ''
                  }`}
                >
                  <option value="">Nenhum</option>
                  {users.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name} ({u.role})
                    </option>
                  ))}
                </select>
              </span>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Read-Only Alert Banner */}
        {readOnly && (
          <div className="bg-amber-950/40 border-b border-amber-800/50 px-6 py-2.5 flex items-center justify-between text-xs text-amber-300">
            <span className="flex items-center gap-2 font-medium">
              <ShieldAlert className="w-4 h-4 text-amber-400 shrink-0" />
              <span>Modo Somente Leitura • Você pode consultar as informações, mas não tem permissão para alterar dados deste setor.</span>
            </span>
            <span className="text-[10px] bg-amber-900/50 border border-amber-700/60 px-2 py-0.5 rounded font-bold uppercase shrink-0">
              Consulta
            </span>
          </div>
        )}

        {/* Lead Sheet Origin Banner */}
        {isFromLeadSheet && (
          <div className="bg-indigo-950/40 border-b border-indigo-800/50 px-6 py-2.5 flex items-center justify-between text-xs text-indigo-300">
            <div className="flex items-center gap-2 font-semibold">
              <Sparkles className="w-4 h-4 text-indigo-400" />
              <span>Projeto originado da <strong>Planilha de Triagem de Leads</strong></span>
            </div>
            <Link
              href="/tools/lead-sheet"
              className="inline-flex items-center gap-1 font-bold text-indigo-300 hover:text-white underline hover:no-underline"
            >
              Ver na Planilha <ExternalLink className="w-3 h-3" />
            </Link>
          </div>
        )}

        {/* Phase Gate Alert Banner if missing required fields */}
        {gateErrors.length > 0 && (
          <div className="bg-purple-950/40 border-b border-purple-800/60 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-purple-200 text-sm">
            <div className="flex items-start gap-3">
              <AlertOctagon className="w-5 h-5 shrink-0 text-purple-400 mt-0.5" />
              <div>
                <p className="font-bold">{gateErrorMessage || 'Pendências de Transição de Fase'}</p>
                <p className="text-xs text-purple-300/80 mt-0.5">
                  Preencha os seguintes campos obrigatórios:{' '}
                  <span className="font-semibold text-white">{gateErrors.map((f) => f.label).join(', ')}</span>
                </p>
              </div>
            </div>

            {targetPhasePending && targetPhasePending.id && (
              <button
                type="button"
                onClick={() => handlePhaseChangeAttempt(targetPhasePending.id)}
                className="px-4 py-2 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-bold text-xs rounded-xl shadow shrink-0 flex items-center gap-1.5 transition-all"
              >
                <span>Concluir Transição ➔</span>
              </button>
            )}
          </div>
        )}

        {/* Tab Navigation */}
        <div className="border-b border-slate-200 dark:border-slate-800 px-6 flex gap-6 bg-white dark:bg-slate-900">
          <button
            onClick={() => setActiveTab('fields')}
            className={`py-3 text-sm font-semibold border-b-2 transition-colors flex items-center gap-2 ${
              activeTab === 'fields'
                ? 'border-blue-600 text-blue-600 dark:text-blue-400'
                : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
            }`}
          >
            📋 Campos da Fase ({currentPhaseFields.length})
          </button>

          <button
            onClick={() => setActiveTab('timeline')}
            className={`py-3 text-sm font-semibold border-b-2 transition-colors flex items-center gap-2 ${
              activeTab === 'timeline'
                ? 'border-blue-600 text-blue-600 dark:text-blue-400'
                : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
            }`}
          >
            🕒 Histórico & Timeline ({card.activities?.length || 0})
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto flex-1 space-y-6">
          {activeTab === 'fields' && (
            <div className="space-y-6">
              {/* Description field */}
              <div>
                <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Descrição Geral do Projeto / Card
                </label>
                <textarea
                  rows={2}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Insira detalhes gerais sobre esta oportunidade..."
                  disabled={readOnly}
                  className={`w-full px-3 py-2 text-sm rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 ${
                    readOnly ? 'cursor-not-allowed opacity-80' : 'focus:ring-2 focus:ring-blue-500'
                  }`}
                />
              </div>

              {/* Additional Gate Fields if required for transition */}
              {gateErrors.some((ge) => !currentPhaseFields.some((cpf) => cpf.id === ge.id)) && (
                <div className="p-4 rounded-xl bg-purple-950/30 border border-purple-800/50 space-y-3">
                  <h5 className="text-xs font-bold text-purple-300 flex items-center gap-1.5">
                    <Sparkles className="w-4 h-4 text-purple-400" />
                    Campos Pendentes para Concluir a Transição:
                  </h5>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {gateErrors
                      .filter((ge) => !currentPhaseFields.some((cpf) => cpf.id === ge.id))
                      .map((field) => (
                        <div key={field.id} className={field.type === 'TEXTAREA' ? 'md:col-span-2' : ''}>
                          <DynamicField
                            field={field}
                            value={fieldValues[field.id] || ''}
                            onChange={(val) => handleFieldChange(field.id, val)}
                            isMissing={!fieldValues[field.id] || fieldValues[field.id].trim() === ''}
                            disabled={readOnly}
                          />
                        </div>
                      ))}
                  </div>
                </div>
              )}

              {/* Configured Phase Dynamic Fields */}
              <div className="border-t border-slate-200 dark:border-slate-800 pt-4">
                <div className="flex items-center justify-between mb-4">
                  <h4 className="text-sm font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wider">
                    Campos da Fase: {currentPhase?.name}
                  </h4>
                  <span className="text-xs text-slate-400">
                    {currentPhaseFields.filter((f) => f.required).length} obrigatórios nesta fase
                  </span>
                </div>

                {currentPhaseFields.length === 0 ? (
                  <p className="text-xs text-slate-400 italic py-4">
                    Nenhum campo configurado para a fase {currentPhase?.name}.
                  </p>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {currentPhaseFields.map((field) => {
                      const isMissing = gateErrors.some((ge) => ge.id === field.id);
                      return (
                        <div key={field.id} className={field.type === 'TEXTAREA' ? 'md:col-span-2' : ''}>
                          <DynamicField
                            field={field}
                            value={fieldValues[field.id] || ''}
                            onChange={(val) => handleFieldChange(field.id, val)}
                            isMissing={isMissing}
                            disabled={readOnly}
                          />
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}

          {activeTab === 'timeline' && (
            <div>
              <h4 className="text-sm font-bold text-slate-800 dark:text-slate-200 mb-4">
                Histórico de Movimentações e Atividades
              </h4>
              <ActivityTimeline activities={card.activities} />
            </div>
          )}
        </div>

        {/* Footer Actions */}
        {readOnly ? (
          <div className="p-4 bg-slate-50 dark:bg-slate-950 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between">
            <span className="text-xs text-slate-500 italic">
              Modo de visualização. Edições e exclusões desabilitadas para usuários de outros setores.
            </span>
            <button
              onClick={onClose}
              className="px-5 py-2 text-sm font-semibold text-slate-200 bg-slate-800 hover:bg-slate-700 rounded-lg transition-colors"
            >
              Fechar
            </button>
          </div>
        ) : (
          <div className="p-4 bg-slate-50 dark:bg-slate-950 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between">
            <button
              onClick={handleDeleteCard}
              className="px-3 py-2 text-xs font-semibold text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950/30 rounded-lg flex items-center gap-1.5 transition-colors"
            >
              <Trash2 className="w-4 h-4" /> Excluir Card
            </button>

            <div className="flex items-center gap-3">
              <button
                onClick={onClose}
                className="px-4 py-2 text-sm font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-200/60 dark:hover:bg-slate-800 rounded-lg transition-colors"
              >
                Cancelar
              </button>

              <button
                onClick={handleSaveDetails}
                disabled={isSaving}
                className="px-5 py-2 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 active:bg-blue-800 rounded-lg flex items-center gap-2 shadow-sm transition-colors disabled:opacity-50"
              >
                <Save className="w-4 h-4" />
                {isSaving ? 'Salvando...' : 'Salvar Alterações'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

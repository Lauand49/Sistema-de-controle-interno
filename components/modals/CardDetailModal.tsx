'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { Card, Phase, User, Field } from '@/types';
import { DynamicField } from '../ui/DynamicField';
import { ActivityTimeline } from '../timeline/ActivityTimeline';
import { Save, Trash2, AlertOctagon, ArrowRight, Sparkles, ExternalLink, ShieldAlert, ClipboardList, History } from 'lucide-react';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { Field as FormField } from '../ui/Field';
import { Input, Select, Textarea } from '../ui/Input';
import { Tabs } from '../ui/Tabs';
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

  const footer = readOnly ? (
    <>
      <span className="mr-auto text-xs text-fg-muted">
        Modo de visualização. Edições e exclusões desabilitadas para usuários de outros setores.
      </span>
      <Button variant="secondary" onClick={onClose}>
        Fechar
      </Button>
    </>
  ) : (
    <>
      <Button variant="danger" size="sm" icon={Trash2} onClick={handleDeleteCard} className="mr-auto">
        Excluir Card
      </Button>
      <Button variant="ghost" onClick={onClose}>
        Cancelar
      </Button>
      <Button icon={Save} onClick={handleSaveDetails} loading={isSaving}>
        {isSaving ? 'Salvando...' : 'Salvar Alterações'}
      </Button>
    </>
  );

  return (
    <Modal title="Detalhes do card" onClose={onClose} size="xl" footer={footer} closeOnBackdrop={false}>
      <div className="-mx-5 -mt-4">
        {/* Banners */}
        {readOnly && (
          <div className="bg-amber-950/40 border-b border-amber-800/50 px-5 py-2.5 flex items-center justify-between gap-3 text-xs text-amber-300">
            <span className="flex items-center gap-2 font-medium">
              <ShieldAlert className="w-4 h-4 text-amber-400 shrink-0" aria-hidden="true" />
              <span>Modo Somente Leitura • Você pode consultar as informações, mas não tem permissão para alterar dados deste setor.</span>
            </span>
            <span className="text-[11px] bg-amber-900/50 border border-amber-700/60 px-2 py-0.5 rounded font-bold uppercase shrink-0">
              Consulta
            </span>
          </div>
        )}
        {isFromLeadSheet && (
          <div className="bg-indigo-950/40 border-b border-indigo-800/50 px-5 py-2.5 flex items-center justify-between gap-3 text-xs text-indigo-300">
            <div className="flex items-center gap-2 font-semibold">
              <Sparkles className="w-4 h-4 text-indigo-400" aria-hidden="true" />
              <span>Projeto originado da <strong>Planilha de Triagem de Leads</strong></span>
            </div>
            <Link
              href="/tools/lead-sheet"
              className="inline-flex items-center gap-1 min-h-10 font-bold text-indigo-300 hover:text-white underline hover:no-underline"
            >
              Ver na Planilha <ExternalLink className="w-3 h-3" aria-hidden="true" />
            </Link>
          </div>
        )}
        {gateErrors.length > 0 && (
          <div role="alert" className="bg-primary-subtle border-b border-primary/40 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-purple-200 text-sm">
            <div className="flex items-start gap-3">
              <AlertOctagon className="w-5 h-5 shrink-0 text-primary-soft mt-0.5" aria-hidden="true" />
              <div>
                <p className="font-bold">{gateErrorMessage || 'Pendências de Transição de Fase'}</p>
                <p className="text-xs text-purple-200 mt-0.5">
                  Preencha os seguintes campos obrigatórios:{' '}
                  <span className="font-semibold text-white">{gateErrors.map((f) => f.label).join(', ')}</span>
                </p>
              </div>
            </div>
            {targetPhasePending && targetPhasePending.id && (
              <Button size="sm" icon={ArrowRight} onClick={() => handlePhaseChangeAttempt(targetPhasePending.id)} className="shrink-0">
                Concluir Transição
              </Button>
            )}
          </div>
        )}

        <div className="px-5 pt-4 space-y-4">
          <FormField label="Título do card">
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Título do Card" disabled={readOnly} className="text-base font-semibold" />
          </FormField>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <FormField label="Fase atual">
              <Select value={phaseId} onChange={(e) => handlePhaseChangeAttempt(e.target.value)} disabled={readOnly}>
                {phases.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                    {p.fields.some((f) => f.required) ? ' (com campos obrigatórios)' : ''}
                  </option>
                ))}
              </Select>
            </FormField>
            <FormField label="Responsável">
              <Select value={assigneeId} onChange={(e) => setAssigneeId(e.target.value)} disabled={readOnly}>
                <option value="">Nenhum</option>
                {users.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name} ({u.title})
                  </option>
                ))}
              </Select>
            </FormField>
          </div>

          <Tabs
            ariaLabel="Seções do card"
            value={activeTab}
            onChange={setActiveTab}
            tabs={[
              { id: 'fields', label: 'Campos da fase', icon: ClipboardList, count: currentPhaseFields.length },
              { id: 'timeline', label: 'Histórico', icon: History, count: card.activities?.length || 0 },
            ]}
          />

          {activeTab === 'fields' && (
            <div className="space-y-6">
              <FormField label="Descrição geral do projeto / card">
                <Textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Insira detalhes gerais sobre esta oportunidade..."
                  disabled={readOnly}
                />
              </FormField>

              {gateErrors.some((ge) => !currentPhaseFields.some((cpf) => cpf.id === ge.id)) && (
                <div className="p-4 rounded-card bg-primary-subtle border border-primary/40 space-y-3">
                  <h5 className="text-xs font-bold text-primary-soft flex items-center gap-1.5">
                    <Sparkles className="w-4 h-4" aria-hidden="true" />
                    Campos pendentes para concluir a transição
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

              <div className="border-t border-border pt-4">
                <div className="flex items-center justify-between gap-3 mb-4">
                  <h4 className="text-sm font-bold text-fg uppercase tracking-wider truncate" title={currentPhase?.name}>
                    Campos da fase: {currentPhase?.name}
                  </h4>
                  <span className="text-xs text-fg-muted shrink-0">
                    {currentPhaseFields.filter((f) => f.required).length} obrigatórios nesta fase
                  </span>
                </div>
                {currentPhaseFields.length === 0 ? (
                  <p className="text-xs text-fg-muted py-4">Nenhum campo configurado para a fase {currentPhase?.name}.</p>
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
              <h4 className="text-sm font-bold text-fg mb-4">Histórico de movimentações e atividades</h4>
              <ActivityTimeline activities={card.activities} />
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
};

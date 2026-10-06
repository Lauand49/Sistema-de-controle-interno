'use client';

import React, { useState } from 'react';
import { Phase, User } from '@/types';
import { DynamicField } from '../ui/DynamicField';
import { toast } from 'sonner';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Field } from '@/components/ui/Field';
import { Input, Select, Textarea } from '@/components/ui/Input';

interface CreateCardModalProps {
  phaseId: string;
  phases: Phase[];
  users: User[];
  onClose: () => void;
  onCardCreated: () => void;
}

export const CreateCardModal: React.FC<CreateCardModalProps> = ({
  phaseId,
  phases,
  users,
  onClose,
  onCardCreated,
}) => {
  const [selectedPhaseId, setSelectedPhaseId] = useState(phaseId);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [assigneeId, setAssigneeId] = useState('');
  const [fieldValues, setFieldValues] = useState<Record<string, string>>({});
  const [isLoading, setIsLoading] = useState(false);

  const currentPhase = phases.find((p) => p.id === selectedPhaseId);
  const phaseFields = currentPhase?.fields || [];

  const handleFieldChange = (fieldId: string, val: string) => {
    setFieldValues((prev) => ({ ...prev, [fieldId]: val }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      toast.error('O título do card é obrigatório.');
      return;
    }

    setIsLoading(true);
    try {
      const res = await fetch('/api/cards', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title,
          description,
          phaseId: selectedPhaseId,
          assigneeId: assigneeId || null,
          fieldValues,
        }),
      });

      if (!res.ok) throw new Error('Erro ao criar card.');

      toast.success('Card criado com sucesso!');
      onCardCreated();
      onClose();
    } catch (err: any) {
      toast.error(err.message || 'Erro ao criar card.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Modal
      title={`Novo card em ${currentPhase?.name ?? ''}`}
      onClose={onClose}
      closeOnBackdrop={false}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" form="create-card-form" loading={isLoading}>
            {isLoading ? 'Criando...' : 'Criar Card'}
          </Button>
        </>
      }
    >
      <form id="create-card-form" onSubmit={handleSubmit} className="space-y-4">
        <Field label="Título do projeto / oportunidade" required>
          <Input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Ex: Consultoria em Gestão - Empresa X"
            required
          />
        </Field>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label="Fase inicial">
            <Select value={selectedPhaseId} onChange={(e) => setSelectedPhaseId(e.target.value)}>
              {phases.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Responsável">
            <Select value={assigneeId} onChange={(e) => setAssigneeId(e.target.value)}>
              <option value="">Selecione um consultor</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name} ({u.title})
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <Field label="Descrição geral">
          <Textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Resumo do escopo ou contexto do cliente..."
          />
        </Field>
        {phaseFields.length > 0 && (
          <div className="border-t border-border pt-4 space-y-3">
            <h4 className="text-xs font-bold text-fg-muted uppercase tracking-wider">Campos da fase {currentPhase?.name}</h4>
            {phaseFields.map((field) => (
              <DynamicField
                key={field.id}
                field={field}
                value={fieldValues[field.id] || ''}
                onChange={(val) => handleFieldChange(field.id, val)}
              />
            ))}
          </div>
        )}
      </form>
    </Modal>
  );
};

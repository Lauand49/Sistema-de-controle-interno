'use client';

import React, { useState } from 'react';
import { Phase, FieldType } from '@/types';
import { toast } from 'sonner';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Field } from '@/components/ui/Field';
import { Input, Select } from '@/components/ui/Input';

interface CreateFieldModalProps {
  phaseId: string;
  phases: Phase[];
  onClose: () => void;
  onFieldCreated: () => void;
}

export const CreateFieldModal: React.FC<CreateFieldModalProps> = ({
  phaseId,
  phases,
  onClose,
  onFieldCreated,
}) => {
  const [selectedPhaseId, setSelectedPhaseId] = useState(phaseId);
  const [label, setLabel] = useState('');
  const [type, setType] = useState<FieldType>('TEXT');
  const [required, setRequired] = useState(false);
  const [optionsStr, setOptionsStr] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const currentPhase = phases.find((p) => p.id === selectedPhaseId);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!label.trim()) {
      toast.error('O rótulo do campo é obrigatório.');
      return;
    }

    setIsLoading(true);
    try {
      const slugName = label
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '');

      let optionsPayload: string[] | undefined = undefined;
      if (type === 'SELECT' && optionsStr.trim()) {
        optionsPayload = optionsStr
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean);
      }

      const res = await fetch('/api/fields', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: slugName || 'campo_customizado',
          label,
          type,
          required,
          options: optionsPayload,
          phaseId: selectedPhaseId,
        }),
      });

      if (!res.ok) throw new Error('Erro ao criar campo.');

      toast.success(`Campo "${label}" adicionado à fase ${currentPhase?.name}!`);
      onFieldCreated();
      onClose();
    } catch (err: any) {
      toast.error(err.message || 'Erro ao criar campo.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Modal
      title={`Novo campo configurável - ${currentPhase?.name ?? ''}`}
      onClose={onClose}
      closeOnBackdrop={false}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" form="create-field-form" loading={isLoading}>
            {isLoading ? 'Adicionando...' : 'Salvar Campo'}
          </Button>
        </>
      }
    >
      <form id="create-field-form" onSubmit={handleSubmit} className="space-y-4">
        <Field label="Fase alvo">
          <Select value={selectedPhaseId} onChange={(e) => setSelectedPhaseId(e.target.value)}>
            {phases.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Nome / rótulo do campo" required>
          <Input
            type="text"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="Ex: Valor Estimado, Contato Principal, Motivo de Perda"
            required
          />
        </Field>
        <Field label="Tipo do campo">
          <Select value={type} onChange={(e) => setType(e.target.value as FieldType)}>
            <option value="TEXT">Texto Curto (TEXT)</option>
            <option value="NUMBER">Número (NUMBER)</option>
            <option value="CURRENCY">Moeda (CURRENCY - R$)</option>
            <option value="DATE">Data (DATE)</option>
            <option value="SELECT">Seleção (SELECT)</option>
            <option value="TEXTAREA">Texto Longo (TEXTAREA)</option>
          </Select>
        </Field>
        {type === 'SELECT' && (
          <Field label="Opções da lista (separadas por vírgula)">
            <Input type="text" value={optionsStr} onChange={(e) => setOptionsStr(e.target.value)} placeholder="Opção A, Opção B, Opção C" />
          </Field>
        )}
        <div className="flex items-center gap-2 pt-2">
          <input
            type="checkbox"
            id="req-check"
            checked={required}
            onChange={(e) => setRequired(e.target.checked)}
            className="w-4 h-4 accent-purple-600 rounded focus-visible:ring-2 focus-visible:ring-focus"
          />
          <label htmlFor="req-check" className="text-sm font-semibold text-fg">
            Campo obrigatório na fase gate (required)
          </label>
        </div>
      </form>
    </Modal>
  );
};

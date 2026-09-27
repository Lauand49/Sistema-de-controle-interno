'use client';

import React, { useState } from 'react';
import { Phase, User } from '@/types';
import { DynamicField } from '../ui/DynamicField';
import { X, PlusCircle } from 'lucide-react';
import { toast } from 'sonner';

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
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto animate-in fade-in duration-200">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-xl shadow-2xl overflow-hidden flex flex-col">
        {/* Header */}
        <div className="p-5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50 dark:bg-slate-950">
          <div className="flex items-center gap-2">
            <PlusCircle className="w-5 h-5 text-blue-600 dark:text-blue-400" />
            <h3 className="font-bold text-slate-900 dark:text-slate-100">
              Novo Card em {currentPhase?.name}
            </h3>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 rounded-lg hover:bg-slate-200/60 dark:hover:bg-slate-800"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4 overflow-y-auto max-h-[75vh]">
          <div>
            <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Título do Projeto / Oportunidade <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Ex: Consultoria em Gestão - Empresa X"
              required
              className="w-full px-3 py-2 text-sm rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Fase Inicial
              </label>
              <select
                value={selectedPhaseId}
                onChange={(e) => setSelectedPhaseId(e.target.value)}
                className="w-full px-3 py-2 text-sm rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100"
              >
                {phases.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Responsável
              </label>
              <select
                value={assigneeId}
                onChange={(e) => setAssigneeId(e.target.value)}
                className="w-full px-3 py-2 text-sm rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100"
              >
                <option value="">Selecione um consultor</option>
                {users.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name} ({u.role})
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Descrição Geral
            </label>
            <textarea
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Resumo do escopo ou contexto do cliente..."
              className="w-full px-3 py-2 text-sm rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {phaseFields.length > 0 && (
            <div className="border-t border-slate-200 dark:border-slate-800 pt-4 space-y-3">
              <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                Campos da Fase {currentPhase?.name}
              </h4>
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

          <div className="pt-4 border-t border-slate-200 dark:border-slate-800 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-200/60 dark:hover:bg-slate-800 rounded-lg"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isLoading}
              className="px-5 py-2 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors disabled:opacity-50"
            >
              {isLoading ? 'Criando...' : 'Criar Card'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

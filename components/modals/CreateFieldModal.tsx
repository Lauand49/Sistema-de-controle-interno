'use client';

import React, { useState } from 'react';
import { Phase, FieldType } from '@/types';
import { X, Settings2 } from 'lucide-react';
import { toast } from 'sonner';

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
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto animate-in fade-in duration-200">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden flex flex-col">
        <div className="p-5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50 dark:bg-slate-950">
          <div className="flex items-center gap-2">
            <Settings2 className="w-5 h-5 text-purple-600 dark:text-purple-400" />
            <h3 className="font-bold text-slate-900 dark:text-slate-100">
              Novo Campo Configurável - {currentPhase?.name}
            </h3>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 rounded-lg"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Fase Alvo
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
              Nome / Rótulo do Campo <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="Ex: Valor Estimado, Contato Principal, Motivo de Perda"
              required
              className="w-full px-3 py-2 text-sm rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100"
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Tipo do Campo
            </label>
            <select
              value={type}
              onChange={(e) => setType(e.target.value as FieldType)}
              className="w-full px-3 py-2 text-sm rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100"
            >
              <option value="TEXT">Texto Curto (TEXT)</option>
              <option value="NUMBER">Número (NUMBER)</option>
              <option value="CURRENCY">Moeda (CURRENCY - R$)</option>
              <option value="DATE">Data (DATE)</option>
              <option value="SELECT">Seleção (SELECT)</option>
              <option value="TEXTAREA">Texto Longo (TEXTAREA)</option>
            </select>
          </div>

          {type === 'SELECT' && (
            <div>
              <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Opções da Lista (separadas por vírgula)
              </label>
              <input
                type="text"
                value={optionsStr}
                onChange={(e) => setOptionsStr(e.target.value)}
                placeholder="Opção A, Opção B, Opção C"
                className="w-full px-3 py-2 text-sm rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100"
              />
            </div>
          )}

          <div className="flex items-center gap-2 pt-2">
            <input
              type="checkbox"
              id="req-check"
              checked={required}
              onChange={(e) => setRequired(e.target.checked)}
              className="w-4 h-4 text-blue-600 rounded border-slate-300 focus:ring-blue-500"
            />
            <label htmlFor="req-check" className="text-sm font-semibold text-slate-800 dark:text-slate-200">
              Campo Obrigatório na Fase Gate (Required)
            </label>
          </div>

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
              className="px-5 py-2 text-sm font-semibold text-white bg-purple-600 hover:bg-purple-700 rounded-lg transition-colors disabled:opacity-50"
            >
              {isLoading ? 'Adicionando...' : 'Salvar Campo'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

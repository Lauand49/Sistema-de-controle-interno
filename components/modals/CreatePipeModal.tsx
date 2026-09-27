'use client';

import React, { useState } from 'react';
import { Pipe } from '@/types';
import { toast } from 'sonner';
import {
  X,
  Plus,
  Trash2,
  Sparkles,
  Layers,
  Users,
  UserCheck,
  Award,
  Target,
  Heart,
  CheckCircle2,
  Folder,
  Palette,
} from 'lucide-react';

interface CreatePipeModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (newPipe: Pipe) => void;
  defaultDepartment?: string;
}

interface PhaseDraft {
  name: string;
  color: string;
  isFinal: boolean;
}

const AVAILABLE_ICONS = [
  { name: 'Users', icon: Users, label: 'Membros' },
  { name: 'UserCheck', icon: UserCheck, label: 'Aprovação' },
  { name: 'Award', icon: Award, label: 'Reconhecimento' },
  { name: 'Target', icon: Target, label: 'Metas' },
  { name: 'Heart', icon: Heart, label: 'Cuidado' },
  { name: 'Sparkles', icon: Sparkles, label: 'Destaque' },
  { name: 'Folder', icon: Folder, label: 'Pasta' },
  { name: 'Layers', icon: Layers, label: 'Camadas' },
];

const COLOR_PALETTE = [
  '#3b82f6', // Blue
  '#8b5cf6', // Violet
  '#a855f7', // Purple
  '#f59e0b', // Amber
  '#10b981', // Emerald
  '#06b6d4', // Cyan
  '#ec4899', // Pink
  '#64748b', // Slate
];

export const CreatePipeModal: React.FC<CreatePipeModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  defaultDepartment = 'GENTE',
}) => {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [selectedIcon, setSelectedIcon] = useState('Users');
  const [phases, setPhases] = useState<PhaseDraft[]>([
    { name: 'Inscrito / Backlog', color: '#3b82f6', isFinal: false },
    { name: 'Em Andamento', color: '#8b5cf6', isFinal: false },
    { name: 'Avaliação / Validação', color: '#f59e0b', isFinal: false },
    { name: 'Concluído / Aprovado', color: '#10b981', isFinal: true },
  ]);
  const [loading, setLoading] = useState(false);

  if (!isOpen) return null;

  const handleAddPhase = () => {
    const nextColor = COLOR_PALETTE[phases.length % COLOR_PALETTE.length];
    setPhases([
      ...phases,
      {
        name: `Nova Fase ${phases.length + 1}`,
        color: nextColor,
        isFinal: false,
      },
    ]);
  };

  const handleRemovePhase = (index: number) => {
    if (phases.length <= 1) {
      toast.info('O funil precisa ter pelo menos uma fase.');
      return;
    }
    setPhases(phases.filter((_, i) => i !== index));
  };

  const handleUpdatePhase = (index: number, field: keyof PhaseDraft, value: any) => {
    const updated = [...phases];
    updated[index] = {
      ...updated[index],
      [field]: value,
    };
    setPhases(updated);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      toast.error('Informe o nome do funil.');
      return;
    }

    if (phases.some((p) => !p.name.trim())) {
      toast.error('Todas as fases do funil devem ter um nome.');
      return;
    }

    setLoading(true);
    try {
      const res = await fetch('/api/pipes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim() || null,
          department: defaultDepartment.toUpperCase(),
          icon: selectedIcon,
          phases: phases.map((p, idx) => ({
            name: p.name.trim(),
            order: idx,
            color: p.color,
            isFinal: p.isFinal,
          })),
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Erro ao criar funil.');
      }

      const createdPipe = await res.json();
      toast.success(`Funil "${createdPipe.name}" criado com sucesso!`);
      onSuccess(createdPipe);
      onClose();
    } catch (err: any) {
      toast.error(err.message || 'Erro ao criar o funil.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-fadeIn">
      <div className="relative w-full max-w-2xl bg-slate-900 border border-purple-800/50 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="p-5 border-b border-slate-800 flex items-center justify-between bg-gradient-to-r from-purple-950/60 via-slate-900 to-indigo-950/40">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-purple-600/20 text-purple-400 border border-purple-500/30">
              <Layers className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                Criar Novo Funil Personalizado
              </h2>
              <p className="text-xs text-slate-400">
                Configure um novo fluxo de trabalho para o setor de{' '}
                <strong className="text-purple-300">{defaultDepartment}</strong>
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-5 overflow-y-auto flex-1 text-xs">
          {/* Funnel Name & Description */}
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Nome do Funil <span className="text-rose-400">*</span>
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ex: Acompanhamento de Trainees 2026.2 ou Ciclo de Feedback"
                className="w-full px-3.5 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white placeholder-slate-600 focus:outline-none focus:border-purple-500"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                Descrição & Objetivo (Opcional)
              </label>
              <input
                type="text"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Ex: Processo de capacitação e avaliação contínua dos membros ingressantes"
                className="w-full px-3.5 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-white placeholder-slate-600 focus:outline-none focus:border-purple-500"
              />
            </div>
          </div>

          {/* Icon Selector */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-2">
              Ícone Representativo
            </label>
            <div className="grid grid-cols-4 sm:grid-cols-8 gap-2">
              {AVAILABLE_ICONS.map((item) => {
                const IconComponent = item.icon;
                const isSelected = selectedIcon === item.name;
                return (
                  <button
                    key={item.name}
                    type="button"
                    onClick={() => setSelectedIcon(item.name)}
                    className={`p-2.5 rounded-xl border flex flex-col items-center justify-center gap-1 transition-all ${
                      isSelected
                        ? 'bg-purple-950/80 border-purple-500 text-purple-300 shadow-md shadow-purple-900/30 font-bold'
                        : 'bg-slate-950/60 border-slate-800 text-slate-400 hover:text-white hover:border-slate-700'
                    }`}
                    title={item.label}
                  >
                    <IconComponent className="w-4 h-4" />
                    <span className="text-[10px] truncate max-w-full">{item.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Phases Builder */}
          <div className="space-y-3 pt-2 border-t border-slate-800">
            <div className="flex items-center justify-between">
              <div>
                <label className="text-xs font-semibold text-slate-300 block">
                  Fases do Funil (Etapas do Processo)
                </label>
                <p className="text-[11px] text-slate-400">
                  Defina as colunas pelas quais os cards irão transitar.
                </p>
              </div>
              <button
                type="button"
                onClick={handleAddPhase}
                className="px-3 py-1 rounded-xl bg-slate-800 hover:bg-slate-700 text-purple-300 border border-purple-800/40 text-xs font-semibold flex items-center gap-1.5 transition-all"
              >
                <Plus className="w-3.5 h-3.5" /> Adicionar Fase
              </button>
            </div>

            <div className="space-y-2.5">
              {phases.map((phase, idx) => (
                <div
                  key={idx}
                  className="p-3 rounded-xl bg-slate-950/70 border border-slate-800 flex items-center gap-3"
                >
                  <div className="w-6 h-6 rounded-lg bg-slate-900 border border-slate-700 flex items-center justify-center font-bold text-[11px] text-slate-400 shrink-0">
                    {idx + 1}
                  </div>

                  {/* Phase Name Input */}
                  <input
                    type="text"
                    value={phase.name}
                    onChange={(e) => handleUpdatePhase(idx, 'name', e.target.value)}
                    placeholder={`Nome da Fase ${idx + 1}`}
                    className="flex-1 px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-xs text-white focus:outline-none focus:border-purple-500"
                    required
                  />

                  {/* Color Selector */}
                  <div className="flex items-center gap-1 shrink-0">
                    {COLOR_PALETTE.map((color) => (
                      <button
                        key={color}
                        type="button"
                        onClick={() => handleUpdatePhase(idx, 'color', color)}
                        className={`w-4 h-4 rounded-full border transition-transform ${
                          phase.color === color
                            ? 'scale-125 border-white ring-2 ring-purple-500/50'
                            : 'border-transparent hover:scale-110 opacity-70 hover:opacity-100'
                        }`}
                        style={{ backgroundColor: color }}
                      />
                    ))}
                  </div>

                  {/* Final Phase Checkbox */}
                  <label className="flex items-center gap-1.5 text-[11px] text-slate-400 cursor-pointer shrink-0 ml-1">
                    <input
                      type="checkbox"
                      checked={phase.isFinal}
                      onChange={(e) => handleUpdatePhase(idx, 'isFinal', e.target.checked)}
                      className="w-3.5 h-3.5 rounded text-purple-600 bg-slate-900 border-slate-700 focus:ring-purple-500"
                    />
                    <span>Final</span>
                  </label>

                  {/* Delete Phase Button */}
                  <button
                    type="button"
                    onClick={() => handleRemovePhase(idx)}
                    className="p-1.5 rounded-lg text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 transition-colors shrink-0"
                    title="Remover fase"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Footer Actions */}
          <div className="pt-4 border-t border-slate-800 flex items-center justify-end gap-2.5">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold text-xs transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={loading}
              className="px-5 py-2 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-bold text-xs shadow-lg shadow-purple-900/40 flex items-center gap-2 transition-all disabled:opacity-50"
            >
              {loading ? (
                'Criando...'
              ) : (
                <>
                  <Plus className="w-3.5 h-3.5" /> Criar Funil
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

'use client';

import React, { useState } from 'react';
import { Pipe } from '@/types';
import { toast } from 'sonner';
import {
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
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Field } from '@/components/ui/Field';
import { Input } from '@/components/ui/Input';

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
    <Modal
      title="Criar Novo Funil Personalizado"
      description={`Configure um novo fluxo de trabalho para o setor de ${defaultDepartment}`}
      onClose={onClose}
      size="lg"
      closeOnBackdrop={false}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" form="create-pipe-form" icon={Plus} loading={loading}>
            {loading ? 'Criando...' : 'Criar Funil'}
          </Button>
        </>
      }
    >
      <form id="create-pipe-form" onSubmit={handleSubmit} className="space-y-5 text-xs">
        <div className="space-y-3">
          <Field label="Nome do funil" required>
            <Input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ex: Acompanhamento de Trainees 2026.2 ou Ciclo de Feedback"
              required
            />
          </Field>
          <Field label="Descrição & objetivo (opcional)">
            <Input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Ex: Processo de capacitação e avaliação contínua dos membros ingressantes"
            />
          </Field>
        </div>
          {/* Icon Selector */}
          <div>
            <p className="block text-xs font-semibold text-fg mb-2">Ícone Representativo</p>
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
                        : 'bg-slate-950/60 border-slate-800 text-fg-muted hover:text-white hover:border-slate-700'
                    }`}
                    title={item.label}
                    aria-pressed={isSelected}
                  >
                    <IconComponent className="w-4 h-4" />
                    <span className="text-[11px] truncate max-w-full">{item.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Phases Builder */}
          <div className="space-y-3 pt-2 border-t border-slate-800">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold text-fg block">Fases do Funil (Etapas do Processo)</p>
                <p className="text-[11px] text-fg-muted">
                  Defina as colunas pelas quais os cards irão transitar.
                </p>
              </div>
              <Button type="button" variant="secondary" size="sm" icon={Plus} onClick={handleAddPhase}>
                Adicionar Fase
              </Button>
            </div>

            <div className="space-y-2.5">
              {phases.map((phase, idx) => (
                <div
                  key={idx}
                  className="p-3 rounded-xl bg-slate-950/70 border border-slate-800 flex items-center gap-3"
                >
                  <div className="w-6 h-6 rounded-lg bg-slate-900 border border-slate-700 flex items-center justify-center font-bold text-[11px] text-fg-muted shrink-0">
                    {idx + 1}
                  </div>

                  {/* Phase Name Input */}
                  <Input
                    type="text"
                    aria-label={`Nome da fase ${idx + 1}`}
                    value={phase.name}
                    onChange={(e) => handleUpdatePhase(idx, 'name', e.target.value)}
                    placeholder={`Nome da Fase ${idx + 1}`}
                    className="flex-1"
                    required
                  />

                  {/* Color Selector */}
                  <div className="flex items-center gap-1 shrink-0">
                    {COLOR_PALETTE.map((color) => (
                      <button
                        key={color}
                        type="button"
                        onClick={() => handleUpdatePhase(idx, 'color', color)}
                        aria-label={`Cor ${color}`}
                        aria-pressed={phase.color === color}
                        className={`w-6 h-6 rounded-full border transition-transform ${
                          phase.color === color
                            ? 'scale-125 border-white ring-2 ring-purple-500/50'
                            : 'border-transparent hover:scale-110 opacity-70 hover:opacity-100'
                        }`}
                        style={{ backgroundColor: color }}
                      />
                    ))}
                  </div>

                  {/* Final Phase Checkbox */}
                  <label className="flex items-center gap-1.5 text-[11px] text-fg-muted cursor-pointer shrink-0 ml-1">
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
                    className="w-10 h-10 inline-flex items-center justify-center rounded-lg text-fg-muted hover:text-danger-soft hover:bg-danger-subtle transition-colors shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
                    title="Remover fase"
                    aria-label={`Remover fase ${idx + 1}`}
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          </div>

      </form>
    </Modal>
  );
};

'use client';

import React, { useState, useEffect } from 'react';
import { useProfile } from '@/contexts/ProfileContext';
import { Department } from '@/types';
import { toast } from 'sonner';
import {
  Send,
  Sparkles,
  Calendar,
  AlertTriangle,
  FileText,
  Link2,
  Building2,
  Scale,
  Users,
  Palette,
} from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Field } from '@/components/ui/Field';
import { DateInput, Input, Select, Textarea } from '@/components/ui/Input';

interface CreateRequestModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
  defaultToDept?: Department | string;
  defaultTitle?: string;
  defaultDescription?: string;
  linkedCardId?: string;
}

export const CreateRequestModal: React.FC<CreateRequestModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  defaultToDept = 'ADMJURFIN',
  defaultTitle = '',
  defaultDescription = '',
  linkedCardId,
}) => {
  const { currentProfile } = useProfile();

  const [toDept, setToDept] = useState<string>(defaultToDept);
  const [fromDept, setFromDept] = useState<string>(currentProfile?.departmentCode || 'GLOBAL');
  const [title, setTitle] = useState(defaultTitle);
  const [description, setDescription] = useState(defaultDescription);
  const [priority, setPriority] = useState<'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT'>('MEDIUM');
  const [dueDate, setDueDate] = useState('');
  const [attachmentLink, setAttachmentLink] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (defaultToDept) setToDept(defaultToDept);
    if (defaultTitle) setTitle(defaultTitle);
    if (defaultDescription) setDescription(defaultDescription);
    if (currentProfile) setFromDept(currentProfile.departmentCode || 'GLOBAL');
  }, [defaultToDept, defaultTitle, defaultDescription, currentProfile, isOpen]);

  if (!isOpen) return null;

  const departmentPresets: Record<string, string[]> = {
    ADMJURFIN: [
      'Emissão de Minuta Contratual',
      'Validação Jurídica de Parceria / NDA',
      'Faturamento e Emissão de Boleto/NF',
      'Reembolso de Despesas / Pagamento de Ferramenta',
    ],
    MIDIAS: [
      'Criação de Arte para Post / Criativo',
      'Redação de Copy & Linha Editorial',
      'Design de Apresentação / Proposta Visual',
      'Material Gráfico para Evento / Divulgação',
    ],
    GENTE: [
      'Abertura de Vaga no Processo Seletivo',
      'Agendamento de Checkpoint de PDI',
      'Avaliação 360 / Feedback Estruturado',
      'Alocação de Membro em Novo Projeto',
    ],
    NEGOCIOS: [
      'Validação Técnica de Escopo de Proposta',
      'Consulta de Histórico Comercial de Cliente',
      'Indicação de Lead Quente / Parceria Comercial',
    ],
  };

  const handleApplyPreset = (presetText: string) => {
    setTitle(presetText);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !description.trim()) {
      toast.error('Preencha o título e a descrição da solicitação.');
      return;
    }

    if (!currentProfile) {
      toast.error('Você precisa estar logado para abrir uma solicitação.');
      return;
    }

    setLoading(true);
    try {
      const fullDescription = attachmentLink.trim()
        ? `${description.trim()}\n\n🔗 Link Anexo: ${attachmentLink.trim()}`
        : description.trim();

      const res = await fetch('/api/requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title.trim(),
          description: fullDescription,
          fromDept,
          toDept,
          priority,
          requesterId: currentProfile.id,
          dueDate: dueDate || null,
          linkedCardId: linkedCardId || null,
          createTargetCard: true,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Erro ao criar solicitação.');
      }

      toast.success(
        `Solicitação enviada com sucesso para o setor ${toDept}! Card gerado no funil de destino.`
      );
      onSuccess?.();
      onClose();
    } catch (err: any) {
      toast.error(err.message || 'Erro ao enviar solicitação.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      title="Nova Solicitação"
      description="Gera automaticamente uma tarefa no funil de entrada do setor responsável"
      onClose={onClose}
      size="lg"
      closeOnBackdrop={false}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" form="create-request-form" icon={Send} loading={loading}>
            {loading ? 'Enviando...' : 'Enviar Solicitação'}
          </Button>
        </>
      }
    >
      <form id="create-request-form" onSubmit={handleSubmit} className="space-y-4 text-xs">
          {/* Target Department Selector */}
          <fieldset>
            <legend className="block text-xs font-semibold text-fg mb-1.5">Setor de Destino (Quem deve atender?)</legend>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {[
                { id: 'ADMJURFIN', label: 'AdmJurFin', icon: Scale, color: 'hover:border-blue-500' },
                { id: 'MIDIAS', label: 'Mídias', icon: Palette, color: 'hover:border-pink-500' },
                { id: 'GENTE', label: 'Gente', icon: Users, color: 'hover:border-amber-500' },
                { id: 'NEGOCIOS', label: 'Negócios', icon: Building2, color: 'hover:border-purple-500' },
              ].map((dept) => {
                const Icon = dept.icon;
                const isSelected = toDept === dept.id;
                return (
                  <button
                    key={dept.id}
                    type="button"
                    aria-pressed={isSelected}
                    onClick={() => setToDept(dept.id)}
                    className={`min-h-16 p-3 rounded-xl border flex flex-col items-center gap-1.5 transition-all text-center ${
                      isSelected
                        ? 'bg-purple-950/80 border-purple-500 text-white shadow-md shadow-purple-900/30 font-bold'
                        : 'bg-slate-950/60 border-slate-800 text-fg-muted hover:text-fg ' +
                          dept.color
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                    <span className="text-[11px]">{dept.label}</span>
                  </button>
                );
              })}
            </div>
          </fieldset>

          {/* Quick Presets based on selected department */}
          {departmentPresets[toDept] && (
            <div>
              <span className="text-[11px] font-semibold text-purple-300/80 uppercase tracking-wider block mb-1.5 flex items-center gap-1">
                <Sparkles className="w-3 h-3 text-purple-400" /> Modelos Rápidos para {toDept}:
              </span>
              <div className="flex flex-wrap gap-1.5">
                {departmentPresets[toDept].map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => handleApplyPreset(preset)}
                    className="px-3 min-h-10 rounded-lg bg-slate-950 border border-slate-800 hover:border-purple-600 text-slate-300 hover:text-white transition-all text-[11px]"
                  >
                    + {preset}
                  </button>
                ))}
              </div>
            </div>
          )}

        <Field label="Título da solicitação" required>
          <Input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Ex: Elaborar minuta de contrato para cliente X"
            required
          />
        </Field>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Field label="Prioridade">
            <Select value={priority} onChange={(e) => setPriority(e.target.value as any)}>
              <option value="LOW">Baixa</option>
              <option value="MEDIUM">Média</option>
              <option value="HIGH">Alta</option>
              <option value="URGENT">Urgente</option>
            </Select>
          </Field>
          <Field label="Prazo desejado (SLA)">
            <DateInput value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
          </Field>
          <Field label="Setor solicitante">
            <Select value={fromDept} onChange={(e) => setFromDept(e.target.value)}>
              <option value="NEGOCIOS">Negócios</option>
              <option value="ADMJURFIN">AdmJurFin</option>
              <option value="GENTE">Gente</option>
              <option value="MIDIAS">Mídias</option>
            </Select>
          </Field>
        </div>
        <Field label="Descrição & requisitos detalhados" required>
          <Textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Explique o que precisa ser feito, valores envolvidos, especificações e contexto para a equipe responsável..."
            required
          />
        </Field>
        <Field label="Link de apoio (Drive, Figma, documento)">
          <Input
            type="url"
            value={attachmentLink}
            onChange={(e) => setAttachmentLink(e.target.value)}
            placeholder="https://drive.google.com/... ou link de briefing"
          />
        </Field>
      </form>
    </Modal>
  );
};

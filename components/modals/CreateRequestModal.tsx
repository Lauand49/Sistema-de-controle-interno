'use client';

import React, { useState, useEffect } from 'react';
import { useProfile } from '@/contexts/ProfileContext';
import { Department } from '@/types';
import { toast } from 'sonner';
import {
  X,
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
import { ModalFrame } from '@/components/ui/Modal';
import { CONTROL_CLASS } from '@/components/ui/Input';

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
    <ModalFrame onClose={onClose} label="Nova solicitação" className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-fadeIn">
      <div className="relative w-full max-w-2xl bg-slate-900 border border-purple-800/50 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="p-5 border-b border-slate-800 flex items-center justify-between bg-gradient-to-r from-purple-950/60 to-slate-900">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-purple-600/20 text-purple-400 border border-purple-500/30">
              <Send className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                Nova Solicitação
              </h2>
              <p className="text-xs text-slate-400">
                Gera automaticamente uma tarefa no funil de entrada do setor responsável
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

        {/* Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4 overflow-y-auto flex-1 text-xs">
          {/* Target Department Selector */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1.5">
              Setor de Destino (Quem deve atender?)
            </label>
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
                    onClick={() => setToDept(dept.id)}
                    className={`p-3 rounded-xl border flex flex-col items-center gap-1.5 transition-all text-center ${
                      isSelected
                        ? 'bg-purple-950/80 border-purple-500 text-white shadow-md shadow-purple-900/30 font-bold'
                        : 'bg-slate-950/60 border-slate-800 text-slate-400 hover:text-white ' +
                          dept.color
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                    <span className="text-[11px]">{dept.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

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
                    className="px-2.5 py-1 rounded-lg bg-slate-950 border border-slate-800 hover:border-purple-600 text-slate-300 hover:text-white transition-all text-[11px]"
                  >
                    + {preset}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Title */}
          <div>
            <label htmlFor="createrequ-1" className="block text-xs font-semibold text-slate-300 mb-1">
              Título da Solicitação
            </label>
            <input id="createrequ-1"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Ex: Elaborar minuta de contrato para cliente X"
              className={`${CONTROL_CLASS} w-full`}
              required
            />
          </div>

          {/* Priority, SLA Due Date & From Department */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label htmlFor="createrequ-2" className="block text-xs font-semibold text-slate-300 mb-1">
                Prioridade
              </label>
              <select id="createrequ-2"
                value={priority}
                onChange={(e) => setPriority(e.target.value as any)}
                className={`${CONTROL_CLASS} w-full`}
              >
                <option value="LOW">Baixa</option>
                <option value="MEDIUM">Média</option>
                <option value="HIGH">Alta</option>
                <option value="URGENT">Urgente</option>
              </select>
            </div>

            <div>
              <label htmlFor="createrequ-3" className="block text-xs font-semibold text-slate-300 mb-1 flex items-center gap-1">
                <Calendar className="w-3 h-3 text-purple-400" /> Prazo Desejado (SLA)
              </label>
              <input id="createrequ-3"
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className={`${CONTROL_CLASS} w-full`}
              />
            </div>

            <div>
              <label htmlFor="createrequ-4" className="block text-xs font-semibold text-slate-300 mb-1">
                Setor Solicitante
              </label>
              <select id="createrequ-4"
                value={fromDept}
                onChange={(e) => setFromDept(e.target.value)}
                className={`${CONTROL_CLASS} w-full`}
              >
                <option value="NEGOCIOS">Negócios</option>
                <option value="ADMJURFIN">AdmJurFin</option>
                <option value="GENTE">Gente</option>
                <option value="MIDIAS">Mídias</option>
              </select>
            </div>
          </div>

          {/* Description */}
          <div>
            <label htmlFor="createrequ-5" className="block text-xs font-semibold text-slate-300 mb-1">
              Descrição & Requisitos Detalhados
            </label>
            <textarea id="createrequ-5"
              rows={4}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Explique o que precisa ser feito, valores envolvidos, especificações e contexto para a equipe responsável..."
              className={`${CONTROL_CLASS} w-full resize-none`}
              required
            />
          </div>

          {/* Attachment Link */}
          <div>
            <label htmlFor="createrequ-6" className="block text-xs font-semibold text-slate-300 mb-1 flex items-center gap-1">
              <Link2 className="w-3.5 h-3.5 text-purple-400" /> Link de Apoio (Drive, Figma, Documento)
            </label>
            <input id="createrequ-6"
              type="url"
              value={attachmentLink}
              onChange={(e) => setAttachmentLink(e.target.value)}
              placeholder="https://drive.google.com/... ou link de briefing"
              className={`${CONTROL_CLASS} w-full`}
            />
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
                'Enviando...'
              ) : (
                <>
                  <Send className="w-3.5 h-3.5" /> Enviar Solicitação
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </ModalFrame>
  );
};

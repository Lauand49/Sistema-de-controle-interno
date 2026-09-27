'use client';

import React, { useState } from 'react';
import {
  Building2,
  User,
  Phone,
  Tag,
  Check,
  X,
  FileText,
  AlertTriangle,
  ChevronDown,
  Sparkles,
} from 'lucide-react';

export interface TriageLead {
  id: string;
  companyName: string;
  contactName?: string | null;
  contactInfo?: string | null;
  segment?: string | null;
  actionPlan: string;
  notes?: string | null;
  status: string;
}

interface LeadDecisionCardProps {
  lead: TriageLead;
  currentIndex: number;
  totalCount: number;
  readOnly?: boolean;
  onApprove: (lead: TriageLead) => void;
  onDiscard: (lead: TriageLead, reason: string) => void;
}

const DEFAULT_DISCARD_REASONS = [
  'Sem perfil / Fora de escopo',
  'Contato inválido / Não atende',
  'Empresa inativa / Fechada',
  'Fora da região atendida',
  'Já atendido anteriormente',
];

export const LeadDecisionCard: React.FC<LeadDecisionCardProps> = ({
  lead,
  currentIndex,
  totalCount,
  readOnly = false,
  onApprove,
  onDiscard,
}) => {
  const [discardReason, setDiscardReason] = useState<string>('');
  const [isDiscardOpen, setIsDiscardOpen] = useState<boolean>(false);
  const [animationClass, setAnimationClass] = useState<string>('');

  const handleApproveClick = () => {
    setAnimationClass('translate-x-16 opacity-0 rotate-3 transition-all duration-200');
    setTimeout(() => {
      onApprove(lead);
      setAnimationClass('');
    }, 200);
  };

  const handleDiscardClick = (reasonToUse?: string) => {
    const finalReason = reasonToUse || discardReason || 'Sem perfil comercial identificado';
    setAnimationClass('-translate-x-16 opacity-0 -rotate-3 transition-all duration-200');
    setTimeout(() => {
      onDiscard(lead, finalReason);
      setAnimationClass('');
      setIsDiscardOpen(false);
      setDiscardReason('');
    }, 200);
  };

  return (
    <div className={`w-full max-w-xl mx-auto transition-transform ${animationClass}`}>
      <div className="relative rounded-3xl bg-slate-900/90 border border-slate-800 shadow-2xl p-7 flex flex-col space-y-6 backdrop-blur-md">
        {/* Top Header Badge & Counter */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-purple-500 animate-pulse" />
            <span className="text-xs font-bold uppercase tracking-wider text-purple-400">
              Decisão de Prospecção
            </span>
          </div>

          <div className="flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-800/80 border border-slate-700/60 text-xs font-semibold text-slate-300">
            <span>Lead</span>
            <strong className="text-white">{currentIndex + 1}</strong>
            <span className="text-slate-500">/</span>
            <span>{totalCount}</span>
          </div>
        </div>

        {/* Company and Segment Info */}
        <div className="space-y-2">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="p-3.5 rounded-2xl bg-purple-950/60 text-purple-300 border border-purple-800/50 shadow-inner">
                <Building2 className="w-7 h-7" />
              </div>
              <div>
                <h3 className="text-2xl font-black text-white tracking-tight leading-tight">
                  {lead.companyName}
                </h3>
                {lead.segment ? (
                  <span className="inline-flex items-center gap-1 mt-1 text-xs font-semibold text-purple-300 bg-purple-950/60 border border-purple-800/40 px-2.5 py-0.5 rounded-full">
                    <Tag className="w-3 h-3" /> {lead.segment}
                  </span>
                ) : (
                  <span className="text-xs text-slate-500 italic">Segmento não informado</span>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Contact Info Section */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 p-4 rounded-2xl bg-slate-950/70 border border-slate-800/60">
          <div className="space-y-1">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1">
              <User className="w-3 h-3 text-purple-400" /> Contato / Decisor
            </span>
            <p className="text-sm font-medium text-slate-200 truncate">
              {lead.contactName || <span className="text-slate-600 italic">Não identificado</span>}
            </p>
          </div>

          <div className="space-y-1">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1">
              <Phone className="w-3 h-3 text-purple-400" /> Telefone / E-mail
            </span>
            <p className="text-sm font-medium text-slate-200 truncate">
              {lead.contactInfo || <span className="text-slate-600 italic">Sem contato direto</span>}
            </p>
          </div>
        </div>

        {/* Context / Initial Notes */}
        {(lead.actionPlan || lead.notes) && (
          <div className="p-4 rounded-2xl bg-slate-950/40 border border-slate-800/50 space-y-2">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1">
              <FileText className="w-3 h-3 text-purple-400" /> Contexto / Anotações Iniciais
            </span>
            <p className="text-xs text-slate-300 leading-relaxed">
              {lead.notes || lead.actionPlan}
            </p>
          </div>
        )}

        {isDiscardOpen ? (
          <div className="p-4 rounded-2xl bg-rose-950/20 border border-rose-900/40 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-rose-300 flex items-center gap-1.5">
                <AlertTriangle className="w-3.5 h-3.5 text-rose-400" /> Motivo do Descarte:
              </span>
              <button
                onClick={() => setIsDiscardOpen(false)}
                className="text-[11px] text-slate-400 hover:text-white"
              >
                Cancelar
              </button>
            </div>

            {/* Quick Reason Pills */}
            <div className="flex flex-wrap gap-1.5">
              {DEFAULT_DISCARD_REASONS.map((reason) => (
                <button
                  key={reason}
                  onClick={() => handleDiscardClick(reason)}
                  className="px-2.5 py-1 rounded-lg text-xs font-medium bg-rose-950/60 hover:bg-rose-900/70 text-rose-200 border border-rose-800/40 transition-colors text-left"
                >
                  {reason}
                </button>
              ))}
            </div>

            <div className="flex gap-2 pt-1">
              <input
                type="text"
                value={discardReason}
                onChange={(e) => setDiscardReason(e.target.value)}
                placeholder="Ou digite uma justificativa personalizada..."
                className="flex-1 bg-slate-900 border border-slate-700 rounded-xl px-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-rose-500"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleDiscardClick();
                  }
                }}
              />
              <button
                onClick={() => handleDiscardClick()}
                className="px-3 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold transition-colors shrink-0"
              >
                Confirmar
              </button>
            </div>
          </div>
        ) : null}

        {/* Action Decision Buttons */}
        {readOnly ? (
          <div className="pt-2">
            <div className="p-3.5 rounded-2xl bg-slate-950/80 border border-slate-800 text-center space-y-1">
              <span className="text-xs font-bold text-amber-300 flex items-center justify-center gap-1.5">
                🔒 Triagem em Modo Somente Leitura
              </span>
              <p className="text-[11px] text-slate-400">
                Aprovação e descarte de leads são restritos à equipe de <strong>Negócios</strong> e Presidência.
              </p>
            </div>
          </div>
        ) : (
          <div className="pt-2 grid grid-cols-2 gap-4">
            {/* Discard Button (Left / ❌) */}
            <button
              onClick={() => {
                if (!isDiscardOpen) {
                  setIsDiscardOpen(true);
                } else {
                  handleDiscardClick();
                }
              }}
              className="group relative flex items-center justify-center gap-3 py-3.5 px-5 rounded-2xl font-bold text-sm bg-rose-950/40 hover:bg-rose-900/60 text-rose-300 border border-rose-800/40 hover:border-rose-600/60 shadow-lg shadow-rose-950/30 transition-all hover:scale-[1.02] active:scale-[0.98]"
            >
              <div className="p-1.5 rounded-xl bg-rose-500/20 text-rose-400 group-hover:bg-rose-500 group-hover:text-white transition-colors">
                <X className="w-4 h-4" />
              </div>
              <span>Descartar</span>
              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-rose-950/80 text-rose-400 border border-rose-800/50">
                ←
              </span>
            </button>

            {/* Approve Button (Right / 💚) */}
            <button
              onClick={handleApproveClick}
              className="group relative flex items-center justify-center gap-3 py-3.5 px-5 rounded-2xl font-bold text-sm bg-emerald-950/40 hover:bg-emerald-900/60 text-emerald-300 border border-emerald-800/40 hover:border-emerald-500/60 shadow-lg shadow-emerald-950/30 transition-all hover:scale-[1.02] active:scale-[0.98]"
            >
              <div className="p-1.5 rounded-xl bg-emerald-500/20 text-emerald-400 group-hover:bg-emerald-500 group-hover:text-white transition-colors">
                <Check className="w-4 h-4" />
              </div>
              <span>Manter & Aprovar</span>
              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-emerald-950/80 text-emerald-400 border border-emerald-800/50">
                →
              </span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

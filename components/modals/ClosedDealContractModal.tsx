'use client';

import React, { useState } from 'react';
import { Card } from '@/types';
import { useProfile } from '@/contexts/ProfileContext';
import { toast } from 'sonner';
import {
  PartyPopper,
  Scale,
  DollarSign,
  ArrowRight,
  X,
  FileCheck2,
  Sparkles,
} from 'lucide-react';

interface ClosedDealContractModalProps {
  card: Card | null;
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

export const ClosedDealContractModal: React.FC<ClosedDealContractModalProps> = ({
  card,
  isOpen,
  onClose,
  onSuccess,
}) => {
  const { currentProfile } = useProfile();
  const [loading, setLoading] = useState(false);

  if (!isOpen || !card) return null;

  // Extract company name and final value if present in card values
  const companyValue =
    card.values?.find((v) => v.field?.name === 'company_name')?.value || card.title;
  const finalVal =
    card.values?.find((v) => v.field?.name === 'final_value')?.value ||
    card.values?.find((v) => v.field?.name === 'proposal_value')?.value ||
    '';

  const handleCreateRequest = async () => {
    if (!currentProfile) {
      toast.error('Você precisa estar logado para disparar a solicitação.');
      return;
    }

    setLoading(true);
    try {
      const description = `🎉 PROJETO FECHADO EM NEGÓCIOS!
Cliente: ${companyValue}
Título do Projeto: ${card.title}
${finalVal ? `Valor Fechado: R$ ${finalVal}` : ''}
${card.description ? `Resumo do Escopo: ${card.description}` : ''}

Ações Solicitadas à AdmJurFin:
1. Redigir minuta de contrato com as cláusulas padrão da SciTec jr.
2. Preparar cobrança/faturamento da primeira parcela (sinal de entrada).`;

      const res = await fetch('/api/requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: `Minuta de Contrato & Faturamento - ${companyValue}`,
          description,
          fromDept: 'NEGOCIOS',
          toDept: 'ADMJURFIN',
          priority: 'HIGH',
          requesterId: currentProfile.id,
          linkedCardId: card.id,
          createTargetCard: true,
        }),
      });

      if (!res.ok) {
        throw new Error('Falha ao disparar solicitação para AdmJurFin.');
      }

      toast.success(
        'Solicitação para AdmJurFin criada com sucesso! Minuta de contrato em andamento.'
      );
      onSuccess?.();
      onClose();
    } catch (err: any) {
      toast.error(err.message || 'Erro ao gerar solicitação.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-fadeIn">
      <div className="relative w-full max-w-md bg-slate-900 border border-emerald-500/50 rounded-2xl shadow-2xl shadow-emerald-950/40 overflow-hidden">
        {/* Confetti / Badge Header */}
        <div className="p-6 bg-gradient-to-b from-emerald-950/60 to-slate-900 text-center relative">
          <button
            onClick={onClose}
            className="absolute top-4 right-4 p-1 text-slate-400 hover:text-white rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>

          <div className="w-14 h-14 mx-auto rounded-2xl bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400 mb-3 shadow-lg">
            <PartyPopper className="w-7 h-7" />
          </div>

          <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-300 bg-emerald-950 border border-emerald-800/60 px-3 py-0.5 rounded-full inline-flex items-center gap-1 mb-1.5">
            <Sparkles className="w-3 h-3 text-emerald-400" /> Projeto Fechado!
          </span>

          <h3 className="text-lg font-black text-white">
            Parabéns pelo Fechamento!
          </h3>
          <p className="text-xs text-slate-300 mt-1 max-w-xs mx-auto">
            O projeto <strong className="text-white">"{card.title}"</strong> foi movido para{' '}
            <span className="text-emerald-400 font-semibold">Fechado/Ganho</span>.
          </p>
        </div>

        {/* Action Prompt */}
        <div className="p-6 pt-2 space-y-4 text-xs">
          <div className="p-3.5 rounded-xl bg-slate-950/70 border border-slate-800 space-y-2">
            <div className="flex items-center gap-2 text-slate-300 font-semibold">
              <Scale className="w-4 h-4 text-blue-400" />
              <span>Gatilho Intersetorial com AdmJurFin:</span>
            </div>
            <p className="text-slate-400 leading-relaxed text-[11px]">
              Deseja abrir imediatamente uma solicitação formal para o setor de{' '}
              <strong className="text-slate-200">AdmJurFin</strong> elaborar a minuta do contrato
              e emitir a cobrança da 1ª parcela?
            </p>
          </div>

          <div className="flex items-center gap-2 pt-2">
            <button
              onClick={onClose}
              disabled={loading}
              className="flex-1 py-2.5 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold transition-colors"
            >
              Agora não
            </button>
            <button
              onClick={handleCreateRequest}
              disabled={loading}
              className="flex-1 py-2.5 px-3 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-bold shadow-lg shadow-emerald-900/30 flex items-center justify-center gap-1.5 transition-all"
            >
              {loading ? (
                'Solicitando...'
              ) : (
                <>
                  <FileCheck2 className="w-4 h-4" /> Solicitar Contrato
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

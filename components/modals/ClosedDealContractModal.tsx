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
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Badge } from '@/components/ui/Display';

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
    <Modal
      title="Parabéns pelo Fechamento!"
      description={`O projeto "${card.title}" foi movido para Fechado/Ganho.`}
      onClose={onClose}
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={loading}>
            Agora não
          </Button>
          <Button icon={FileCheck2} onClick={handleCreateRequest} loading={loading}>
            {loading ? 'Solicitando...' : 'Solicitar Contrato'}
          </Button>
        </>
      }
    >
      <div className="space-y-4 text-center">
        <div className="w-14 h-14 mx-auto rounded-card bg-success-subtle border border-success/40 flex items-center justify-center text-success-soft">
          <PartyPopper className="w-7 h-7" aria-hidden="true" />
        </div>
        <Badge tone="success" icon={Sparkles}>
          Projeto Fechado!
        </Badge>
        <div className="p-3.5 rounded-control bg-surface border border-border space-y-2 text-left">
          <div className="flex items-center gap-2 text-fg text-sm font-semibold">
            <Scale className="w-4 h-4 text-info" aria-hidden="true" />
            <span>Gatilho Intersetorial com AdmJurFin:</span>
          </div>
          <p className="text-fg-muted leading-relaxed text-xs">
            Deseja abrir imediatamente uma solicitação formal para o setor de{' '}
            <strong className="text-fg">AdmJurFin</strong> elaborar a minuta do contrato e emitir a cobrança da 1ª parcela?
          </p>
        </div>
      </div>
    </Modal>
  );
};

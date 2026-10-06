'use client';
import { Button } from '@/components/ui/Button';
import React, { useRef, useState } from 'react';
import { toast } from 'sonner';
import { Loader2, RefreshCw } from 'lucide-react';
import {
  isLeadMinerApiError,
  leadMinerApi,
  reanalyzeConflictReason,
  type CompanyDetail,
} from '@/lib/leads/client-api';

/**
 * Botão "Reanalisar" (Req. 16.1, 16.7). Desabilitado durante a execução (`useRef` + estado), com
 * `aria-busy`. 409 vira toast informativo (RECENTE/EM_CURSO); erro vira toast de erro.
 */
export interface ReanalyzeButtonProps {
  companyId: string;
  onReanalyzed: (company: CompanyDetail) => void;
}

export const ReanalyzeButton: React.FC<ReanalyzeButtonProps> = ({ companyId, onReanalyzed }) => {
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);

  const run = async () => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    try {
      const result = await leadMinerApi.reanalyze(companyId);
      onReanalyzed(result.company);
      toast.success('Empresa reanalisada', {
        description: result.semWebsite ? 'Analisada sem website informado.' : undefined,
      });
    } catch (e) {
      const reason = isLeadMinerApiError(e) ? reanalyzeConflictReason(e) : null;
      if (reason === 'RECENTE') {
        toast.info('Empresa analisada há menos de 10 minutos', {
          description: 'Aguarde para reanalisar novamente.',
        });
      } else if (reason === 'EM_CURSO') {
        toast.info('Reanálise já em andamento para esta empresa');
      } else {
        toast.error('A reanálise não foi concluída', {
          description: isLeadMinerApiError(e) ? e.message : 'Tente novamente.',
        });
      }
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };

  return (
    <Button variant="secondary" size="sm" type="button" onClick={() => void run()} disabled={busy} aria-busy={busy}>
      {busy ? (
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
      ) : (
        <RefreshCw className="h-4 w-4" aria-hidden="true" />
      )}
      {busy ? 'Reanalisando…' : 'Reanalisar'}
    </Button>
  );
};

export default ReanalyzeButton;

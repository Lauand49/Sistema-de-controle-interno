'use client';
import React, { useState } from 'react';
import { toast } from 'sonner';
import { FileText, Loader2 } from 'lucide-react';
import {
  conflictCnpjCompany,
  isLeadMinerApiError,
  leadMinerApi,
  type CompanyDetail,
} from '@/lib/leads/client-api';
import { Field, Muted, Section } from './Section';
import { cnpjOriginLabel } from '@/components/lead-miner/enrichment-helpers';
import { formatDateTime } from './ficha-helpers';
import { CONTROL_CLASS } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Field as FormField } from '@/components/ui/Field';
import { Input } from '@/components/ui/Input';

/**
 * Seção "CNPJ" (Req. 17.3, 11.5–11.8, 11.10, 12.4): CNPJ formatado, origem, Dados_CNPJ e data;
 * candidatos com "Usar este CNPJ"; ações "Informar CNPJ"/"Alterar"/"Remover" com diálogo
 * acessível, mensagem "CNPJ inválido" (400) e conflito com link para a outra empresa (409).
 */
export interface CnpjSectionProps {
  company: CompanyDetail;
  onUpdated: (company: CompanyDetail) => void;
}

export const CnpjSection: React.FC<CnpjSectionProps> = ({ company, onUpdated }) => {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [input, setInput] = useState('');
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [conflict, setConflict] = useState<{ id: string; nome: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const cnpj = company.cnpj;

  const openDialog = () => {
    setInput(cnpj?.formatado ?? '');
    setFieldError(null);
    setConflict(null);
    setDialogOpen(true);
  };

  const submit = async () => {
    if (busy) return;
    setBusy(true);
    setFieldError(null);
    setConflict(null);
    try {
      const { company: updated, lookup } = await leadMinerApi.setCnpj(company.id, input.trim());
      onUpdated(updated);
      setDialogOpen(false);
      toast.success('CNPJ atualizado', { description: lookupNote(lookup) });
    } catch (e) {
      if (isLeadMinerApiError(e) && e.status === 400) {
        setFieldError(e.fields?.cnpj ?? 'CNPJ inválido');
      } else if (isLeadMinerApiError(e) && e.status === 409) {
        setConflict(conflictCnpjCompany(e));
      } else {
        toast.error('Não foi possível salvar o CNPJ', {
          description: isLeadMinerApiError(e) ? e.message : 'Tente novamente.',
        });
      }
    } finally {
      setBusy(false);
    }
  };

  const useCandidate = async (value: string) => {
    setInput(value);
    setDialogOpen(true);
  };

  const remove = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const { company: updated } = await leadMinerApi.removeCnpj(company.id);
      onUpdated(updated);
      toast.success('CNPJ removido');
    } catch (e) {
      toast.error('Não foi possível remover o CNPJ', {
        description: isLeadMinerApiError(e) ? e.message : 'Tente novamente.',
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Section
      id="ficha-cnpj"
      title="CNPJ"
      icon={<FileText className="h-5 w-5 text-purple-400" aria-hidden="true" />}
      actions={
        <div className="flex gap-2">
          <Button variant="secondary" size="sm" type="button" onClick={openDialog}>
            {cnpj ? 'Alterar' : 'Informar CNPJ'}
          </Button>
          {cnpj && (
            <Button variant="danger" size="sm" type="button"  onClick={() => void remove()}  disabled={busy}>
              Remover
            </Button>
          )}
        </div>
      }
    >
      {cnpj ? (
        <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="CNPJ">{cnpj.formatado}</Field>
          <Field label="Origem">{cnpjOriginLabel(cnpj.origem)}</Field>
          {cnpj.dados ? (
            <>
              <Field label="Razão social / fantasia">
                {cnpj.dados.nomeFantasia ?? <Muted>não informado</Muted>}
              </Field>
              <Field label="Situação cadastral">{cnpj.dados.situacao ?? <Muted>não informada</Muted>}</Field>
              <Field label="CNAE">
                {cnpj.dados.cnaeDescricao ?? <Muted>não informado</Muted>}
              </Field>
              <Field label="Porte">{cnpj.dados.porte ?? <Muted>não informado</Muted>}</Field>
            </>
          ) : (
            <Field label="Dados da Receita">
              <Muted>{cnpj.status ?? 'Dados não consultados'}</Muted>
            </Field>
          )}
          {company.lastAnalyzedAt && (
            <Field label="Consultado em">{formatDateTime(company.lastAnalyzedAt) ?? '—'}</Field>
          )}
        </dl>
      ) : (
        <p className="text-sm">
          <Muted>Nenhum CNPJ associado a esta empresa.</Muted>
        </p>
      )}

      {company.cnpjCandidatos.length > 0 && (
        <div className="mt-4">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-400">Candidatos encontrados</h3>
          <ul className="mt-2 space-y-2">
            {company.cnpjCandidatos.map((c) => (
              <li
                key={`${c.cnpj}-${c.motivo}`}
                className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-800 bg-slate-900/40 px-3 py-2 text-sm"
              >
                <span className="text-slate-200">
                  {c.formatado}
                  <span className="ml-2 text-xs text-slate-400">{candidateReason(c.motivo)}</span>
                  {c.conflito && (
                    <a
                      href={`/tools/lead-miner/leads/${encodeURIComponent(c.conflito.id)}`}
                      className="ml-2 rounded text-xs text-purple-300 underline hover:text-purple-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-500"
                    >
                      {c.conflito.nome}
                    </a>
                  )}
                </span>
                {!c.conflito && (
                  <Button variant="secondary" size="sm" type="button" onClick={() => void useCandidate(c.formatado)}>
                    Usar este CNPJ
                  </Button>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {dialogOpen && (
        <Modal
          title={cnpj ? 'Alterar CNPJ' : 'Informar CNPJ'}
          onClose={() => setDialogOpen(false)}
          size="sm"
          footer={
            <>
              <Button variant="secondary" onClick={() => setDialogOpen(false)}>
                Cancelar
              </Button>
              <Button onClick={() => void submit()} disabled={input.trim() === ''} loading={busy}>
                Salvar
              </Button>
            </>
          }
        >
          <div className="space-y-2">
            <FormField label="CNPJ" error={fieldError || undefined}>
              <Input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="00.000.000/0000-00"
              />
            </FormField>
            {conflict && (
              <p role="alert" className="text-xs text-warning-soft">
                CNPJ já vinculado à empresa{' '}
                <a
                  href={`/tools/lead-miner/leads/${encodeURIComponent(conflict.id)}`}
                  className="rounded underline hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
                >
                  {conflict.nome}
                </a>
              </p>
            )}
          </div>
        </Modal>
      )}
    </Section>
  );
};

function lookupNote(lookup: string): string | undefined {
  switch (lookup) {
    case 'OK':
      return 'Dados da Receita atualizados.';
    case 'EM_CACHE':
      return 'Dados da Receita já em cache.';
    case 'NAO_ENCONTRADO':
      return 'CNPJ não encontrado na Receita; o CNPJ foi mantido.';
    case 'INDISPONIVEL':
      return 'Consulta à Receita indisponível; o CNPJ foi mantido.';
    default:
      return undefined;
  }
}

const CANDIDATE_REASON: Record<string, string> = {
  MULTIPLOS: 'vários CNPJs no site',
  CONFLITO: 'já vinculado a outra empresa',
  UF_DIVERGENTE: 'de outra UF',
  NAO_ENCONTRADO: 'não encontrado na Receita',
  MANUAL_PRESERVADO: 'CNPJ manual preservado',
  CONSULTA_DESABILITADA: 'consulta desabilitada na mineração',
};

function candidateReason(motivo: string): string {
  return CANDIDATE_REASON[motivo] ?? motivo;
}

export default CnpjSection;

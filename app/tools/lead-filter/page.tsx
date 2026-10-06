'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import Link from 'next/link';
import { SciTecNavbar } from '@/components/navigation/SciTecNavbar';
import { LeadDecisionCard, TriageLead } from '@/components/tools/LeadDecisionCard';
import { DiscardedLeadsDrawer } from '@/components/tools/DiscardedLeadsDrawer';
import {
  Filter,
  CheckCircle2,
  XCircle,
  RotateCcw,
  Upload,
  ArrowRight,
  FileSpreadsheet,
  Trash2,
  Eye,
  Building2,
  Layers,
  Sparkles,
  ArrowLeft,
  X,
  AlertCircle,
  HelpCircle,
  ShieldAlert,
  Lock,
} from 'lucide-react';
import { toast } from 'sonner';
import * as XLSX from 'xlsx';
import { useProfile } from '@/contexts/ProfileContext';
import { canUseNegociosTools } from '@/lib/permissions';
import { Modal } from '@/components/ui/Modal';
import { Button, ButtonLink } from '@/components/ui/Button';
import { Field } from '@/components/ui/Field';
import { Select } from '@/components/ui/Input';
import { CONTROL_CLASS } from '@/components/ui/Input';
import { LoadingState, ErrorState, EmptyState } from '@/components/ui/Display';
import { PageHeader } from '@/components/ui/Display';

interface HistoryItem {
  lead: TriageLead;
  decision: 'APPROVED' | 'DISCARDED';
  previousStatus: string;
  previousNotes?: string | null;
}

export default function LeadFilterPage() {
  const { currentProfile } = useProfile();
  const canManageLeads = canUseNegociosTools(currentProfile);

  const [queueLeads, setQueueLeads] = useState<TriageLead[]>([]);
  const [currentIndex, setCurrentIndex] = useState<number>(0);
  const [loading, setLoading] = useState<boolean>(true);
  const [sessionApproved, setSessionApproved] = useState<number>(0);
  const [sessionDiscarded, setSessionDiscarded] = useState<number>(0);
  const [historyStack, setHistoryStack] = useState<HistoryItem[]>([]);

  // Discarded Drawer State
  const [isDrawerOpen, setIsDrawerOpen] = useState<boolean>(false);
  const [discardedLeads, setDiscardedLeads] = useState<any[]>([]);

  // Upload Modal State
  const [isUploadModalOpen, setIsUploadModalOpen] = useState<boolean>(false);
  const [parsedPreview, setParsedPreview] = useState<any[] | null>(null);
  const [columns, setColumns] = useState<string[]>([]);
  const [mapping, setMapping] = useState({
    companyName: '',
    contactName: '',
    contactInfo: '',
    segment: '',
    actionPlan: '',
    notes: '',
  });
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Load leads for triage (status RAW or PENDING without notes)
  const fetchTriageData = useCallback(async () => {
    if (!canManageLeads) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      // First fetch RAW leads (freshly uploaded for quick triage)
      const rawRes = await fetch('/api/tools/leads?status=RAW');
      const rawData = await rawRes.json();

      let leadsToTriage: TriageLead[] = rawData.leads || [];

      // If no RAW leads, also check if there are PENDING leads available for triage
      if (leadsToTriage.length === 0) {
        const pendingRes = await fetch('/api/tools/leads?status=PENDING');
        const pendingData = await pendingRes.json();
        leadsToTriage = pendingData.leads || [];
      }

      setQueueLeads(leadsToTriage);
      setCurrentIndex(0);

      // Fetch discarded leads for the drawer
      const discRes = await fetch('/api/tools/leads?status=DISCARDED');
      const discData = await discRes.json();
      setDiscardedLeads(discData.leads || []);
    } catch (err: any) {
      toast.error('Erro ao buscar fila de leads para triagem.');
    } finally {
      setLoading(false);
    }
  }, [canManageLeads]);

  useEffect(() => {
    fetchTriageData();
  }, [fetchTriageData]);

  const currentLead = queueLeads[currentIndex] || null;

  // Decision Handlers
  const handleApprove = async (lead: TriageLead) => {
    if (!canManageLeads) return;
    try {
      const res = await fetch(`/api/tools/leads/${lead.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: 'PENDING',
        }),
      });

      if (!res.ok) throw new Error('Falha ao aprovar lead');

      setHistoryStack((prev) => [
        ...prev,
        {
          lead,
          decision: 'APPROVED',
          previousStatus: lead.status,
          previousNotes: lead.notes,
        },
      ]);

      setSessionApproved((prev) => prev + 1);
      setCurrentIndex((prev) => prev + 1);
      toast.success(`"${lead.companyName}" aprovado para a lista de trabalho!`, {
        duration: 1800,
      });
    } catch (err: any) {
      toast.error(err.message || 'Erro ao processar aprovação.');
    }
  };

  const handleDiscard = async (lead: TriageLead, reason: string) => {
    if (!canManageLeads) return;
    try {
      const res = await fetch(`/api/tools/leads/${lead.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: 'DISCARDED',
          notes: reason,
        }),
      });

      if (!res.ok) throw new Error('Falha ao descartar lead');

      const updatedLead = await res.json();

      setHistoryStack((prev) => [
        ...prev,
        {
          lead,
          decision: 'DISCARDED',
          previousStatus: lead.status,
          previousNotes: lead.notes,
        },
      ]);

      setDiscardedLeads((prev) => [updatedLead, ...prev]);
      setSessionDiscarded((prev) => prev + 1);
      setCurrentIndex((prev) => prev + 1);
      toast.info(`"${lead.companyName}" descartado e arquivado.`, {
        duration: 1800,
      });
    } catch (err: any) {
      toast.error(err.message || 'Erro ao processar descarte.');
    }
  };

  // Undo Decision
  const handleUndo = async () => {
    if (!canManageLeads || historyStack.length === 0 || currentIndex <= 0) return;

    const lastItem = historyStack[historyStack.length - 1];
    try {
      const res = await fetch(`/api/tools/leads/${lastItem.lead.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: lastItem.previousStatus,
          notes: lastItem.previousNotes || null,
        }),
      });

      if (!res.ok) throw new Error('Falha ao reverter decisão');

      setHistoryStack((prev) => prev.slice(0, prev.length - 1));
      if (lastItem.decision === 'APPROVED') {
        setSessionApproved((prev) => Math.max(0, prev - 1));
      } else {
        setSessionDiscarded((prev) => Math.max(0, prev - 1));
        setDiscardedLeads((prev) => prev.filter((l) => l.id !== lastItem.lead.id));
      }

      setCurrentIndex((prev) => Math.max(0, prev - 1));
      toast.info(`Decisão sobre "${lastItem.lead.companyName}" revertida.`);
    } catch (err: any) {
      toast.error(err.message || 'Erro ao reverter ação.');
    }
  };

  // Keyboard Shortcuts Listener
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!canManageLeads) return;
      // Ignore if user is currently typing in an input or textarea
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || isDrawerOpen || isUploadModalOpen) {
        return;
      }

      // Undo shortcut: Ctrl+Z or Cmd+Z
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        handleUndo();
        return;
      }

      if (!currentLead) return;

      // Right arrow -> Approve
      if (e.key === 'ArrowRight' || e.key.toLowerCase() === 's') {
        e.preventDefault();
        handleApprove(currentLead);
      }

      // Left arrow -> Discard with default reason
      if (e.key === 'ArrowLeft' || e.key.toLowerCase() === 'n') {
        e.preventDefault();
        handleDiscard(currentLead, 'Descartado via atalho de teclado');
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [canManageLeads, currentLead, isDrawerOpen, isUploadModalOpen, historyStack, currentIndex]);

  // Drawer handlers
  const handleRestoreFromDrawer = async (leadId: string, targetStatus: 'RAW' | 'PENDING') => {
    if (!canManageLeads) return;
    try {
      const res = await fetch(`/api/tools/leads/${leadId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: targetStatus,
        }),
      });

      if (!res.ok) throw new Error('Erro ao restaurar lead');

      setDiscardedLeads((prev) => prev.filter((l) => l.id !== leadId));
      if (targetStatus === 'RAW') {
        fetchTriageData();
        toast.success('Lead devolvido à fila de triagem!');
      } else {
        toast.success('Lead aprovado para a planilha de trabalho!');
      }
    } catch (err: any) {
      toast.error(err.message || 'Erro ao restaurar lead.');
    }
  };

  const handleDeleteFromDrawer = async (leadId: string) => {
    if (!canManageLeads) return;
    if (!confirm('Deseja excluir este lead permanentemente?')) return;
    try {
      const res = await fetch(`/api/tools/leads/${leadId}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Erro ao excluir');
      setDiscardedLeads((prev) => prev.filter((l) => l.id !== leadId));
      toast.success('Lead excluído permanentemente.');
    } catch (err: any) {
      toast.error(err.message || 'Erro ao excluir.');
    }
  };

  // Handle Excel Upload
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const bstr = evt.target?.result;
        const wb = XLSX.read(bstr, { type: 'array' });
        const wsname = wb.SheetNames[0];
        const ws = wb.Sheets[wsname];
        const rawData = XLSX.utils.sheet_to_json<Record<string, any>>(ws, { defval: '' });

        if (rawData.length === 0) {
          toast.error('A planilha importada está vazia.');
          return;
        }

        const detectedCols = Object.keys(rawData[0]);
        setColumns(detectedCols);

        // Auto-match headers
        setMapping({
          companyName: detectedCols.find((c) => /empresa|nome|company|cliente|razao/i.test(c)) || detectedCols[0] || '',
          contactName: detectedCols.find((c) => /contato|decisor|responsavel/i.test(c)) || '',
          contactInfo: detectedCols.find((c) => /telefone|email|whatsapp|celular|phone/i.test(c)) || '',
          segment: detectedCols.find((c) => /segmento|nicho|setor|industria/i.test(c)) || '',
          actionPlan: detectedCols.find((c) => /acao|abordagem|plano|fazer|action/i.test(c)) || '',
          notes: detectedCols.find((c) => /obs|observac|notas|contexto/i.test(c)) || '',
        });

        setParsedPreview(rawData);
        toast.success(`Planilha "${file.name}" processada! ${rawData.length} leads prontos para mapeamento.`);
      } catch (err: any) {
        toast.error('Erro ao ler planilha.');
      }
    };
    reader.readAsArrayBuffer(file);
  };

  const handleSaveBatchToTriage = async () => {
    if (!canManageLeads) {
      toast.error('Apenas membros de Negócios e Presidência podem importar leads.');
      return;
    }
    if (!parsedPreview || !mapping.companyName) {
      toast.error('Selecione a coluna do Nome da Empresa.');
      return;
    }

    const formattedLeads = parsedPreview.map((row) => ({
      companyName: String(row[mapping.companyName] || 'Empresa Sem Nome'),
      contactName: mapping.contactName ? String(row[mapping.contactName] || '') : '',
      contactInfo: mapping.contactInfo ? String(row[mapping.contactInfo] || '') : '',
      segment: mapping.segment ? String(row[mapping.segment] || '') : '',
      actionPlan: mapping.actionPlan ? String(row[mapping.actionPlan] || '') : 'Aguardando definição de abordagem',
      notes: mapping.notes ? String(row[mapping.notes] || '') : '',
      status: 'RAW',
    }));

    try {
      const res = await fetch('/api/tools/leads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          leads: formattedLeads,
          defaultStatus: 'RAW',
        }),
      });

      if (!res.ok) throw new Error('Erro ao salvar lote de leads');

      toast.success(`${formattedLeads.length} leads carregados para a Triagem Rápida!`);
      setIsUploadModalOpen(false);
      setParsedPreview(null);
      fetchTriageData();
    } catch (err: any) {
      toast.error(err.message || 'Erro ao salvar leads.');
    }
  };

  const progressPercent =
    queueLeads.length > 0 ? Math.min(100, Math.round((currentIndex / queueLeads.length) * 100)) : 0;

  const closeUpload = () => {
    setIsUploadModalOpen(false);
    setParsedPreview(null);
  };

  return (
    <div className="min-h-screen flex flex-col bg-slate-950 text-slate-100 selection:bg-purple-500 selection:text-white">
      <SciTecNavbar />

      <main className="flex-1 min-w-0 max-w-7xl w-full mx-auto p-4 md:p-6 space-y-6 flex flex-col">
        {/* Navigation & Header Bar */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-2 border-b border-slate-800">
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-xs font-semibold text-purple-400">
              <Link href="/setores/negocios?tab=TOOLS" className="hover:underline flex items-center gap-1">
                <ArrowLeft className="w-3.5 h-3.5" /> Ferramentas de Negócios
              </Link>
              <span className="text-slate-600">/</span>
              <span className="text-slate-300">Triagem Rápida de Leads</span>
            </div>
            <PageHeader icon={Filter} title="Triagem Rápida de Leads" subtitle="Qualificação preliminar ágil: aprove leads com perfil comercial ou descarte-os com justificativa." />
          </div>

          {canManageLeads && (
            <div className="flex items-center flex-wrap gap-2.5">
              {/* Undo Button */}
              <Button variant="secondary" size="sm" onClick={handleUndo} disabled={!canManageLeads || historyStack.length === 0 || currentIndex === 0} title="Desfazer última decisão (Ctrl+Z)">
                <RotateCcw className="w-3.5 h-3.5 text-amber-400" />
                <span>Desfazer</span>
              </Button>

              {/* Hidden Discarded Drawer Button */}
              <button
                onClick={() => setIsDrawerOpen(true)}
                className="px-3.5 py-2 rounded-xl text-xs font-semibold bg-rose-950/40 hover:bg-rose-900/60 border border-rose-800/40 text-rose-300 flex items-center gap-2 transition-all"
              >
                <Eye className="w-3.5 h-3.5 text-rose-400" />
                <span>Ver Descartados</span>
                <span className="px-1.5 py-0.5 rounded-full bg-rose-950 border border-rose-800/60 text-[11px] font-bold">
                  {discardedLeads.length}
                </span>
              </button>

              {/* Upload Spreadsheet Button */}
              <button
                onClick={() => setIsUploadModalOpen(true)}
                className="px-3.5 py-2 rounded-xl text-xs font-semibold bg-purple-950/60 hover:bg-purple-900/80 border border-purple-700/50 text-purple-200 flex items-center gap-2 transition-all"
              >
                <Upload className="w-3.5 h-3.5 text-purple-400" />
                <span>Subir Planilha</span>
              </button>

              {/* Go to Work Sheet */}
              <Link
                href="/tools/lead-sheet"
                className="px-3.5 py-2 rounded-xl text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 flex items-center gap-1.5 transition-all"
              >
                <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-400" />
                <span>Planilha de Leads</span>
              </Link>
            </div>
          )}
        </div>

        {/* Módulo Exclusivo: Bloqueio Total para Outros Setores */}
        {!canManageLeads ? (
          <ErrorState
            icon={Lock}
            tone="warning"
            title="Acesso restrito: módulo exclusivo de Negócios"
            description="A triagem rápida e a qualificação de leads são confidenciais e de uso interno da Diretoria de Negócios. Membros de outros setores (Mídias, Gente ou AdmJurFin) não têm autorização para avaliar ou visualizar a base de leads da SciTec jr."
            action={
              <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
                <Link
                  href="/setores/negocios"
                  className="inline-flex items-center min-h-10 px-5 rounded-control bg-primary hover:bg-primary-hover text-white font-bold text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
                >
                  Ir para o Setor de Negócios
                </Link>
                <Link
                  href="/"
                  className="inline-flex items-center min-h-10 px-5 rounded-control bg-surface-overlay hover:bg-border-strong text-fg font-semibold text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
                >
                  Voltar à Página Inicial
                </Link>
              </div>
            }
            className="max-w-lg mx-auto"
          />
        ) : (
          <>

        {/* Progress and Live Counters Bar */}
        {queueLeads.length > 0 && currentIndex < queueLeads.length && (
          <div className="bg-slate-900/60 border border-slate-800/80 rounded-2xl p-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-400 font-medium">Progresso da Triagem:</span>
                <span className="text-sm font-bold text-white">
                  {currentIndex} de {queueLeads.length}
                </span>
                <span className="text-xs font-bold text-purple-400 bg-purple-950/80 px-2 py-0.5 rounded-full border border-purple-800/50">
                  {progressPercent}%
                </span>
              </div>
            </div>

            <div className="flex-1 max-w-md mx-auto w-full bg-slate-950 rounded-full h-2.5 overflow-hidden border border-slate-800">
              <div
                className="bg-gradient-to-r from-purple-500 to-indigo-500 h-full rounded-full transition-all duration-300"
                style={{ width: `${progressPercent}%` }}
              />
            </div>

            <div className="flex items-center gap-4 text-xs">
              <span className="flex items-center gap-1.5 text-emerald-400 font-semibold bg-emerald-950/40 px-2.5 py-1 rounded-lg border border-emerald-800/40">
                <CheckCircle2 className="w-3.5 h-3.5" /> {sessionApproved} Aprovados
              </span>
              <span className="flex items-center gap-1.5 text-rose-400 font-semibold bg-rose-950/40 px-2.5 py-1 rounded-lg border border-rose-800/40">
                <XCircle className="w-3.5 h-3.5" /> {sessionDiscarded} Descartados
              </span>
            </div>
          </div>
        )}

        {/* Main Content Area */}
        <div className="flex-1 flex flex-col items-center justify-center py-4">
          {loading ? (
            <LoadingState label="Carregando leads para a triagem…" className="py-16" />
          ) : queueLeads.length === 0 ? (
            /* Empty Queue State */
            <EmptyState
              icon={Layers}
              title="Nenhum lead pendente de triagem"
              description="Importe uma planilha de prospecção (.xlsx ou .csv) para iniciar a qualificação individual de leads."
              className="max-w-md w-full"
              action={
                <div className="pt-2 flex flex-col gap-2.5">
                {canManageLeads ? (
                  <button
                    onClick={() => setIsUploadModalOpen(true)}
                    className="w-full py-3 px-4 rounded-xl text-xs font-bold bg-purple-600 hover:bg-purple-500 text-white flex items-center justify-center gap-2 transition-all shadow-lg shadow-purple-900/30"
                  >
                    <Upload className="w-4 h-4" /> Importar Planilha de Leads
                  </button>
                ) : (
                  <div className="w-full py-3 px-4 rounded-xl text-xs font-medium bg-slate-950/80 border border-slate-800 text-slate-400 text-center">
                    <Lock className="w-3.5 h-3.5 inline mr-1 -mt-0.5" aria-hidden="true" />Importação de leads restrita a Negócios
                  </div>
                )}
                <Link
                  href="/tools/lead-sheet"
                  className="w-full py-2.5 px-4 rounded-xl text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-slate-300 flex items-center justify-center gap-2 transition-colors"
                >
                  <FileSpreadsheet className="w-4 h-4 text-emerald-400" /> Acessar Planilha Existente
                </Link>
              </div>
              }
            />
          ) : currentIndex >= queueLeads.length ? (
            /* Completed Queue State */
            <EmptyState
              icon={CheckCircle2}
              title="Triagem Concluída!"
              description="Todos os leads da fila foram avaliados. Os leads aprovados já estão disponíveis para a equipe comercial na planilha de trabalho."
              className="max-w-lg w-full"
              action={
                <div className="w-full space-y-4 pt-2">
                  {/* Session Summary Card */}
              <div className="grid grid-cols-2 gap-3 p-4 rounded-2xl bg-slate-950/70 border border-slate-800/80">
                <div className="text-center p-3 rounded-xl bg-emerald-950/30 border border-emerald-800/30">
                  <span className="text-2xl font-black text-emerald-300">{sessionApproved}</span>
                  <p className="text-[11px] text-emerald-400 font-semibold mt-0.5">Leads Aprovados</p>
                </div>
                <div className="text-center p-3 rounded-xl bg-rose-950/30 border border-rose-800/30">
                  <span className="text-2xl font-black text-rose-300">{sessionDiscarded}</span>
                  <p className="text-[11px] text-rose-400 font-semibold mt-0.5">Leads Descartados</p>
                </div>
              </div>
                  <div className="flex flex-col sm:flex-row gap-3 justify-center">
                    <ButtonLink href="/tools/lead-sheet" icon={FileSpreadsheet}>
                      Ver Planilha de Leads
                    </ButtonLink>
                    <Button variant="secondary" onClick={() => setIsDrawerOpen(true)}>
                      <Eye className="w-4 h-4" aria-hidden="true" /> Ver Descartados ({discardedLeads.length})
                    </Button>
                  </div>
                </div>
              }
            />
          ) : (
            /* Active Triage Decision Card */
            <div className="w-full flex flex-col items-center space-y-4">
              <LeadDecisionCard
                lead={currentLead}
                currentIndex={currentIndex}
                totalCount={queueLeads.length}
                readOnly={!canManageLeads}
                onApprove={handleApprove}
                onDiscard={handleDiscard}
              />

              {/* Keyboard Shortcuts Hint */}
              {canManageLeads && (
                <div className="flex items-center justify-center gap-6 text-[11px] text-slate-400 pt-2 font-medium">
                  <span className="flex items-center gap-1.5">
                    <kbd className="px-2 py-0.5 rounded bg-slate-800 border border-slate-700 text-slate-300 font-mono text-[11px]">
                      ←
                    </kbd>{' '}
                    ou{' '}
                    <kbd className="px-2 py-0.5 rounded bg-slate-800 border border-slate-700 text-slate-300 font-mono text-[11px]">
                      N
                    </kbd>{' '}
                    Descartar
                  </span>
                  <span className="flex items-center gap-1.5">
                    <kbd className="px-2 py-0.5 rounded bg-slate-800 border border-slate-700 text-slate-300 font-mono text-[11px]">
                      →
                    </kbd>{' '}
                    ou{' '}
                    <kbd className="px-2 py-0.5 rounded bg-slate-800 border border-slate-700 text-slate-300 font-mono text-[11px]">
                      S
                    </kbd>{' '}
                    Aprovar
                  </span>
                  <span className="flex items-center gap-1.5">
                    <kbd className="px-2 py-0.5 rounded bg-slate-800 border border-slate-700 text-slate-300 font-mono text-[11px]">
                      Ctrl+Z
                    </kbd>{' '}
                    Desfazer
                  </span>
                </div>
              )}
            </div>
          )}
        </div>
      </>
    )}
  </main>

  {/* Discarded Leads Drawer */}
  {canManageLeads && (
    <DiscardedLeadsDrawer
      isOpen={isDrawerOpen}
      onClose={() => setIsDrawerOpen(false)}
      discardedLeads={discardedLeads}
      onRestoreLead={handleRestoreFromDrawer}
      onDeleteLead={handleDeleteFromDrawer}
    />
  )}

      {/* Upload Spreadsheet Modal */}
      {isUploadModalOpen && (
        <Modal
          title="Importar Planilha para Triagem"
          description="Carregue um arquivo .xlsx ou .csv para avaliar os leads um a um"
          onClose={closeUpload}
          closeOnBackdrop={false}
          footer={
            parsedPreview ? (
              <>
                <Button variant="ghost" onClick={closeUpload}>
                  Cancelar
                </Button>
                <Button onClick={handleSaveBatchToTriage}>Iniciar Triagem</Button>
              </>
            ) : undefined
          }
        >
          {!parsedPreview ? (
            <>
            <input ref={fileInputRef} type="file" accept=".xlsx,.xls,.csv" onChange={handleFileChange} className="hidden" aria-label="Arquivo da planilha" />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="w-full min-h-40 border-2 border-dashed border-border-strong hover:border-primary-soft rounded-card p-8 flex flex-col items-center justify-center text-center transition-colors bg-surface group space-y-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
            >
              <span className="p-4 rounded-full bg-primary-subtle text-primary-soft group-hover:scale-110 transition-transform">
                <FileSpreadsheet className="w-8 h-8" aria-hidden="true" />
              </span>
              <span className="space-y-1">
                <span className="block text-sm font-semibold text-fg">Clique para selecionar a planilha</span>
                <span className="block text-xs text-fg-muted">Formatos aceitos: Excel (.xlsx, .xls) ou CSV</span>
              </span>
            </button>
            </>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center justify-between gap-3 bg-primary-subtle border border-primary/30 p-3 rounded-control text-xs text-primary-soft">
                <span className="font-semibold">{parsedPreview.length} leads detectados na planilha.</span>
                <Button variant="ghost" size="sm" onClick={() => setParsedPreview(null)}>
                  Trocar arquivo
                </Button>
              </div>
              <div className="space-y-3">
                <h4 className="text-xs font-bold uppercase tracking-wider text-fg-muted">Confirme o mapeamento das colunas:</h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                <Field label="Nome da empresa" required>
                  <Select value={mapping.companyName} onChange={(e) => setMapping({ ...mapping, companyName: e.target.value })}>

                    {columns.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Contato / decisor">
                  <Select value={mapping.contactName} onChange={(e) => setMapping({ ...mapping, contactName: e.target.value })}>
                    <option value="">-- Não mapear --</option>
                    {columns.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Telefone / e-mail">
                  <Select value={mapping.contactInfo} onChange={(e) => setMapping({ ...mapping, contactInfo: e.target.value })}>
                    <option value="">-- Não mapear --</option>
                    {columns.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Segmento / setor">
                  <Select value={mapping.segment} onChange={(e) => setMapping({ ...mapping, segment: e.target.value })}>
                    <option value="">-- Não mapear --</option>
                    {columns.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </Select>
                </Field>
                </div>
              </div>
            </div>
          )}
        </Modal>
      )}
    </div>
  );
}

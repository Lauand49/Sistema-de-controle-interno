'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import * as XLSX from 'xlsx';
import { SciTecNavbar } from '@/components/navigation/SciTecNavbar';
import { ProspectLead, LeadProspectStatus, User, getUserCargoTitle } from '@/types';
import { ConvertLeadModal } from '@/components/modals/ConvertLeadModal';
import { useProfile } from '@/contexts/ProfileContext';
import {
  FileSpreadsheet,
  Upload,
  Search,
  CheckCircle2,
  AlertCircle,
  ArrowRight,
  ArrowLeft,
  Filter,
  Trash2,
  Save,
  Sparkles,
  ExternalLink,
  RefreshCw,
  Zap,
  Download,
  Calendar,
  User as UserIcon,
  Phone,
  Users,
  EyeOff,
  Eye,
  ChevronDown,
  RotateCcw,
  Ban,
  Building2,
  Clock,
  Briefcase,
  ShieldAlert,
  Lock,
} from 'lucide-react';
import { toast } from 'sonner';

type TabType = 'TRIAGE' | 'MEETING';

function formatMeetingDate(dateStr?: string | null) {
  if (!dateStr) return 'Data a definir';
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    return d.toLocaleString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return dateStr;
  }
}

export default function LeadSheetPage() {
  const router = useRouter();
  const { currentProfile } = useProfile();

  // Permission: Only Negócios members and President can manage leads
  const isPresident =
    currentProfile?.role?.toUpperCase() === 'PRESIDENTE' ||
    currentProfile?.primaryDept === 'GLOBAL';
  const isNegociosMember =
    currentProfile?.primaryDept?.toUpperCase() === 'NEGOCIOS';
  const canManageLeads = Boolean(currentProfile && (isPresident || isNegociosMember));

  const [leads, setLeads] = useState<ProspectLead[]>([]);
  const [users, setUsers] = useState<User[]>([]);

  // Users who can be assigned leads (Negócios + Presidência)
  const negociosUsers = users.filter((u) => u.primaryDept?.toUpperCase() === 'NEGOCIOS');
  const presidenciaUsers = users.filter(
    (u) => u.role?.toUpperCase() === 'PRESIDENTE' && u.primaryDept?.toUpperCase() !== 'NEGOCIOS'
  );
  const eligibleAssignees = [...negociosUsers, ...presidenciaUsers];
  const [activeTab, setActiveTab] = useState<TabType>('TRIAGE');
  const [showDiscardedDrawer, setShowDiscardedDrawer] = useState<boolean>(false);
  const [stats, setStats] = useState({
    total: 0,
    pending: 0,
    inProgress: 0,
    converted: 0,
    discarded: 0,
  });
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');

  // Convert Lead Modal State
  const [convertingLead, setConvertingLead] = useState<ProspectLead | null>(null);

  // File Upload & Mapping State
  const [isUploading, setIsUploading] = useState(false);
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

  const fetchData = async () => {
    if (!canManageLeads) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const url = new URL('/api/tools/leads', window.location.origin);
      if (statusFilter !== 'ALL') url.searchParams.set('status', statusFilter);
      if (searchQuery) url.searchParams.set('q', searchQuery);

      const [leadsRes, usersRes] = await Promise.all([
        fetch(url.toString()),
        fetch('/api/users'),
      ]);

      if (!leadsRes.ok || !usersRes.ok) throw new Error('Erro ao carregar dados do servidor.');

      const leadsData = await leadsRes.json();
      const usersData = await usersRes.json();

      setLeads(leadsData.leads || []);
      setUsers(usersData || []);
      setStats(
        leadsData.stats || {
          total: 0,
          pending: 0,
          inProgress: 0,
          converted: 0,
          discarded: 0,
        }
      );
    } catch (err: any) {
      toast.error(err.message || 'Erro ao carregar dados.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [statusFilter, searchQuery]);

  // Handle Excel File Drop / Upload
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
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
          setIsUploading(false);
          return;
        }

        const detectedCols = Object.keys(rawData[0]);
        setColumns(detectedCols);

        // Auto-match columns based on header keywords
        const newMap = {
          companyName:
            detectedCols.find((c) =>
              /empresa|nome|company|cliente|razao/i.test(c)
            ) || detectedCols[0] || '',
          contactName:
            detectedCols.find((c) => /contato|decisor|responsavel/i.test(c)) || '',
          contactInfo:
            detectedCols.find((c) => /telefone|email|whatsapp|celular|phone/i.test(c)) || '',
          segment:
            detectedCols.find((c) => /segmento|nicho|setor|industria/i.test(c)) || '',
          actionPlan:
            detectedCols.find((c) => /acao|abordagem|plano|fazer|action/i.test(c)) || '',
          notes:
            detectedCols.find((c) => /obs|observac|notas|contexto/i.test(c)) || '',
        };

        setMapping(newMap);
        setParsedPreview(rawData);
        toast.success(`Planilha "${file.name}" lida com sucesso! ${rawData.length} linhas encontradas.`);
      } catch (err: any) {
        toast.error('Erro ao processar planilha. Verifique o formato do arquivo.');
      } finally {
        setIsUploading(false);
      }
    };

    reader.readAsArrayBuffer(file);
  };

  // Save Parsed Batch to Database
  const handleSaveBatch = async () => {
    if (!parsedPreview || !mapping.companyName) {
      toast.error('Selecione a coluna correspondente ao Nome da Empresa.');
      return;
    }

    const formattedLeads = parsedPreview.map((row) => ({
      companyName: String(row[mapping.companyName] || 'Empresa Sem Nome'),
      contactName: mapping.contactName ? String(row[mapping.contactName] || '') : '',
      contactInfo: mapping.contactInfo ? String(row[mapping.contactInfo] || '') : '',
      segment: mapping.segment ? String(row[mapping.segment] || '') : '',
      actionPlan: mapping.actionPlan
        ? String(row[mapping.actionPlan] || '')
        : 'Qualificar interesse e agendar reunião de diagnóstico',
      notes: mapping.notes ? String(row[mapping.notes] || '') : '',
    }));

    try {
      const res = await fetch('/api/tools/leads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ leads: formattedLeads }),
      });

      if (!res.ok) throw new Error('Erro ao salvar lote de leads.');

      const result = await res.json();
      toast.success(`${result.count} leads importados com sucesso!`);
      setParsedPreview(null);
      fetchData();
    } catch (err: any) {
      toast.error(err.message || 'Erro ao importar.');
    }
  };

  // Update Lead Details
  const handleUpdateLead = async (id: string, updates: Partial<ProspectLead>) => {
    try {
      const res = await fetch(`/api/tools/leads/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });

      if (!res.ok) throw new Error('Erro ao atualizar lead.');

      setLeads((prev) =>
        prev.map((l) => (l.id === id ? { ...l, ...updates } : l))
      );
      toast.success('Lead atualizado.');
    } catch (err: any) {
      toast.error(err.message || 'Erro ao atualizar.');
    }
  };

  // Discard Lead (Send to hidden list)
  const handleDiscardLead = async (id: string) => {
    try {
      const res = await fetch(`/api/tools/leads/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'DISCARDED' }),
      });

      if (!res.ok) throw new Error('Erro ao descartar lead.');

      setLeads((prev) =>
        prev.map((l) => (l.id === id ? { ...l, status: 'DISCARDED' as LeadProspectStatus } : l))
      );
      setStats((prev) => ({
        ...prev,
        pending: Math.max(0, prev.pending - 1),
        discarded: prev.discarded + 1,
      }));

      toast.success('Lead descartado e movido para a lista oculta.', {
        action: {
          label: 'Desfazer',
          onClick: () => handleRestoreLead(id),
        },
        duration: 5000,
      });
    } catch (err: any) {
      toast.error(err.message || 'Erro ao descartar.');
    }
  };

  // Restore Lead from Discarded (Return to active triage)
  const handleRestoreLead = async (id: string) => {
    try {
      const res = await fetch(`/api/tools/leads/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'PENDING' }),
      });

      if (!res.ok) throw new Error('Erro ao restaurar lead.');

      setLeads((prev) =>
        prev.map((l) => (l.id === id ? { ...l, status: 'PENDING' as LeadProspectStatus } : l))
      );
      setStats((prev) => ({
        ...prev,
        pending: prev.pending + 1,
        discarded: Math.max(0, prev.discarded - 1),
      }));

      toast.success('Lead restaurado para a triagem ativa!');
    } catch (err: any) {
      toast.error(err.message || 'Erro ao restaurar.');
    }
  };

  // Revert Conversion back to Triage
  const handleRevertLead = async (id: string) => {
    if (!confirm('Deseja reverter este lead de volta para a lista de triagem?')) return;
    try {
      const res = await fetch(`/api/tools/leads/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'IN_PROGRESS' }),
      });

      if (!res.ok) throw new Error('Erro ao reverter lead.');

      setLeads((prev) =>
        prev.map((l) => (l.id === id ? { ...l, status: 'IN_PROGRESS' as LeadProspectStatus } : l))
      );
      setStats((prev) => ({
        ...prev,
        inProgress: prev.inProgress + 1,
        converted: Math.max(0, prev.converted - 1),
      }));

      toast.success('Lead revertido para a triagem ativa.');
    } catch (err: any) {
      toast.error(err.message || 'Erro ao reverter.');
    }
  };

  // Callback when lead is converted via modal -> Automatically switch to Meeting tab
  const handleConversionSuccess = (newCardId: string) => {
    setActiveTab('MEETING');
    toast.success('Lead convertido! Nova plaquinha gerada na aba "Reunião Marcada".', {
      action: {
        label: 'Ver no Funil ➔',
        onClick: () => router.push(`/pipe?openCard=${newCardId}`),
      },
      duration: 7000,
    });
    fetchData();
  };

  // Delete Lead permanently
  const handleDeleteLead = async (id: string) => {
    if (!confirm('Deseja excluir permanentemente este lead?')) return;

    try {
      const res = await fetch(`/api/tools/leads/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Erro ao excluir.');

      toast.success('Lead removido.');
      fetchData();
    } catch (err: any) {
      toast.error(err.message || 'Erro ao excluir.');
    }
  };

  const [assigneeFilter, setAssigneeFilter] = useState<string>('ALL');

  // Partition leads for views
  let triageLeads = leads.filter(
    (l) => l.status === 'PENDING' || l.status === 'IN_PROGRESS'
  );

  if (assigneeFilter !== 'ALL') {
    if (assigneeFilter === 'UNASSIGNED') {
      triageLeads = triageLeads.filter((l) => !l.assignedTo);
    } else {
      triageLeads = triageLeads.filter((l) => l.assignedTo === assigneeFilter);
    }
  }

  const meetingLeads = leads.filter((l) => l.status === 'CONVERTED_TO_PIPE');
  const discardedLeads = leads.filter((l) => l.status === 'DISCARDED');

  return (
    <div className="min-h-screen flex flex-col bg-slate-950 text-slate-100">
      <SciTecNavbar />

      <main className="flex-1 max-w-7xl w-full mx-auto p-6 space-y-6">
        {/* Header & Stats Banner */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-gradient-to-r from-purple-950/80 via-slate-900 to-indigo-950/80 border border-purple-800/40 p-6 rounded-2xl shadow-xl">
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-xs font-semibold text-purple-400 pb-1">
              <Link href="/setores/negocios?tab=TOOLS" className="hover:underline flex items-center gap-1">
                <ArrowLeft className="w-3.5 h-3.5" /> Ferramentas de Negócios
              </Link>
              <span className="text-slate-600">/</span>
              <span className="text-slate-300">Planilha de Leads</span>
            </div>
            <div className="flex items-center gap-2 text-xs font-bold text-purple-300">
              <FileSpreadsheet className="w-4 h-4 text-purple-400" /> Ferramenta de Prospecção SciTec
            </div>
            <h2 className="text-2xl font-black text-white">
              Anotação e Triagem de Leads via Planilha
            </h2>
            <p className="text-xs text-purple-200/70">
              Importe listas de prospecção em Excel/CSV, anote o plano de ação de cada lead e converta direto para a fase "Reunião marcada" do Funil SciTec.
            </p>
          </div>

          <div className="flex items-center gap-3 shrink-0 flex-wrap">
            <Link
              href="/tools/lead-filter"
              className="px-4 py-2.5 rounded-xl bg-purple-900/60 hover:bg-purple-800/80 border border-purple-600/50 text-purple-200 font-bold text-xs flex items-center justify-center gap-2 shadow transition-all hover:scale-[1.02]"
              title="Abrir modo de decisão rápida individual de leads"
            >
              <Filter className="w-4 h-4 text-purple-300" /> Triagem Rápida ⚡
            </Link>

            <a
              href="/planilha_teste_leads_scitec.xlsx"
              download="planilha_teste_leads_scitec.xlsx"
              className="px-4 py-2.5 rounded-xl bg-purple-950/80 hover:bg-purple-900 border border-purple-700/60 text-purple-200 font-bold text-xs flex items-center justify-center gap-2 shadow transition-colors"
              title="Baixar planilha de teste com 5 leads reais da SciTec"
            >
              <Download className="w-4 h-4 text-purple-400" /> Baixar Planilha Teste (.xlsx)
            </a>

            {canManageLeads ? (
              <label className="cursor-pointer px-5 py-2.5 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-bold text-xs flex items-center justify-center gap-2 shadow-lg shadow-purple-900/40 transition-all transform hover:-translate-y-0.5">
                <Upload className="w-4 h-4" /> Importar Planilha (.xlsx/.csv)
                <input
                  type="file"
                  accept=".xlsx, .xls, .csv"
                  onChange={handleFileUpload}
                  className="hidden"
                />
              </label>
            ) : (
              <div className="px-4 py-2.5 rounded-xl bg-slate-900/90 border border-slate-800 text-xs text-slate-500 font-medium flex items-center justify-center gap-2">
                🔒 Importação restrita a Negócios
              </div>
            )}
          </div>
        </div>

        {/* Módulo Exclusivo: Bloqueio Total para Outros Setores */}
        {!canManageLeads ? (
          <div className="py-20 flex flex-col items-center justify-center text-center space-y-6 max-w-lg mx-auto bg-slate-900/50 border border-slate-800 p-8 rounded-3xl shadow-2xl animate-in fade-in duration-200">
            <div className="w-16 h-16 rounded-3xl bg-amber-950/70 border border-amber-700/60 text-amber-400 flex items-center justify-center shadow-xl shadow-amber-950/40">
              <Lock className="w-8 h-8" />
            </div>
            <div className="space-y-2">
              <span className="text-xs font-extrabold uppercase tracking-wider text-amber-400 bg-amber-950/80 px-3 py-1 rounded-full border border-amber-800/60">
                Acesso Restrito
              </span>
              <h2 className="text-2xl font-black text-white">
                Módulo Exclusivo e Interno de Negócios
              </h2>
              <p className="text-xs text-slate-400 leading-relaxed">
                A anotação, triagem e designação de leads é confidencial e de uso estritamente interno da Diretoria de <strong>Negócios</strong>. Membros de outros setores (Mídias, Gente ou AdmJurFin) não possuem autorização para visualizar ou manipular a carteira de prospecção da SciTec jr.
              </p>
            </div>
            <div className="flex items-center gap-3 pt-2">
              <Link
                href="/setores/negocios"
                className="px-5 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-bold text-xs transition-colors shadow-lg shadow-purple-900/30"
              >
                Ir para o Setor de Negócios
              </Link>
              <Link
                href="/"
                className="px-5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold text-xs transition-colors"
              >
                Voltar à Página Inicial
              </Link>
            </div>
          </div>
        ) : (
          <>

        {/* Stats Quick Overview (Clickable Tabs/Filters) */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
          <div className="bg-slate-900/80 border border-slate-800 p-3.5 rounded-xl flex items-center justify-between">
            <span className="text-slate-400 font-medium">Total de Leads:</span>
            <span className="font-extrabold text-white text-sm">{stats.total}</span>
          </div>

          <button
            onClick={() => setActiveTab('TRIAGE')}
            className={`p-3.5 rounded-xl flex items-center justify-between transition-all text-left border ${
              activeTab === 'TRIAGE'
                ? 'bg-purple-950/80 border-purple-600 shadow-lg shadow-purple-900/30'
                : 'bg-slate-900/80 border-purple-900/40 hover:border-purple-700'
            }`}
          >
            <span className="text-purple-300 font-medium">Leads em Triagem:</span>
            <span className="font-extrabold text-purple-200 text-sm">{triageLeads.length}</span>
          </button>

          <button
            onClick={() => setActiveTab('MEETING')}
            className={`p-3.5 rounded-xl flex items-center justify-between transition-all text-left border ${
              activeTab === 'MEETING'
                ? 'bg-indigo-950/80 border-indigo-500 shadow-lg shadow-indigo-900/30'
                : 'bg-slate-900/80 border-indigo-900/40 hover:border-indigo-700'
            }`}
          >
            <span className="text-indigo-300 font-medium">Reunião Marcada:</span>
            <span className="font-extrabold text-indigo-200 text-sm">{meetingLeads.length}</span>
          </button>

          <button
            onClick={() => setShowDiscardedDrawer((prev) => !prev)}
            className={`p-3.5 rounded-xl flex items-center justify-between transition-all text-left border ${
              showDiscardedDrawer
                ? 'bg-rose-950/80 border-rose-600 shadow-lg shadow-rose-900/30'
                : 'bg-slate-900/80 border-rose-900/40 hover:border-rose-700'
            }`}
          >
            <span className="text-rose-300 font-medium">Lista Oculta (Descartados):</span>
            <span className="font-extrabold text-rose-200 text-sm">{discardedLeads.length}</span>
          </button>
        </div>

        {/* Excel Import Mapping Modal / Preview */}
        {parsedPreview && (
          <div className="bg-slate-900 border border-purple-500/50 p-6 rounded-2xl space-y-6 shadow-2xl animate-in fade-in duration-200">
            <div className="flex items-center justify-between border-b border-slate-800 pb-4">
              <div>
                <h3 className="font-bold text-lg text-white flex items-center gap-2">
                  <Sparkles className="w-5 h-5 text-purple-400" /> Mapeamento de Colunas da Planilha
                </h3>
                <p className="text-xs text-slate-400">
                  {parsedPreview.length} linhas detectadas. Confirme quais colunas da sua planilha correspondem a cada atributo do lead.
                </p>
              </div>
              <button
                onClick={() => setParsedPreview(null)}
                className="text-xs text-slate-400 hover:text-white px-3 py-1.5 rounded-lg border border-slate-700"
              >
                Cancelar
              </button>
            </div>

            {/* Select Mappers Grid */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
              <div>
                <label className="block font-semibold text-purple-300 mb-1">
                  Nome da Empresa / Cliente <span className="text-red-400">*</span>
                </label>
                <select
                  value={mapping.companyName}
                  onChange={(e) => setMapping({ ...mapping, companyName: e.target.value })}
                  className="w-full p-2 rounded-lg bg-slate-950 border border-purple-800 text-white font-medium"
                >
                  {columns.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block font-semibold text-slate-300 mb-1">
                  Contato Principal (Nome)
                </label>
                <select
                  value={mapping.contactName}
                  onChange={(e) => setMapping({ ...mapping, contactName: e.target.value })}
                  className="w-full p-2 rounded-lg bg-slate-950 border border-slate-800 text-white"
                >
                  <option value="">-- Ignorar ou Nenhum --</option>
                  {columns.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block font-semibold text-slate-300 mb-1">
                  Telefone / E-mail / WhatsApp
                </label>
                <select
                  value={mapping.contactInfo}
                  onChange={(e) => setMapping({ ...mapping, contactInfo: e.target.value })}
                  className="w-full p-2 rounded-lg bg-slate-950 border border-slate-800 text-white"
                >
                  <option value="">-- Ignorar ou Nenhum --</option>
                  {columns.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block font-semibold text-slate-300 mb-1">
                  Segmento / Nicho
                </label>
                <select
                  value={mapping.segment}
                  onChange={(e) => setMapping({ ...mapping, segment: e.target.value })}
                  className="w-full p-2 rounded-lg bg-slate-950 border border-slate-800 text-white"
                >
                  <option value="">-- Ignorar ou Nenhum --</option>
                  {columns.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block font-semibold text-slate-300 mb-1">
                  Plano de Ação / Recomendação
                </label>
                <select
                  value={mapping.actionPlan}
                  onChange={(e) => setMapping({ ...mapping, actionPlan: e.target.value })}
                  className="w-full p-2 rounded-lg bg-slate-950 border border-slate-800 text-white"
                >
                  <option value="">-- Ignorar ou Valor Padrão --</option>
                  {columns.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block font-semibold text-slate-300 mb-1">
                  Observações / Contexto
                </label>
                <select
                  value={mapping.notes}
                  onChange={(e) => setMapping({ ...mapping, notes: e.target.value })}
                  className="w-full p-2 rounded-lg bg-slate-950 border border-slate-800 text-white"
                >
                  <option value="">-- Ignorar ou Nenhum --</option>
                  {columns.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Preview First 3 Rows */}
            <div className="border border-slate-800 rounded-xl overflow-hidden bg-slate-950/60 p-3 space-y-2">
              <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                Pré-visualização dos 3 primeiros registros:
              </span>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs text-slate-300">
                  <thead className="border-b border-slate-800 text-purple-400">
                    <tr>
                      <th className="p-2">Empresa</th>
                      <th className="p-2">Contato</th>
                      <th className="p-2">Info</th>
                      <th className="p-2">Segmento</th>
                      <th className="p-2">Plano de Ação</th>
                    </tr>
                  </thead>
                  <tbody>
                    {parsedPreview.slice(0, 3).map((row, idx) => (
                      <tr key={idx} className="border-b border-slate-800/40">
                        <td className="p-2 font-bold text-white">{row[mapping.companyName] || '-'}</td>
                        <td className="p-2">{mapping.contactName ? row[mapping.contactName] : '-'}</td>
                        <td className="p-2">{mapping.contactInfo ? row[mapping.contactInfo] : '-'}</td>
                        <td className="p-2">{mapping.segment ? row[mapping.segment] : '-'}</td>
                        <td className="p-2">{mapping.actionPlan ? row[mapping.actionPlan] : '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <button
                onClick={handleSaveBatch}
                className="px-6 py-2.5 text-xs font-bold text-white bg-purple-600 hover:bg-purple-500 rounded-xl shadow-lg shadow-purple-900/40 transition-colors flex items-center gap-2"
              >
                <Save className="w-4 h-4" /> Confirmar & Salvar {parsedPreview.length} Leads
              </button>
            </div>
          </div>
        )}

        {/* Main Navigation Tabs Bar */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-slate-800 pb-3">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setActiveTab('TRIAGE')}
              className={`px-4 py-2.5 rounded-xl font-bold text-xs flex items-center gap-2 transition-all ${
                activeTab === 'TRIAGE'
                  ? 'bg-purple-600 text-white shadow-lg shadow-purple-900/40'
                  : 'bg-slate-900/80 text-slate-400 hover:text-white border border-slate-800 hover:bg-slate-850'
              }`}
            >
              <FileSpreadsheet className="w-4 h-4" />
              <span>Leads em Triagem</span>
              <span
                className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold ${
                  activeTab === 'TRIAGE' ? 'bg-purple-800 text-white' : 'bg-slate-800 text-purple-300'
                }`}
              >
                {triageLeads.length}
              </span>
            </button>

            <button
              onClick={() => setActiveTab('MEETING')}
              className={`px-4 py-2.5 rounded-xl font-bold text-xs flex items-center gap-2 transition-all ${
                activeTab === 'MEETING'
                  ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-900/40'
                  : 'bg-slate-900/80 text-slate-400 hover:text-white border border-slate-800 hover:bg-slate-850'
              }`}
            >
              <Calendar className="w-4 h-4" />
              <span>Reunião Marcada</span>
              <span
                className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold ${
                  activeTab === 'MEETING' ? 'bg-indigo-800 text-white' : 'bg-slate-800 text-indigo-300'
                }`}
              >
                {meetingLeads.length}
              </span>
            </button>
          </div>

          <div className="flex items-center gap-3 w-full sm:w-auto justify-between sm:justify-end flex-wrap">
            {/* Filter by Member / Assignee */}
            <select
              value={assigneeFilter}
              onChange={(e) => setAssigneeFilter(e.target.value)}
              className="px-3 py-1.5 rounded-xl border border-slate-800 bg-slate-900/90 text-xs text-purple-300 font-semibold focus:outline-none focus:ring-2 focus:ring-purple-500"
            >
              <option value="ALL">Todos os Responsáveis</option>
              <option value="UNASSIGNED">Sem Responsável</option>
              <optgroup label="Equipe de Negócios">
                {negociosUsers.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name} ({getUserCargoTitle(u)})
                  </option>
                ))}
              </optgroup>
              {presidenciaUsers.length > 0 && (
                <optgroup label="Presidência">
                  {presidenciaUsers.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name} ({getUserCargoTitle(u)})
                    </option>
                  ))}
                </optgroup>
              )}
            </select>

            <div className="relative w-full sm:w-64">
              <Search className="w-4 h-4 text-purple-400 absolute left-3 top-2.5" />
              <input
                type="text"
                placeholder="Buscar por empresa, contato..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-4 py-1.5 text-xs rounded-xl border border-slate-800 bg-slate-900/90 text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-purple-500"
              />
            </div>

            <button
              onClick={() => setShowDiscardedDrawer((prev) => !prev)}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold border flex items-center gap-1.5 transition-colors shrink-0 ${
                showDiscardedDrawer
                  ? 'bg-rose-950/70 text-rose-300 border-rose-800 shadow'
                  : 'bg-slate-900/70 text-slate-400 hover:text-slate-200 border-slate-800'
              }`}
              title="Alternar visibilidade da lista oculta de descartados"
            >
              <EyeOff className="w-3.5 h-3.5 text-rose-400" />
              <span className="hidden md:inline">Descartados</span>
              <span className="px-1.5 py-0.2 rounded-full bg-rose-950 text-rose-300 text-[10px] font-bold">
                {discardedLeads.length}
              </span>
            </button>
          </div>
        </div>

        {/* TAB 1: Leads em Triagem Ativa */}
        {activeTab === 'TRIAGE' && (
          <div className="space-y-4 animate-in fade-in duration-200">
            <div className="bg-slate-900/80 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-950/80 border-b border-slate-800 text-purple-300 font-bold uppercase tracking-wider">
                    <tr>
                      <th className="p-3.5">Empresa / Cliente</th>
                      <th className="p-3.5">Contato & Info</th>
                      <th className="p-3.5">Responsável</th>
                      <th className="p-3.5">Segmento</th>
                      <th className="p-3.5">Plano de Ação / Abordagem</th>
                      <th className="p-3.5">Observações</th>
                      <th className="p-3.5">Status</th>
                      <th className="p-3.5 text-right">Ação / Funil SciTec</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 text-slate-200">
                    {loading ? (
                      <tr>
                        <td colSpan={8} className="text-center py-12 text-slate-500 font-medium">
                          <RefreshCw className="w-6 h-6 animate-spin mx-auto text-purple-500 mb-2" />
                          Carregando lista de leads...
                        </td>
                      </tr>
                    ) : triageLeads.length === 0 ? (
                      <tr>
                        <td colSpan={8} className="text-center py-12 text-slate-500 font-medium">
                          <div className="max-w-md mx-auto space-y-2">
                            <CheckCircle2 className="w-10 h-10 text-emerald-400 mx-auto" />
                            <p className="font-bold text-white text-sm">Nenhum lead pendente nesta lista de triagem!</p>
                            <p className="text-xs text-slate-400">
                              Todos os leads foram convertidos em reuniões ou descartados. Importe uma nova planilha ou confira a aba "Reunião Marcada".
                            </p>
                          </div>
                        </td>
                      </tr>
                    ) : (
                      triageLeads.map((lead) => (
                        <tr key={lead.id} className="hover:bg-slate-800/30 transition-colors">
                          <td className="p-3.5 font-bold text-white max-w-[180px]">
                            <div>{lead.companyName}</div>
                            <span className="text-[10px] text-slate-500 font-normal">
                              {new Date(lead.createdAt).toLocaleDateString('pt-BR')}
                            </span>
                          </td>

                          <td className="p-3.5 text-slate-300 max-w-[160px]">
                            <div className="font-semibold text-slate-200">{lead.contactName || 'Sem nome'}</div>
                            <div className="text-[11px] text-purple-300/80 truncate">{lead.contactInfo || '-'}</div>
                          </td>

                          {/* Member Assignment (Responsável) - Restrito a Negócios & Presidência */}
                          <td className="p-3.5 min-w-[150px]">
                            <select
                              value={lead.assignedTo || ''}
                              onChange={(e) => {
                                const val = e.target.value || null;
                                handleUpdateLead(lead.id, { assignedTo: val });
                              }}
                              disabled={!canManageLeads}
                              className="w-full text-xs font-semibold px-2 py-1 rounded-lg border border-slate-800 bg-slate-950 text-slate-200 focus:ring-1 focus:ring-purple-500 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                              <option value="">Não atribuído</option>
                              <optgroup label="Equipe de Negócios">
                                {negociosUsers.map((u) => (
                                  <option key={u.id} value={u.id}>
                                    {u.name} ({getUserCargoTitle(u)})
                                  </option>
                                ))}
                              </optgroup>
                              {presidenciaUsers.length > 0 && (
                                <optgroup label="Presidência">
                                  {presidenciaUsers.map((u) => (
                                    <option key={u.id} value={u.id}>
                                      {u.name} ({getUserCargoTitle(u)})
                                    </option>
                                  ))}
                                </optgroup>
                              )}
                            </select>
                          </td>

                          <td className="p-3.5 text-slate-400 font-medium">
                            {lead.segment ? (
                              <span className="px-2 py-0.5 rounded bg-slate-800 text-purple-300 font-semibold text-[11px]">
                                {lead.segment}
                              </span>
                            ) : (
                              '-'
                            )}
                          </td>

                          {/* Editable Action Plan */}
                          <td className="p-3.5 min-w-[220px]">
                            <textarea
                              rows={2}
                              defaultValue={lead.actionPlan}
                              disabled={!canManageLeads}
                              onBlur={(e) => {
                                if (e.target.value !== lead.actionPlan) {
                                  handleUpdateLead(lead.id, { actionPlan: e.target.value });
                                }
                              }}
                              placeholder={canManageLeads ? "Digite o plano de abordagem..." : "Sem plano de abordagem definido"}
                              className="w-full p-1.5 text-xs bg-slate-950/80 border border-slate-800 rounded text-slate-100 focus:ring-1 focus:ring-purple-500 disabled:opacity-60 disabled:cursor-not-allowed"
                            />
                          </td>

                          {/* Editable Notes */}
                          <td className="p-3.5 min-w-[180px]">
                            <textarea
                              rows={2}
                              defaultValue={lead.notes || ''}
                              disabled={!canManageLeads}
                              onBlur={(e) => {
                                if (e.target.value !== (lead.notes || '')) {
                                  handleUpdateLead(lead.id, { notes: e.target.value });
                                }
                              }}
                              placeholder={canManageLeads ? "Anotações livres..." : "Nenhuma anotação"}
                              className="w-full p-1.5 text-xs bg-slate-950/80 border border-slate-800 rounded text-slate-400 focus:ring-1 focus:ring-purple-500 disabled:opacity-60 disabled:cursor-not-allowed"
                            />
                          </td>

                          {/* Status Dropdown */}
                          <td className="p-3.5">
                            <select
                              value={lead.status}
                              disabled={!canManageLeads}
                              onChange={(e) => {
                                const newStatus = e.target.value as LeadProspectStatus;
                                if (newStatus === 'DISCARDED') {
                                  handleDiscardLead(lead.id);
                                } else {
                                  handleUpdateLead(lead.id, { status: newStatus });
                                }
                              }}
                              className={`text-xs font-bold px-2.5 py-1 rounded-lg border disabled:opacity-50 disabled:cursor-not-allowed ${
                                lead.status === 'IN_PROGRESS'
                                  ? 'bg-purple-950/60 text-purple-300 border-purple-800'
                                  : 'bg-amber-950/60 text-amber-300 border-amber-800'
                              }`}
                            >
                              <option value="PENDING">Pendente</option>
                              <option value="IN_PROGRESS">Em Triagem</option>
                              <option value="DISCARDED">Descartado</option>
                            </select>
                          </td>

                          {/* Action: Convert or Discard */}
                          <td className="p-3.5 text-right">
                            {!canManageLeads ? (
                              <span className="text-[11px] text-slate-500 italic px-2 py-1 bg-slate-900/60 rounded-lg border border-slate-800/60">
                                Somente Leitura
                              </span>
                            ) : (
                              <div className="flex items-center justify-end gap-2">
                                <button
                                  onClick={() => setConvertingLead(lead)}
                                  title="Agendar reunião e criar Card no Funil de Vendas"
                                  className="px-3.5 py-1.5 text-xs font-bold text-white bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 rounded-xl shadow-md flex items-center gap-1.5 transition-all transform hover:-translate-y-0.5"
                                >
                                  <Zap className="w-3.5 h-3.5 text-yellow-300" /> Converter p/ Card
                                </button>

                                <button
                                  onClick={() => handleDiscardLead(lead.id)}
                                  title="Descartar lead (mover para lista escondida)"
                                  className="p-1.5 text-slate-500 hover:text-rose-400 rounded-lg hover:bg-slate-800 transition-colors flex items-center gap-1"
                                >
                                  <Ban className="w-4 h-4" />
                                </button>

                                <button
                                  onClick={() => handleDeleteLead(lead.id)}
                                  title="Excluir permanentemente"
                                  className="p-1.5 text-slate-500 hover:text-red-400 rounded-lg hover:bg-slate-800 transition-colors"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </div>
                            )}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: Reunião Marcada (Plaquinhas Visuais) */}
        {activeTab === 'MEETING' && (
          <div className="space-y-4 animate-in fade-in duration-200">
            {meetingLeads.length === 0 ? (
              <div className="p-12 text-center bg-slate-900/40 border border-slate-800/80 rounded-2xl space-y-3">
                <Calendar className="w-10 h-10 text-indigo-400 mx-auto" />
                <h4 className="text-base font-bold text-white">Nenhuma reunião marcada ainda</h4>
                <p className="text-xs text-slate-400 max-w-md mx-auto">
                  Converta leads na aba "Leads em Triagem" definindo a data da reunião e o consultor. Eles se transformarão automaticamente em plaquinhas aqui e entrarão no Funil de Vendas!
                </p>
                <button
                  onClick={() => setActiveTab('TRIAGE')}
                  className="px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white font-bold text-xs rounded-xl shadow-md transition-colors inline-flex items-center gap-2"
                >
                  <FileSpreadsheet className="w-4 h-4" /> Ir para Leads em Triagem
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {meetingLeads.map((lead) => (
                  <div
                    key={lead.id}
                    className="p-5 rounded-2xl bg-gradient-to-br from-slate-900/95 via-slate-900/70 to-indigo-950/40 border border-indigo-800/40 hover:border-indigo-500/70 transition-all duration-200 shadow-xl flex flex-col justify-between group hover:shadow-indigo-900/20"
                  >
                    {/* Header da Plaquinha */}
                    <div className="space-y-2.5">
                      <div className="flex items-start justify-between gap-3">
                        <div className="space-y-1">
                          <span className="text-[10px] font-extrabold uppercase tracking-wider text-indigo-400 flex items-center gap-1">
                            <Sparkles className="w-3 h-3 text-indigo-400" /> Reunião Marcada
                          </span>
                          <h4 className="text-base font-bold text-white group-hover:text-indigo-200 transition-colors">
                            {lead.companyName}
                          </h4>
                        </div>

                        {lead.pipeCard && (
                          <span
                            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold border shadow-sm shrink-0"
                            style={{
                              borderColor: lead.pipeCard.phaseColor ? `${lead.pipeCard.phaseColor}60` : '#6366f160',
                              backgroundColor: lead.pipeCard.phaseColor ? `${lead.pipeCard.phaseColor}20` : '#6366f120',
                              color: lead.pipeCard.phaseColor || '#818cf8',
                            }}
                          >
                            <span
                              className="w-2 h-2 rounded-full animate-pulse"
                              style={{ backgroundColor: lead.pipeCard.phaseColor || '#818cf8' }}
                            />
                            {lead.pipeCard.phaseName}
                          </span>
                        )}
                      </div>

                      {/* Box Destaque de Agendamento da Reunião */}
                      <div className="flex items-center gap-2.5 p-2.5 rounded-xl bg-indigo-950/60 border border-indigo-800/50 text-indigo-200 text-xs">
                        <Clock className="w-4 h-4 text-indigo-400 shrink-0" />
                        <div>
                          <span className="text-[10px] text-indigo-300/70 uppercase block font-semibold">Data da Reunião:</span>
                          <strong className="text-white font-bold text-xs">
                            {formatMeetingDate(lead.pipeCard?.meetingDate)}
                          </strong>
                        </div>
                      </div>
                    </div>

                    {/* Informações da Plaquinha */}
                    <div className="my-4 space-y-2 text-xs text-slate-300">
                      <div className="flex items-center gap-2">
                        <UserIcon className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                        <span className="font-semibold text-slate-200">{lead.contactName || 'Contato a qualificar'}</span>
                      </div>

                      {lead.contactInfo && (
                        <div className="flex items-center gap-2 text-slate-400">
                          <Phone className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                          <span className="truncate">{lead.contactInfo}</span>
                        </div>
                      )}

                      {lead.pipeCard?.assigneeName && (
                        <div className="flex items-center gap-2 text-purple-300">
                          <Users className="w-3.5 h-3.5 text-purple-400 shrink-0" />
                          <span>Consultor: <strong className="text-white">{lead.pipeCard.assigneeName}</strong></span>
                        </div>
                      )}

                      {lead.segment && (
                        <div className="pt-1">
                          <span className="px-2 py-0.5 rounded-md bg-slate-800 border border-slate-700/60 text-[10px] font-semibold text-purple-300">
                            {lead.segment}
                          </span>
                        </div>
                      )}

                      {lead.actionPlan && (
                        <div className="p-2.5 rounded-xl bg-slate-950/80 border border-slate-800/80 text-[11px] text-slate-400 line-clamp-2">
                          <strong className="text-slate-300 not-italic block mb-0.5">Plano de Ação:</strong>
                          {lead.actionPlan}
                        </div>
                      )}
                    </div>

                    {/* Rodapé da Plaquinha com Ações */}
                    <div className="pt-3 border-t border-slate-800/80 flex items-center justify-between gap-2">
                      {canManageLeads && (
                        <button
                          onClick={() => handleRevertLead(lead.id)}
                          className="text-[11px] font-medium text-slate-500 hover:text-slate-300 transition-colors"
                          title="Reverter este lead para a lista de triagem"
                        >
                          Reverter p/ Triagem
                        </button>
                      )}

                      {lead.pipeCardId && (
                        <Link
                          href={`/?openCard=${lead.pipeCardId}`}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-white bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 rounded-xl shadow-md transition-transform hover:scale-105"
                        >
                          <span>Abrir no Funil</span>
                          <ExternalLink className="w-3.5 h-3.5" />
                        </Link>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* SEÇÃO ESCONDIDA: Leads Descartados */}
        <div className="mt-8 border border-slate-800/80 rounded-2xl bg-slate-950/70 overflow-hidden shadow-lg transition-all">
          <button
            onClick={() => setShowDiscardedDrawer(!showDiscardedDrawer)}
            className="w-full px-6 py-4 flex items-center justify-between text-left text-xs font-bold text-slate-400 hover:text-slate-200 hover:bg-slate-900/50 transition-colors"
          >
            <div className="flex items-center gap-2.5">
              <EyeOff className="w-4 h-4 text-rose-400" />
              <span>Lista Oculta de Leads Descartados</span>
              <span className="px-2 py-0.5 rounded-full bg-rose-950/70 text-rose-300 border border-rose-900/60 text-[10px] font-extrabold">
                {discardedLeads.length} descartados
              </span>
            </div>
            <div className="flex items-center gap-1 text-[11px] text-slate-500">
              <span>{showDiscardedDrawer ? 'Ocultar lista' : 'Exibir lista escondida'}</span>
              <ChevronDown
                className={`w-4 h-4 transition-transform duration-200 ${
                  showDiscardedDrawer ? 'rotate-180 text-purple-400' : ''
                }`}
              />
            </div>
          </button>

          {showDiscardedDrawer && (
            <div className="p-6 border-t border-slate-800 bg-slate-900/40 space-y-4 animate-in fade-in duration-200">
              {discardedLeads.length === 0 ? (
                <p className="text-center py-6 text-xs text-slate-500">
                  Nenhum lead descartado nesta lista oculta.
                </p>
              ) : (
                <div className="divide-y divide-slate-800/60">
                  {discardedLeads.map((lead) => (
                    <div
                      key={lead.id}
                      className="py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
                    >
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-white line-through opacity-70">
                            {lead.companyName}
                          </span>
                          {lead.segment && (
                            <span className="text-[10px] px-2 py-0.5 rounded bg-slate-800 text-slate-400">
                              {lead.segment}
                            </span>
                          )}
                        </div>
                        <div className="text-slate-400 text-[11px]">
                          {lead.contactName || 'Sem contato'} {lead.contactInfo ? `• ${lead.contactInfo}` : ''}
                        </div>
                        {lead.notes && (
                          <p className="text-[10px] text-rose-300/80 italic">
                            Obs: {lead.notes}
                          </p>
                        )}
                      </div>

                      {canManageLeads ? (
                        <div className="flex items-center gap-2 shrink-0">
                          <button
                            onClick={() => handleRestoreLead(lead.id)}
                            className="px-3 py-1.5 rounded-xl bg-purple-950/60 hover:bg-purple-900/80 border border-purple-800/60 text-purple-200 font-bold text-xs flex items-center gap-1.5 transition-colors"
                            title="Restaurar lead de volta para a triagem ativa"
                          >
                            <RotateCcw className="w-3.5 h-3.5 text-purple-400" />
                            Restaurar Lead
                          </button>
                          <button
                            onClick={() => handleDeleteLead(lead.id)}
                            className="p-1.5 rounded-lg text-slate-500 hover:text-red-400 hover:bg-slate-800 transition-colors"
                            title="Excluir definitivamente"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      ) : (
                        <span className="text-[11px] text-slate-500 italic shrink-0">Descartado</span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </>
    )}
  </main>

      {/* Convert Lead to Funnel Card Modal */}
      {convertingLead && (
        <ConvertLeadModal
          lead={convertingLead}
          users={users}
          onClose={() => setConvertingLead(null)}
          onSuccess={handleConversionSuccess}
        />
      )}
    </div>
  );
}

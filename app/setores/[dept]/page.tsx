'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { SciTecNavbar } from '@/components/navigation/SciTecNavbar';
import { KanbanBoard } from '@/components/kanban/KanbanBoard';
import { CreateCardModal } from '@/components/modals/CreateCardModal';
import { CreateRequestModal } from '@/components/modals/CreateRequestModal';
import { CreatePipeModal } from '@/components/modals/CreatePipeModal';
import { SectorTaskBoard } from '@/components/tasks/SectorTaskBoard';
import { useProfile } from '@/contexts/ProfileContext';
import { Pipe, User, CrossDeptRequest, FinancialTransaction, ProspectLead, getUserCargoTitle } from '@/types';
import { toast } from 'sonner';
import {
  Building2,
  Scale,
  Users,
  Palette,
  Kanban,
  Wrench,
  Send,
  Plus,
  ArrowRight,
  TrendingUp,
  DollarSign,
  Calendar,
  Clock,
  CheckCircle2,
  CheckSquare,
  AlertCircle,
  FileSpreadsheet,
  Calculator,
  ChevronRight,
  Receipt,
  FileText,
  UserCheck,
  Award,
  Sparkles,
  ExternalLink,
  ShieldAlert,
  Target,
  Lock,
  ShieldCheck,
  Eye,
  Filter,
  MessageSquare,
  Pickaxe,
  LayoutDashboard,
} from 'lucide-react';
import {
  canAssignLeads,
  canBeLeadAssignee,
  canEditUnit,
  canUseNegociosTools,
  canViewUnitDashboard,
  unitName,
} from '@/lib/permissions';
import { dashboardPages } from '@/lib/dashboards/client-api';
import { formatDueDate } from '@/lib/dashboards/format';
import { ModalFrame } from '@/components/ui/Modal';
import { PageHeader, StatCard, EmptyState, LoadingState } from '@/components/ui/Display';
import { Button } from '@/components/ui/Button';
import { Tabs, type TabItem } from '@/components/ui/Tabs';
import { Select } from '@/components/ui/Input';
import { pluralize } from '@/lib/ui/format';
import { CONTROL_CLASS } from '@/components/ui/Input';

export default function SectorWorkspacePage() {
  const params = useParams();
  const router = useRouter();
  const { currentProfile, profiles } = useProfile();

  const deptParam = (params.dept as string)?.toLowerCase() || 'negocios';

  // Sector Configuration Metadata
  const sectorConfigs: Record<
    string,
    {
      code: string;
      title: string;
      subtitle: string;
      icon: any;
      bannerGradient: string;
      accentBorder: string;
      accentText: string;
      badgeColor: string;
    }
  > = {
    negocios: {
      code: 'NEGOCIOS',
      title: 'Diretoria de Negócios & Comercial',
      subtitle: 'Prospecção B2B, gestão do CRM comercial, diagnóstico técnico e propostas.',
      icon: Building2,
      bannerGradient: 'from-purple-950/90 via-slate-900 to-indigo-950/80',
      accentBorder: 'border-purple-800/40',
      accentText: 'text-purple-300',
      badgeColor: 'bg-purple-950/80 text-purple-300 border-purple-700/50',
    },
    admjurfin: {
      code: 'ADMJURFIN',
      title: 'Diretoria AdmJurFin',
      subtitle: 'Gestão de contratos, conformidade jurídica, cobranças e fluxo de caixa da SciTec jr.',
      icon: Scale,
      bannerGradient: 'from-blue-950/90 via-slate-900 to-indigo-950/80',
      accentBorder: 'border-blue-800/40',
      accentText: 'text-blue-300',
      badgeColor: 'bg-blue-950/80 text-blue-300 border-blue-700/50',
    },
    gente: {
      code: 'GENTE',
      title: 'Diretoria de Gente & Gestão',
      subtitle: 'Recrutamento & seleção de trainees, onboarding, PDI e desenvolvimento de liderança.',
      icon: Users,
      bannerGradient: 'from-amber-950/90 via-slate-900 to-purple-950/80',
      accentBorder: 'border-amber-800/40',
      accentText: 'text-amber-300',
      badgeColor: 'bg-amber-950/80 text-amber-300 border-amber-700/50',
    },
    midias: {
      code: 'MIDIAS',
      title: 'Diretoria de Mídias & Marketing',
      subtitle: 'Produção de conteúdo, design de criativos, calendário editorial e posicionamento da marca.',
      icon: Palette,
      bannerGradient: 'from-pink-950/90 via-slate-900 to-purple-950/80',
      accentBorder: 'border-pink-800/40',
      accentText: 'text-pink-300',
      badgeColor: 'bg-pink-950/80 text-pink-300 border-pink-700/50',
    },
  };

  const currentSector = sectorConfigs[deptParam] || sectorConfigs.negocios;
  const SectorIcon = currentSector.icon;

  // RBAC Permission check: President or sector member can edit; others are read-only
  // Permissões (lib/permissions): membros do departamento e Presidência trabalham aqui.
  const canEditSector = canEditUnit(currentProfile, currentSector.code);
  const canAssign = canAssignLeads(currentProfile);

  // Tabs State
  type SectorTab = 'KANBAN' | 'LEADS' | 'TOOLS' | 'REQUESTS';
  const [activeTab, setActiveTab] = useState<SectorTab>('KANBAN');

  // Support ?tab=TOOLS directly from URL or redirects
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const urlParams = new URLSearchParams(window.location.search);
      const tabParam = urlParams.get('tab')?.toUpperCase();
      if (tabParam === 'TOOLS' || tabParam === 'LEADS' || tabParam === 'REQUESTS' || tabParam === 'KANBAN') {
        setActiveTab(tabParam as any);
      }
    }
  }, [deptParam]);

  // Sector Data State
  const [pipes, setPipes] = useState<Pipe[]>([]);
  const [selectedPipeId, setSelectedPipeId] = useState<string>('');
  const [users, setUsers] = useState<User[]>([]);
  const [requests, setRequests] = useState<CrossDeptRequest[]>([]);
  const [negociosLeads, setNegociosLeads] = useState<ProspectLead[]>([]);
  const [leadAssigneeFilter, setLeadAssigneeFilter] = useState<string>('ALL');
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  const sectorTabs: TabItem<SectorTab>[] = [
    { id: 'KANBAN', label: 'Funis & Processos', icon: Kanban },
    ...(currentSector.code === 'NEGOCIOS' ? [{ id: 'LEADS' as const, label: 'Leads Designados', icon: Target, count: negociosLeads.length }] : []),
    { id: 'TOOLS', label: `Ferramentas de ${unitName(currentSector.code)}`, icon: Wrench },
    { id: 'REQUESTS', label: 'Solicitações', icon: Send, count: requests.length },
  ];

  // Eligible users for lead assignment (exclusive to Negócios and Presidência)
  const negociosUsers = users.filter((u) => canBeLeadAssignee(u) && u.departmentCode === 'NEGOCIOS');
  const presidenciaUsers = users.filter((u) => canBeLeadAssignee(u) && u.globalRole !== null);
  // Quem não pode atribuir só assume leads sem dono ou libera os seus (o servidor valida de novo).
  const canChangeAssignee = (lead: ProspectLead) =>
    canUseNegociosTools(currentProfile) &&
    (canAssign || !lead.assignedTo || lead.assignedTo === currentProfile?.id);
  const assignOptionsFor = (lead: ProspectLead, list: User[]) =>
    canAssign ? list : list.filter((u) => u.id === currentProfile?.id || u.id === lead.assignedTo);

  // Modals State
  const [isCreateCardModalOpen, setIsCreateCardModalOpen] = useState(false);
  const [isCreateRequestModalOpen, setIsCreateRequestModalOpen] = useState(false);
  const [isCreatePipeModalOpen, setIsCreatePipeModalOpen] = useState(false);

  // Gente Specific View Mode ('KANBAN' or 'TASKS')
  const [genteViewMode, setGenteViewMode] = useState<'KANBAN' | 'TASKS'>('KANBAN');

  // Financial State (for AdmJurFin)
  const [financeData, setFinanceData] = useState<{
    transactions: FinancialTransaction[];
    metrics: {
      totalInflow: number;
      pendingInflow: number;
      totalOutflow: number;
      pendingOutflow: number;
      currentBalance: number;
    };
  }>({
    transactions: [],
    metrics: { totalInflow: 0, pendingInflow: 0, totalOutflow: 0, pendingOutflow: 0, currentBalance: 0 },
  });

  // New Transaction Form Modal State
  const [isNewTransactionModalOpen, setIsNewTransactionModalOpen] = useState(false);
  const [transDesc, setTransDesc] = useState('');
  const [transAmount, setTransAmount] = useState('');
  const [transType, setTransType] = useState<'INFLOW' | 'OUTFLOW'>('INFLOW');
  const [transCategory, setTransCategory] = useState('Projeto');
  const [transStatus, setTransStatus] = useState<'PAID' | 'PENDING'>('PAID');

  const fetchSectorData = async () => {
    setLoading(true);
    try {
      const [pipesRes, usersRes, reqsRes] = await Promise.all([
        fetch(`/api/pipes?department=${currentSector.code}`),
        fetch('/api/users'),
        fetch(`/api/requests?toDept=${currentSector.code}`),
      ]);

      if (pipesRes.ok) {
        const pipesData: Pipe[] = await pipesRes.json();
        setPipes(pipesData);
        if (pipesData.length > 0 && !selectedPipeId) {
          setSelectedPipeId(pipesData[0].id);
        } else if (pipesData.length > 0 && !pipesData.some((p) => p.id === selectedPipeId)) {
          setSelectedPipeId(pipesData[0].id);
        }
      }

      if (usersRes.ok) {
        const usersData = await usersRes.json();
        setUsers(usersData);
      }

      if (reqsRes.ok) {
        const reqsData = await reqsRes.json();
        setRequests(Array.isArray(reqsData) ? reqsData : []);
      }

      // If AdmJurFin, load finance data
      if (currentSector.code === 'ADMJURFIN') {
        const finRes = await fetch('/api/finance');
        if (finRes.ok) {
          const finData = await finRes.json();
          setFinanceData(finData);
        }
      }

      // If Negócios, load leads for the designated leads module
      if (currentSector.code === 'NEGOCIOS') {
        const leadsRes = await fetch('/api/tools/leads');
        if (leadsRes.ok) {
          const leadsData = await leadsRes.json();
          setNegociosLeads(leadsData.leads || []);
        }
      }
    } catch (err: any) {
      toast.error('Erro ao carregar dados do setor.');
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateLeadAssignee = async (leadId: string, assignedTo: string | null) => {
    try {
      const res = await fetch(`/api/tools/leads/${leadId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ assignedTo }),
      });
      if (!res.ok) throw new Error('Erro ao atualizar consultor responsável.');
      toast.success('Consultor do lead atualizado!');
      setNegociosLeads((prev) =>
        prev.map((l) => (l.id === leadId ? { ...l, assignedTo } : l))
      );
    } catch (err: any) {
      toast.error(err.message || 'Erro ao atualizar.');
    }
  };

  useEffect(() => {
    setSelectedPipeId('');
    fetchSectorData();
  }, [deptParam]);

  const activePipe = pipes.find((p) => p.id === selectedPipeId) || pipes[0] || null;

  // Filter cards by search query
  const filteredActivePipe = activePipe
    ? {
      ...activePipe,
      phases: activePipe.phases.map((phase) => ({
        ...phase,
        cards: phase.cards.filter((card) => {
          if (!searchQuery.trim()) return true;
          const q = searchQuery.toLowerCase();
          return (
            card.title.toLowerCase().includes(q) ||
            (card.description && card.description.toLowerCase().includes(q))
          );
        }),
      })),
    }
    : null;

  // Handle New Financial Transaction Creation
  const handleCreateTransaction = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!transDesc.trim() || !transAmount) {
      toast.error('Informe descrição e valor da movimentação.');
      return;
    }

    try {
      const res = await fetch('/api/finance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          description: transDesc.trim(),
          amount: Number(transAmount),
          type: transType,
          category: transCategory,
          status: transStatus,
        }),
      });

      if (!res.ok) throw new Error('Erro ao cadastrar transação.');

      toast.success('Movimentação financeira registrada com sucesso!');
      setIsNewTransactionModalOpen(false);
      setTransDesc('');
      setTransAmount('');
      // Reload finance
      const finRes = await fetch('/api/finance');
      if (finRes.ok) setFinanceData(await finRes.json());
    } catch (err: any) {
      toast.error(err.message || 'Erro ao registrar.');
    }
  };

  // Complete Request Action
  const handleUpdateReqStatus = async (id: string, newStatus: string) => {
    try {
      const res = await fetch(`/api/requests/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: newStatus,
          handlerId: currentProfile?.id || null,
        }),
      });

      if (!res.ok) throw new Error('Erro ao atualizar status.');

      toast.success(`Solicitação atualizada para ${newStatus}!`);
      fetchSectorData();
    } catch (err: any) {
      toast.error(err.message || 'Erro ao atualizar solicitação.');
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-slate-950 text-slate-100">
      <SciTecNavbar
        onRefresh={fetchSectorData}
        loading={loading}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        onNewCardClick={
          canEditSector && activePipe && activePipe.phases.length > 0
            ? () => setIsCreateCardModalOpen(true)
            : undefined
        }
        pipeName={currentSector.title}
      />

      <main className="flex-1 max-w-7xl w-full mx-auto p-4 md:p-6 space-y-6">
        {/* Breadcrumb Navigation */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <nav aria-label="Trilha de navegação" className="flex items-center gap-2 text-xs text-purple-300 min-w-0">
            <Link href="/" className="hover:text-purple-200 transition-colors">
              Início
            </Link>
            <ChevronRight className="w-3 h-3 text-slate-600" />
            <span className="text-slate-400">Setores</span>
            <ChevronRight className="w-3 h-3 text-slate-600" />
            <span className="text-white font-semibold truncate" title={currentSector.title}>{currentSector.title}</span>
          </nav>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setIsCreateRequestModalOpen(true)}
              className="px-3.5 min-h-10 text-xs font-bold rounded-xl bg-purple-950/80 border border-purple-700/50 hover:bg-purple-900/60 text-purple-200 flex items-center gap-1.5 transition-all shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
            >
              <Send className="w-3.5 h-3.5 text-purple-400" aria-hidden="true" />
              Nova Solicitação
            </button>
          </div>
        </div>

        <PageHeader
          icon={SectorIcon}
          title={currentSector.title}
          subtitle={currentSector.subtitle}
          actions={
            canViewUnitDashboard(currentProfile, currentSector.code) ? (
              <Link
                href={dashboardPages.unit(currentSector.code)}
                className="inline-flex items-center justify-center gap-2 min-h-10 px-4 text-sm font-bold text-white rounded-control bg-gradient-to-r from-primary-from to-primary-to hover:brightness-110 shadow-glow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
              >
                <LayoutDashboard className="w-4 h-4" aria-hidden="true" /> Ver painel
              </Link>
            ) : undefined
          }
        />
        <div className="grid grid-cols-2 gap-4 max-w-xl">
          <StatCard label={`Workspace ${unitName(currentSector.code)}`} value={pluralize(pipes.length, 'funil', 'funis')} />
          <StatCard
            label="Solicitações"
            tone="warning"
            value={pluralize(requests.filter((r) => r.status === 'PENDING').length, 'pendente', 'pendentes')}
          />
        </div>

        {/* Read-Only Mode Banner */}
        {!canEditSector && (
          <div className="rounded-2xl bg-amber-950/40 border border-amber-800/60 p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 text-amber-200 shadow-lg animate-in fade-in duration-200">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-amber-500/20 text-amber-400 shrink-0">
                <ShieldAlert className="w-5 h-5" />
              </div>
              <div className="space-y-0.5">
                <div className="flex items-center gap-2">
                  <h4 className="text-xs font-bold text-amber-300 uppercase tracking-wider">
                    Acesso restrito
                  </h4>
                  <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-amber-500/20 border border-amber-500/40 text-amber-300">
                    Sem permissão
                  </span>
                </div>
                <p className="text-xs text-amber-200/80">
                  Você não participa de <strong className="text-white">{unitName(currentSector.code)}</strong>. Funis, tarefas e
                  ferramentas deste departamento ficam disponíveis apenas para seus membros e para a Presidência.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Navigation Tabs Header */}
        <div className="flex flex-wrap items-end justify-between gap-4 border-b border-slate-800 pb-3">
          <Tabs<SectorTab>
            ariaLabel="Seções do setor"
            value={activeTab}
            onChange={setActiveTab}
            className="border-b-0 max-w-full"
            tabs={sectorTabs}
          />

          {/* Pipe Switcher (when in Kanban tab and there are multiple pipes) - For non-GENTE sectors */}
          {activeTab === 'KANBAN' && currentSector.code !== 'GENTE' && pipes.length > 1 && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-400 font-medium hidden sm:inline">
                Funil Selecionado:
              </span>
              <Select
                aria-label="Funil selecionado"
                value={selectedPipeId}
                onChange={(e) => setSelectedPipeId(e.target.value)}
                className="w-auto"
              >
                {pipes.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </Select>
            </div>
          )}
        </div>

        {/* TAB 1: KANBAN WORKSPACE */}
        {activeTab === 'KANBAN' && (
          <div className="space-y-4">
            {/* GENTE Specific: Sub-view Switcher & Funnel Selector/Creator */}
            {currentSector.code === 'GENTE' && (
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 rounded-2xl bg-slate-900/80 border border-amber-500/20 backdrop-blur-sm shadow-lg">
                <div className="flex items-center gap-1.5 bg-slate-950/80 p-1 rounded-xl border border-slate-800 w-fit">
                  <button
                    onClick={() => setGenteViewMode('KANBAN')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all ${genteViewMode === 'KANBAN'
                      ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 shadow-sm'
                      : 'text-slate-400 hover:text-white'
                      }`}
                  >
                    <Kanban className="w-3.5 h-3.5" /> Funis de Processo ({pipes.length})
                  </button>
                  <button
                    onClick={() => setGenteViewMode('TASKS')}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-all ${genteViewMode === 'TASKS'
                      ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 shadow-sm'
                      : 'text-slate-400 hover:text-white'
                      }`}
                  >
                    <CheckSquare className="w-3.5 h-3.5" /> Quadro Livre de Tarefas
                  </button>
                </div>

                <div className="flex items-center gap-2">
                  {genteViewMode === 'KANBAN' && pipes.length > 0 && (
                    <div className="flex items-center gap-1.5">
                      <span className="text-[11px] font-semibold text-slate-400 hidden sm:inline">Funil:</span>
                      <select
                        value={selectedPipeId}
                        onChange={(e) => setSelectedPipeId(e.target.value)}
                        className={`${CONTROL_CLASS}`}
                      >
                        {pipes.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                  {canEditSector && (
                    <button
                      onClick={() => setIsCreatePipeModalOpen(true)}
                      className="px-3 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs flex items-center gap-1.5 transition-all shadow-md shadow-amber-950/30"
                    >
                      <Plus className="w-3.5 h-3.5" /> Criar Novo Funil
                    </button>
                  )}
                </div>
              </div>
            )}

            {currentSector.code === 'GENTE' && genteViewMode === 'TASKS' ? (
              <SectorTaskBoard
                department={currentSector.code}
                users={users}
                readOnly={!canEditSector}
              />
            ) : filteredActivePipe ? (
              <div className="rounded-2xl bg-slate-900/40 border border-slate-800/80 p-1">
                <KanbanBoard
                  pipe={filteredActivePipe}
                  users={users}
                  onRefresh={fetchSectorData}
                  readOnly={!canEditSector}
                />
              </div>
            ) : (
              <EmptyState
                icon={SectorIcon}
                title="Nenhum funil configurado"
                description="Os processos deste setor ainda não foram inicializados."
                action={
                  canEditSector && currentSector.code === 'GENTE' ? (
                    <Button icon={Plus} onClick={() => setIsCreatePipeModalOpen(true)}>
                      Criar primeiro funil de Gente
                    </Button>
                  ) : undefined
                }
              />
            )}
          </div>
        )}

        {/* TAB: LEADS DESIGNADOS (EXCLUSIVO E INTERNO DO SETOR DE NEGÓCIOS) */}
        {activeTab === 'LEADS' && currentSector.code === 'NEGOCIOS' && (
          <div className="space-y-6 animate-in fade-in duration-200">
            {!canEditSector ? (
              <div className="p-12 rounded-3xl bg-slate-900/60 border border-slate-800 text-center max-w-lg mx-auto space-y-4">
                <div className="w-16 h-16 rounded-2xl bg-amber-950/60 border border-amber-800/50 text-amber-400 flex items-center justify-center mx-auto shadow-inner">
                  <Lock className="w-8 h-8" />
                </div>
                <div className="space-y-1">
                  <h3 className="text-lg font-bold text-white">Módulo Exclusivo e Interno de Negócios</h3>
                  <p className="text-xs text-slate-400 leading-relaxed">
                    A carteira de prospecção e a designação nominal de leads são confidenciais e restritas aos membros da Diretoria de Negócios e Presidência.
                  </p>
                </div>
              </div>
            ) : (
              <div className="space-y-6">
                {/* Header & Quick Navigation to Tools */}
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-6 rounded-2xl bg-gradient-to-r from-purple-950/80 via-slate-900 to-indigo-950/80 border border-purple-800/40 shadow-xl">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 text-xs font-bold text-purple-300">
                      <Target className="w-4 h-4 text-purple-400" /> Módulo Interno de Prospecção Comercial
                    </div>
                    <h2 className="text-2xl font-black text-white">
                      Carteira de Leads Designados
                    </h2>
                    <p className="text-xs text-purple-200/70">
                      Acompanhe e redistribua nominalmente os leads entre os consultores da equipe de Negócios.
                    </p>
                  </div>

                  <div className="flex items-center gap-3 shrink-0 flex-wrap">
                    <Link
                      href="/tools/lead-filter"
                      className="px-4 py-2.5 rounded-xl bg-purple-900/60 hover:bg-purple-800/80 border border-purple-600/50 text-purple-200 font-bold text-xs flex items-center justify-center gap-2 shadow transition-all hover:scale-[1.02]"
                    >
                      <TrendingUp className="w-4 h-4 text-purple-300" /> Triagem Rápida
                    </Link>
                    <Link
                      href="/tools/lead-sheet"
                      className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-bold text-xs flex items-center justify-center gap-2 shadow-lg shadow-purple-900/40 transition-all hover:scale-[1.02]"
                    >
                      <FileSpreadsheet className="w-4 h-4" /> Abrir Planilha Completa
                    </Link>
                  </div>
                </div>

                {/* KPI Metrics */}
                {(() => {
                  const activeLeads = negociosLeads.filter((l) => l.status !== 'DISCARDED');
                  const unassignedLeads = activeLeads.filter((l) => !l.assignedTo);
                  const inTriageLeads = activeLeads.filter((l) => l.status === 'IN_PROGRESS' || l.status === 'PENDING');
                  const meetingLeads = negociosLeads.filter((l) => l.status === 'CONVERTED_TO_PIPE');

                  return (
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                      <div className="p-5 rounded-2xl bg-slate-900/80 border border-slate-800 space-y-1">
                        <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block">
                          Total de Leads Ativos
                        </span>
                        <h3 className="text-2xl font-black text-white">{activeLeads.length}</h3>
                        <span className="text-[11px] text-slate-400">Excluindo descartados</span>
                      </div>

                      <div className="p-5 rounded-2xl bg-slate-900/80 border border-amber-900/40 space-y-1">
                        <span className="text-[11px] font-semibold text-amber-300 uppercase tracking-wider block">
                          Aguardando Designação
                        </span>
                        <h3 className="text-2xl font-black text-amber-400">{unassignedLeads.length}</h3>
                        <span className="text-[11px] text-slate-400">Sem consultor responsável</span>
                      </div>

                      <div className="p-5 rounded-2xl bg-slate-900/80 border border-purple-900/40 space-y-1">
                        <span className="text-[11px] font-semibold text-purple-300 uppercase tracking-wider block">
                          Em Prospecção / Triagem
                        </span>
                        <h3 className="text-2xl font-black text-purple-300">{inTriageLeads.length}</h3>
                        <span className="text-[11px] text-slate-400">Contatos sendo qualificados</span>
                      </div>

                      <div className="p-5 rounded-2xl bg-slate-900/80 border border-emerald-900/40 space-y-1">
                        <span className="text-[11px] font-semibold text-emerald-300 uppercase tracking-wider block">
                          Reuniões no Funil
                        </span>
                        <h3 className="text-2xl font-black text-emerald-400">{meetingLeads.length}</h3>
                        <span className="text-[11px] text-slate-400">Convertidos p/ Card de Vendas</span>
                      </div>
                    </div>
                  );
                })()}

                {/* Filter Pills por Consultor de Negócios */}
                <div className="flex items-center gap-2 overflow-x-auto pb-2">
                  <span className="text-xs font-bold text-slate-400 whitespace-nowrap">Filtrar por:</span>
                  <button
                    onClick={() => setLeadAssigneeFilter('ALL')}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-colors ${leadAssigneeFilter === 'ALL'
                      ? 'bg-purple-600 text-white'
                      : 'bg-slate-900 border border-slate-800 text-slate-400 hover:text-white'
                      }`}
                  >
                    Todos ({negociosLeads.filter((l) => l.status !== 'DISCARDED').length})
                  </button>

                  <button
                    onClick={() => setLeadAssigneeFilter('UNASSIGNED')}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-colors ${leadAssigneeFilter === 'UNASSIGNED'
                      ? 'bg-amber-600 text-white'
                      : 'bg-slate-900 border border-slate-800 text-slate-400 hover:text-white'
                      }`}
                  >
                    Sem Consultor ({negociosLeads.filter((l) => !l.assignedTo && l.status !== 'DISCARDED').length})
                  </button>

                  {negociosUsers.map((u) => {
                    const count = negociosLeads.filter(
                      (l) => l.assignedTo === u.id && l.status !== 'DISCARDED'
                    ).length;
                    return (
                      <button
                        key={u.id}
                        onClick={() => setLeadAssigneeFilter(u.id)}
                        className={`px-3 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-colors ${leadAssigneeFilter === u.id
                          ? 'bg-indigo-600 text-white'
                          : 'bg-slate-900 border border-slate-800 text-slate-400 hover:text-white'
                          }`}
                      >
                        {u.name} ({count})
                      </button>
                    );
                  })}
                </div>

                {/* Tabela de Leads Designados */}
                {(() => {
                  let filteredLeads = negociosLeads.filter((l) => l.status !== 'DISCARDED');
                  if (leadAssigneeFilter === 'UNASSIGNED') {
                    filteredLeads = filteredLeads.filter((l) => !l.assignedTo);
                  } else if (leadAssigneeFilter !== 'ALL') {
                    filteredLeads = filteredLeads.filter((l) => l.assignedTo === leadAssigneeFilter);
                  }

                  if (filteredLeads.length === 0) {
                    return (
                      <div className="p-12 text-center bg-slate-900/40 border border-slate-800/80 rounded-2xl space-y-3">
                        <Target className="w-10 h-10 text-slate-600 mx-auto" />
                        <h4 className="text-sm font-bold text-white">Nenhum lead encontrado neste filtro</h4>
                        <p className="text-xs text-slate-400 max-w-sm mx-auto">
                          Importe uma planilha ou selecione outro consultor para visualizar a carteira de prospecção.
                        </p>
                      </div>
                    );
                  }

                  return (
                    <div className="border border-slate-800 rounded-2xl bg-slate-900/60 overflow-hidden shadow-xl">
                      <div className="overflow-x-auto">
                        <table className="w-full text-left text-xs border-collapse">
                          <thead>
                            <tr className="border-b border-slate-800 bg-slate-950/80 text-slate-400 text-[11px] uppercase tracking-wider font-extrabold">
                              <th className="p-3.5">Empresa / Lead</th>
                              <th className="p-3.5">Contato</th>
                              <th className="p-3.5 min-w-[200px]">Consultor Designado (Negócios)</th>
                              <th className="p-3.5">Status</th>
                              <th className="p-3.5 min-w-[200px]">Plano de Ação</th>
                              <th className="p-3.5 text-right">Ação</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-800/60">
                            {filteredLeads.map((lead) => {
                              return (
                                <tr key={lead.id} className="hover:bg-slate-800/30 transition-colors">
                                  <td className="p-3.5 font-bold text-white">
                                    <div>{lead.companyName}</div>
                                    {lead.segment && (
                                      <span className="text-[11px] text-purple-300/80 font-normal">
                                        {lead.segment}
                                      </span>
                                    )}
                                  </td>

                                  <td className="p-3.5 text-slate-300">
                                    <div className="font-semibold text-slate-200">{lead.contactName || 'Sem contato'}</div>
                                    <div className="text-[11px] text-slate-400 truncate max-w-[150px]">{lead.contactInfo || '-'}</div>
                                  </td>

                                  {/* Select de Consultor Designado */}
                                  <td className="p-3.5">
                                    <select
                                      value={lead.assignedTo || ''}
                                      onChange={(e) => handleUpdateLeadAssignee(lead.id, e.target.value || null)}
                                      disabled={!canChangeAssignee(lead)}
                                      aria-label={`Consultor de ${lead.companyName}`}
                                      className={`${CONTROL_CLASS} w-full disabled:opacity-50`}
                                    >
                                      <option value="">Aguardando Designação</option>
                                      <optgroup label="Equipe de Negócios">
                                        {assignOptionsFor(lead, negociosUsers).map((u) => (
                                          <option key={u.id} value={u.id}>
                                            {u.name} ({getUserCargoTitle(u)})
                                          </option>
                                        ))}
                                      </optgroup>
                                      {assignOptionsFor(lead, presidenciaUsers).length > 0 && (
                                        <optgroup label="Presidência">
                                          {assignOptionsFor(lead, presidenciaUsers).map((u) => (
                                            <option key={u.id} value={u.id}>
                                              {u.name} ({getUserCargoTitle(u)})
                                            </option>
                                          ))}
                                        </optgroup>
                                      )}
                                    </select>
                                  </td>

                                  <td className="p-3.5">
                                    <span
                                      className={`px-2.5 py-1 rounded-full text-[11px] font-extrabold border ${lead.status === 'CONVERTED_TO_PIPE'
                                        ? 'bg-emerald-950/60 text-emerald-300 border-emerald-800'
                                        : lead.status === 'IN_PROGRESS'
                                          ? 'bg-purple-950/60 text-purple-300 border-purple-800'
                                          : 'bg-amber-950/60 text-amber-300 border-amber-800'
                                        }`}
                                    >
                                      {lead.status === 'CONVERTED_TO_PIPE'
                                        ? 'Reunião Marcada'
                                        : lead.status === 'IN_PROGRESS'
                                          ? 'Em Triagem'
                                          : 'Pendente'}
                                    </span>
                                  </td>

                                  <td className="p-3.5 text-slate-400 text-xs truncate max-w-[250px]">
                                    {lead.actionPlan || <span className="text-slate-600 italic">Sem plano</span>}
                                  </td>

                                  <td className="p-3.5 text-right">
                                    {lead.pipeCardId ? (
                                      <Link
                                        href={`/pipe?openCard=${lead.pipeCardId}`}
                                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-purple-600/30 hover:bg-purple-600/50 text-purple-300 font-bold text-[11px] border border-purple-500/30 transition-colors"
                                      >
                                        <span>No Funil</span>
                                        <ExternalLink className="w-3 h-3" />
                                      </Link>
                                    ) : (
                                      <Link
                                        href="/tools/lead-sheet"
                                        className="inline-flex items-center gap-1 text-[11px] text-indigo-400 hover:text-indigo-300 font-semibold"
                                      >
                                        <span>Gerenciar</span>
                                        <ArrowRight className="w-3 h-3" />
                                      </Link>
                                    )}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  );
                })()}
              </div>
            )}
          </div>
        )}

        {/* TAB 2: SPECIALIZED TOOLS PER SECTOR */}
        {activeTab === 'TOOLS' && (
          <div className="space-y-6">
            {/* ADMJURFIN TOOLS: FLUXO DE CAIXA & CONTRATOS */}
            {currentSector.code === 'ADMJURFIN' && (
              <div className="space-y-6">
                {/* Sector Tools Banner */}
                <div className="p-6 rounded-2xl bg-gradient-to-r from-blue-950/70 via-slate-900 to-indigo-950/70 border border-blue-800/40 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 shadow-xl">
                  <div className="space-y-1">
                    <div className="inline-flex items-center gap-2 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-blue-950 text-blue-300 border border-blue-700/50">
                      <Scale className="w-3 h-3 text-blue-400" /> Utilitários Exclusivos de AdmJurFin
                    </div>
                    <h3 className="text-xl font-black text-white flex items-center gap-2">
                      Central de Ferramentas Administrativas, Jurídicas & Financeiras
                    </h3>
                    <p className="text-xs text-blue-200/80 max-w-2xl leading-relaxed">
                      Gestão de fluxo de caixa em tempo real, conciliação de receitas/despesas de projetos, minutas contratuais e conformidade jurídica da SciTec jr.
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-xs font-semibold px-3 py-1.5 rounded-xl bg-blue-950/80 border border-blue-700/50 text-blue-300">
                      Painel Financeiro Ativo
                    </span>
                  </div>
                </div>

                {/* Financial KPI Cards */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                  <div className="p-5 rounded-2xl bg-slate-900/80 border border-slate-800 space-y-1">
                    <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block">
                      Saldo Operacional SciTec
                    </span>
                    <h3 className="text-2xl font-black text-emerald-400">
                      {financeData.metrics.currentBalance.toLocaleString('pt-BR', {
                        style: 'currency',
                        currency: 'BRL',
                      })}
                    </h3>
                    <span className="text-[11px] text-slate-400">Receitas pagas - Despesas pagas</span>
                  </div>

                  <div className="p-5 rounded-2xl bg-slate-900/80 border border-slate-800 space-y-1">
                    <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block">
                      Total Receitas (Entradas)
                    </span>
                    <h3 className="text-2xl font-black text-blue-400">
                      {financeData.metrics.totalInflow.toLocaleString('pt-BR', {
                        style: 'currency',
                        currency: 'BRL',
                      })}
                    </h3>
                    <span className="text-[11px] text-slate-400">
                      +{' '}
                      {financeData.metrics.pendingInflow.toLocaleString('pt-BR', {
                        style: 'currency',
                        currency: 'BRL',
                      })}{' '}
                      a receber
                    </span>
                  </div>

                  <div className="p-5 rounded-2xl bg-slate-900/80 border border-slate-800 space-y-1">
                    <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block">
                      Total Despesas (Saídas)
                    </span>
                    <h3 className="text-2xl font-black text-rose-400">
                      {financeData.metrics.totalOutflow.toLocaleString('pt-BR', {
                        style: 'currency',
                        currency: 'BRL',
                      })}
                    </h3>
                    <span className="text-[11px] text-slate-400">Infraestrutura, ferramentas e reembolsos</span>
                  </div>

                  <div className="p-5 rounded-2xl bg-gradient-to-br from-blue-950/60 to-slate-900 border border-blue-800/40 flex flex-col justify-between">
                    <div>
                      <span className="text-[11px] font-bold text-blue-300 uppercase tracking-wider block">
                        Ação Financeira
                      </span>
                      <p className="text-[11px] text-slate-400 mt-1">
                        Registrar entrada de sinal ou despesa de projeto
                      </p>
                    </div>
                    {canEditSector ? (
                      <button
                        onClick={() => setIsNewTransactionModalOpen(true)}
                        className="mt-3 w-full py-2 px-3 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-bold text-xs flex items-center justify-center gap-1.5 transition-all shadow-md shadow-purple-900/30"
                      >
                        <Plus className="w-3.5 h-3.5" /> Nova Movimentação
                      </button>
                    ) : (
                      <div className="mt-3 py-2 px-3 rounded-xl bg-slate-950/80 border border-slate-800 text-center text-xs text-slate-400 font-medium">
                        <Lock className="w-3.5 h-3.5 inline mr-1 -mt-0.5" aria-hidden="true" />Registro restrito ao AdmJurFin
                      </div>
                    )}
                  </div>
                </div>

                {/* Financial Transactions List */}
                <div className="rounded-2xl bg-slate-900/80 border border-slate-800 p-5 space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-bold text-white flex items-center gap-2">
                      <Receipt className="w-4 h-4 text-blue-400" /> Extrato Financeiro & Lançamentos
                    </h3>
                    <span className="text-xs text-slate-400">
                      {financeData.transactions.length} registros
                    </span>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead>
                        <tr className="border-b border-slate-800 text-slate-400 font-semibold uppercase tracking-wider text-[11px]">
                          <th className="pb-3">Descrição</th>
                          <th className="pb-3">Tipo</th>
                          <th className="pb-3">Categoria</th>
                          <th className="pb-3">Status</th>
                          <th className="pb-3">Data</th>
                          <th className="pb-3 text-right">Valor (R$)</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/60">
                        {financeData.transactions.map((t) => (
                          <tr key={t.id} className="hover:bg-slate-800/30 transition-colors">
                            <td className="py-3 font-medium text-white">{t.description}</td>
                            <td className="py-3">
                              <span
                                className={`px-2 py-0.5 rounded-full text-[11px] font-bold ${t.type === 'INFLOW'
                                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                                  : 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
                                  }`}
                              >
                                {t.type === 'INFLOW' ? 'Receita' : 'Despesa'}
                              </span>
                            </td>
                            <td className="py-3 text-slate-300">{t.category}</td>
                            <td className="py-3">
                              <span
                                className={`px-2 py-0.5 rounded-full text-[11px] font-bold ${t.status === 'PAID'
                                  ? 'bg-blue-500/20 text-blue-300'
                                  : 'bg-amber-500/20 text-amber-300'
                                  }`}
                              >
                                {t.status === 'PAID' ? 'Liquidado' : 'Pendente'}
                              </span>
                            </td>
                            <td className="py-3 text-slate-400">
                              {t.paymentDate
                                ? new Date(t.paymentDate).toLocaleDateString('pt-BR')
                                : t.dueDate
                                  ? `Venc: ${new Date(t.dueDate).toLocaleDateString('pt-BR')}`
                                  : '-'}
                            </td>
                            <td
                              className={`py-3 text-right font-bold ${t.type === 'INFLOW' ? 'text-emerald-400' : 'text-rose-400'
                                }`}
                            >
                              {t.type === 'INFLOW' ? '+' : '-'}{' '}
                              {t.amount.toLocaleString('pt-BR', {
                                style: 'currency',
                                currency: 'BRL',
                              })}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* AdmJurFin Specialized Tools Grid */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-5 pt-2">
                  <div className="p-5 rounded-2xl bg-slate-900/80 border border-blue-800/40 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="p-2.5 rounded-xl bg-blue-950/80 border border-blue-800/60 text-blue-400">
                        <FileText className="w-5 h-5" />
                      </div>
                      <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-300 border border-blue-500/40">
                        Minutas Ativas
                      </span>
                    </div>
                    <div>
                      <h4 className="text-sm font-bold text-white">Gerador de Minutas & Contratos</h4>
                      <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                        Modelos contratuais de prestação de serviços de TI, termos aditivos e acordos de confidencialidade (NDA) da SciTec jr.
                      </p>
                    </div>
                  </div>

                  <div className="p-5 rounded-2xl bg-slate-900/80 border border-blue-800/40 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="p-2.5 rounded-xl bg-blue-950/80 border border-blue-800/60 text-blue-400">
                        <Receipt className="w-5 h-5" />
                      </div>
                      <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-300 border border-blue-500/40">
                        Disponível
                      </span>
                    </div>
                    <div>
                      <h4 className="text-sm font-bold text-white">Emissor de Faturas & Recibos PJ</h4>
                      <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                        Emissão de comprovantes de pagamento e faturas personalizadas com dados cadastrais e CNPJ da Empresa Júnior.
                      </p>
                    </div>
                  </div>

                  <div className="p-5 rounded-2xl bg-slate-900/80 border border-blue-800/40 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="p-2.5 rounded-xl bg-blue-950/80 border border-blue-800/60 text-blue-400">
                        <Scale className="w-5 h-5" />
                      </div>
                      <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-300 border border-blue-500/40">
                        Disponível
                      </span>
                    </div>
                    <div>
                      <h4 className="text-sm font-bold text-white">Simulador Tributário & Fiscal</h4>
                      <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                        Conformidade com enquadramento de entidade sem fins lucrativos e cálculo de alíquotas incidentes sobre projetos.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* MIDIAS TOOLS: CALENDÁRIO EDITORIAL & BRANDING */}
            {currentSector.code === 'MIDIAS' && (
              <div className="space-y-6">
                <div className="p-6 rounded-2xl bg-gradient-to-r from-pink-950/70 via-slate-900 to-purple-950/70 border border-pink-800/40 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 shadow-xl">
                  <div className="space-y-1">
                    <div className="inline-flex items-center gap-2 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-pink-950 text-pink-300 border border-pink-700/50">
                      <Palette className="w-3 h-3 text-pink-400" /> Utilitários Exclusivos de Mídias
                    </div>
                    <h3 className="text-xl font-black text-white flex items-center gap-2">
                      Central de Ferramentas de Mídias, Marketing & Criação
                    </h3>
                    <p className="text-xs text-pink-200/80 max-w-2xl leading-relaxed">
                      Planejamento editorial, governança da marca SciTec jr., produção de criativos e campanhas de atração institucional.
                    </p>
                  </div>
                  {canEditSector ? (
                    <button
                      onClick={() => {
                        if (activePipe && activePipe.phases.length > 0) {
                          setIsCreateCardModalOpen(true);
                        }
                      }}
                      className="px-4 py-2 rounded-xl bg-pink-600 hover:bg-pink-500 text-white font-bold text-xs shadow-md shadow-pink-900/40 flex items-center gap-1.5 transition-all shrink-0"
                    >
                      <Plus className="w-4 h-4" /> Agendar Nova Pauta
                    </button>
                  ) : (
                    <div className="px-3.5 py-1.5 rounded-xl bg-slate-950/80 border border-slate-800 text-xs text-slate-400 font-medium shrink-0">
                      <Lock className="w-3.5 h-3.5 inline mr-1 -mt-0.5" aria-hidden="true" />Pauta restrita a Mídias
                    </div>
                  )}
                </div>

                {/* Editorial Schedule Cards */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h4 className="text-sm font-bold text-white flex items-center gap-2">
                      <Calendar className="w-4 h-4 text-pink-400" /> Pautas Editoriais da Semana
                    </h4>
                    <span className="text-xs text-slate-400">Instagram, LinkedIn e TikTok</span>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {[
                      {
                        date: '18/09 (Sexta)',
                        title: 'Carrossel: Por que sua empresa precisa de um Sistema Sob Medida?',
                        channel: 'Instagram',
                        status: 'Agendado/Postado',
                        color: 'border-emerald-500/40 bg-emerald-950/20 text-emerald-300',
                      },
                      {
                        date: '23/09 (Quarta)',
                        title: 'Reels: Bastidores da Imersão Técnica SciTec jr.',
                        channel: 'Instagram & TikTok',
                        status: 'Em Design & Edição',
                        color: 'border-purple-500/40 bg-purple-950/20 text-purple-300',
                      },
                      {
                        date: '26/09 (Sábado)',
                        title: 'Artigo: Como a IA Transforma Pequenos Negócios',
                        channel: 'LinkedIn',
                        status: 'Aprovação Interna',
                        color: 'border-amber-500/40 bg-amber-950/20 text-amber-300',
                      },
                    ].map((post, i) => (
                      <div
                        key={i}
                        className="p-5 rounded-2xl bg-slate-900/80 border border-slate-800 space-y-3 hover:border-pink-800/50 transition-all flex flex-col justify-between"
                      >
                        <div className="space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-bold text-pink-400 flex items-center gap-1">
                              <Calendar className="w-3.5 h-3.5" /> {post.date}
                            </span>
                            <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full border ${post.color}`}>
                              {post.status}
                            </span>
                          </div>
                          <h4 className="text-sm font-bold text-white">{post.title}</h4>
                        </div>

                        <div className="pt-3 border-t border-slate-800/80 flex items-center justify-between text-xs text-slate-400">
                          <span>Canal: <strong className="text-white">{post.channel}</strong></span>
                          <span className="text-pink-400 hover:text-pink-300 font-semibold cursor-pointer">
                            Ver Detalhes →
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Mídias Specialized Tools Grid */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-5 pt-2">
                  <div className="p-5 rounded-2xl bg-slate-900/80 border border-pink-800/40 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="p-2.5 rounded-xl bg-pink-950/80 border border-pink-800/60 text-pink-400">
                        <Palette className="w-5 h-5" />
                      </div>
                      <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-pink-500/20 text-pink-300 border border-pink-500/40">
                        Brand Kit
                      </span>
                    </div>
                    <div>
                      <h4 className="text-sm font-bold text-white">Identidade Visual & Ativos de Marca</h4>
                      <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                        Logos oficiais em alta resolução (SVG, PNG), paleta de cores corporativa da SciTec e manual de aplicação de marca.
                      </p>
                    </div>
                  </div>

                  <div className="p-5 rounded-2xl bg-slate-900/80 border border-pink-800/40 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="p-2.5 rounded-xl bg-pink-950/80 border border-pink-800/60 text-pink-400">
                        <Sparkles className="w-5 h-5" />
                      </div>
                      <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-pink-500/20 text-pink-300 border border-pink-500/40">
                        Copywriting
                      </span>
                    </div>
                    <div>
                      <h4 className="text-sm font-bold text-white">Gerador de Briefings de Conteúdo</h4>
                      <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                        Estruturação de roteiros, ganchos (hooks) para reels e carrosséis com foco em atração de novos clientes para o comercial.
                      </p>
                    </div>
                  </div>

                  <div className="p-5 rounded-2xl bg-slate-900/80 border border-pink-800/40 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="p-2.5 rounded-xl bg-pink-950/80 border border-pink-800/60 text-pink-400">
                        <ExternalLink className="w-5 h-5" />
                      </div>
                      <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-pink-500/20 text-pink-300 border border-pink-500/40">
                        Canais
                      </span>
                    </div>
                    <div>
                      <h4 className="text-sm font-bold text-white">Central de Links de Divulgação</h4>
                      <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                        Gestão dos links da bio do Instagram, formulários de prospecção e redirecionamento para o funil comercial.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* GENTE TOOLS: GESTÃO DE PESSOAS & DHO */}
            {currentSector.code === 'GENTE' && (
              <div className="space-y-6">
                <div className="p-6 rounded-2xl bg-gradient-to-r from-amber-950/70 via-slate-900 to-purple-950/70 border border-amber-800/40 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 shadow-xl">
                  <div className="space-y-1">
                    <div className="inline-flex items-center gap-2 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-950 text-amber-300 border border-amber-700/50">
                      <Users className="w-3 h-3 text-amber-400" /> Utilitários Exclusivos de Gente
                    </div>
                    <h3 className="text-xl font-black text-white flex items-center gap-2">
                      Central de Ferramentas de Gente, Gestão & DHO
                    </h3>
                    <p className="text-xs text-amber-200/80 max-w-2xl leading-relaxed">
                      Acompanhamento da jornada dos membros, taxa de alocação técnica, ciclos de feedback e planos de desenvolvimento individual.
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-xs font-semibold px-3 py-1.5 rounded-xl bg-amber-950/80 border border-amber-700/50 text-amber-300">
                      Ciclo PDI Ativo
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className="p-5 rounded-2xl bg-slate-900/80 border border-slate-800 space-y-1">
                    <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block">
                      Membros Cadastrados
                    </span>
                    <h3 className="text-2xl font-black text-white">{users.length} membros</h3>
                    <span className="text-[11px] text-slate-400">Distribuídos nas 4 diretorias</span>
                  </div>

                  <div className="p-5 rounded-2xl bg-slate-900/80 border border-slate-800 space-y-1">
                    <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block">
                      Taxa de Alocação em Projetos
                    </span>
                    <h3 className="text-2xl font-black text-amber-400">83.3%</h3>
                    <span className="text-[11px] text-slate-400">Membros ativos em clientes ou demandas</span>
                  </div>

                  <div className="p-5 rounded-2xl bg-slate-900/80 border border-slate-800 space-y-1">
                    <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block">
                      Ciclo de PDI Vigente
                    </span>
                    <h3 className="text-2xl font-black text-purple-400">2026.2</h3>
                    <span className="text-[11px] text-slate-400">Checkpoints mensais em andamento</span>
                  </div>
                </div>

                {/* Team Members Allocation List */}
                <div className="rounded-2xl bg-slate-900/80 border border-slate-800 p-5 space-y-4">
                  <h3 className="text-sm font-bold text-white flex items-center gap-2">
                    <UserCheck className="w-4 h-4 text-amber-400" /> Alocação & Cargos da Equipe
                  </h3>

                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {users.map((u) => (
                      <div
                        key={u.id}
                        className="p-4 rounded-xl bg-slate-950/70 border border-slate-800 flex items-center gap-3"
                      >
                        <img
                          src={
                            u.avatar ||
                            `https://ui-avatars.com/api/?name=${encodeURIComponent(u.name)}&background=7c3aed&color=fff`
                          }
                          alt={u.name}
                          className="w-10 h-10 rounded-full object-cover border border-purple-500/40"
                        />
                        <div className="flex-1 min-w-0">
                          <h4 className="text-xs font-bold text-white truncate">{u.name}</h4>
                          <span className="text-[11px] font-medium text-purple-300 block">
                            {getUserCargoTitle(u)} • {unitName(u.departmentCode)}
                          </span>
                          <span className="text-[11px] text-slate-400 truncate block">
                            {u.email}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Gente Specialized Tools Grid */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-5 pt-2">
                  <div className="p-5 rounded-2xl bg-slate-900/80 border border-amber-800/40 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="p-2.5 rounded-xl bg-amber-950/80 border border-amber-800/60 text-amber-400">
                        <Clock className="w-5 h-5" />
                      </div>
                      <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/40">
                        Ativo
                      </span>
                    </div>
                    <div>
                      <h4 className="text-sm font-bold text-white">Banco de Horas & Dedicação Semanal</h4>
                      <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                        Acompanhamento das horas dedicadas pelos membros em projetos comerciais, núcleos técnicos e rotinas internas.
                      </p>
                    </div>
                  </div>

                  <div className="p-5 rounded-2xl bg-slate-900/80 border border-amber-800/40 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="p-2.5 rounded-xl bg-amber-950/80 border border-amber-800/60 text-amber-400">
                        <Award className="w-5 h-5" />
                      </div>
                      <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/40">
                        Ciclo 2026.2
                      </span>
                    </div>
                    <div>
                      <h4 className="text-sm font-bold text-white">Matriz de Avaliação 360° & PDI</h4>
                      <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                        Avaliação de competências técnicas e comportamentais para promoção de assessores, gerentes e lideranças.
                      </p>
                    </div>
                  </div>

                  <div className="p-5 rounded-2xl bg-slate-900/80 border border-amber-800/40 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="p-2.5 rounded-xl bg-amber-950/80 border border-amber-800/60 text-amber-400">
                        <UserCheck className="w-5 h-5" />
                      </div>
                      <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/40">
                        Disponível
                      </span>
                    </div>
                    <div>
                      <h4 className="text-sm font-bold text-white">Emissor de Certificados de Membro</h4>
                      <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                        Emissão de certificados comprobatórios de atuação júnior para validação de horas de extensão e atividades complementares.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* NEGOCIOS TOOLS: CENTRAL COMERCIAL COMPLETA */}
            {currentSector.code === 'NEGOCIOS' && (
              <div className="space-y-6">
                <div className="p-6 rounded-2xl bg-gradient-to-r from-purple-950/70 via-slate-900 to-indigo-950/70 border border-purple-800/40 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 shadow-xl">
                  <div className="space-y-1">
                    <div className="inline-flex items-center gap-2 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-purple-950 text-purple-300 border border-purple-700/50">
                      <Wrench className="w-3 h-3 text-purple-400" /> Utilitários Exclusivos de Negócios
                    </div>
                    <h3 className="text-xl font-black text-white flex items-center gap-2">
                      Central de Ferramentas Comerciais & Prospecção
                    </h3>
                    <p className="text-xs text-purple-200/80 max-w-2xl leading-relaxed">
                      Ferramentas científicas e de automação para simulação de orçamentos, importação de planilhas de prospecção e triagem ágil de oportunidades da SciTec jr.
                    </p>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-xs font-semibold px-3 py-1.5 rounded-xl bg-purple-950/80 border border-purple-700/50 text-purple-300">
                      {canUseNegociosTools(currentProfile) ? 4 : 3} Ferramentas Ativas
                    </span>
                  </div>
                </div>

                {/* Grid com todas as ferramentas de Negócios */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                  {/* Ferramenta 1: Simulador de Precificação */}
                  <div className="p-6 rounded-2xl bg-slate-900/80 border border-purple-500/40 hover:border-purple-500 hover:shadow-xl hover:shadow-purple-950/30 flex flex-col justify-between space-y-4 transition-all group">
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <div className="p-3 rounded-xl bg-purple-950/80 border border-purple-800/60 text-purple-300">
                          <Calculator className="w-6 h-6" />
                        </div>
                        <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full border bg-emerald-500/20 text-emerald-300 border-emerald-500/40">
                          ● Ativo
                        </span>
                      </div>
                      <div>
                        <span className="text-[11px] font-bold text-purple-400 uppercase tracking-wider">
                          Precificação & Propostas
                        </span>
                        <h4 className="text-base font-bold text-white mt-0.5 group-hover:text-purple-300 transition-colors">
                          Motor de Simulação & Precificação
                        </h4>
                        <p className="text-xs text-slate-400 mt-2 leading-relaxed">
                          Cálculo científico de preço de venda e custos de equipe técnica baseado nas taxas horárias dos núcleos, modificadores de porte, urgência e complexidade.
                        </p>
                      </div>
                    </div>

                    <div className="pt-3 border-t border-slate-800/80 flex items-center justify-between">
                      <span className="text-[11px] text-slate-400">Pronto para uso</span>
                      <Link
                        href="/tools/pricing"
                        className="px-4 py-2 text-xs font-bold text-white bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 rounded-xl shadow-md flex items-center gap-1.5 transition-all transform hover:-translate-y-0.5"
                      >
                        Abrir Simulador <ArrowRight className="w-3.5 h-3.5" />
                      </Link>
                    </div>
                  </div>

                  {/* Ferramenta 2: Triagem Rápida */}
                  <div className="p-6 rounded-2xl bg-slate-900/80 border border-purple-500/40 hover:border-purple-500 hover:shadow-xl hover:shadow-purple-950/30 flex flex-col justify-between space-y-4 transition-all group">
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <div className="p-3 rounded-xl bg-purple-950/80 border border-purple-800/60 text-purple-300">
                          <Filter className="w-6 h-6" />
                        </div>
                        <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full border bg-purple-500/20 text-purple-300 border-purple-500/40">
                          ● Ativo
                        </span>
                      </div>
                      <div>
                        <span className="text-[11px] font-bold text-purple-400 uppercase tracking-wider">
                          Prospecção & Qualificação
                        </span>
                        <h4 className="text-base font-bold text-white mt-0.5 group-hover:text-purple-300 transition-colors">
                          Triagem Rápida (Decisão Ágil)
                        </h4>
                        <p className="text-xs text-slate-400 mt-2 leading-relaxed">
                          Qualificação preliminar ágil com cartões de decisão individual com atalhos de teclado (Aprovar para carteira ou Descartar com justificativa).
                        </p>
                      </div>
                    </div>

                    <div className="pt-3 border-t border-slate-800/80 flex items-center justify-between">
                      <span className="text-[11px] text-slate-400">Pronto para uso</span>
                      <Link
                        href="/tools/lead-filter"
                        className="px-4 py-2 text-xs font-bold text-white bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 rounded-xl shadow-md flex items-center gap-1.5 transition-all transform hover:-translate-y-0.5"
                      >
                        Abrir Decisão Ágil <ArrowRight className="w-3.5 h-3.5" />
                      </Link>
                    </div>
                  </div>

                  {/* Ferramenta 3: Planilha de Leads */}
                  <div className="p-6 rounded-2xl bg-slate-900/80 border border-purple-500/40 hover:border-purple-500 hover:shadow-xl hover:shadow-purple-950/30 flex flex-col justify-between space-y-4 transition-all group">
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <div className="p-3 rounded-xl bg-purple-950/80 border border-purple-800/60 text-purple-300">
                          <FileSpreadsheet className="w-6 h-6" />
                        </div>
                        <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full border bg-emerald-500/20 text-emerald-300 border-emerald-500/40">
                          ● Ativo
                        </span>
                      </div>
                      <div>
                        <span className="text-[11px] font-bold text-purple-400 uppercase tracking-wider">
                          Prospecção & Conversão
                        </span>
                        <h4 className="text-base font-bold text-white mt-0.5 group-hover:text-purple-300 transition-colors">
                          Anotação e Triagem de Leads (.xlsx/.csv)
                        </h4>
                        <p className="text-xs text-slate-400 mt-2 leading-relaxed">
                          Importação inteligente de planilhas de prospecção, mapeamento de colunas, plano de ação e conversão direta para o Funil de Vendas.
                        </p>
                      </div>
                    </div>

                    <div className="pt-3 border-t border-slate-800/80 flex items-center justify-between">
                      <span className="text-[11px] text-slate-400">Pronto para uso</span>
                      <Link
                        href="/tools/lead-sheet"
                        className="px-4 py-2 text-xs font-bold text-white bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 rounded-xl shadow-md flex items-center gap-1.5 transition-all transform hover:-translate-y-0.5"
                      >
                        Abrir Planilha <ArrowRight className="w-3.5 h-3.5" />
                      </Link>
                    </div>
                  </div>

                  {/* Ferramenta 4: Gerador de Propostas AI */}
                  <div className="p-6 rounded-2xl bg-slate-900/40 border border-slate-800/80 flex flex-col justify-between space-y-4 opacity-75">
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <div className="p-3 rounded-xl bg-purple-950/60 border border-purple-800/40 text-purple-300">
                          <FileText className="w-6 h-6" />
                        </div>
                        <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full border bg-slate-800 text-slate-400 border-slate-700">
                          Em breve
                        </span>
                      </div>
                      <div>
                        <span className="text-[11px] font-bold text-purple-400 uppercase tracking-wider">
                          Vendas & Contratos
                        </span>
                        <h4 className="text-base font-bold text-white mt-0.5">
                          Gerador de Propostas Comerciais AI
                        </h4>
                        <p className="text-xs text-slate-400 mt-2 leading-relaxed">
                          Geração automática de propostas comerciais e técnicas em PDF a partir das necessidades levantadas na reunião de diagnóstico.
                        </p>
                      </div>
                    </div>
                    <div className="pt-3 border-t border-slate-800/80 flex items-center justify-between">
                      <span className="text-[11px] text-slate-400">Em desenvolvimento</span>
                      <button disabled className="px-3.5 py-1.5 rounded-xl bg-slate-800/60 text-slate-400 text-xs font-semibold cursor-not-allowed">
                        Em breve
                      </button>
                    </div>
                  </div>

                  {/* Ferramenta 5: WhatsApp Bot */}
                  <div className="p-6 rounded-2xl bg-slate-900/40 border border-slate-800/80 flex flex-col justify-between space-y-4 opacity-75">
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <div className="p-3 rounded-xl bg-blue-950/60 border border-blue-800/40 text-blue-300">
                          <MessageSquare className="w-6 h-6" />
                        </div>
                        <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full border bg-slate-800 text-slate-400 border-slate-700">
                          Em breve
                        </span>
                      </div>
                      <div>
                        <span className="text-[11px] font-bold text-blue-400 uppercase tracking-wider">
                          Comunicação Comercial
                        </span>
                        <h4 className="text-base font-bold text-white mt-0.5">
                          Disparador & Follow-up WhatsApp SciTec
                        </h4>
                        <p className="text-xs text-slate-400 mt-2 leading-relaxed">
                          Mensagens personalizadas e lembretes pré-reunião para reduzir taxas de no-show em diagnósticos comerciais.
                        </p>
                      </div>
                    </div>
                    <div className="pt-3 border-t border-slate-800/80 flex items-center justify-between">
                      <span className="text-[11px] text-slate-400">Em desenvolvimento</span>
                      <button disabled className="px-3.5 py-1.5 rounded-xl bg-slate-800/60 text-slate-400 text-xs font-semibold cursor-not-allowed">
                        Em breve
                      </button>
                    </div>
                  </div>

                  {/* Ferramenta 6: Minerador de Leads */}
                  {canUseNegociosTools(currentProfile) && (
                    <Link
                      href="/tools/lead-miner"
                      aria-label="Abrir Minerador de Leads"
                      onKeyDown={(e) => {
                        // Enter já é nativo em <a>; Espaço precisa ser tratado.
                        if (e.key === ' ' || e.key === 'Spacebar') {
                          e.preventDefault();
                          router.push('/tools/lead-miner');
                        }
                      }}
                      className="p-6 rounded-2xl bg-slate-900/80 border border-purple-500/40 hover:border-purple-500 hover:shadow-xl hover:shadow-purple-950/30 flex flex-col justify-between space-y-4 transition-all group focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-500"
                    >
                      <div className="space-y-3">
                        <div className="flex items-center justify-between">
                          <div className="p-3 rounded-xl bg-purple-950/80 border border-purple-800/60 text-purple-300">
                            <Pickaxe className="w-6 h-6" aria-hidden="true" />
                          </div>
                          <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full border bg-emerald-500/20 text-emerald-300 border-emerald-500/40">
                            ● Ativo
                          </span>
                        </div>
                        <div>
                          <span className="text-[11px] font-bold text-purple-400 uppercase tracking-wider">
                            Inteligência de Mercado
                          </span>
                          <h4 className="text-base font-bold text-white mt-0.5 group-hover:text-purple-300 transition-colors">
                            Minerador de Leads
                          </h4>
                          <p className="text-xs text-slate-400 mt-2 leading-relaxed">
                            Mineração de empresas por bairro e nicho, análise de presença digital, classificação por oportunidade e ranking de prioridade para prospecção.
                          </p>
                        </div>
                      </div>

                      <div className="pt-3 border-t border-slate-800/80 flex items-center justify-between">
                        <span className="text-[11px] text-slate-400">Pronto para uso</span>
                        <span className="px-4 py-2 text-xs font-bold text-white bg-gradient-to-r from-purple-600 to-indigo-600 group-hover:from-purple-500 group-hover:to-indigo-500 rounded-xl shadow-md flex items-center gap-1.5 transition-all">
                          Abrir Minerador <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
                        </span>
                      </div>
                    </Link>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* TAB 3: SECTOR REQUESTS */}
        {activeTab === 'REQUESTS' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  <Send className="w-4 h-4 text-purple-400" /> Solicitações recebidas por {unitName(currentSector.code)}
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Solicitações que outros setores abriram para esta diretoria executar.
                </p>
              </div>

              <button
                onClick={() => setIsCreateRequestModalOpen(true)}
                className="px-3.5 py-1.5 text-xs font-bold rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white flex items-center gap-1.5 transition-all shadow-md"
              >
                <Plus className="w-3.5 h-3.5" /> Abrir Solicitação
              </button>
            </div>

            {requests.length === 0 ? (
              <EmptyState
                icon={CheckCircle2}
                title="Nenhuma solicitação pendente"
                description="Todas as solicitações deste setor foram atendidas ou arquivadas."
              />
            ) : (
              <div className="space-y-3">
                {requests.map((req) => (
                  <div
                    key={req.id}
                    className="p-4 rounded-2xl bg-slate-900/80 border border-slate-800 hover:border-slate-700 transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                  >
                    <div className="space-y-1.5">
                      <div className="flex items-center gap-2">
                        <span
                          className={`text-[11px] font-bold px-2 py-0.5 rounded-full border ${req.priority === 'URGENT'
                            ? 'bg-rose-500/20 text-rose-300 border-rose-500/40'
                            : req.priority === 'HIGH'
                              ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                              : 'bg-slate-800 text-slate-300 border-slate-700'
                            }`}
                        >
                          {req.priority}
                        </span>

                        <span className="text-xs font-bold text-purple-400">
                          De: Setor {req.fromDept}
                        </span>

                        <span
                          className={`text-[11px] font-semibold px-2 py-0.2 rounded-full ${req.status === 'COMPLETED'
                            ? 'bg-emerald-500/20 text-emerald-300'
                            : req.status === 'IN_PROGRESS'
                              ? 'bg-blue-500/20 text-blue-300'
                              : 'bg-amber-500/20 text-amber-300'
                            }`}
                        >
                          ● {req.status}
                        </span>
                      </div>

                      <h4 className="text-sm font-bold text-white">{req.title}</h4>
                      <p className="text-xs text-slate-400 line-clamp-2">{req.description}</p>

                      <div className="flex items-center gap-3 text-[11px] text-slate-400 pt-1">
                        <span>Solicitante: <strong className="text-slate-300">{req.requester?.name || 'Membro'}</strong></span>
                        {req.dueDate && (
                          <span>
                            SLA:{' '}
                            <strong className="text-amber-400">
                              {formatDueDate(req.dueDate)}
                            </strong>
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      {req.status === 'PENDING' && (
                        <button
                          onClick={() => handleUpdateReqStatus(req.id, 'IN_PROGRESS')}
                          className="px-3 py-1.5 rounded-lg bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-bold text-xs transition-colors"
                        >
                          Iniciar Atendimento
                        </button>
                      )}

                      {req.status === 'IN_PROGRESS' && (
                        <button
                          onClick={() => handleUpdateReqStatus(req.id, 'COMPLETED')}
                          className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs transition-colors flex items-center gap-1"
                        >
                          <CheckCircle2 className="w-3.5 h-3.5" /> Concluir
                        </button>
                      )}

                      {req.linkedCardId && (
                        <Link
                          href={`/setores/${deptParam}?openCard=${req.linkedCardId}`}
                          className="p-1.5 text-slate-400 hover:text-white rounded-lg bg-slate-800 transition-colors"
                          title="Ver card gerado no funil"
                        >
                          <ExternalLink className="w-4 h-4" />
                        </Link>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </main>

      {/* Create Card Modal for Active Pipe */}
      {isCreateCardModalOpen && activePipe && activePipe.phases.length > 0 && (
        <CreateCardModal
          phaseId={activePipe.phases[0].id}
          phases={activePipe.phases}
          users={users}
          onClose={() => setIsCreateCardModalOpen(false)}
          onCardCreated={() => {
            fetchSectorData();
            setIsCreateCardModalOpen(false);
          }}
        />
      )}

      {/* Global Create Request Modal */}
      <CreateRequestModal
        isOpen={isCreateRequestModalOpen}
        onClose={() => setIsCreateRequestModalOpen(false)}
        defaultToDept={currentSector.code}
        onSuccess={fetchSectorData}
      />

      {/* Create Custom Pipe Modal for GENTE */}
      <CreatePipeModal
        isOpen={isCreatePipeModalOpen}
        onClose={() => setIsCreatePipeModalOpen(false)}
        defaultDepartment={currentSector.code}
        onSuccess={(newPipe) => {
          setPipes((prev) => [...prev, newPipe]);
          setSelectedPipeId(newPipe.id);
          setGenteViewMode('KANBAN');
        }}
      />

      {/* AdmJurFin: Modal Nova Movimentação Financeira */}
      {isNewTransactionModalOpen && (
        <ModalFrame onClose={() => setIsNewTransactionModalOpen(false)} label="Nova Movimentação Financeira" className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-fadeIn">
          <div className="relative w-full max-w-md bg-slate-900 border border-blue-800/50 rounded-2xl shadow-2xl p-6 space-y-4">
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <Receipt className="w-5 h-5 text-blue-400" /> Nova Movimentação Financeira
            </h3>

            <form onSubmit={handleCreateTransaction} className="space-y-3 text-xs">
              <div>
                <label htmlFor="page-1" className="block text-slate-300 font-semibold mb-1">Descrição</label>
                <input id="page-1"
                  type="text"
                  value={transDesc}
                  onChange={(e) => setTransDesc(e.target.value)}
                  placeholder="Ex: Parcela 1/2 Projeto X ou Hospedagem Cloud"
                  className={`${CONTROL_CLASS} w-full`}
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="page-2" className="block text-slate-300 font-semibold mb-1">Valor (R$)</label>
                  <input id="page-2"
                    type="number"
                    step="0.01"
                    min="0"
                    value={transAmount}
                    onChange={(e) => setTransAmount(e.target.value)}
                    placeholder="0.00"
                    className={`${CONTROL_CLASS} w-full`}
                    required
                  />
                </div>

                <div>
                  <label htmlFor="page-3" className="block text-slate-300 font-semibold mb-1">Tipo</label>
                  <select id="page-3"
                    value={transType}
                    onChange={(e) => setTransType(e.target.value as any)}
                    className={`${CONTROL_CLASS} w-full`}
                  >
                    <option value="INFLOW">Receita (Entrada)</option>
                    <option value="OUTFLOW">Despesa (Saída)</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="page-4" className="block text-slate-300 font-semibold mb-1">Categoria</label>
                  <select id="page-4"
                    value={transCategory}
                    onChange={(e) => setTransCategory(e.target.value)}
                    className={`${CONTROL_CLASS} w-full`}
                  >
                    <option value="Projeto">Projeto</option>
                    <option value="Ferramenta">Ferramenta / Software</option>
                    <option value="Reembolso">Reembolso</option>
                    <option value="Evento">Evento / Treinamento</option>
                    <option value="Outros">Outros</option>
                  </select>
                </div>

                <div>
                  <label htmlFor="page-5" className="block text-slate-300 font-semibold mb-1">Status</label>
                  <select id="page-5"
                    value={transStatus}
                    onChange={(e) => setTransStatus(e.target.value as any)}
                    className={`${CONTROL_CLASS} w-full`}
                  >
                    <option value="PAID">Liquidado / Pago</option>
                    <option value="PENDING">Pendente</option>
                  </select>
                </div>
              </div>

              <div className="pt-3 border-t border-slate-800 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsNewTransactionModalOpen(false)}
                  className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold text-xs"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-bold text-xs shadow-md shadow-purple-900/30"
                >
                  Salvar Lançamento
                </button>
              </div>
            </form>
          </div>
        </ModalFrame>
      )}
    </div>
  );
}

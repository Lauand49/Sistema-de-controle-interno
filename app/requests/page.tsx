'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { SciTecNavbar } from '@/components/navigation/SciTecNavbar';
import { CreateRequestModal } from '@/components/modals/CreateRequestModal';
import { useProfile } from '@/contexts/ProfileContext';
import { CrossDeptRequest, Department } from '@/types';
import { toast } from 'sonner';
import {
  Send,
  Sparkles,
  Plus,
  Filter,
  CheckCircle2,
  Clock,
  AlertTriangle,
  ExternalLink,
  ArrowRight,
  Search,
  Building2,
  Scale,
  Users,
  Palette,
  Calendar,
  Layers,
} from 'lucide-react';

export default function CrossDeptRequestsPage() {
  const { currentProfile } = useProfile();

  const [requests, setRequests] = useState<CrossDeptRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);

  // Filters State
  const [filterToDept, setFilterToDept] = useState('ALL');
  const [filterFromDept, setFilterFromDept] = useState('ALL');
  const [filterStatus, setFilterStatus] = useState('ALL');
  const [filterPriority, setFilterPriority] = useState('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  const fetchRequests = async () => {
    setLoading(true);
    try {
      const url = new URL('/api/requests', window.location.origin);
      if (filterToDept !== 'ALL') url.searchParams.set('toDept', filterToDept);
      if (filterFromDept !== 'ALL') url.searchParams.set('fromDept', filterFromDept);
      if (filterStatus !== 'ALL') url.searchParams.set('status', filterStatus);

      const res = await fetch(url.toString());
      if (res.ok) {
        const data = await res.json();
        setRequests(Array.isArray(data) ? data : []);
      }
    } catch {
      toast.error('Erro ao carregar solicitações intersetoriais.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRequests();
  }, [filterToDept, filterFromDept, filterStatus]);

  // Update Status
  const handleUpdateStatus = async (id: string, newStatus: string) => {
    try {
      const res = await fetch(`/api/requests/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: newStatus,
          handlerId: currentProfile?.id || null,
        }),
      });

      if (!res.ok) throw new Error('Erro ao atualizar solicitação.');

      toast.success(`Solicitação alterada para "${newStatus}"!`);
      fetchRequests();
    } catch (err: any) {
      toast.error(err.message || 'Erro ao atualizar.');
    }
  };

  // Filter in memory for Priority and Search
  const filteredRequests = requests.filter((r) => {
    if (filterPriority !== 'ALL' && r.priority !== filterPriority) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchTitle = r.title.toLowerCase().includes(q);
      const matchDesc = r.description.toLowerCase().includes(q);
      const matchRequester = r.requester?.name?.toLowerCase().includes(q);
      if (!matchTitle && !matchDesc && !matchRequester) return false;
    }
    return true;
  });

  // Calculate Metrics
  const totalCount = requests.length;
  const pendingCount = requests.filter((r) => r.status === 'PENDING').length;
  const inProgressCount = requests.filter((r) => r.status === 'IN_PROGRESS').length;
  const completedCount = requests.filter((r) => r.status === 'COMPLETED').length;

  const getDeptColor = (dept: string) => {
    switch (dept) {
      case 'NEGOCIOS':
        return 'text-purple-400 bg-purple-950/60 border-purple-800/60';
      case 'ADMJURFIN':
        return 'text-blue-400 bg-blue-950/60 border-blue-800/60';
      case 'GENTE':
        return 'text-amber-400 bg-amber-950/60 border-amber-800/60';
      case 'MIDIAS':
        return 'text-pink-400 bg-pink-950/60 border-pink-800/60';
      default:
        return 'text-slate-400 bg-slate-900 border-slate-800';
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-slate-950 text-slate-100">
      <SciTecNavbar onRefresh={fetchRequests} loading={loading} />

      <main className="flex-1 max-w-7xl w-full mx-auto p-4 md:p-6 space-y-6">
        {/* Banner Hero */}
        <div className="relative rounded-3xl bg-gradient-to-r from-purple-950/80 via-slate-900 to-indigo-950/80 border border-purple-800/40 p-6 md:p-8 shadow-2xl overflow-hidden">
          <div className="absolute top-0 right-0 transform translate-x-12 -translate-y-12 w-96 h-96 bg-purple-600/10 rounded-full blur-3xl pointer-events-none" />

          <div className="relative z-10 flex flex-col sm:flex-row sm:items-center justify-between gap-6">
            <div className="space-y-2 max-w-2xl">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-bold bg-purple-950/80 text-purple-300 border border-purple-700/50">
                <Send className="w-3.5 h-3.5 text-purple-400" /> Integração Intersetorial
              </div>
              <h1 className="text-2xl md:text-3xl font-black tracking-tight text-white">
                Central de Solicitações da SciTec jr.
              </h1>
              <p className="text-xs md:text-sm text-purple-200/80 leading-relaxed">
                Canal unificado para demandas cruzadas entre Negócios, AdmJurFin, Gente e Mídias.
                Cada pedido gera automaticamente um card no Kanban do setor responsável com rastreamento de SLA.
              </p>
            </div>

            <button
              onClick={() => setIsCreateModalOpen(true)}
              className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-bold text-xs shadow-lg shadow-purple-900/40 flex items-center justify-center gap-2 transition-all transform active:scale-95 shrink-0"
            >
              <Plus className="w-4 h-4" /> Nova Solicitação
            </button>
          </div>
        </div>

        {/* KPI Metrics Summary */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="p-4 rounded-2xl bg-slate-900/80 border border-slate-800 space-y-1">
            <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block">
              Total de Solicitações
            </span>
            <h3 className="text-2xl font-black text-white">{totalCount}</h3>
            <span className="text-[10px] text-slate-500">Histórico geral da EJ</span>
          </div>

          <div className="p-4 rounded-2xl bg-slate-900/80 border border-slate-800 space-y-1">
            <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block">
              Pendentes de Início
            </span>
            <h3 className="text-2xl font-black text-amber-400">{pendingCount}</h3>
            <span className="text-[10px] text-slate-500">Aguardando atendimento do setor</span>
          </div>

          <div className="p-4 rounded-2xl bg-slate-900/80 border border-slate-800 space-y-1">
            <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block">
              Em Execução
            </span>
            <h3 className="text-2xl font-black text-blue-400">{inProgressCount}</h3>
            <span className="text-[10px] text-slate-500">Com responsável alocado</span>
          </div>

          <div className="p-4 rounded-2xl bg-slate-900/80 border border-slate-800 space-y-1">
            <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block">
              Concluídas
            </span>
            <h3 className="text-2xl font-black text-emerald-400">{completedCount}</h3>
            <span className="text-[10px] text-slate-500">Entregues com sucesso</span>
          </div>
        </div>

        {/* Filter Controls Bar */}
        <div className="p-4 rounded-2xl bg-slate-900/80 border border-slate-800 space-y-3">
          <div className="flex items-center justify-between border-b border-slate-800/60 pb-2.5">
            <span className="text-xs font-bold text-slate-300 flex items-center gap-1.5 uppercase tracking-wider">
              <Filter className="w-3.5 h-3.5 text-purple-400" /> Filtros de Busca
            </span>

            <div className="relative w-64">
              <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-2.5" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Buscar por título, escopo ou solicitante..."
                className="w-full pl-8 pr-3 py-1.5 rounded-lg bg-slate-950 border border-slate-800 text-xs text-white placeholder-slate-600 focus:outline-none focus:border-purple-500"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
            <div>
              <label className="block text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1">
                Setor de Destino
              </label>
              <select
                value={filterToDept}
                onChange={(e) => setFilterToDept(e.target.value)}
                className="w-full px-3 py-1.5 rounded-lg bg-slate-950 border border-slate-800 text-xs text-white focus:outline-none focus:border-purple-500"
              >
                <option value="ALL">Todos os Destinos</option>
                <option value="ADMJURFIN">AdmJurFin</option>
                <option value="MIDIAS">Mídias</option>
                <option value="GENTE">Gente</option>
                <option value="NEGOCIOS">Negócios</option>
              </select>
            </div>

            <div>
              <label className="block text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1">
                Setor de Origem
              </label>
              <select
                value={filterFromDept}
                onChange={(e) => setFilterFromDept(e.target.value)}
                className="w-full px-3 py-1.5 rounded-lg bg-slate-950 border border-slate-800 text-xs text-white focus:outline-none focus:border-purple-500"
              >
                <option value="ALL">Todas as Origens</option>
                <option value="NEGOCIOS">Negócios</option>
                <option value="ADMJURFIN">AdmJurFin</option>
                <option value="GENTE">Gente</option>
                <option value="MIDIAS">Mídias</option>
              </select>
            </div>

            <div>
              <label className="block text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1">
                Status
              </label>
              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
                className="w-full px-3 py-1.5 rounded-lg bg-slate-950 border border-slate-800 text-xs text-white focus:outline-none focus:border-purple-500"
              >
                <option value="ALL">Todos os Status</option>
                <option value="PENDING">Pendente</option>
                <option value="IN_PROGRESS">Em Andamento</option>
                <option value="COMPLETED">Concluída</option>
                <option value="REJECTED">Rejeitada</option>
              </select>
            </div>

            <div>
              <label className="block text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-1">
                Prioridade
              </label>
              <select
                value={filterPriority}
                onChange={(e) => setFilterPriority(e.target.value)}
                className="w-full px-3 py-1.5 rounded-lg bg-slate-950 border border-slate-800 text-xs text-white focus:outline-none focus:border-purple-500"
              >
                <option value="ALL">Todas as Prioridades</option>
                <option value="LOW">Baixa</option>
                <option value="MEDIUM">Média</option>
                <option value="HIGH">Alta</option>
                <option value="URGENT">Urgente</option>
              </select>
            </div>
          </div>
        </div>

        {/* Requests List */}
        <div className="space-y-3">
          {filteredRequests.length === 0 ? (
            <div className="p-12 rounded-2xl bg-slate-900/40 border border-dashed border-slate-800 text-center space-y-2">
              <CheckCircle2 className="w-8 h-8 text-slate-600 mx-auto" />
              <h4 className="text-sm font-bold text-white">Nenhuma solicitação encontrada</h4>
              <p className="text-xs text-slate-400">
                Ajuste os filtros acima ou crie uma nova solicitação.
              </p>
            </div>
          ) : (
            filteredRequests.map((req) => (
              <div
                key={req.id}
                className="p-5 rounded-2xl bg-slate-900/80 border border-slate-800 hover:border-slate-700 transition-all flex flex-col md:flex-row md:items-center justify-between gap-4"
              >
                <div className="space-y-2 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    {/* Priority Badge */}
                    <span
                      className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full border ${
                        req.priority === 'URGENT'
                          ? 'bg-rose-500/20 text-rose-300 border-rose-500/40'
                          : req.priority === 'HIGH'
                          ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                          : 'bg-slate-800 text-slate-300 border-slate-700'
                      }`}
                    >
                      {req.priority === 'URGENT' ? '🚨 URGENTE' : req.priority}
                    </span>

                    {/* Department Flow Badge */}
                    <span
                      className={`text-[11px] font-bold px-2 py-0.5 rounded-lg border ${getDeptColor(
                        req.fromDept
                      )}`}
                    >
                      {req.fromDept}
                    </span>
                    <ArrowRight className="w-3 h-3 text-slate-500" />
                    <span
                      className={`text-[11px] font-bold px-2 py-0.5 rounded-lg border ${getDeptColor(
                        req.toDept
                      )}`}
                    >
                      {req.toDept}
                    </span>

                    {/* Status Badge */}
                    <span
                      className={`text-[11px] font-bold px-2.5 py-0.5 rounded-full ml-auto md:ml-2 ${
                        req.status === 'COMPLETED'
                          ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                          : req.status === 'IN_PROGRESS'
                          ? 'bg-blue-500/20 text-blue-300 border border-blue-500/40'
                          : 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                      }`}
                    >
                      ● {req.status}
                    </span>
                  </div>

                  <h3 className="text-sm font-bold text-white">{req.title}</h3>
                  <p className="text-xs text-slate-400 leading-relaxed whitespace-pre-line line-clamp-2">
                    {req.description}
                  </p>

                  <div className="flex flex-wrap items-center gap-4 text-[11px] text-slate-500 pt-1">
                    <span>
                      Solicitante: <strong className="text-slate-300">{req.requester?.name || 'Membro'}</strong>
                    </span>
                    {req.handler && (
                      <span>
                        Responsável: <strong className="text-slate-300">{req.handler.name}</strong>
                      </span>
                    )}
                    {req.dueDate && (
                      <span className="flex items-center gap-1 text-amber-400 font-medium">
                        <Calendar className="w-3 h-3" /> SLA:{' '}
                        {new Date(req.dueDate).toLocaleDateString('pt-BR')}
                      </span>
                    )}
                  </div>
                </div>

                {/* Right Actions */}
                <div className="flex items-center gap-2 pt-2 md:pt-0 border-t md:border-t-0 border-slate-800 shrink-0">
                  {req.status === 'PENDING' && (
                    <button
                      onClick={() => handleUpdateStatus(req.id, 'IN_PROGRESS')}
                      className="px-3 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs transition-colors"
                    >
                      Iniciar Atendimento
                    </button>
                  )}

                  {req.status === 'IN_PROGRESS' && (
                    <button
                      onClick={() => handleUpdateStatus(req.id, 'COMPLETED')}
                      className="px-3.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs transition-colors flex items-center gap-1 shadow-md shadow-emerald-900/30"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" /> Concluir
                    </button>
                  )}

                  {req.linkedCardId && (
                    <Link
                      href={`/setores/${req.toDept.toLowerCase()}?openCard=${req.linkedCardId}`}
                      className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors flex items-center gap-1.5 text-xs font-semibold"
                      title="Abrir card vinculado no Kanban do setor destino"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                      <span className="hidden sm:inline">Ver no Funil</span>
                    </Link>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </main>

      <CreateRequestModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        onSuccess={fetchRequests}
      />
    </div>
  );
}

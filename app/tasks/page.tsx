'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { SciTecNavbar } from '@/components/navigation/SciTecNavbar';
import { useProfile } from '@/contexts/ProfileContext';
import { Task, User, Pipe } from '@/types';
import {
  CheckSquare,
  Plus,
  Clock,
  Calendar,
  AlertCircle,
  CheckCircle2,
  Trash2,
  Edit3,
  Filter,
  Users,
  Search,
  ArrowRight,
  Sparkles,
  ExternalLink,
  Kanban,
  Check,
  X,
  ChevronRight,
} from 'lucide-react';
import { toast } from 'sonner';
import { isDepartmentManager, isGlobal, isSectorManager } from '@/lib/permissions';
import { formatDueDate } from '@/lib/dashboards/format';
import { ModalFrame } from '@/components/ui/Modal';
import { CONTROL_CLASS } from '@/components/ui/Input';
import { LoadingState, EmptyState, PageHeader, StatCard } from '@/components/ui/Display';
import { Button } from '@/components/ui/Button';

type TaskStatus = 'TODO' | 'IN_PROGRESS' | 'DONE' | 'CANCELLED';
type TaskPriority = 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';

export default function MyTasksPage() {
  const { currentProfile, profiles, loading: profileLoading } = useProfile();

  // State
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [assignedCards, setAssignedCards] = useState<any[]>([]);

  // Filters
  const [viewScope, setViewScope] = useState<'MINE' | 'ALL'>('MINE');
  const [selectedMemberId, setSelectedMemberId] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState('');
  const [priorityFilter, setPriorityFilter] = useState<'ALL' | TaskPriority>('ALL');

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [formTitle, setFormTitle] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [formPriority, setFormPriority] = useState<TaskPriority>('MEDIUM');
  const [formStatus, setFormStatus] = useState<TaskStatus>('TODO');
  const [formDueDate, setFormDueDate] = useState('');
  const [formAssigneeId, setFormAssigneeId] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Sync selectedMemberId with currentProfile on initial load
  useEffect(() => {
    if (currentProfile && !selectedMemberId) {
      setSelectedMemberId(currentProfile.id);
    }
  }, [currentProfile]);

  // Fetch tasks and related assigned items
  const fetchData = async () => {
    setLoading(true);
    try {
      const [tasksRes, pipesRes] = await Promise.all([
        fetch('/api/tasks'),
        fetch('/api/pipes'),
      ]);

      if (tasksRes.ok) {
        const tasksData = await tasksRes.json();
        setTasks(tasksData);
      }

      if (pipesRes.ok) {
        const pipesData: Pipe[] = await pipesRes.json();
        const allCards: any[] = [];
        pipesData.forEach((pipe) => {
          pipe.phases.forEach((phase) => {
            phase.cards.forEach((card) => {
              allCards.push({
                ...card,
                phaseName: phase.name,
                phaseColor: phase.color,
              });
            });
          });
        });
        setAssignedCards(allCards);
      }
    } catch (err: any) {
      console.error('Erro ao buscar tarefas:', err);
      toast.error('Erro ao carregar tarefas.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  // Filter tasks
  const activeMemberId = viewScope === 'MINE' ? currentProfile?.id : selectedMemberId;

  const filteredTasks = tasks.filter((task) => {
    // Member filter
    if (viewScope === 'MINE' && currentProfile) {
      if (task.assigneeId !== currentProfile.id) return false;
    } else if (viewScope === 'ALL' && selectedMemberId && selectedMemberId !== 'ALL') {
      if (task.assigneeId !== selectedMemberId) return false;
    }

    // Priority filter
    if (priorityFilter !== 'ALL' && task.priority !== priorityFilter) {
      return false;
    }

    // Search query
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      const matchesTitle = task.title.toLowerCase().includes(q);
      const matchesDesc = task.description?.toLowerCase().includes(q);
      if (!matchesTitle && !matchesDesc) return false;
    }

    return true;
  });

  // Filter assigned cards for the current member
  const myCards = assignedCards.filter(
    (c) => c.assigneeId === (currentProfile?.id || '')
  );

  // Group tasks by status
  const todoTasks = filteredTasks.filter((t) => t.status === 'TODO');
  const inProgressTasks = filteredTasks.filter((t) => t.status === 'IN_PROGRESS');
  const doneTasks = filteredTasks.filter((t) => t.status === 'DONE');

  // Open modal to Create
  const handleOpenCreate = (initialStatus: TaskStatus = 'TODO') => {
    setEditingTask(null);
    setFormTitle('');
    setFormDescription('');
    setFormPriority('MEDIUM');
    setFormStatus(initialStatus);
    setFormDueDate('');
    setFormAssigneeId(currentProfile?.id || '');
    setIsModalOpen(true);
  };

  // Open modal to Edit
  const handleOpenEdit = (task: Task) => {
    setEditingTask(task);
    setFormTitle(task.title);
    setFormDescription(task.description || '');
    setFormPriority(task.priority);
    setFormStatus(task.status);
    setFormDueDate(task.dueDate ? task.dueDate.split('T')[0] : '');
    setFormAssigneeId(task.assigneeId || '');
    setIsModalOpen(true);
  };

  // Submit Task (Create / Edit)
  const handleSubmitTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formTitle.trim()) {
      toast.error('Informe o título da tarefa.');
      return;
    }

    setSubmitting(true);
    try {
      if (editingTask) {
        // Update
        const res = await fetch(`/api/tasks/${editingTask.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title: formTitle.trim(),
            description: formDescription.trim() || null,
            priority: formPriority,
            status: formStatus,
            dueDate: formDueDate || null,
            assigneeId: formAssigneeId || null,
          }),
        });

        if (!res.ok) throw new Error('Erro ao atualizar tarefa.');

        const updated = await res.json();
        setTasks((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
        toast.success('Tarefa atualizada com sucesso!');
      } else {
        // Create
        const res = await fetch('/api/tasks', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title: formTitle.trim(),
            description: formDescription.trim() || null,
            priority: formPriority,
            status: formStatus,
            dueDate: formDueDate || null,
            assigneeId: formAssigneeId || null,
          }),
        });

        if (!res.ok) throw new Error('Erro ao criar tarefa.');

        const created = await res.json();
        setTasks((prev) => [created, ...prev]);
        toast.success('Tarefa adicionada!');
      }

      setIsModalOpen(false);
    } catch (err: any) {
      toast.error(err.message || 'Erro ao salvar tarefa.');
    } finally {
      setSubmitting(false);
    }
  };

  // Quick Status Update
  const handleUpdateStatus = async (taskId: string, newStatus: TaskStatus) => {
    try {
      const res = await fetch(`/api/tasks/${taskId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });

      if (!res.ok) throw new Error('Erro ao alterar status.');

      const updated = await res.json();
      setTasks((prev) => prev.map((t) => (t.id === taskId ? updated : t)));

      if (newStatus === 'DONE') {
        toast.success('Tarefa marcada como concluída!');
      } else {
        toast.success(`Tarefa movida para ${newStatus === 'IN_PROGRESS' ? 'Em Andamento' : 'A Fazer'}`);
      }
    } catch (err: any) {
      toast.error(err.message || 'Erro ao atualizar.');
    }
  };

  // Delete Task
  const handleDeleteTask = async (taskId: string) => {
    if (!confirm('Deseja excluir esta tarefa?')) return;

    try {
      const res = await fetch(`/api/tasks/${taskId}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Erro ao excluir tarefa.');

      setTasks((prev) => prev.filter((t) => t.id !== taskId));
      toast.success('Tarefa excluída.');
    } catch (err: any) {
      toast.error(err.message || 'Erro ao excluir.');
    }
  };

  const getPriorityBadge = (p: TaskPriority) => {
    switch (p) {
      case 'URGENT':
        return (
          <span className="px-2 py-0.5 rounded text-[11px] font-extrabold uppercase bg-rose-500/20 text-rose-300 border border-rose-500/40">
            Urgente
          </span>
        );
      case 'HIGH':
        return (
          <span className="px-2 py-0.5 rounded text-[11px] font-extrabold uppercase bg-amber-500/20 text-amber-300 border border-amber-500/40">
            Alta
          </span>
        );
      case 'MEDIUM':
        return (
          <span className="px-2 py-0.5 rounded text-[11px] font-extrabold uppercase bg-blue-500/20 text-blue-300 border border-blue-500/40">
            Média
          </span>
        );
      case 'LOW':
      default:
        return (
          <span className="px-2 py-0.5 rounded text-[11px] font-extrabold uppercase bg-slate-800 text-slate-400 border border-slate-700">
            Baixa
          </span>
        );
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-slate-950 text-slate-100 selection:bg-purple-500 selection:text-white">
      <SciTecNavbar />

      <main className="flex-1 min-w-0 max-w-7xl w-full mx-auto p-4 md:p-6 space-y-6">
        <PageHeader
          icon={CheckSquare}
          title="Minhas Tarefas & Responsabilidades"
          subtitle={`Tarefas atribuídas a ${currentProfile?.name || 'você'} (${currentProfile?.title || 'Membro'}), além dos projetos e cards sob sua responsabilidade.`}
          actions={
            <Button icon={Plus} onClick={() => handleOpenCreate('TODO')}>
              Nova Tarefa
            </Button>
          }
        />
        {/* Workload Summary Cards for Current Operator */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <StatCard label="A Fazer" icon={Clock} tone="default" value={todoTasks.length} />

          <StatCard label="Em Andamento" icon={AlertCircle} tone="info" value={inProgressTasks.length} />

          <StatCard label="Concluídas" icon={CheckCircle2} tone="success" value={doneTasks.length} />

          <StatCard label="Cards no Funil" icon={Kanban} tone="default" value={myCards.length} />
        </div>

        {/* Filter Controls Bar */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4">
          {/* Escopo: Presidência e gerentes acompanham a equipe; assessores só as próprias tarefas */}
          {currentProfile && (isGlobal(currentProfile) || isDepartmentManager(currentProfile) || isSectorManager(currentProfile)) ? (
            <div className="flex items-center gap-1.5 p-1 rounded-2xl bg-slate-900/80 border border-slate-800">
              <button
                onClick={() => setViewScope('MINE')}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                  viewScope === 'MINE'
                    ? 'bg-purple-600 text-white shadow-md'
                    : 'text-slate-400 hover:text-white hover:bg-slate-800'
                }`}
              >
                Minhas Tarefas ({currentProfile?.name.split(' ')[0] || 'Eu'})
              </button>

              <button
                onClick={() => setViewScope('ALL')}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                  viewScope === 'ALL'
                    ? 'bg-purple-600 text-white shadow-md'
                    : 'text-slate-400 hover:text-white hover:bg-slate-800'
                }`}
              >
                Tarefas da Equipe (Supervisão)
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-2xl bg-slate-900/80 border border-slate-800 text-xs font-bold text-emerald-400">
              <CheckCircle2 className="w-3.5 h-3.5" /> Tarefas Pessoais de {currentProfile?.name.split(' ')[0]}
            </div>
          )}

          <div className="flex items-center gap-3 flex-wrap">
            {/* Filter by Member when in ALL scope */}
            {viewScope === 'ALL' && (
              <select
                value={selectedMemberId}
                onChange={(e) => setSelectedMemberId(e.target.value)}
                className={`${CONTROL_CLASS}`}
              >
                <option value="ALL">Todos os Membros</option>
                {profiles.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} ({p.title})
                  </option>
                ))}
              </select>
            )}

            {/* Filter Priority */}
            <select
              value={priorityFilter}
              onChange={(e) => setPriorityFilter(e.target.value as any)}
              className={`${CONTROL_CLASS}`}
            >
              <option value="ALL">Todas Prioridades</option>
              <option value="URGENT">Urgente</option>
              <option value="HIGH">Alta</option>
              <option value="MEDIUM">Média</option>
              <option value="LOW">Baixa</option>
            </select>

            {/* Search Box */}
            <div className="relative min-w-[220px]">
              <Search className="w-4 h-4 text-purple-400 absolute left-3 top-2.5" />
              <input
                type="text"
                placeholder="Buscar tarefa..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className={`${CONTROL_CLASS} w-full pl-9 pr-4 placeholder:text-slate-400`}
              />
            </div>
          </div>
        </div>

        {/* Tasks Kanban Board */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* COLUMN 1: A FAZER (TODO) */}
          <div className="bg-slate-900/40 border border-slate-800/80 rounded-3xl p-4 flex flex-col space-y-3">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800/80 px-2">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-purple-500" />
                <h3 className="font-bold text-white text-sm">A Fazer</h3>
                <span className="px-2 py-0.5 rounded-full bg-slate-800 text-purple-300 text-[11px] font-extrabold">
                  {todoTasks.length}
                </span>
              </div>
              <button
                onClick={() => handleOpenCreate('TODO')}
                className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800"
                title="Adicionar tarefa em A Fazer"
              >
                <Plus className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 overflow-y-auto max-h-[600px] pr-1">
              {loading ? (
                <LoadingState label="Carregando…" />
              ) : todoTasks.length === 0 ? (
                <EmptyState title="Nenhuma tarefa pendente nesta coluna." />
              ) : (
                todoTasks.map((task) => (
                  <TaskCard
                    key={task.id}
                    task={task}
                    onStatusChange={handleUpdateStatus}
                    onEdit={handleOpenEdit}
                    onDelete={handleDeleteTask}
                    getPriorityBadge={getPriorityBadge}
                  />
                ))
              )}
            </div>
          </div>

          {/* COLUMN 2: EM ANDAMENTO (IN_PROGRESS) */}
          <div className="bg-slate-900/40 border border-slate-800/80 rounded-3xl p-4 flex flex-col space-y-3">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800/80 px-2">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-blue-500 animate-pulse" />
                <h3 className="font-bold text-white text-sm">Em Andamento</h3>
                <span className="px-2 py-0.5 rounded-full bg-slate-800 text-blue-300 text-[11px] font-extrabold">
                  {inProgressTasks.length}
                </span>
              </div>
              <button
                onClick={() => handleOpenCreate('IN_PROGRESS')}
                className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800"
                title="Adicionar tarefa em Em Andamento"
              >
                <Plus className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 overflow-y-auto max-h-[600px] pr-1">
              {loading ? (
                <LoadingState label="Carregando…" />
              ) : inProgressTasks.length === 0 ? (
                <EmptyState title="Nenhuma tarefa em andamento." />
              ) : (
                inProgressTasks.map((task) => (
                  <TaskCard
                    key={task.id}
                    task={task}
                    onStatusChange={handleUpdateStatus}
                    onEdit={handleOpenEdit}
                    onDelete={handleDeleteTask}
                    getPriorityBadge={getPriorityBadge}
                  />
                ))
              )}
            </div>
          </div>

          {/* COLUMN 3: CONCLUÍDO (DONE) */}
          <div className="bg-slate-900/40 border border-slate-800/80 rounded-3xl p-4 flex flex-col space-y-3">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800/80 px-2">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" />
                <h3 className="font-bold text-white text-sm">Concluídas</h3>
                <span className="px-2 py-0.5 rounded-full bg-slate-800 text-emerald-300 text-[11px] font-extrabold">
                  {doneTasks.length}
                </span>
              </div>
            </div>

            <div className="space-y-3 overflow-y-auto max-h-[600px] pr-1">
              {loading ? (
                <LoadingState label="Carregando…" />
              ) : doneTasks.length === 0 ? (
                <EmptyState title="Nenhuma tarefa concluída ainda." />
              ) : (
                doneTasks.map((task) => (
                  <TaskCard
                    key={task.id}
                    task={task}
                    onStatusChange={handleUpdateStatus}
                    onEdit={handleOpenEdit}
                    onDelete={handleDeleteTask}
                    getPriorityBadge={getPriorityBadge}
                  />
                ))
              )}
            </div>
          </div>
        </div>

        {/* Connected Work Section: Pipeline Cards */}
        {viewScope === 'MINE' && (
          <div className="pt-6 border-t border-slate-800/80 space-y-6">
            <h3 className="text-base font-black text-white flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-purple-400" /> Outras Demandas Atribuídas a Você
            </h3>

            <div className="grid grid-cols-1 gap-6">
              {/* My Pipeline Cards Box */}
              <div className="bg-slate-900/50 border border-slate-800 rounded-3xl p-5 space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="p-2 rounded-xl bg-purple-950/60 text-purple-400 border border-purple-800/40">
                      <Kanban className="w-4 h-4" />
                    </div>
                    <div>
                      <h4 className="font-bold text-white text-sm">Cards Ativos no Funil</h4>
                      <p className="text-[11px] text-slate-400">Atividades, projetos ou demandas com você</p>
                    </div>
                  </div>
                  <Link
                    href="/pipe"
                    className="text-[11px] font-bold text-purple-400 hover:text-purple-300 flex items-center gap-1"
                  >
                    Abrir Funil <ExternalLink className="w-3 h-3" />
                  </Link>
                </div>

                {myCards.length === 0 ? (
                  <p className="text-xs text-slate-400 py-4 text-center">
                    Você ainda não possui cards ativos no funil.
                  </p>
                ) : (
                  <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                    {myCards.map((card) => (
                      <div
                        key={card.id}
                        className="p-3 rounded-2xl bg-slate-950/60 border border-slate-800/80 flex items-center justify-between text-xs"
                      >
                        <div className="max-w-[200px] truncate">
                          <div className="font-bold text-white truncate">{card.title}</div>
                          <div className="text-[11px] text-slate-400">Fase: {card.phaseName}</div>
                        </div>
                        <Link
                          href={`/pipe?openCard=${card.id}`}
                          className="px-2.5 py-1 rounded-xl bg-purple-600/30 hover:bg-purple-600/50 text-purple-300 font-bold text-[11px] border border-purple-500/30 transition-colors"
                        >
                          Ver Card
                        </Link>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Modal: Create / Edit Task */}
        {isModalOpen && (
          <ModalFrame onClose={() => setIsModalOpen(false)} label="Tarefa" className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm">
            <div className="bg-slate-900 border border-slate-800 rounded-3xl w-full max-w-lg overflow-hidden shadow-2xl p-6 space-y-5 animate-in fade-in duration-150">
              <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                <div className="flex items-center gap-2.5">
                  <div className="p-2 rounded-xl bg-purple-950/60 border border-purple-800/40 text-purple-400">
                    <CheckSquare className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="font-bold text-white text-base">
                      {editingTask ? 'Editar Tarefa' : 'Nova Tarefa'}
                    </h3>
                    <p className="text-[11px] text-slate-400">Designação nominal para membros da SciTec jr.</p>
                  </div>
                </div>
                <button
                  onClick={() => setIsModalOpen(false)}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <form onSubmit={handleSubmitTask} className="space-y-4">
                {/* Título */}
                <div className="space-y-1.5">
                  <label htmlFor="page-1" className="text-xs font-semibold text-slate-300">
                    Título da Tarefa <span className="text-rose-400">*</span>
                  </label>
                  <input id="page-1"
                    type="text"
                    required
                    placeholder="Ex: Entrar em contato com o cliente X para diagnóstico..."
                    value={formTitle}
                    onChange={(e) => setFormTitle(e.target.value)}
                    className={`${CONTROL_CLASS} w-full placeholder:text-slate-600`}
                  />
                </div>

                {/* Descrição */}
                <div className="space-y-1.5">
                  <label htmlFor="page-2" className="text-xs font-semibold text-slate-300">Descrição / Orientações</label>
                  <textarea id="page-2"
                    rows={3}
                    placeholder="Detalhes sobre o que deve ser feito, links ou anotações..."
                    value={formDescription}
                    onChange={(e) => setFormDescription(e.target.value)}
                    className={`${CONTROL_CLASS} w-full placeholder:text-slate-600`}
                  />
                </div>

                {/* Linha Dupla: Responsável e Prioridade */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {/* Responsável */}
                  <div className="space-y-1.5">
                    <label htmlFor="page-3" className="text-xs font-semibold text-slate-300">Responsável Nominal</label>
                    <select id="page-3"
                      value={formAssigneeId}
                      onChange={(e) => setFormAssigneeId(e.target.value)}
                      className={`${CONTROL_CLASS} w-full`}
                    >
                      <option value="">Não atribuído</option>
                      {profiles.map((u) => (
                        <option key={u.id} value={u.id}>
                          {u.name} ({u.title})
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Prioridade */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-slate-300">Prioridade</label>
                    <select
                      value={formPriority}
                      onChange={(e) => setFormPriority(e.target.value as TaskPriority)}
                      className={`${CONTROL_CLASS} w-full`}
                    >
                      <option value="LOW">Baixa</option>
                      <option value="MEDIUM">Média</option>
                      <option value="HIGH">Alta</option>
                      <option value="URGENT">Urgente</option>
                    </select>
                  </div>
                </div>

                {/* Linha Dupla: Status e Data de Entrega */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {/* Status */}
                  <div className="space-y-1.5">
                    <label htmlFor="page-4" className="text-xs font-semibold text-slate-300">Status</label>
                    <select id="page-4"
                      value={formStatus}
                      onChange={(e) => setFormStatus(e.target.value as TaskStatus)}
                      className={`${CONTROL_CLASS} w-full`}
                    >
                      <option value="TODO">A Fazer</option>
                      <option value="IN_PROGRESS">Em Andamento</option>
                      <option value="DONE">Concluída</option>
                    </select>
                  </div>

                  {/* Prazo */}
                  <div className="space-y-1.5">
                    <label htmlFor="page-5" className="text-xs font-semibold text-slate-300">Prazo de Entrega</label>
                    <input id="page-5"
                      type="date"
                      value={formDueDate}
                      onChange={(e) => setFormDueDate(e.target.value)}
                      className={`${CONTROL_CLASS} w-full`}
                    />
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-800">
                  <button
                    type="button"
                    onClick={() => setIsModalOpen(false)}
                    className="px-4 py-2 text-xs font-semibold text-slate-400 hover:text-white rounded-xl hover:bg-slate-800 transition-colors"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={submitting}
                    className="px-5 py-2 text-xs font-bold text-white bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 rounded-xl shadow-lg shadow-purple-900/40 transition-all disabled:opacity-50"
                  >
                    {submitting ? 'Salvando...' : editingTask ? 'Salvar Alterações' : 'Criar Tarefa'}
                  </button>
                </div>
              </form>
            </div>
          </ModalFrame>
        )}
      </main>
    </div>
  );
}

// Individual Task Card Component
function TaskCard({
  task,
  onStatusChange,
  onEdit,
  onDelete,
  getPriorityBadge,
}: {
  task: Task;
  onStatusChange: (id: string, status: TaskStatus) => void;
  onEdit: (task: Task) => void;
  onDelete: (id: string) => void;
  getPriorityBadge: (p: TaskPriority) => React.ReactNode;
}) {
  const isDone = task.status === 'DONE';

  return (
    <div
      className={`p-4 rounded-2xl border transition-all duration-200 space-y-3 ${
        isDone
          ? 'bg-slate-950/40 border-slate-800/60 opacity-75'
          : 'bg-slate-900/80 hover:bg-slate-850 border-slate-800 hover:border-slate-700 shadow-md'
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          {getPriorityBadge(task.priority)}
          {task.dueDate && (
            <span className="text-[11px] text-slate-400 flex items-center gap-1">
              <Calendar className="w-3 h-3 text-purple-400" />
              {formatDueDate(task.dueDate)}
            </span>
          )}
        </div>

        <div className="flex items-center gap-1">
          <button
            onClick={() => onEdit(task)}
            className="p-1 text-slate-400 hover:text-white rounded hover:bg-slate-800 transition-colors"
            title="Editar Tarefa"
          >
            <Edit3 className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => onDelete(task.id)}
            className="p-1 text-slate-400 hover:text-rose-400 rounded hover:bg-slate-800 transition-colors"
            title="Excluir Tarefa"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      <div>
        <h4
          className={`font-bold text-xs text-white ${
            isDone ? 'line-through text-slate-400' : ''
          }`}
        >
          {task.title}
        </h4>
        {task.description && (
          <p className="text-[11px] text-slate-400 mt-1 line-clamp-2 leading-relaxed">
            {task.description}
          </p>
        )}
      </div>

      {/* Footer / Move controls */}
      <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between gap-2">
        {task.assignee ? (
          <div className="flex items-center gap-1.5 min-w-0" title={`Designado para: ${task.assignee.name}`}>
            <img
              src={
                task.assignee.avatar ||
                `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(
                  task.assignee.name
                )}`
              }
              alt={task.assignee.name}
              className="w-4 h-4 rounded-full object-cover shrink-0"
            />
            <span className="text-[11px] font-semibold text-slate-300 truncate">
              {task.assignee.name.split(' ')[0]}
            </span>
          </div>
        ) : (
          <span className="text-[11px] text-slate-400">Sem responsável</span>
        )}

        <div className="flex items-center gap-1">
          {task.status === 'TODO' && (
            <button
              onClick={() => onStatusChange(task.id, 'IN_PROGRESS')}
              className="px-2 py-0.5 rounded-lg bg-blue-950 text-blue-300 border border-blue-800 text-[11px] font-bold hover:bg-blue-900 transition-colors flex items-center gap-1"
            >
              Iniciar <ChevronRight className="w-3 h-3" />
            </button>
          )}

          {task.status === 'IN_PROGRESS' && (
            <>
              <button
                onClick={() => onStatusChange(task.id, 'TODO')}
                className="px-2 py-0.5 rounded-lg bg-slate-800 text-slate-400 text-[11px] font-bold hover:text-white transition-colors"
                title="Voltar para A Fazer"
              >
                Voltar
              </button>
              <button
                onClick={() => onStatusChange(task.id, 'DONE')}
                className="px-2 py-0.5 rounded-lg bg-emerald-950 text-emerald-300 border border-emerald-800 text-[11px] font-bold hover:bg-emerald-900 transition-colors flex items-center gap-1"
              >
                Concluir <Check className="w-3 h-3" />
              </button>
            </>
          )}

          {task.status === 'DONE' && (
            <button
              onClick={() => onStatusChange(task.id, 'TODO')}
              className="px-2 py-0.5 rounded-lg bg-slate-800 text-slate-400 text-[11px] font-bold hover:text-white transition-colors"
            >
              Reabrir
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

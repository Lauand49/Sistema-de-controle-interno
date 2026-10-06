'use client';

import React, { useState, useEffect } from 'react';
import { Task, User } from '@/types';
import { useProfile } from '@/contexts/ProfileContext';
import { toast } from 'sonner';
import {
  CheckSquare,
  Plus,
  Clock,
  Calendar,
  AlertCircle,
  CheckCircle2,
  Trash2,
  Users,
  Search,
  Filter,
  ArrowRight,
  ArrowLeft,
  X,
  Sparkles,
  Layers,
  ChevronRight, Lock } from 'lucide-react';
import { formatDueDate } from '@/lib/dashboards/format';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Field } from '@/components/ui/Field';
import { CONTROL_CLASS } from '@/components/ui/Input';
import { EmptyState } from '@/components/ui/Display';
import { DateInput, Input, Select, Textarea } from '@/components/ui/Input';

interface SectorTaskBoardProps {
  department: string;
  users: User[];
  readOnly?: boolean;
}

type TaskStatus = 'TODO' | 'IN_PROGRESS' | 'DONE';
type TaskPriority = 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';

interface ColumnConfig {
  id: TaskStatus;
  title: string;
  icon: any;
  color: string;
  badgeBg: string;
  borderColor: string;
}

const COLUMNS: ColumnConfig[] = [
  {
    id: 'TODO',
    title: 'A Fazer / Backlog',
    icon: Clock,
    color: 'text-amber-400',
    badgeBg: 'bg-amber-500/20 text-amber-300 border-amber-500/40',
    borderColor: 'border-amber-500/40',
  },
  {
    id: 'IN_PROGRESS',
    title: 'Em Andamento',
    icon: Sparkles,
    color: 'text-blue-400',
    badgeBg: 'bg-blue-500/20 text-blue-300 border-blue-500/40',
    borderColor: 'border-blue-500/40',
  },
  {
    id: 'DONE',
    title: 'Concluído',
    icon: CheckCircle2,
    color: 'text-emerald-400',
    badgeBg: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40',
    borderColor: 'border-emerald-500/40',
  },
];

export const SectorTaskBoard: React.FC<SectorTaskBoardProps> = ({
  department,
  users,
  readOnly = false,
}) => {
  const { currentProfile } = useProfile();

  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedAssignee, setSelectedAssignee] = useState<string>('ALL');

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalDefaultStatus, setModalDefaultStatus] = useState<TaskStatus>('TODO');
  const [editingTask, setEditingTask] = useState<Task | null>(null);

  // Form State
  const [formTitle, setFormTitle] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [formPriority, setFormPriority] = useState<TaskPriority>('MEDIUM');
  const [formStatus, setFormStatus] = useState<TaskStatus>('TODO');
  const [formDueDate, setFormDueDate] = useState('');
  const [formAssigneeId, setFormAssigneeId] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const fetchTasks = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/tasks?department=${department.toUpperCase()}`);
      if (res.ok) {
        const data = await res.json();
        setTasks(Array.isArray(data) ? data : []);
      }
    } catch {
      toast.error('Erro ao carregar tarefas do quadro.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTasks();
  }, [department]);

  const openNewTaskModal = (initialStatus: TaskStatus = 'TODO') => {
    setEditingTask(null);
    setFormTitle('');
    setFormDescription('');
    setFormPriority('MEDIUM');
    setFormStatus(initialStatus);
    setFormDueDate('');
    setFormAssigneeId(currentProfile?.id || '');
    setModalDefaultStatus(initialStatus);
    setIsModalOpen(true);
  };

  const openEditTaskModal = (task: Task) => {
    setEditingTask(task);
    setFormTitle(task.title);
    setFormDescription(task.description || '');
    setFormPriority((task.priority as TaskPriority) || 'MEDIUM');
    setFormStatus((task.status as TaskStatus) || 'TODO');
    setFormDueDate(task.dueDate ? task.dueDate.split('T')[0] : '');
    setFormAssigneeId(task.assigneeId || '');
    setIsModalOpen(true);
  };

  const handleSaveTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formTitle.trim()) {
      toast.error('Informe o título da tarefa.');
      return;
    }

    setSubmitting(true);
    try {
      if (editingTask) {
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
        toast.success('Tarefa atualizada com sucesso!');
      } else {
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
            department: department.toUpperCase(),
          }),
        });

        if (!res.ok) throw new Error('Erro ao criar tarefa.');
        toast.success('Tarefa criada no quadro com sucesso!');
      }

      setIsModalOpen(false);
      fetchTasks();
    } catch (err: any) {
      toast.error(err.message || 'Erro ao salvar tarefa.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleMoveStatus = async (taskId: string, targetStatus: TaskStatus) => {
    try {
      const res = await fetch(`/api/tasks/${taskId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: targetStatus }),
      });

      if (!res.ok) throw new Error('Erro ao mover status.');

      setTasks((prev) =>
        prev.map((t) => (t.id === taskId ? { ...t, status: targetStatus } : t))
      );
      toast.success(`Tarefa movida para ${targetStatus === 'DONE' ? 'Concluído' : targetStatus === 'IN_PROGRESS' ? 'Em Andamento' : 'A Fazer'}!`);
    } catch (err: any) {
      toast.error(err.message || 'Erro ao movimentar tarefa.');
    }
  };

  const handleDeleteTask = async (taskId: string) => {
    if (!confirm('Deseja realmente excluir esta tarefa do quadro?')) return;

    try {
      const res = await fetch(`/api/tasks/${taskId}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Erro ao excluir tarefa.');

      setTasks((prev) => prev.filter((t) => t.id !== taskId));
      toast.success('Tarefa excluída do quadro.');
    } catch (err: any) {
      toast.error(err.message || 'Erro ao excluir.');
    }
  };

  // Filter tasks
  const filteredTasks = tasks.filter((t) => {
    if (selectedAssignee !== 'ALL' && t.assigneeId !== selectedAssignee) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchTitle = t.title.toLowerCase().includes(q);
      const matchDesc = t.description?.toLowerCase().includes(q) || false;
      const matchAssignee = t.assignee?.name?.toLowerCase().includes(q) || false;
      if (!matchTitle && !matchDesc && !matchAssignee) return false;
    }
    return true;
  });

  return (
    <div className="space-y-5">
      {/* Board Control Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-2xl bg-slate-900/80 border border-slate-800">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-purple-950/80 border border-purple-800/60 text-purple-400">
            <CheckSquare className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              Quadro Livre de Tarefas • {department.toUpperCase()}
            </h3>
            <p className="text-[11px] text-slate-400">
              Posicione, organize e acompanhe as atividades internas sem as restrições rígidas de um funil
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {/* Search */}
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
            <Input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Buscar tarefa..."
              className="pl-8 pr-3 w-44"
            />
          </div>

          {/* Member Filter */}
          <Select
            value={selectedAssignee}
            onChange={(e) => setSelectedAssignee(e.target.value)}
            
          >
            <option value="ALL">Todos os Responsáveis</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </Select>

          {/* New Task Button */}
          {readOnly ? (
            <span className="text-[11px] font-bold px-3 py-1.5 rounded-xl bg-amber-500/20 border border-amber-500/40 text-amber-300">
              <Lock className="w-3.5 h-3.5 inline mr-1 -mt-0.5" aria-hidden="true" />Somente Leitura
            </span>
          ) : (
            <Button size="sm" onClick={() => openNewTaskModal('TODO')}>
              <Plus className="w-3.5 h-3.5" /> Nova Tarefa
            </Button>
          )}
        </div>
      </div>

      {/* Board Columns Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5 items-start">
        {COLUMNS.map((col) => {
          const colTasks = filteredTasks.filter((t) => t.status === col.id);
          const ColIcon = col.icon;

          return (
            <div
              key={col.id}
              className="rounded-2xl bg-slate-900/60 border border-slate-800/80 p-4 space-y-3 min-h-[450px] flex flex-col justify-between"
            >
              {/* Column Header */}
              <div className="space-y-3">
                <div className="flex items-center justify-between border-b border-slate-800/80 pb-3">
                  <div className="flex items-center gap-2">
                    <ColIcon className={`w-4 h-4 ${col.color}`} />
                    <span className="font-bold text-xs text-white">{col.title}</span>
                  </div>

                  <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full border ${col.badgeBg}`}>
                    {colTasks.length}
                  </span>
                </div>

                {/* Cards List in this column */}
                <div className="space-y-3">
                  {colTasks.length === 0 ? (
                    <EmptyState title="Nenhuma tarefa aqui" className="p-6" />
                  ) : (
                    colTasks.map((task) => (
                      <div
                        key={task.id}
                        className="group p-4 rounded-xl bg-slate-950/80 border border-slate-800 hover:border-purple-600/50 shadow-md transition-all space-y-3"
                      >
                        {/* Priority & Actions Header */}
                        <div className="flex items-center justify-between">
                          <span
                            className={`text-[9px] font-bold px-2 py-0.5 rounded-full border ${
                              task.priority === 'URGENT'
                                ? 'bg-rose-500/20 text-rose-300 border-rose-500/40'
                                : task.priority === 'HIGH'
                                ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                                : 'bg-slate-800 text-slate-300 border-slate-700'
                            }`}
                          >
                            {task.priority === 'URGENT' ? 'URGENTE' : task.priority}
                          </span>

                          {!readOnly && (
                            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                              <button
                                onClick={() => openEditTaskModal(task)}
                                className="p-1 rounded text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
                                title="Editar tarefa"
                              >
                                <CheckSquare className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={() => handleDeleteTask(task.id)}
                                className="p-1 rounded text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 transition-colors"
                                title="Excluir tarefa"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          )}
                        </div>

                        {/* Title & Description */}
                        <div>
                          <h4 className="text-xs font-bold text-white group-hover:text-purple-300 transition-colors">
                            {task.title}
                          </h4>
                          {task.description && (
                            <p className="text-[11px] text-slate-400 mt-1 line-clamp-2 leading-relaxed">
                              {task.description}
                            </p>
                          )}
                        </div>

                        {/* Footer Details: Assignee & Due Date */}
                        <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between text-[11px] text-slate-400">
                          <div className="flex items-center gap-1.5 truncate max-w-[140px]">
                            {task.assignee ? (
                              <>
                                <img
                                  src={
                                    task.assignee.avatar ||
                                    `https://ui-avatars.com/api/?name=${encodeURIComponent(
                                      task.assignee.name
                                    )}&background=7c3aed&color=fff`
                                  }
                                  alt={task.assignee.name}
                                  className="w-4 h-4 rounded-full object-cover"
                                />
                                <span className="truncate text-slate-300">{task.assignee.name}</span>
                              </>
                            ) : (
                              <span className="text-slate-400 italic">Sem responsável</span>
                            )}
                          </div>

                          {task.dueDate && (
                            <span className="flex items-center gap-1 text-slate-400 text-[11px]">
                              <Calendar className="w-3.5 h-3.5 text-purple-400" />
                              {formatDueDate(task.dueDate)}
                            </span>
                          )}
                        </div>

                        {/* Quick Shift Buttons */}
                        {!readOnly && (
                          <div className="pt-1 flex items-center justify-between gap-1">
                            {col.id !== 'TODO' ? (
                              <button
                                onClick={() =>
                                  handleMoveStatus(
                                    task.id,
                                    col.id === 'DONE' ? 'IN_PROGRESS' : 'TODO'
                                  )
                                }
                                className="px-2 py-1 rounded bg-slate-900 hover:bg-slate-800 text-[11px] text-slate-400 hover:text-white flex items-center gap-1 transition-colors"
                                title="Voltar etapa"
                              >
                                <ArrowLeft className="w-3 h-3" /> Voltar
                              </button>
                            ) : (
                              <div />
                            )}

                            {col.id !== 'DONE' && (
                              <button
                                onClick={() =>
                                  handleMoveStatus(
                                    task.id,
                                    col.id === 'TODO' ? 'IN_PROGRESS' : 'DONE'
                                  )
                                }
                                className="px-2 py-1 rounded bg-purple-950/60 border border-purple-800/50 hover:bg-purple-900/80 text-[11px] text-purple-300 hover:text-white flex items-center gap-1 transition-all ml-auto"
                                title="Avançar etapa"
                              >
                                Avançar <ArrowRight className="w-3 h-3" />
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* Add Card Button at bottom of column */}
              {!readOnly && (
                <button
                  onClick={() => openNewTaskModal(col.id)}
                  className="w-full py-2 rounded-xl bg-slate-950/60 hover:bg-slate-900 border border-dashed border-slate-800 hover:border-purple-600/50 text-slate-400 hover:text-white text-xs font-semibold flex items-center justify-center gap-1.5 transition-all mt-4"
                >
                  <Plus className="w-3.5 h-3.5" /> Adicionar nesta coluna
                </button>
              )}
            </div>
          );
        })}
      </div>

      {/* Modal Nova / Editar Tarefa */}
      {isModalOpen && (
        <Modal
          title={editingTask ? 'Editar Tarefa do Quadro' : 'Nova Tarefa no Quadro'}
          onClose={() => setIsModalOpen(false)}
          closeOnBackdrop={false}
          footer={
            <>
              <Button variant="secondary" onClick={() => setIsModalOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit" form="sector-task-form" loading={submitting}>
                {submitting ? 'Salvando...' : editingTask ? 'Salvar Alterações' : 'Criar Tarefa'}
              </Button>
            </>
          }
        >
          <form id="sector-task-form" onSubmit={handleSaveTask} className="space-y-3.5 text-xs">
            <Field label="Título da tarefa" required>
              <Input
                type="text"
                value={formTitle}
                onChange={(e) => setFormTitle(e.target.value)}
                placeholder="Ex: Elaborar dinâmica de grupo para Trainees"
                required
              />
            </Field>
            <Field label="Descrição & detalhes">
              <Textarea
                value={formDescription}
                onChange={(e) => setFormDescription(e.target.value)}
                placeholder="Descreva o objetivo, critérios e instruções..."
              />
            </Field>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="Coluna / status">
                <Select value={formStatus} onChange={(e) => setFormStatus(e.target.value as TaskStatus)}>
                  <option value="TODO">A Fazer / Backlog</option>
                  <option value="IN_PROGRESS">Em Andamento</option>
                  <option value="DONE">Concluído</option>
                </Select>
              </Field>
              <Field label="Prioridade">
                <Select value={formPriority} onChange={(e) => setFormPriority(e.target.value as TaskPriority)}>
                  <option value="LOW">Baixa</option>
                  <option value="MEDIUM">Média</option>
                  <option value="HIGH">Alta</option>
                  <option value="URGENT">Urgente</option>
                </Select>
              </Field>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="Responsável">
                <Select value={formAssigneeId} onChange={(e) => setFormAssigneeId(e.target.value)}>
                  <option value="">Sem responsável</option>
                  {users.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name} ({u.title})
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Data limite (prazo)">
                <DateInput value={formDueDate} onChange={(e) => setFormDueDate(e.target.value)} />
              </Field>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
};

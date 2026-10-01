'use client';

import React from 'react';
import { AlertTriangle, CalendarClock } from 'lucide-react';
import { formatDayKey } from '@/lib/dashboards/format';
import type { OverdueTaskDTO } from '@/lib/dashboards/types';
import { DashboardSection, SectionEmpty, avatarUrl } from './DashboardSection';

/**
 * Até 10 Tarefas_Atrasadas (já limitadas e ordenadas pela API) com título, responsável
 * (painéis de unidade, Req. 4.5, 5.3) ou Unidade/"Geral" (painel do membro, Req. 8.8)
 * e Dia_Prazo em DD/MM/AAAA.
 */
export function OverdueTaskList({
  tasks,
  show,
  title = 'Tarefas atrasadas',
}: {
  tasks: OverdueTaskDTO[];
  show: 'assignee' | 'unit';
  title?: string;
}) {
  return (
    <DashboardSection
      title={title}
      icon={AlertTriangle}
      description="Ordenadas pelo prazo mais antigo (até 10)"
    >
      {tasks.length === 0 ? (
        <SectionEmpty>Nenhuma tarefa atrasada</SectionEmpty>
      ) : (
        <ul className="divide-y divide-slate-800">
          {tasks.map((task) => (
            <li key={task.id} className="flex flex-col gap-1 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-slate-100">{task.title}</p>
                <p className="mt-0.5 flex items-center gap-1.5 text-xs text-slate-400">
                  {show === 'assignee' ? <AssigneeLabel task={task} /> : <UnitLabel task={task} />}
                </p>
              </div>
              <p className="flex shrink-0 items-center gap-1.5 text-xs font-semibold text-red-300">
                <CalendarClock className="h-3.5 w-3.5" aria-hidden="true" />
                <span>
                  Prazo: <time dateTime={task.dueDate}>{formatDayKey(task.dueDate)}</time>
                </span>
              </p>
            </li>
          ))}
        </ul>
      )}
    </DashboardSection>
  );
}

function AssigneeLabel({ task }: { task: OverdueTaskDTO }) {
  if (!task.assignee) return <span>Responsável: Sem responsável</span>;
  return (
    <>
      <img src={avatarUrl(task.assignee)} alt="" className="h-4 w-4 rounded-full object-cover" />
      <span>Responsável: {task.assignee.name}</span>
    </>
  );
}

function UnitLabel({ task }: { task: OverdueTaskDTO }) {
  return <span>Unidade: {task.unit ? task.unit.name : 'Geral'}</span>;
}

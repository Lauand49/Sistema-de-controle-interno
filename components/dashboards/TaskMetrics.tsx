'use client';

import React from 'react';
import { AlertTriangle, CheckCircle2, CheckSquare, ListTodo, type LucideIcon } from 'lucide-react';
import { formatInt } from '@/lib/dashboards/format';
import type { TaskCounts } from '@/lib/dashboards/types';
import { DashboardSection } from './DashboardSection';

/**
 * Contagens de tarefas abertas, atrasadas e concluídas no período (Req. 4.1, 5.1, 8.1, 10.4).
 */
export function TaskMetrics({ tasks, title = 'Tarefas' }: { tasks: TaskCounts; title?: string }) {
  return (
    <DashboardSection title={title} icon={CheckSquare}>
      <dl className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Metric label="Abertas" value={tasks.open} icon={ListTodo} tone="text-purple-300" />
        <Metric label="Atrasadas" value={tasks.overdue} icon={AlertTriangle} tone="text-red-300" />
        <Metric label="Concluídas no período" value={tasks.doneInPeriod} icon={CheckCircle2} tone="text-emerald-300" />
      </dl>
    </DashboardSection>
  );
}

function Metric({
  label,
  value,
  icon: Icon,
  tone,
}: {
  label: string;
  value: number;
  icon: LucideIcon;
  tone: string;
}) {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-950/40 p-4">
      <dt className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-slate-400">
        <Icon className={`h-4 w-4 ${tone}`} aria-hidden="true" />
        {label}
      </dt>
      <dd className="mt-2 text-3xl font-bold text-white">{formatInt(value)}</dd>
    </div>
  );
}

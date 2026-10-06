import React from 'react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/ui/format';

type Icon = LucideIcon;

export type BadgeTone = 'neutral' | 'primary' | 'success' | 'warning' | 'danger' | 'info';
const TONES: Record<BadgeTone, string> = {
  neutral: 'bg-surface-overlay text-fg border-border-strong',
  primary: 'bg-primary-subtle text-primary-soft border-primary/40',
  success: 'bg-success-subtle text-success-soft border-success/40',
  warning: 'bg-warning-subtle text-warning-soft border-warning/40',
  danger: 'bg-danger-subtle text-danger-soft border-danger/40',
  info: 'bg-info-subtle text-info-soft border-info/40',
};

export const Badge: React.FC<{ tone?: BadgeTone; icon?: Icon; className?: string; children: React.ReactNode }> = ({
  tone = 'neutral',
  icon: I,
  className,
  children,
}) => (
  <span className={cn('inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full border', TONES[tone], className)}>
    {I && <I className="w-3 h-3" aria-hidden="true" />}
    {children}
  </span>
);

/** Cartão de número: rótulo + valor. O valor já vem formatado ("1 funil", "0 pendentes"). */
export const StatCard: React.FC<{ label: string; value: React.ReactNode; icon?: Icon; className?: string }> = ({
  label,
  value,
  icon: I,
  className,
}) => (
  <div className={cn('rounded-card border border-border bg-surface-raised p-4', className)}>
    <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-fg-muted">
      {I && <I className="w-3.5 h-3.5 text-primary-soft" aria-hidden="true" />}
      {label}
    </p>
    <p className="mt-1 text-xl font-bold text-fg">{value}</p>
  </div>
);

export const EmptyState: React.FC<{
  icon?: Icon;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}> = ({ icon: I, title, description, action, className }) => (
  <div className={cn('flex flex-col items-center justify-center text-center gap-2 rounded-card border border-dashed border-border-strong p-8', className)}>
    {I && <I className="w-8 h-8 text-fg-muted" aria-hidden="true" />}
    <p className="text-sm font-semibold text-fg">{title}</p>
    {description && <p className="text-xs text-fg-muted max-w-sm">{description}</p>}
    {action}
  </div>
);

/** Título de página: ícone, título (h1), subtítulo e ações à direita. */
export const PageHeader: React.FC<{
  title: string;
  subtitle?: React.ReactNode;
  icon?: Icon;
  actions?: React.ReactNode;
  className?: string;
}> = ({ title, subtitle, icon: I, actions, className }) => (
  <div className={cn('flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between', className)}>
    <div className="flex items-center gap-3 min-w-0">
      {I && (
        <span className="shrink-0 w-10 h-10 rounded-control bg-primary-subtle text-primary-soft flex items-center justify-center">
          <I className="w-5 h-5" aria-hidden="true" />
        </span>
      )}
      <div className="min-w-0">
        <h1 className="text-xl sm:text-2xl font-bold text-fg truncate">{title}</h1>
        {subtitle && <p className="text-sm text-fg-muted">{subtitle}</p>}
      </div>
    </div>
    {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
  </div>
);

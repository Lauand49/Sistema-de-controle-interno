'use client';
import React from 'react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/ui/format';

export interface TabItem<T extends string> {
  id: T;
  label: string;
  icon?: LucideIcon;
  /** `id` do elemento (para `aria-labelledby` de painéis). */
  domId?: string;
  /** `aria-controls` do painel associado. */
  controls?: string;
  /** Número exibido ao lado do rótulo. */
  count?: number;
}

export interface TabsProps<T extends string> {
  tabs: TabItem<T>[];
  value: T;
  onChange: (id: T) => void;
  ariaLabel: string;
  className?: string;
}

/** Abas (role="tablist"); setas esquerda/direita, Home e End movem a seleção. */
export function Tabs<T extends string>({ tabs, value, onChange, ariaLabel, className }: TabsProps<T>) {
  const onKeyDown = (e: React.KeyboardEvent) => {
    const i = tabs.findIndex((t) => t.id === value);
    let next = i;
    if (e.key === 'ArrowRight') next = (i + 1) % tabs.length;
    else if (e.key === 'ArrowLeft') next = (i - 1 + tabs.length) % tabs.length;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = tabs.length - 1;
    else return;
    e.preventDefault();
    onChange(tabs[next].id);
    (e.currentTarget.querySelectorAll('[role="tab"]')[next] as HTMLElement | undefined)?.focus();
  };
  return (
    <div role="tablist" aria-label={ariaLabel} onKeyDown={onKeyDown} className={cn('flex gap-1 border-b border-border overflow-x-auto', className)}>
      {tabs.map(({ id, label, icon: Icon, count, domId, controls }) => {
        const active = id === value;
        return (
          <button
            key={id}
            type="button"
            role="tab"
            id={domId}
            aria-controls={controls}
            aria-selected={active}
            tabIndex={active ? 0 : -1}
            onClick={() => onChange(id)}
            className={cn(
              'inline-flex items-center gap-2 min-h-10 px-4 text-sm font-semibold whitespace-nowrap border-b-2 -mb-px transition-colors',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus rounded-t-control',
              active ? 'border-primary-soft text-primary-soft' : 'border-transparent text-fg-muted hover:text-fg',
            )}
          >
            {Icon && <Icon className="w-4 h-4" aria-hidden="true" />}
            {label}
            {count !== undefined && (
              <span className={cn('text-[11px] px-1.5 rounded-full', active ? 'bg-primary-subtle' : 'bg-surface-overlay')}>{count}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}

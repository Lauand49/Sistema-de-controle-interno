import React from 'react';
import { Loader2, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/ui/format';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'md' | 'lg';

const VARIANTS: Record<ButtonVariant, string> = {
  primary: 'bg-gradient-to-r from-primary-from to-primary-to text-white hover:brightness-110 shadow-glow',
  secondary: 'bg-surface-overlay text-fg border border-border-strong hover:bg-border-strong',
  ghost: 'bg-transparent text-fg-muted hover:bg-surface-overlay hover:text-fg',
  danger: 'bg-danger-subtle text-danger-soft border border-danger/40 hover:bg-danger/25',
};
// Alvo de toque mínimo de 40px em todos os tamanhos.
const SIZES: Record<ButtonSize, string> = {
  sm: 'min-h-10 px-3 text-xs gap-1.5',
  md: 'min-h-10 px-4 text-sm gap-2',
  lg: 'min-h-12 px-6 text-sm gap-2',
};

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  /** Ícone lucide (componente) antes do texto. */
  icon?: LucideIcon;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'primary', size = 'md', loading = false, icon: Icon, className, children, disabled, type = 'button', ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cn(
        'inline-flex items-center justify-center rounded-control font-bold transition-all',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 focus-visible:ring-offset-surface',
        'disabled:opacity-50 disabled:cursor-not-allowed',
        VARIANTS[variant],
        SIZES[size],
        className,
      )}
      {...rest}
    >
      {loading ? <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> : Icon ? <Icon className="w-4 h-4" aria-hidden="true" /> : null}
      {children}
    </button>
  );
});

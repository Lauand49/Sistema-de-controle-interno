import React from 'react';
import Link from 'next/link';
import { Loader2, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/ui/format';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'danger-ghost';
export type ButtonSize = 'sm' | 'md' | 'lg';

const VARIANTS: Record<ButtonVariant, string> = {
  primary: 'bg-gradient-to-r from-primary-from to-primary-to text-white hover:brightness-110 shadow-glow',
  secondary: 'bg-surface-overlay text-fg border border-border-strong hover:bg-border-strong',
  ghost: 'bg-transparent text-fg-muted hover:bg-surface-overlay hover:text-fg',
  'danger-ghost': 'bg-transparent text-fg-muted hover:bg-danger-subtle hover:text-danger-soft',
  danger: 'bg-danger-subtle text-danger-soft border border-danger/40 hover:bg-danger/25',
};
// Alvo de toque mínimo de 40px em todos os tamanhos.
const SIZES: Record<ButtonSize, string> = {
  sm: 'min-h-10 px-3 text-xs gap-1.5',
  md: 'min-h-10 px-4 text-sm gap-2',
  lg: 'min-h-12 px-6 text-sm gap-2',
};

/** Classes do botão, para usar em <Link>/<a> (sem aninhar <button> dentro de <a>). */
export function buttonVariants({ variant = 'primary', size = 'md', className }: { variant?: ButtonVariant; size?: ButtonSize; className?: string } = {}): string {
  return cn(
    'inline-flex items-center justify-center rounded-control font-bold transition-all',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 focus-visible:ring-offset-surface',
    VARIANTS[variant],
    SIZES[size],
    className,
  );
}

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

/** Link com a cara de Button: mesmas variantes e tamanhos; mantém href, prefetch e demais props do Link. */
export const ButtonLink = React.forwardRef<
  HTMLAnchorElement,
  React.ComponentProps<typeof Link> & { variant?: ButtonVariant; size?: ButtonSize; icon?: LucideIcon }
>(function ButtonLink({ variant, size, icon: Icon, className, children, ...rest }, ref) {
  return (
    <Link ref={ref} className={buttonVariants({ variant, size, className })} {...rest}>
      {Icon ? <Icon className="w-4 h-4" aria-hidden="true" /> : null}
      {children}
    </Link>
  );
});

export interface IconButtonProps extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'aria-label'> {
  /** Obrigatório: botão só com ícone precisa de nome acessível. */
  'aria-label': string;
  variant?: Exclude<ButtonVariant, 'primary'>;
  icon: LucideIcon;
}

/** Botão quadrado de 40px só com ícone (tooltip = aria-label). */
export const IconButton = React.forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { variant = 'ghost', icon: Icon, className, title, type = 'button', ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      title={title ?? rest['aria-label']}
      className={buttonVariants({ variant, size: 'sm', className: cn('w-10 min-w-10 px-0 shrink-0', className) })}
      {...rest}
    >
      <Icon className="w-4 h-4" aria-hidden="true" />
    </button>
  );
});

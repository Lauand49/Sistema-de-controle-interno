'use client';
import React, { useEffect, useId, useRef } from 'react';
import { X } from 'lucide-react';
import { cn } from '@/lib/ui/format';

const FOCUSABLE =
  'a[href],button:not([disabled]),input:not([disabled]):not([type="hidden"]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

let lockCount = 0;
function lockScroll() {
  if (lockCount++ === 0) document.body.style.overflow = 'hidden';
}
function unlockScroll() {
  if (--lockCount <= 0) {
    lockCount = 0;
    document.body.style.overflow = '';
  }
}


/**
 * Comportamento comum de diálogos: trava a rolagem da página, foca o primeiro campo, prende o Tab,
 * fecha com Esc e devolve o foco a quem abriu.
 */
export function useDialogBehavior<T extends HTMLElement>(open: boolean, onClose: () => void) {
  const ref = useRef<T>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement as HTMLElement | null;
    lockScroll();
    const dialog = ref.current;
    const first =
      dialog?.querySelector<HTMLElement>('[data-autofocus],input:not([type="hidden"]),select,textarea') ??
      dialog?.querySelector<HTMLElement>(FOCUSABLE);
    (first ?? dialog)?.focus();
    return () => {
      unlockScroll();
      previous?.focus?.();
    };
  }, [open]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      onCloseRef.current();
      return;
    }
    if (e.key !== 'Tab') return;
    const items = Array.from(ref.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? []).filter((el) => el.tabIndex >= 0);
    if (items.length === 0) {
      e.preventDefault();
      return;
    }
    const firstEl = items[0];
    const lastEl = items[items.length - 1];
    const active = document.activeElement;
    if (e.shiftKey && (active === firstEl || active === ref.current)) {
      e.preventDefault();
      lastEl.focus();
    } else if (!e.shiftKey && active === lastEl) {
      e.preventDefault();
      firstEl.focus();
    }
  };
  return { ref, onKeyDown };
}

/**
 * Moldura para diálogos com visual próprio (migração gradual para `Modal`): mantém as classes do
 * overlay original e acrescenta role="dialog", aria-modal, Esc, foco preso e trava de rolagem.
 */
export const ModalFrame: React.FC<{
  onClose: () => void;
  label: string;
  className?: string;
  children: React.ReactNode;
}> = ({ onClose, label, className, children }) => {
  const { ref, onKeyDown } = useDialogBehavior<HTMLDivElement>(true, onClose);
  return (
    <div ref={ref} role="dialog" aria-modal="true" aria-label={label} tabIndex={-1} onKeyDown={onKeyDown} className={cn(className, 'focus:outline-none')}>
      {children}
    </div>
  );
};

const WIDTHS = { sm: 'max-w-md', md: 'max-w-xl', lg: 'max-w-3xl', xl: 'max-w-5xl' } as const;

export interface ModalProps {
  /** Padrão true; útil quando o componente pai controla a montagem. */
  open?: boolean;
  onClose: () => void;
  title: React.ReactNode;
  description?: React.ReactNode;
  /** Área fixa abaixo do corpo (botões). */
  footer?: React.ReactNode;
  size?: keyof typeof WIDTHS;
  /** Fecha ao clicar fora. Padrão true; use false em formulários longos. */
  closeOnBackdrop?: boolean;
  children: React.ReactNode;
}

/**
 * Diálogo acessível: role="dialog" + aria-modal, foco preso, Esc fecha, trava a rolagem da página,
 * devolve o foco a quem abriu. Cabeçalho e rodapé fixos; só o corpo rola.
 */
export const Modal: React.FC<ModalProps> = ({
  open = true,
  onClose,
  title,
  description,
  footer,
  size = 'md',
  closeOnBackdrop = true,
  children,
}) => {
  const uid = useId().replace(/:/g, '');
  const titleId = `m${uid}-t`;
  const descId = `m${uid}-d`;
  const { ref: dialogRef, onKeyDown } = useDialogBehavior<HTMLDivElement>(open, onClose);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm p-0 sm:p-4"
      onMouseDown={(e) => {
        if (closeOnBackdrop && e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descId : undefined}
        tabIndex={-1}
        onKeyDown={onKeyDown}
        className={cn(
          'flex flex-col w-full max-h-[100dvh] sm:max-h-[90vh] bg-surface-raised border border-border rounded-t-card sm:rounded-card shadow-overlay focus:outline-none',
          WIDTHS[size],
        )}
      >
        <header className="flex items-start justify-between gap-4 px-5 py-4 border-b border-border shrink-0">
          <div className="min-w-0">
            <h2 id={titleId} className="text-base font-bold text-fg truncate">
              {title}
            </h2>
            {description && (
              <p id={descId} className="text-xs text-fg-muted mt-0.5">
                {description}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar"
            className="shrink-0 inline-flex items-center justify-center w-10 h-10 -mr-2 -mt-1 rounded-control text-fg-muted hover:bg-surface-overlay hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
          >
            <X className="w-5 h-5" aria-hidden="true" />
          </button>
        </header>
        <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer && (
          <footer className="flex flex-wrap items-center justify-end gap-2 px-5 py-3 border-t border-border shrink-0">
            {footer}
          </footer>
        )}
      </div>
    </div>
  );
};

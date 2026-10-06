'use client';
import React from 'react';
import { X } from 'lucide-react';
import { ModalFrame } from './Modal';

export interface DrawerProps {
  onClose: () => void;
  title: React.ReactNode;
  description?: React.ReactNode;
  /** Ícone ao lado do título (opcional). */
  icon?: React.ReactNode;
  footer?: React.ReactNode;
  children: React.ReactNode;
}

/**
 * Painel lateral (à direita). Reaproveita o ModalFrame: role="dialog", Esc, foco preso e trava de rolagem.
 * Mesmo cabeçalho/rodapé do Modal; o corpo ocupa o espaço restante (filhos podem rolar por conta própria).
 */
export const Drawer: React.FC<DrawerProps> = ({ onClose, title, description, icon, footer, children }) => (
  <ModalFrame
    onClose={onClose}
    label={typeof title === 'string' ? title : 'Painel lateral'}
    className="fixed inset-0 z-50 flex justify-end bg-black/70 backdrop-blur-sm"
  >
    <div className="w-full max-w-xl h-full flex flex-col bg-surface-raised border-l border-border shadow-overlay">
      <header className="flex items-start justify-between gap-4 px-5 py-4 border-b border-border shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          {icon}
          <div className="min-w-0">
            <h2 className="text-base font-bold text-fg truncate">{title}</h2>
            {description && <p className="text-xs text-fg-muted mt-0.5">{description}</p>}
          </div>
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
      <div className="flex-1 min-h-0 flex flex-col">{children}</div>
      {footer && <footer className="flex flex-wrap items-center justify-end gap-2 px-5 py-3 border-t border-border shrink-0">{footer}</footer>}
    </div>
  </ModalFrame>
);

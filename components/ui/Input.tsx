import React, { useLayoutEffect, useRef } from 'react';
import { cn } from '@/lib/ui/format';

/** Estilo único de todo controle de formulário: caixa com fundo, borda e anel de foco. */
export const CONTROL_CLASS =
  'w-full min-h-10 px-3 py-2 text-sm rounded-control bg-surface border border-border-strong text-fg ' +
  'placeholder:text-fg-muted/70 transition-colors ' +
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:border-primary-soft ' +
  'disabled:opacity-60 disabled:cursor-not-allowed';
const INVALID_CLASS = 'border-danger ring-1 ring-danger/40';

type Invalid = { invalid?: boolean };

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement> & Invalid>(
  function Input({ className, invalid, ...rest }, ref) {
    return <input ref={ref} className={cn(CONTROL_CLASS, invalid && INVALID_CLASS, className)} {...rest} />;
  },
);

/** `<input type="date">`; o ícone do calendário fica visível no tema escuro (globals.css). */
export const DateInput = React.forwardRef<HTMLInputElement, Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type'> & Invalid>(
  function DateInput(props, ref) {
    return <Input ref={ref} type="date" {...props} />;
  },
);

export const Select = React.forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement> & Invalid>(
  function Select({ className, invalid, children, ...rest }, ref) {
    return (
      <select ref={ref} className={cn(CONTROL_CLASS, invalid && INVALID_CLASS, className)} {...rest}>
        {children}
      </select>
    );
  },
);

export interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement>, Invalid {
  /** Cresce com o conteúdo até esta altura (px); depois rola. Padrão 320. */
  maxHeight?: number;
}

/** Textarea com altura mínima de 96px que cresce com o conteúdo. */
export const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { className, invalid, maxHeight = 320, value, onInput, ...rest },
  ref,
) {
  const inner = useRef<HTMLTextAreaElement | null>(null);
  const resize = () => {
    const el = inner.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, maxHeight)}px`;
    el.style.overflowY = el.scrollHeight > maxHeight ? 'auto' : 'hidden';
  };
  useLayoutEffect(resize, [value, maxHeight]);
  return (
    <textarea
      ref={(el) => {
        inner.current = el;
        if (typeof ref === 'function') ref(el);
        else if (ref) (ref as React.MutableRefObject<HTMLTextAreaElement | null>).current = el;
      }}
      value={value}
      onInput={(e) => {
        resize();
        onInput?.(e);
      }}
      className={cn(CONTROL_CLASS, 'min-h-24 resize-y', invalid && INVALID_CLASS, className)}
      {...rest}
    />
  );
});

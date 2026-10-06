'use client';
import React, { useState } from 'react';
import { cn } from '@/lib/ui/format';
import { formatBRL, normalizeDecimalInput } from '@/lib/ui/format';
import { CONTROL_CLASS } from './Input';

export interface CurrencyInputProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'type'> {
  /** Valor no formato gravado (ponto decimal, ex.: "4" ou "1234.5"). */
  value: string;
  /** Devolve o valor no MESMO formato gravado (ponto decimal). */
  onChange: (stored: string) => void;
  invalid?: boolean;
}

/**
 * Campo de valor em R$. Fora de foco mostra pt-BR ("4,00", "1.234,50"); em foco mostra o que está sendo
 * digitado (aceita vírgula ou ponto). O valor emitido continua sendo o mesmo texto de antes ("4.5").
 */
export const CurrencyInput = React.forwardRef<HTMLInputElement, CurrencyInputProps>(function CurrencyInput(
  { value, onChange, invalid, className, onFocus, onBlur, ...rest },
  ref,
) {
  const [typed, setTyped] = useState<string | null>(null); // null = fora de foco
  const shown = typed !== null ? typed : formatBRL(value);
  return (
    <div className="relative">
      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm font-medium text-fg-muted" aria-hidden="true">
        R$
      </span>
      <input
        ref={ref}
        type="text"
        inputMode="decimal"
        autoComplete="off"
        value={shown}
        placeholder="0,00"
        onFocus={(e) => {
          setTyped((value ?? '').replace('.', ','));
          onFocus?.(e);
        }}
        onChange={(e) => {
          setTyped(e.target.value);
          onChange(normalizeDecimalInput(e.target.value));
        }}
        onBlur={(e) => {
          setTyped(null);
          onBlur?.(e);
        }}
        className={cn(CONTROL_CLASS, 'pl-10', invalid && 'border-danger ring-1 ring-danger/40', className)}
        {...rest}
      />
    </div>
  );
});

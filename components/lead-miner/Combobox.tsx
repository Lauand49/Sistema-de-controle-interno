'use client';

import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import { filterOptions, moveActive, suggestionsAnnouncement } from './combobox-helpers';

/**
 * Combobox editável com lista de sugestões (padrão ARIA "editable combobox with list
 * autocomplete"). O valor é SEMPRE o texto digitado: escolher uma sugestão apenas preenche o
 * campo, então digitação livre funciona quando a lista está vazia ou indisponível (T2).
 *
 * Teclado: ↓/↑ (abre e navega, com volta), Home/End (na lista aberta), Enter (escolhe a sugestão
 * ativa; sem ativa, confirma o texto), Esc (fecha), Tab/perda de foco (confirma o texto).
 * Busca sem acento e sem diferenciar maiúsculas (`filterOptions`).
 */
export interface ComboboxProps {
  id: string;
  value: string;
  onChange: (value: string) => void;
  /** Texto confirmado: sugestão escolhida, Enter ou saída do campo. */
  onCommit?: (value: string) => void;
  options: readonly string[];
  disabled?: boolean;
  loading?: boolean;
  placeholder?: string;
  maxLength?: number;
  className?: string;
  'aria-describedby'?: string;
  'aria-invalid'?: boolean;
  'aria-required'?: boolean;
}

export const Combobox: React.FC<ComboboxProps> = ({
  id,
  value,
  onChange,
  onCommit,
  options,
  disabled,
  loading,
  placeholder,
  maxLength,
  className = '',
  ...aria
}) => {
  const uid = useId();
  const listId = `${uid}-list`;
  const optionId = (i: number) => `${uid}-opt-${i}`;
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const listRef = useRef<HTMLUListElement>(null);

  const suggestions = useMemo(() => filterOptions(options, value), [options, value]);
  const expanded = open && !disabled && suggestions.length > 0;

  // Mantém a opção ativa visível ao navegar pelo teclado.
  useEffect(() => {
    if (active < 0) return;
    const el = listRef.current?.children[active] as HTMLElement | undefined;
    el?.scrollIntoView?.({ block: 'nearest' });
  }, [active]);

  const commit = (text: string) => {
    setOpen(false);
    setActive(-1);
    onCommit?.(text);
  };

  const choose = (text: string) => {
    onChange(text);
    commit(text);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    switch (e.key) {
      case 'ArrowDown':
      case 'ArrowUp':
      case 'Home':
      case 'End': {
        if ((e.key === 'Home' || e.key === 'End') && !expanded) return; // edição normal do texto
        e.preventDefault();
        if (!expanded) {
          setOpen(true);
          setActive(suggestions.length > 0 ? (e.key === 'ArrowUp' ? suggestions.length - 1 : 0) : -1);
          return;
        }
        setActive((cur) => moveActive(cur, suggestions.length, e.key as 'ArrowDown' | 'ArrowUp' | 'Home' | 'End'));
        return;
      }
      case 'Enter':
        // Com a lista aberta o Enter não envia o formulário: escolhe a sugestão ativa ou confirma o texto.
        if (expanded) {
          e.preventDefault();
          if (active >= 0 && active < suggestions.length) choose(suggestions[active]);
          else commit(value);
        }
        return;
      case 'Escape':
        if (expanded) {
          e.preventDefault();
          e.stopPropagation();
          setOpen(false);
          setActive(-1);
        }
        return;
      default:
    }
  };

  return (
    <div className="relative">
      <input
        id={id}
        type="text"
        role="combobox"
        aria-expanded={expanded}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={expanded && active >= 0 ? optionId(active) : undefined}
        aria-busy={loading || undefined}
        autoComplete="off"
        value={value}
        disabled={disabled}
        placeholder={placeholder}
        maxLength={maxLength}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
          setActive(-1);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => {
          setOpen(false);
          setActive(-1);
          if (value.trim() !== '') onCommit?.(value);
        }}
        onKeyDown={onKeyDown}
        className={className}
        {...aria}
      />
      <ul
        id={listId}
        ref={listRef}
        role="listbox"
        hidden={!expanded}
        className="absolute z-20 mt-1 max-h-60 w-full overflow-auto rounded-xl border border-slate-700 bg-slate-900 py-1 shadow-xl"
      >
        {expanded &&
          suggestions.map((s, i) => (
            <li
              key={s}
              id={optionId(i)}
              role="option"
              aria-selected={i === active}
              // mousedown (e não click) para escolher antes de o input perder o foco.
              onMouseDown={(e) => {
                e.preventDefault();
                choose(s);
              }}
              onMouseEnter={() => setActive(i)}
              className={`cursor-pointer px-3 py-1.5 text-sm ${
                i === active ? 'bg-purple-600/30 text-white' : 'text-slate-200 hover:bg-slate-800'
              }`}
            >
              {s}
            </li>
          ))}
      </ul>
      <span className="sr-only" role="status" aria-live="polite">
        {expanded ? suggestionsAnnouncement(suggestions.length) : ''}
      </span>
    </div>
  );
};

export default Combobox;

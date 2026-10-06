'use client';
/**
 * Filtros da Tela_Mineracoes: busca (debounce 300 ms), UF, status, fonte e intervalo de datas
 * com validação local (Req. 11.2, 11.3, 11.7).
 */
import React, { useEffect, useRef, useState } from 'react';
import { AlertCircle, RotateCcw, Search } from 'lucide-react';
import { UFS } from '@/lib/leads/config';
import {
  RUN_SOURCE_LABEL,
  RUN_SOURCE_OPTIONS,
  RUN_STATUS_LABEL,
  RUN_STATUS_OPTIONS,
  SEARCH_DEBOUNCE_MS,
  SEARCH_MAX,
  type DateRangeCheck,
  type RunsUiState,
} from './runs-helpers';
import { CONTROL_CLASS } from '@/components/ui/Input';

export interface RunsFiltersProps {
  value: RunsUiState;
  dateCheck: DateRangeCheck;
  onChange: (patch: Partial<Omit<RunsUiState, 'page'>>) => void;
  onClear: () => void;
}

const LABEL = 'mb-1 block text-xs font-semibold text-slate-300';
const FIELD = `${CONTROL_CLASS} aria-[invalid=true]:border-red-500`;
const FIELD_INVALID = 'border-red-600/70';

export const RunsFilters: React.FC<RunsFiltersProps> = ({ value, dateCheck, onChange, onClear }) => {
  const [search, setSearch] = useState(value.q);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const lastSent = useRef(value.q);

  // Valor externo (ex.: "Limpar filtros", navegação) substitui o texto digitado.
  useEffect(() => {
    if (value.q !== lastSent.current) {
      lastSent.current = value.q;
      setSearch(value.q);
    }
  }, [value.q]);

  useEffect(() => {
    if (search === lastSent.current) return;
    const t = setTimeout(() => {
      lastSent.current = search;
      onChangeRef.current({ q: search });
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [search]);

  const { errors } = dateCheck;
  const dateMessage = errors.range ?? errors.from ?? errors.to;
  const fromInvalid = !!(errors.from || errors.range);
  const toInvalid = !!(errors.to || errors.range);
  const hasFilters = !!(search || value.uf || value.status || value.fonte || value.from || value.to);

  return (
    <section aria-label="Filtros das minerações" className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-6">
        <div className="sm:col-span-2">
          <label htmlFor="runs-q" className={LABEL}>
            Buscar por bairro, cidade ou autor
          </label>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden="true" />
            <input
              id="runs-q"
              type="search"
              value={search}
              maxLength={SEARCH_MAX}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Ex.: Vila Mariana"
              className={`${FIELD} pl-9`}
            />
          </div>
        </div>

        <div>
          <label htmlFor="runs-uf" className={LABEL}>
            UF
          </label>
          <select id="runs-uf" value={value.uf} onChange={(e) => onChange({ uf: e.target.value })} className={FIELD}>
            <option value="">Todas</option>
            {UFS.map((uf) => (
              <option key={uf} value={uf}>
                {uf}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="runs-status" className={LABEL}>
            Status
          </label>
          <select id="runs-status" value={value.status} onChange={(e) => onChange({ status: e.target.value })} className={FIELD}>
            <option value="">Todos</option>
            {RUN_STATUS_OPTIONS.map((s) => (
              <option key={s} value={s}>
                {RUN_STATUS_LABEL[s]}
              </option>
            ))}
          </select>
        </div>

        <div className="lg:col-span-2">
          <label htmlFor="runs-fonte" className={LABEL}>
            Fonte
          </label>
          <select id="runs-fonte" value={value.fonte} onChange={(e) => onChange({ fonte: e.target.value })} className={FIELD}>
            <option value="">Todas</option>
            {RUN_SOURCE_OPTIONS.map((s) => (
              <option key={s} value={s}>
                {RUN_SOURCE_LABEL[s]}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor="runs-from" className={LABEL}>
            Data inicial
          </label>
          <input
            id="runs-from"
            type="date"
            value={value.from}
            onChange={(e) => onChange({ from: e.target.value })}
            aria-invalid={fromInvalid}
            aria-describedby={fromInvalid ? 'runs-dates-error' : undefined}
            className={`${FIELD} ${fromInvalid ? FIELD_INVALID : ''}`}
          />
        </div>

        <div>
          <label htmlFor="runs-to" className={LABEL}>
            Data final
          </label>
          <input
            id="runs-to"
            type="date"
            value={value.to}
            onChange={(e) => onChange({ to: e.target.value })}
            aria-invalid={toInvalid}
            aria-describedby={toInvalid ? 'runs-dates-error' : undefined}
            className={`${FIELD} ${toInvalid ? FIELD_INVALID : ''}`}
          />
        </div>

        <div className="flex items-end sm:col-span-2 lg:col-span-4">
          <button
            type="button"
            onClick={() => {
              setSearch('');
              lastSent.current = '';
              onClear();
            }}
            disabled={!hasFilters}
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-800 bg-slate-900 px-3 py-2 text-xs font-semibold text-slate-200 hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-500"
          >
            <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
            Limpar filtros
          </button>
        </div>
      </div>

      <div aria-live="polite">
        {dateMessage && (
          <p id="runs-dates-error" className="mt-3 flex items-center gap-1.5 text-xs text-red-400">
            <AlertCircle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            {dateMessage} O filtro de datas não foi aplicado.
          </p>
        )}
      </div>
    </section>
  );
};

export default RunsFilters;

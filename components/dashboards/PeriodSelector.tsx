'use client';

import React, { useCallback, useEffect, useId } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { CalendarRange } from 'lucide-react';
import { DEFAULT_PERIODO, PERIODS, parsePeriodo, type Periodo } from '@/lib/dashboards/period';
import { PERIOD_LABEL } from '@/lib/dashboards/format';

export interface UsePeriodoResult {
  /** Periodo efetivo (inválido na URL → '30d'). */
  periodo: Periodo;
  /** false enquanto a URL tem `periodo` inválido e está sendo corrigida: não chame a API. */
  ready: boolean;
  setPeriodo: (p: Periodo) => void;
}

/**
 * Lê `?periodo=` da URL (sem parâmetro → '30d'). Valor inválido é corrigido para
 * '30d' com `router.replace`. Exige `<Suspense>` acima por causa de `useSearchParams`.
 */
export function usePeriodo(): UsePeriodoResult {
  const router = useRouter();
  const searchParams = useSearchParams();
  const raw = searchParams?.get('periodo') ?? null;
  const parsed = parsePeriodo(raw);

  useEffect(() => {
    if (parsed === null) router.replace(`?periodo=${DEFAULT_PERIODO}`);
  }, [parsed, router]);

  const setPeriodo = useCallback((p: Periodo) => router.replace(`?periodo=${p}`), [router]);

  return { periodo: parsed ?? DEFAULT_PERIODO, ready: parsed !== null, setPeriodo };
}

/** Seletor nativo de Periodo; a troca reflete na URL e a tela recarrega as métricas. */
export function PeriodSelector() {
  const id = useId();
  const { periodo, setPeriodo } = usePeriodo();

  return (
    <div className="flex items-center gap-2">
      <CalendarRange className="h-4 w-4 text-purple-400" aria-hidden="true" />
      <label htmlFor={id} className="text-sm font-medium text-slate-300">
        Período
      </label>
      <select
        id={id}
        value={periodo}
        onChange={(e) => {
          const next = parsePeriodo(e.target.value);
          if (next) setPeriodo(next);
        }}
        className="rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-slate-100 hover:border-slate-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-500"
      >
        {PERIODS.map((p) => (
          <option key={p} value={p}>
            {PERIOD_LABEL[p]}
          </option>
        ))}
      </select>
    </div>
  );
}

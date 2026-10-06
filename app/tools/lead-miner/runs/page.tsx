'use client';
import { ButtonLink, Button } from '@/components/ui/Button';
/**
 * Tela_Mineracoes — `/tools/lead-miner/runs` (Req. 11.1–11.7, 11.9, 2.15, 7.11, 8.6, 8.15).
 * Histórico de minerações de todos os autores com busca, filtros (sincronizados com a query
 * string), paginação e os cards de progresso das minerações ativas do autor.
 */
import React, { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { toast } from 'sonner';
import { AlertCircle, ArrowLeft, History, Loader2, Pickaxe, SearchX } from 'lucide-react';
import { SciTecNavbar } from '@/components/navigation/SciTecNavbar';
import { LeadMinerGate } from '@/components/lead-miner/LeadMinerGate';
import { Pagination } from '@/components/lead-miner/Pagination';
import { RunProgressCard } from '@/components/lead-miner/RunProgressCard';
import { RunsFilters } from '@/components/lead-miner/RunsFilters';
import { RunsTable } from '@/components/lead-miner/RunsTable';
import {
  EMPTY_RUNS_UI,
  NO_RUNS_FOUND,
  buildRunsApiParams,
  changeFilter,
  checkDateRange,
  parseRunsUiState,
  resolveAppliedDates,
  runLocation,
  runsParamsKey,
  runsUiToSearch,
  type AppliedDates,
  type RunsUiState,
} from '@/components/lead-miner/runs-helpers';
import { leadMinerApi, type RunListItem, type RunsListResponse } from '@/lib/leads/client-api';
import { useActiveRuns } from '@/hooks/lead-miner/useActiveRuns';
import { useRunDrivers } from '@/hooks/lead-miner/useRunDrivers';
import { useProfile } from '@/contexts/ProfileContext';
import { PageHeader } from '@/components/ui/Display';

function RunsScreen() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [ui, setUi] = useState<RunsUiState>(() => parseRunsUiState(new URLSearchParams(searchParams.toString())));
  const uiRef = useRef(ui);
  uiRef.current = ui;

  // URL → estado (navegação externa para a mesma tela com outros parâmetros).
  const spString = searchParams.toString();
  useEffect(() => {
    const fromUrl = parseRunsUiState(new URLSearchParams(spString));
    if (runsUiToSearch(fromUrl) !== runsUiToSearch(uiRef.current)) setUi(fromUrl);
  }, [spString]);

  // Estado → URL.
  const search = runsUiToSearch(ui);
  useEffect(() => {
    if (search !== runsUiToSearch(parseRunsUiState(new URLSearchParams(spString)))) {
      router.replace(search ? `${pathname}?${search}` : pathname, { scroll: false });
    }
    // spString fora das deps: só reagimos a mudanças do próprio estado.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, pathname, router]);

  // Datas: intervalo inválido não é aplicado; mantém as últimas válidas (Req. 11.7).
  const dateCheck = checkDateRange(ui.from, ui.to);
  const [lastValidDates, setLastValidDates] = useState<AppliedDates>(() =>
    dateCheck.valid ? { from: ui.from.trim(), to: ui.to.trim() } : { from: '', to: '' },
  );
  const applied = resolveAppliedDates(ui, lastValidDates);
  useEffect(() => {
    if (applied.from !== lastValidDates.from || applied.to !== lastValidDates.to) setLastValidDates(applied);
  }, [applied.from, applied.to, lastValidDates.from, lastValidDates.to]); // eslint-disable-line react-hooks/exhaustive-deps

  const params = useMemo(
    () => buildRunsApiParams(ui, applied),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [ui.q, ui.uf, ui.status, ui.fonte, ui.page, applied.from, applied.to],
  );
  const key = runsParamsKey(params);

  // Minerações ativas do autor: retomada automática e cards de progresso (Req. 8.6, 8.15).
  const active = useActiveRuns();
  const { runs: drivers, dismiss, applyProgress } = useRunDrivers(active.runs);
  const { currentProfile } = useProfile();
  const doneCount = drivers.filter((d) => d.done).length;

  const [data, setData] = useState<RunsListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadNonce, setReloadNonce] = useState(0);

  // Quando alguma mineração acompanhada termina, atualiza a lista (status/contagens).
  const prevDone = useRef(doneCount);
  useEffect(() => {
    if (doneCount > prevDone.current) setReloadNonce((n) => n + 1);
    prevDone.current = doneCount;
  }, [doneCount]);

  useEffect(() => {
    const ac = new AbortController();
    setLoading(true);
    setError(null);
    leadMinerApi
      .listRuns(params, { signal: ac.signal })
      .then((res) => {
        if (ac.signal.aborted) return;
        // Página além do fim (ex.: link antigo): vai para a última página existente.
        if (res.items.length === 0 && res.total > 0 && params.page && params.page > res.totalPages) {
          setUi((u) => ({ ...u, page: res.totalPages }));
          return;
        }
        setData(res);
      })
      .catch((e: unknown) => {
        if (ac.signal.aborted) return;
        const msg = e instanceof Error ? e.message : 'Não foi possível carregar as minerações.';
        setError(msg);
        toast.error('Não foi possível carregar as minerações', { description: msg });
      })
      .finally(() => {
        if (!ac.signal.aborted) setLoading(false);
      });
    return () => ac.abort();
    // `key` resume `params`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, reloadNonce]);

  const onFilterChange = useCallback((patch: Partial<Omit<RunsUiState, 'page'>>) => {
    setUi((u) => changeFilter(u, patch));
  }, []);
  const onClear = useCallback(() => setUi(EMPTY_RUNS_UI), []);
  const onPageChange = useCallback((page: number) => setUi((u) => ({ ...u, page })), []);

  const locationById = useMemo(() => {
    const m = new Map<string, string>();
    for (const r of data?.items ?? ([] as RunListItem[])) m.set(r.id, runLocation(r));
    return m;
  }, [data]);

  const items = data?.items ?? [];
  const empty = !!data && data.total === 0;

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <Link
            href="/tools/lead-miner"
            className="mb-2 inline-flex items-center gap-1 rounded text-xs font-semibold text-slate-400 hover:text-slate-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-500"
          >
            <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
            Minerador de Leads
          </Link>
          <PageHeader icon={History} title="Minerações" subtitle="Histórico de minerações de todos os autores." />
        </div>
        <ButtonLink size="md" href="/tools/lead-miner">
          <Pickaxe className="h-4 w-4" aria-hidden="true" />
          Nova mineração
        </ButtonLink>
      </header>

      {drivers.length > 0 && (
        <section aria-labelledby="active-runs-title" className="space-y-3">
          <h2 id="active-runs-title" className="text-sm font-semibold text-slate-300">
            Suas minerações em andamento
          </h2>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {drivers.map((r) => (
              <RunProgressCard
                key={r.runId}
                run={r}
                title={locationById.get(r.runId)}
                onDismiss={dismiss}
                onStopped={(p) => {
                  applyProgress(p);
                  setReloadNonce((n) => n + 1);
                }}
              />
            ))}
          </div>
        </section>
      )}
      {active.error && (
        <p role="alert" className="flex items-center gap-1.5 text-xs text-amber-300">
          <AlertCircle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          {active.error}
        </p>
      )}

      <RunsFilters value={ui} dateCheck={dateCheck} onChange={onFilterChange} onClear={onClear} />

      <div aria-live="polite" className="sr-only">
        {loading ? 'Carregando minerações…' : data ? `${data.total} ${data.total === 1 ? 'mineração encontrada' : 'minerações encontradas'}.` : ''}
      </div>

      {error && !data && (
        <div role="alert" className="flex items-center gap-2 rounded-2xl border border-red-800/60 bg-red-950/40 p-4 text-sm text-red-300">
          <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
          <span>{error}</span>
          <Button variant="danger" size="sm" type="button"  onClick={() => setReloadNonce((n) => n + 1)} className="ml-auto">
            Tentar novamente
          </Button>
        </div>
      )}

      {!data && loading && (
        <div role="status" className="flex items-center justify-center gap-2 rounded-2xl border border-slate-800 bg-slate-900/60 p-10 text-sm text-slate-400">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          Carregando minerações…
        </div>
      )}

      {empty && (
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-slate-800 bg-slate-900/60 p-10 text-center">
          <SearchX className="h-8 w-8 text-slate-400" aria-hidden="true" />
          <p className="text-sm font-semibold text-slate-300">{NO_RUNS_FOUND}</p>
        </div>
      )}

      {data && !empty && (
        <>
          <div className={loading ? 'opacity-60 transition-opacity' : 'transition-opacity'}>
            <RunsTable
              items={items}
              busy={loading}
              actor={currentProfile}
              onStopped={(p) => {
                applyProgress(p);
                setReloadNonce((n) => n + 1);
              }}
            />
          </div>
          <Pagination page={data.page} totalPages={data.totalPages} onPageChange={onPageChange} disabled={loading} />
        </>
      )}
    </div>
  );
}

export default function LeadMinerRunsPage() {
  return (
    <div className="flex min-h-screen flex-col bg-slate-950 text-slate-100">
      <SciTecNavbar />
      <main className="flex-1 min-w-0 max-w-7xl w-full mx-auto p-4 md:p-6 space-y-6">
        <LeadMinerGate>
          <Suspense
            fallback={
              <div role="status" className="flex items-center gap-2 text-sm text-slate-400">
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                Carregando…
              </div>
            }
          >
            <RunsScreen />
          </Suspense>
        </LeadMinerGate>
      </main>
    </div>
  );
}

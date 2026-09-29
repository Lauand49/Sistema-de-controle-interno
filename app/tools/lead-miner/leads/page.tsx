'use client';

/**
 * Tela_Ranking — `/tools/lead-miner/leads` (Req. 12, 13.9, 15.5, 15.7, 15.10, 16.6, 16.8, 16.9,
 * 17.1, 17.7, 17.8, 2.16). Filtros na query string; a lista vem paginada e ordenada do servidor.
 */
import React, { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { toast } from 'sonner';
import { ArrowLeft, History, List, Loader2, Map as MapIcon, Pickaxe, Trophy } from 'lucide-react';
import { SciTecNavbar } from '@/components/navigation/SciTecNavbar';
import { useProfile } from '@/contexts/ProfileContext';
import { canAssignLeads } from '@/lib/permissions';
import { RANKING_PAGE_SIZE } from '@/lib/leads/config';
import {
  downloadExport,
  isLeadMinerApiError,
  leadMinerApi,
  type Assignee,
  type CompanyRow,
  type MapResponse,
} from '@/lib/leads/client-api';
import { LeadMinerGate } from '@/components/lead-miner/LeadMinerGate';
import { Pagination } from '@/components/lead-miner/Pagination';
import { OdblAttribution } from '@/components/lead-miner/OdblAttribution';
import { RankingFilters } from '@/components/lead-miner/RankingFilters';
import { RankingTable } from '@/components/lead-miner/RankingTable';
import { BulkActionsBar, type BulkAction } from '@/components/lead-miner/BulkActionsBar';
import { AssignDialog } from '@/components/lead-miner/AssignDialog';
import { RunFilterBanner } from '@/components/lead-miner/RunFilterBanner';
import {
  ASSIGN_ERROR_PREFIX,
  EXPORT_EMPTY_MESSAGE,
  TRIAGE_ERROR_PREFIX,
  applyAssignee,
  applyFilterPatch,
  assignSuccessMessage,
  buildRankingRequest,
  clearFilters,
  exportRequestFor,
  exportSuccessMessage,
  exportTruncationNotice,
  filtersKey,
  listQuery,
  parseRankingUrl,
  serializeRankingUrl,
  toggleId,
  togglePageSelection,
  triageSuccessMessage,
  type RankingUrlState,
  type RankingView,
} from '@/components/lead-miner/ranking-helpers';
import type { RankingUiState } from '@/lib/leads/filters';

/** Mapa só no cliente: fora do HTML do servidor e sem tocar APIs de navegador no SSR (Req. 13.9). */
const CompanyMap = dynamic(() => import('@/components/lead-miner/CompanyMap'), {
  ssr: false,
  loading: () => (
    <div
      role="status"
      className="flex h-[480px] items-center justify-center rounded-2xl border border-slate-800 bg-slate-900/60 text-sm text-slate-400"
    >
      <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
      Carregando mapa…
    </div>
  ),
});

const errorMessage = (e: unknown, fallback: string) =>
  isLeadMinerApiError(e) || e instanceof Error ? e.message : fallback;

const isAbort = (e: unknown) => typeof e === 'object' && e !== null && (e as { name?: string }).name === 'AbortError';

interface ListState {
  rows: CompanyRow[];
  total: number;
  totalPages: number;
  loading: boolean;
  error: string | null;
}

function RankingScreen() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { currentProfile } = useProfile();
  const canAssign = canAssignLeads(currentProfile);

  const urlState = useMemo(() => parseRankingUrl(new URLSearchParams(searchParams.toString())), [searchParams]);
  const { ui, page, view } = urlState;
  const { query, invalid } = useMemo(() => buildRankingRequest(ui), [ui]);
  const queryKey = query.toString();
  const fKey = filtersKey(ui);

  const navigate = useCallback(
    (next: RankingUrlState) => {
      const qs = serializeRankingUrl(next).toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [router, pathname],
  );

  const onFilterChange = useCallback(
    (patch: RankingUiState) => navigate(applyFilterPatch(urlState, patch)),
    [navigate, urlState],
  );

  // ---- Lista ---------------------------------------------------------------
  const [list, setList] = useState<ListState>({ rows: [], total: 0, totalPages: 0, loading: true, error: null });
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    const ctrl = new AbortController();
    setList((s) => ({ ...s, loading: true, error: null }));
    leadMinerApi
      .listCompanies(listQuery(new URLSearchParams(queryKey), page), { signal: ctrl.signal })
      .then((res) =>
        setList({ rows: res.items, total: res.total, totalPages: res.totalPages, loading: false, error: null }),
      )
      .catch((e: unknown) => {
        if (ctrl.signal.aborted || isAbort(e)) return;
        setList({ rows: [], total: 0, totalPages: 0, loading: false, error: errorMessage(e, 'Não foi possível carregar as empresas.') });
      });
    return () => ctrl.abort();
  }, [queryKey, page, reloadToken]);

  // Página da URL além do fim (ex.: link antigo): volta para a última página existente.
  useEffect(() => {
    if (!list.loading && !list.error && list.totalPages > 0 && page > list.totalPages) {
      navigate({ ...urlState, page: list.totalPages });
    }
  }, [list.loading, list.error, list.totalPages, page, navigate, urlState]);

  // ---- Mapa (só com a visão Mapa ativa) --------------------------------------
  const [map, setMap] = useState<{ data: MapResponse | null; loading: boolean; error: string | null }>({
    data: null,
    loading: false,
    error: null,
  });

  useEffect(() => {
    if (view !== 'mapa') return;
    const ctrl = new AbortController();
    setMap((s) => ({ ...s, loading: true, error: null }));
    leadMinerApi
      .companiesMap(new URLSearchParams(queryKey), { signal: ctrl.signal })
      .then((data) => setMap({ data, loading: false, error: null }))
      .catch((e: unknown) => {
        if (ctrl.signal.aborted || isAbort(e)) return;
        setMap({ data: null, loading: false, error: errorMessage(e, 'Não foi possível carregar o mapa.') });
      });
    return () => ctrl.abort();
  }, [view, queryKey, reloadToken]);

  // ---- Seleção (limpa quando filtros/busca mudam) ----------------------------
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  useEffect(() => {
    setSelected(new Set());
  }, [fKey]);

  // ---- Responsáveis (só Atribuidor pode consultar /assignees) ---------------
  const [assignees, setAssignees] = useState<Assignee[] | null>(null);
  const [assigneesError, setAssigneesError] = useState<string | null>(null);
  useEffect(() => {
    if (!canAssign) return;
    const ctrl = new AbortController();
    leadMinerApi
      .assignees({ signal: ctrl.signal })
      .then(setAssignees)
      .catch((e: unknown) => {
        if (ctrl.signal.aborted || isAbort(e)) return;
        setAssigneesError(errorMessage(e, 'Não foi possível carregar os responsáveis.'));
      });
    return () => ctrl.abort();
  }, [canAssign]);

  // ---- Ações em lote ---------------------------------------------------------
  const [busy, setBusy] = useState<BulkAction | null>(null);
  const [assignOpen, setAssignOpen] = useState(false);
  const selectedIds = useMemo(() => Array.from(selected), [selected]);

  const onTriage = async () => {
    setBusy('triage');
    try {
      const result = await leadMinerApi.triage(selectedIds);
      toast.success(triageSuccessMessage(result));
      setSelected(new Set());
      setReloadToken((n) => n + 1); // atualiza o status de triagem das linhas
    } catch (e) {
      // Seleção mantida para nova tentativa (Req. 15.10).
      toast.error(`${TRIAGE_ERROR_PREFIX} ${errorMessage(e, '')}`.trim());
    } finally {
      setBusy(null);
    }
  };

  const onAssignConfirm = async (assignee: Assignee) => {
    setBusy('assign');
    const ids = selectedIds;
    try {
      const result = await leadMinerApi.assign(ids, assignee.id);
      const target = { id: result.assignee.id, name: result.assignee.name || assignee.name };
      toast.success(assignSuccessMessage(result.updated, target.name));
      setList((s) => ({ ...s, rows: applyAssignee(s.rows, ids, target) }));
      setSelected(new Set());
      setAssignOpen(false);
    } catch (e) {
      toast.error(`${ASSIGN_ERROR_PREFIX} ${errorMessage(e, '')}`.trim());
    } finally {
      setBusy(null);
    }
  };

  const onExport = async () => {
    if (selectedIds.length === 0 && !list.loading && !list.error && list.total === 0) {
      toast.warning(EXPORT_EMPTY_MESSAGE);
      return;
    }
    setBusy('export');
    try {
      const result = await leadMinerApi.exportCsv(exportRequestFor(selectedIds, query));
      downloadExport(result);
      const notice = exportTruncationNotice(result);
      if (notice) toast.warning(notice, { duration: 10_000 });
      else toast.success(exportSuccessMessage(result));
    } catch (e) {
      if (isLeadMinerApiError(e) && e.status === 404) toast.warning(EXPORT_EMPTY_MESSAGE);
      else toast.error(errorMessage(e, 'Não foi possível exportar o CSV.'));
    } finally {
      setBusy(null);
    }
  };

  const setView = (v: RankingView) => navigate({ ...urlState, view: v });
  const tabClass = (active: boolean) =>
    `inline-flex items-center gap-2 rounded-lg px-3 py-1.5 text-xs font-bold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-500 ${active ? 'bg-gradient-to-r from-purple-600 to-indigo-600 text-white' : 'text-slate-300 hover:bg-slate-800'
    }`;

  const currentPage = list.totalPages > 0 ? Math.min(page, list.totalPages) : 1;

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div className="space-y-2">
          <Link
            href="/tools/lead-miner"
            className="inline-flex items-center gap-1 rounded text-xs font-semibold text-slate-400 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-500"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            Minerador de Leads
          </Link>
          <h1 className="flex items-center gap-3 text-2xl font-extrabold text-white">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600">
              <Trophy className="h-5 w-5 text-white" aria-hidden="true" />
            </span>
            Ranking de empresas
          </h1>
          <p className="text-sm text-slate-400">Toda a base minerada, ordenada por score.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href="/tools/lead-miner"
            className="inline-flex items-center gap-2 rounded-xl border border-slate-800 bg-slate-900 px-4 py-2 text-xs font-bold text-slate-200 hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-500"
          >
            <Pickaxe className="h-4 w-4" aria-hidden="true" />
            Nova mineração
          </Link>
          <Link
            href="/tools/lead-miner/runs"
            className="inline-flex items-center gap-2 rounded-xl border border-slate-800 bg-slate-900 px-4 py-2 text-xs font-bold text-slate-200 hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-500"
          >
            <History className="h-4 w-4" aria-hidden="true" />
            Minerações
          </Link>
        </div>
      </header>

      {ui.runId && <RunFilterBanner runId={ui.runId} onClear={() => onFilterChange({ runId: '' })} />}

      <RankingFilters
        value={ui}
        invalid={invalid}
        onChange={onFilterChange}
        onClear={() => navigate(clearFilters(urlState))}
        assignees={canAssign ? assignees ?? [] : null}
        currentUserId={currentProfile?.id ?? null}
      />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-slate-300" aria-live="polite">
          {list.loading ? (
            'Carregando empresas…'
          ) : list.error ? (
            ''
          ) : (
            <>
              <span className="font-bold text-white">{list.total.toLocaleString('pt-BR')}</span>{' '}
              {list.total === 1 ? 'empresa encontrada' : 'empresas encontradas'}
            </>
          )}
        </p>
        <div role="group" aria-label="Modo de visualização" className="inline-flex gap-1 rounded-xl border border-slate-800 bg-slate-900 p-1">
          <button type="button" aria-pressed={view === 'lista'} onClick={() => setView('lista')} className={tabClass(view === 'lista')}>
            <List className="h-4 w-4" aria-hidden="true" />
            Lista
          </button>
          <button type="button" aria-pressed={view === 'mapa'} onClick={() => setView('mapa')} className={tabClass(view === 'mapa')}>
            <MapIcon className="h-4 w-4" aria-hidden="true" />
            Mapa
          </button>
        </div>
      </div>

      {view === 'mapa' && (
        <section aria-label="Mapa das empresas filtradas" className="space-y-2">
          {map.error ? (
            <p role="alert" className="rounded-2xl border border-red-900/60 bg-red-950/40 p-4 text-sm text-red-300">
              {map.error}
            </p>
          ) : (
            <CompanyMap
              points={map.data?.points ?? []}
              shown={map.data?.shown ?? 0}
              total={map.data?.total ?? 0}
              loading={map.loading || !map.data}
            />
          )}
        </section>
      )}

      <BulkActionsBar
        count={selected.size}
        canAssign={canAssign}
        busy={busy}
        onTriage={onTriage}
        onAssign={() => setAssignOpen(true)}
        onExport={onExport}
        onClearSelection={() => setSelected(new Set())}
      />

      {list.error ? (
        <div role="alert" className="rounded-2xl border border-red-900/60 bg-red-950/40 p-6 text-sm text-red-300">
          <p>{list.error}</p>
          <button
            type="button"
            onClick={() => setReloadToken((n) => n + 1)}
            className="mt-3 rounded-xl border border-slate-800 bg-slate-900 px-4 py-2 text-xs font-bold text-slate-200 hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-500"
          >
            Tentar novamente
          </button>
        </div>
      ) : list.loading && list.rows.length === 0 ? (
        <div role="status" className="flex items-center justify-center gap-2 rounded-2xl border border-slate-800 bg-slate-900/60 p-10 text-sm text-slate-400">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          Carregando empresas…
        </div>
      ) : list.rows.length === 0 ? (
        <p className="rounded-2xl border border-slate-800 bg-slate-900/60 p-10 text-center text-sm text-slate-400">
          Nenhuma empresa atende aos filtros e à busca atuais.
        </p>
      ) : (
        <div className={list.loading ? 'opacity-60 transition-opacity' : undefined} aria-busy={list.loading}>
          <RankingTable
            rows={list.rows}
            selected={selected}
            onToggle={(id) => setSelected((s) => toggleId(s, id))}
            onTogglePage={() => setSelected((s) => togglePageSelection(s, list.rows.map((r) => r.id)))}
            offset={(currentPage - 1) * RANKING_PAGE_SIZE}
          />
        </div>
      )}

      {!list.error && list.total > 0 && (
        <Pagination
          page={currentPage}
          totalPages={list.totalPages}
          onPageChange={(p) => navigate({ ...urlState, page: p })}
          disabled={list.loading}
        />
      )}

      <OdblAttribution className="text-center" />

      {canAssign && (
        <AssignDialog
          open={assignOpen}
          count={selected.size}
          assignees={assignees}
          loadError={assigneesError}
          busy={busy === 'assign'}
          onCancel={() => setAssignOpen(false)}
          onConfirm={onAssignConfirm}
        />
      )}
    </div>
  );
}

export default function LeadMinerRankingPage() {
  return (
    <div className="min-h-screen flex flex-col bg-slate-950 text-slate-100">
      <SciTecNavbar />
      <main className="flex-1 max-w-7xl w-full mx-auto p-6">
        <LeadMinerGate>
          <Suspense
            fallback={
              <div role="status" className="flex items-center gap-2 text-sm text-slate-400">
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                Carregando…
              </div>
            }
          >
            <RankingScreen />
          </Suspense>
        </LeadMinerGate>
      </main>
    </div>
  );
}

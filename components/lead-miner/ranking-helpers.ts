/**
 * Lógica pura da Tela_Ranking (`/tools/lead-miner/leads`): estado na query string, montagem da
 * requisição, seleção em lote, pedido de exportação e mensagens de toast/aviso.
 *
 * Sem React e sem APIs de navegador — testável em ambiente node.
 */
import {
  MSG,
  buildRankingQuery,
  companyFiltersSchema,
  searchParamsToObject,
  type CompanyFilters,
  type RankingUiState,
} from '@/lib/leads/filters';
import { BULK_MAX, EXPORT_MAX } from '@/lib/leads/config';
import type { CompanyRow, ExportRequest, ExportResult, TriageResult, UserRef } from '@/lib/leads/client-api';

// ---------------------------------------------------------------------------
// Estado da URL
// ---------------------------------------------------------------------------

/** Chaves de filtro sincronizadas com a query string (mesmos nomes da API). */
export const RANKING_UI_KEYS = [
  'q',
  'cidade',
  'bairro',
  'uf',
  'nicho',
  'categoria',
  'prioridade',
  'scoreMin',
  'scoreMax',
  'hasSite',
  'isHttps',
  'fonte',
  'assignedTo',
  'leadStatus',
  'analyzedFrom',
  'analyzedTo',
  'runId',
  'temInstagram',
  'temWhatsapp',
  'temCnpj',
  'situacao',
  'desempenhoRuim',
] as const satisfies readonly (keyof CompanyFilters)[];

export type RankingUiKey = (typeof RANKING_UI_KEYS)[number];
export type RankingView = 'lista' | 'mapa';

export interface RankingUrlState {
  ui: RankingUiState;
  page: number;
  view: RankingView;
}

/** Lê filtros (valores crus), página (inteiro ≥ 1, padrão 1) e visão (`lista` padrão). */
export function parseRankingUrl(params: URLSearchParams): RankingUrlState {
  const ui: RankingUiState = {};
  for (const key of RANKING_UI_KEYS) {
    const v = params.get(key);
    if (v !== null && v !== '') ui[key] = v;
  }
  const rawPage = params.get('page') ?? '';
  const n = /^\d+$/.test(rawPage) ? Number(rawPage) : 1;
  const page = Number.isSafeInteger(n) && n >= 1 ? n : 1;
  const view: RankingView = params.get('view') === 'mapa' ? 'mapa' : 'lista';
  return { ui, page, view };
}

/** Serializa o estado; omite filtros vazios, `page=1` e `view=lista`. */
export function serializeRankingUrl(state: RankingUrlState): URLSearchParams {
  const out = new URLSearchParams();
  for (const key of RANKING_UI_KEYS) {
    const v = state.ui[key];
    if (v !== undefined && v !== '') out.set(key, v);
  }
  if (state.page > 1) out.set('page', String(state.page));
  if (state.view === 'mapa') out.set('view', 'mapa');
  return out;
}

/** Aplica alteração de filtro/busca: valores vazios removem o filtro e a página volta a 1 (Req. 12.4). */
export function applyFilterPatch(state: RankingUrlState, patch: RankingUiState): RankingUrlState {
  const ui: RankingUiState = { ...state.ui };
  for (const [key, value] of Object.entries(patch) as [RankingUiKey, string | undefined][]) {
    if (value === undefined || value === '') delete ui[key];
    else ui[key] = value;
  }
  return { ...state, ui, page: 1 };
}

/** Limpa todos os filtros, preservando só a mineração (`runId`) e a visão. */
export function clearFilters(state: RankingUrlState): RankingUrlState {
  const ui: RankingUiState = state.ui.runId ? { runId: state.ui.runId } : {};
  return { ...state, ui, page: 1 };
}

/** Chave estável dos filtros (sem página nem visão), para detectar mudança de filtro. */
export function filtersKey(ui: RankingUiState): string {
  return serializeRankingUrl({ ui, page: 1, view: 'lista' }).toString();
}

// ---------------------------------------------------------------------------
// Requisição
// ---------------------------------------------------------------------------

export type RankingInvalidField = 'score' | 'datas';

export const INVALID_MESSAGES: Record<RankingInvalidField, string> = {
  score: MSG.score,
  datas: MSG.intervaloDatas,
};

/**
 * Query enviada à API: `buildRankingQuery` (faixa de score inválida omitida e sinalizada) e,
 * da mesma forma, intervalo de datas com início posterior ao fim. Os demais filtros seguem.
 */
export function buildRankingRequest(ui: RankingUiState): { query: URLSearchParams; invalid: RankingInvalidField[] } {
  const { query, invalid } = buildRankingQuery(ui);
  const out: RankingInvalidField[] = [...invalid];
  const from = query.get('analyzedFrom');
  const to = query.get('analyzedTo');
  if (from && to && from > to) {
    query.delete('analyzedFrom');
    query.delete('analyzedTo');
    out.push('datas');
  }
  return { query, invalid: out };
}

/** Query da página de listagem (filtros + `page`). */
export function listQuery(query: URLSearchParams, page: number): URLSearchParams {
  const q = new URLSearchParams(query);
  if (page > 1) q.set('page', String(page));
  return q;
}

// ---------------------------------------------------------------------------
// Seleção em lote (Req. 12.5, 15.7)
// ---------------------------------------------------------------------------

export const BULK_LIMIT_MESSAGE = MSG.bulk;

/** Seleção utilizável pelas ações em lote: 1 a 200 empresas. */
export function isSelectionValid(count: number): boolean {
  return count >= 1 && count <= BULK_MAX;
}

export function toggleId(selected: ReadonlySet<string>, id: string): Set<string> {
  const next = new Set(selected);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  return next;
}

/** Estado do checkbox "selecionar a página". */
export function pageSelectionState(selected: ReadonlySet<string>, pageIds: readonly string[]): 'all' | 'some' | 'none' {
  if (pageIds.length === 0) return 'none';
  const n = pageIds.filter((id) => selected.has(id)).length;
  return n === 0 ? 'none' : n === pageIds.length ? 'all' : 'some';
}

/** Com a página toda marcada, desmarca-a; senão marca todas as linhas da página. */
export function togglePageSelection(selected: ReadonlySet<string>, pageIds: readonly string[]): Set<string> {
  const next = new Set(selected);
  if (pageSelectionState(selected, pageIds) === 'all') pageIds.forEach((id) => next.delete(id));
  else pageIds.forEach((id) => next.add(id));
  return next;
}

// ---------------------------------------------------------------------------
// Exportação (Req. 17.1, 17.7, 17.8)
// ---------------------------------------------------------------------------

export const EXPORT_EMPTY_MESSAGE = 'Não há empresas para exportar.';

const nf = new Intl.NumberFormat('pt-BR');

/** Com seleção exporta os ids; sem seleção, os filtros ativos (a mesma query da lista). */
export function exportRequestFor(selectedIds: readonly string[], query: URLSearchParams): ExportRequest {
  if (selectedIds.length > 0) return { ids: [...selectedIds] };
  const raw = searchParamsToObject(query);
  delete raw.page;
  const parsed = companyFiltersSchema.safeParse(raw);
  // Filtro inválido vindo da URL: envia cru e deixa o servidor responder 400 com a mensagem.
  return { filters: parsed.success ? parsed.data : (raw as unknown as CompanyFilters) };
}

/** Aviso após exportar: limite de 5.000 linhas atingido, ou `null`. */
export function exportTruncationNotice(result: Pick<ExportResult, 'total' | 'truncated'>): string | null {
  if (!result.truncated) return null;
  return `Limite de ${nf.format(EXPORT_MAX)} linhas atingido: o arquivo contém as ${nf.format(EXPORT_MAX)} primeiras de ${nf.format(result.total)} empresas que atendiam aos critérios.`;
}

export function exportSuccessMessage(result: Pick<ExportResult, 'total' | 'truncated'>): string {
  const n = result.truncated ? EXPORT_MAX : result.total;
  return `CSV exportado com ${nf.format(n)} ${n === 1 ? 'empresa' : 'empresas'}.`;
}

// ---------------------------------------------------------------------------
// Toasts de triagem e atribuição (Req. 15.5, 15.10, 16.8, 16.9)
// ---------------------------------------------------------------------------

const plural = (n: number, one: string, many: string) => `${nf.format(n)} ${n === 1 ? one : many}`;

export function triageSuccessMessage(r: TriageResult): string {
  return `${plural(r.created, 'lead criado', 'leads criados')} na triagem; ${plural(r.ignored, 'empresa ignorada', 'empresas ignoradas')} (já enviadas).`;
}

export const TRIAGE_ERROR_PREFIX = 'Nenhum lead foi enviado para a triagem.';
export const ASSIGN_ERROR_PREFIX = 'Nenhuma atribuição foi aplicada.';

export function assignSuccessMessage(updated: number, assigneeName: string): string {
  return `${plural(updated, 'empresa atribuída', 'empresas atribuídas')} a ${assigneeName}.`;
}

/** Exibe o novo responsável nas linhas afetadas, sem recarregar a lista (Req. 16.9). */
export function applyAssignee<T extends Pick<CompanyRow, 'id' | 'assignedUser'>>(
  rows: readonly T[],
  ids: readonly string[],
  assignee: UserRef,
): T[] {
  const set = new Set(ids);
  return rows.map((r) => (set.has(r.id) ? { ...r, assignedUser: { id: assignee.id, name: assignee.name } } : r));
}

// ---------------------------------------------------------------------------
// Rótulos
// ---------------------------------------------------------------------------

export const LEAD_STATUS_LABEL: Record<string, string> = {
  RAW: 'Novo na triagem',
  PENDING: 'Pendente de triagem',
  IN_PROGRESS: 'Em triagem',
  CONVERTED_TO_PIPE: 'Convertido em card no funil',
  DISCARDED: 'Descartado',
  NONE: 'Não enviada para triagem',
};

export const SOURCE_LABEL: Record<string, string> = {
  OSM: 'OpenStreetMap',
  GOOGLE: 'Google',
  MISTA: 'Mista',
};

/** Data ISO → DD/MM/AAAA (fuso de Brasília); `null` → "—". */
export function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return new Intl.DateTimeFormat('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(d);
}

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
import { CONTATO_TABS, DEFAULT_CONTATO_TAB, type ContatoTab } from '@/lib/leads/contact';
import type {
  CompanyRow,
  EvaluationSummaryDto,
  ExportRequest,
  ExportResult,
  TriageResult,
  UserRef,
} from '@/lib/leads/client-api';
import { EVALUATION_MANUAL_MAX } from '@/lib/leads/evaluation';

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
  'contato',
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

/** Limpa todos os filtros, preservando só a mineração (`runId`), a aba de contato e a visão. */
export function clearFilters(state: RankingUrlState): RankingUrlState {
  const ui: RankingUiState = {};
  if (state.ui.runId) ui.runId = state.ui.runId;
  if (state.ui.contato) ui.contato = state.ui.contato;
  return { ...state, ui, page: 1 };
}

// ---------------------------------------------------------------------------
// Abas Com contato / Sem contato (T4)
// ---------------------------------------------------------------------------

/** Aba ativa: `com` é o padrão (URL sem `contato`); valor inválido também cai em `com`. */
export function contatoTab(ui: RankingUiState): ContatoTab {
  return (CONTATO_TABS as readonly string[]).includes(ui.contato ?? '') ? (ui.contato as ContatoTab) : DEFAULT_CONTATO_TAB;
}

/** Patch de filtro que troca de aba; a aba padrão sai da URL. */
export function contatoTabPatch(tab: ContatoTab): RankingUiState {
  return { contato: tab === DEFAULT_CONTATO_TAB ? '' : tab };
}

export const CONTATO_TAB_LABEL: Record<ContatoTab, string> = { com: 'Com contato', sem: 'Sem contato' };

const nfTab = new Intl.NumberFormat('pt-BR');

/** "Com contato (12)"; sem contagem (ainda carregando) mostra só o nome. */
export function contatoTabText(tab: ContatoTab, count: number | null | undefined): string {
  return typeof count === 'number' ? `${CONTATO_TAB_LABEL[tab]} (${nfTab.format(count)})` : CONTATO_TAB_LABEL[tab];
}

/** Mensagem da lista vazia por aba. */
export function emptyMessageFor(tab: ContatoTab): string {
  return tab === 'sem'
    ? 'Nenhuma empresa sem contato atende aos filtros e à busca atuais.'
    : 'Nenhuma empresa com contato atende aos filtros e à busca atuais.';
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

/**
 * Requisição da Tela_Ranking: como `buildRankingRequest`, mais a aba de contato (sempre explícita,
 * assim lista, mapa e CSV seguem a mesma aba).
 */
export function buildTabbedRankingRequest(
  ui: RankingUiState,
  opts: { live?: boolean } = {},
): ReturnType<typeof buildRankingRequest> {
  const r = buildRankingRequest(ui);
  r.query.set('contato', contatoTab(ui));
  // T3: com a mineração em andamento, mais recentes primeiro (ainda não há score para ordenar).
  if (opts.live) r.query.set('ordem', 'recentes');
  return r;
}

// ---------------------------------------------------------------------------
// Resultados progressivos (T3)
// ---------------------------------------------------------------------------

/** Intervalo de atualização da Tela_Ranking enquanto a mineração filtrada roda. */
export const LIVE_POLL_MS = 3_000;

/** Mineração ainda produzindo resultados (descoberta ou análise). */
export function isRunLive(status: string | null | undefined): boolean {
  return status === 'PENDENTE' || status === 'EM_ANDAMENTO';
}

/**
 * Linha ainda sem análise numa mineração ativa: mostra "analisando…" no lugar do score.
 * Empresa que já tinha análise antiga mantém o score anterior até a nova ser gravada.
 */
export function isAnalyzing(row: { lastAnalyzedAt: string | null; scoreFinal: number | null }, live: boolean): boolean {
  return live && row.lastAnalyzedAt === null && row.scoreFinal === null;
}

export interface LiveCounters {
  encontradas: number;
  comContato: number;
  analisadas: number;
  /** Total a analisar; `null` enquanto a descoberta ainda não terminou. */
  total: number | null;
}

/** Contadores ao vivo a partir do detalhe da mineração (`novos + existentes` = empresas encontradas). */
export function liveCounters(run: {
  novos: number;
  existentes: number;
  processados: number;
  total: number;
  status: string;
  comContato?: number;
}): LiveCounters {
  return {
    encontradas: run.novos + run.existentes,
    comContato: run.comContato ?? 0,
    analisadas: run.processados,
    total: run.status === 'PENDENTE' ? null : run.total,
  };
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

// ---------------------------------------------------------------------------
// Avaliação dos leads sem contato (T5)
// ---------------------------------------------------------------------------

/**
 * Ids que o botão "Avaliar" envia (no máximo 30): a seleção, se houver; senão os leads da página
 * ainda sem avaliação ou só com a de regras (que a IA pode refazer).
 */
export function evaluationTargets(
  rows: readonly Pick<CompanyRow, 'id' | 'avaliacao'>[],
  selected: ReadonlySet<string>,
  max: number = EVALUATION_MANUAL_MAX,
): string[] {
  const ids =
    selected.size > 0
      ? rows.filter((r) => selected.has(r.id)).map((r) => r.id)
      : rows.filter((r) => r.avaliacao === null || r.avaliacao.fonte === 'REGRA').map((r) => r.id);
  return ids.slice(0, Math.max(0, max));
}

const SEM_IA_REASON: Record<string, string> = {
  IA_SEM_CHAVE: 'a IA não está configurada',
  IA_COTA_ESGOTADA: 'a cota mensal da IA acabou',
  IA_ERRO: 'a IA não respondeu',
  IA_TIMEOUT: 'a IA demorou demais',
  IA_RESPOSTA_INVALIDA: 'a resposta da IA foi inválida',
  IA_SEM_TEMPO: 'faltou tempo para chamar a IA',
};

/** Mensagem do toast após "Avaliar". */
export function evaluationMessage(r: EvaluationSummaryDto): { kind: 'success' | 'info'; text: string } {
  if (r.avaliados === 0) {
    return { kind: 'info', text: 'Nenhum lead precisava de avaliação (já avaliados ou com contato).' };
  }
  const base = `${plural(r.avaliados, 'lead avaliado', 'leads avaliados')}`;
  if (r.porRegra === 0) return { kind: 'success', text: `${base} por IA.` };
  const why = r.motivoSemIa ? SEM_IA_REASON[r.motivoSemIa] ?? 'a IA não foi usada' : 'a IA não foi usada';
  if (r.porIa === 0) return { kind: 'info', text: `${base} por regras (sem IA): ${why}.` };
  return { kind: 'info', text: `${base}: ${r.porIa} por IA e ${r.porRegra} por regras (sem IA), pois ${why}.` };
}

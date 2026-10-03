/**
 * Lógica pura da Tela_Mineracoes (`/tools/lead-miner/runs`): estado dos filtros ↔ query string,
 * validação local das datas e formatação das linhas (Req. 11.1–11.7, 11.9).
 * Sem React e sem rede — testável em ambiente node.
 */
import type { MiningSource, MiningStatus, RunsListParams } from '@/lib/leads/client-api';
import { UFS } from '@/lib/leads/config';
import { MSG, isValidDateString } from '@/lib/leads/filters';

export const RUN_STATUS_OPTIONS: readonly MiningStatus[] = ['PENDENTE', 'EM_ANDAMENTO', 'CONCLUIDA', 'ERRO'];
export const RUN_SOURCE_OPTIONS: readonly MiningSource[] = ['OSM', 'GOOGLE', 'MISTA'];

export const RUN_STATUS_LABEL: Record<MiningStatus, string> = {
  PENDENTE: 'Pendente',
  EM_ANDAMENTO: 'Em andamento',
  CONCLUIDA: 'Concluída',
  ERRO: 'Erro',
};

export const RUN_SOURCE_LABEL: Record<MiningSource, string> = {
  OSM: 'OpenStreetMap',
  GOOGLE: 'Google',
  MISTA: 'Mista',
};

export const SEARCH_DEBOUNCE_MS = 300;
export const SEARCH_MAX = 100;
export const NO_RUNS_FOUND = 'Nenhuma mineração encontrada.';

/** Estado da tela como strings cruas (espelha a query string). */
export interface RunsUiState {
  q: string;
  uf: string;
  status: string;
  fonte: string;
  from: string;
  to: string;
  page: number;
}

export const EMPTY_RUNS_UI: RunsUiState = { q: '', uf: '', status: '', fonte: '', from: '', to: '', page: 1 };

const UF_SET = new Set(UFS);

function parsePage(raw: string | null): number {
  if (!raw || !/^\d+$/.test(raw.trim())) return 1;
  const n = Number(raw.trim());
  return Number.isSafeInteger(n) && n >= 1 ? n : 1;
}

/**
 * Lê o estado da URL. Valores de UF/status/fonte desconhecidos são descartados (a tela só
 * oferece as opções válidas); datas ficam como vieram para que a validação local as indique.
 */
export function parseRunsUiState(params: URLSearchParams): RunsUiState {
  const get = (k: string) => params.get(k) ?? '';
  const uf = get('uf');
  const status = get('status');
  const fonte = get('fonte');
  return {
    q: get('q').slice(0, SEARCH_MAX),
    uf: UF_SET.has(uf) ? uf : '',
    status: (RUN_STATUS_OPTIONS as readonly string[]).includes(status) ? status : '',
    fonte: (RUN_SOURCE_OPTIONS as readonly string[]).includes(fonte) ? fonte : '',
    from: get('from'),
    to: get('to'),
    page: parsePage(params.get('page')),
  };
}

/** Query string da página (omite vazios e `page=1`), sem o `?`. */
export function runsUiToSearch(ui: RunsUiState): string {
  const p = new URLSearchParams();
  const q = ui.q.trim();
  if (q) p.set('q', q);
  if (ui.uf) p.set('uf', ui.uf);
  if (ui.status) p.set('status', ui.status);
  if (ui.fonte) p.set('fonte', ui.fonte);
  if (ui.from) p.set('from', ui.from);
  if (ui.to) p.set('to', ui.to);
  if (ui.page > 1) p.set('page', String(ui.page));
  return p.toString();
}

/**
 * Aplica uma mudança de filtro/busca e volta para a página 1 (Req. 11.4). Exceção: uma mudança
 * só de datas que deixa o intervalo inválido mantém a página, pois o filtro não é aplicado e a
 * lista exibida deve ser mantida (Req. 11.7).
 */
export function changeFilter(ui: RunsUiState, patch: Partial<Omit<RunsUiState, 'page'>>): RunsUiState {
  const keys = Object.keys(patch) as (keyof typeof patch)[];
  const merged = { ...ui, ...patch };
  if (!keys.some((k) => ui[k] !== merged[k])) return ui;
  const onlyDates = keys.every((k) => k === 'from' || k === 'to');
  if (onlyDates && !checkDateRange(merged.from, merged.to).valid) return merged;
  return { ...merged, page: 1 };
}

export interface DateRangeCheck {
  /** Erro por campo (formato) ou do intervalo (`range`). */
  errors: { from?: string; to?: string; range?: string };
  valid: boolean;
}

/** Validação local das datas (AAAA-MM-DD, opcionais, `from ≤ to`) (Req. 11.3, 11.7). */
export function checkDateRange(from: string, to: string): DateRangeCheck {
  const errors: DateRangeCheck['errors'] = {};
  const f = from.trim();
  const t = to.trim();
  if (f && !isValidDateString(f)) errors.from = MSG.data;
  if (t && !isValidDateString(t)) errors.to = MSG.data;
  if (!errors.from && !errors.to && f && t && f > t) errors.range = MSG.intervaloDatas;
  return { errors, valid: Object.keys(errors).length === 0 };
}

export interface AppliedDates {
  from: string;
  to: string;
}

/**
 * Datas efetivamente aplicadas: com intervalo válido, as atuais; com intervalo inválido, as
 * últimas válidas — assim o filtro inválido não é aplicado e a lista exibida é mantida (Req. 11.7).
 */
export function resolveAppliedDates(ui: Pick<RunsUiState, 'from' | 'to'>, lastValid: AppliedDates): AppliedDates {
  return checkDateRange(ui.from, ui.to).valid ? { from: ui.from.trim(), to: ui.to.trim() } : lastValid;
}

/** Parâmetros de `GET /runs` a partir do estado e das datas aplicadas. */
export function buildRunsApiParams(ui: RunsUiState, dates: AppliedDates): RunsListParams {
  const params: RunsListParams = { page: ui.page };
  const q = ui.q.trim();
  if (q) params.q = q.slice(0, SEARCH_MAX);
  if (ui.uf) params.uf = ui.uf;
  if (ui.status) params.status = ui.status as MiningStatus;
  if (ui.fonte) params.fonte = ui.fonte as MiningSource;
  if (dates.from) params.from = dates.from;
  if (dates.to) params.to = dates.to;
  return params;
}

/** Chave estável de uma consulta (evita refazer a mesma requisição). */
export function runsParamsKey(p: RunsListParams): string {
  return JSON.stringify([p.q ?? '', p.uf ?? '', p.status ?? '', p.fonte ?? '', p.from ?? '', p.to ?? '', p.page ?? 1]);
}

const BRT_OFFSET_MS = -3 * 3_600_000; // Brasília, sem horário de verão (mesmo fuso dos filtros)
const pad = (n: number) => String(n).padStart(2, '0');

/** `DD/MM/AAAA HH:mm` no fuso de Brasília; `—` para data inválida (Req. 11.1). */
export function formatRunDateTime(value: string | Date): string {
  const ms = (value instanceof Date ? value : new Date(value)).getTime();
  if (!Number.isFinite(ms)) return '—';
  const d = new Date(ms + BRT_OFFSET_MS);
  return `${pad(d.getUTCDate())}/${pad(d.getUTCMonth() + 1)}/${d.getUTCFullYear()} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
}

/** "Bairro, Cidade/UF". */
export function runLocation(r: { bairro: string; cidade: string; uf: string }): string {
  return `${r.bairro}, ${r.cidade}/${r.uf}`;
}

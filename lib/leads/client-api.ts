/**
 * Cliente HTTP tipado das rotas `/api/tools/lead-miner/**` (uso nas telas).
 *
 * Sem imports de servidor: de `pipeline.ts`, `filters.ts` e `@prisma/client` vêm apenas tipos
 * (`import type`, apagados na compilação — nada disso entra no bundle do navegador).
 * Toda resposta não-OK vira `LeadMinerApiError` com mensagem em português.
 */
import type { CompanyCategory, LeadPriority, MiningSource, MiningStatus } from '@prisma/client';
import type { IaDisabledReason, RunProgress } from './pipeline';
import type { CompanyFilters, LeadStatus, RunsListQuery } from './filters';
import type { PresetId } from './config';

export type { IaDisabledReason, RunProgress, CompanyFilters, LeadStatus, RunsListQuery };
export type { CompanyCategory, LeadPriority, MiningSource, MiningStatus };

const BASE = '/api/tools/lead-miner';

// ---------------------------------------------------------------------------
// Erro
// ---------------------------------------------------------------------------

const DEFAULT_MESSAGES: Record<number, string> = {
  400: 'Dados inválidos. Revise os campos e tente novamente.',
  401: 'Sua sessão expirou. Entre novamente.',
  403: 'Você não tem permissão para esta ação.',
  404: 'Registro não encontrado.',
  409: 'Conflito: o registro foi alterado por outra pessoa.',
  500: 'Erro interno do servidor. Tente novamente.',
};
export const NETWORK_ERROR_MESSAGE = 'Não foi possível conectar ao servidor. Verifique sua conexão.';

export class LeadMinerApiError extends Error {
  /** 0 = falha de rede (sem resposta). */
  readonly status: number;
  /** Erros por campo (400). */
  readonly fields?: Record<string, string>;
  /** Corpo JSON completo da resposta de erro (ex.: `runId` no 409, `assignedTo` no claim). */
  readonly data: Record<string, unknown>;

  constructor(status: number, message: string, data: Record<string, unknown> = {}, fields?: Record<string, string>) {
    super(message);
    this.name = 'LeadMinerApiError';
    this.status = status;
    this.data = data;
    this.fields = fields;
  }
}

export function isLeadMinerApiError(e: unknown): e is LeadMinerApiError {
  return e instanceof LeadMinerApiError;
}

function isAbortError(e: unknown): boolean {
  return typeof e === 'object' && e !== null && (e as { name?: string }).name === 'AbortError';
}

async function toApiError(res: Response): Promise<LeadMinerApiError> {
  let data: Record<string, unknown> = {};
  try {
    const parsed: unknown = await res.json();
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) data = parsed as Record<string, unknown>;
  } catch {
    // corpo ausente ou não-JSON
  }
  const message =
    typeof data.error === 'string' && data.error.trim() !== ''
      ? data.error
      : DEFAULT_MESSAGES[res.status] ?? (res.status >= 500 ? DEFAULT_MESSAGES[500] : 'Não foi possível concluir a operação.');
  let fields: Record<string, string> | undefined;
  if (data.fields && typeof data.fields === 'object' && !Array.isArray(data.fields)) {
    fields = {};
    for (const [k, v] of Object.entries(data.fields as Record<string, unknown>)) {
      if (typeof v === 'string') fields[k] = v;
    }
  }
  return new LeadMinerApiError(res.status, message, data, fields);
}

interface RequestOptions {
  signal?: AbortSignal;
}

async function send(path: string, init: RequestInit & RequestOptions = {}): Promise<Response> {
  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, { cache: 'no-store', ...init });
  } catch (e) {
    if (isAbortError(e)) throw e; // cancelamento não é erro de API
    throw new LeadMinerApiError(0, NETWORK_ERROR_MESSAGE);
  }
  if (!res.ok) throw await toApiError(res);
  return res;
}

async function getJson<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  const res = await send(path, { method: 'GET', signal: opts.signal });
  return (await res.json()) as T;
}

async function postJson<T>(path: string, body: unknown, opts: RequestOptions = {}): Promise<T> {
  const res = await send(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: opts.signal,
  });
  return (await res.json()) as T;
}

/** Monta a query string omitindo valores vazios/indefinidos. */
export function toQueryString(params: object | URLSearchParams | undefined): string {
  if (!params) return '';
  const qs =
    params instanceof URLSearchParams
      ? new URLSearchParams(params)
      : (() => {
        const p = new URLSearchParams();
        for (const [k, v] of Object.entries(params as Record<string, unknown>)) {
          if (v === undefined || v === null || v === '') continue;
          p.set(k, String(v));
        }
        return p;
      })();
  const s = qs.toString();
  return s ? `?${s}` : '';
}

const enc = encodeURIComponent;

// ---------------------------------------------------------------------------
// Tipos das respostas (datas chegam como string ISO)
// ---------------------------------------------------------------------------

export interface UserRef {
  id: string;
  name: string;
}

export interface LeadMinerConfig {
  iaAvailable: boolean;
}

export interface CreateRunInput {
  bairro: string;
  cidade: string;
  uf: string;
  nichos?: string[];
  preset?: PresetId;
  excluirRedes: boolean;
  iaEnabled: boolean;
}

export interface RunListItem extends RunProgress {
  bairro: string;
  cidade: string;
  uf: string;
  fonte: MiningSource;
  iaEnabled: boolean;
  createdAt: string;
  finishedAt: string | null;
  createdBy: UserRef;
}

export interface RunsListResponse {
  items: RunListItem[];
  page: number;
  total: number;
  totalPages: number;
}

export type RunsListParams = Partial<Omit<RunsListQuery, 'page'>> & { page?: number };

export interface RunDetail extends RunProgress {
  bairro: string;
  cidade: string;
  uf: string;
  fonte: MiningSource;
  iaEnabled: boolean;
  createdAt: string;
  finishedAt: string | null;
  createdBy: UserRef;
}

export interface RunLookup {
  id: string;
  createdAt: string;
  total: number;
  createdBy: { name: string };
}

export interface CompanyRow {
  id: string;
  nome: string;
  nicho: string;
  bairro: string | null;
  cidade: string | null;
  uf: string | null;
  telefone: string | null;
  website: string | null;
  categoria: CompanyCategory | null;
  scoreFinal: number | null;
  prioridade: LeadPriority | null;
  hasSite: boolean | null;
  isHttps: boolean | null;
  fonte: MiningSource;
  lastAnalyzedAt: string | null;
  latitude: number | null;
  longitude: number | null;
  assignedUser: UserRef | null;
  prospectLead: { id: string; status: LeadStatus } | null;
}

export interface CompaniesResponse {
  items: CompanyRow[];
  total: number;
  page: number;
  pageSize?: number;
  totalPages: number;
}

export interface MapPoint {
  id: string;
  nome: string;
  latitude: number;
  longitude: number;
  categoria: CompanyCategory | null;
  scoreFinal: number | null;
  prioridade: LeadPriority | null;
}

export interface MapResponse {
  points: MapPoint[];
  shown: number;
  total: number;
}

export interface CompanyAnalysis {
  id: string;
  runId: string | null;
  hasSite: boolean;
  online: boolean;
  statusCode: number | null;
  isHttps: boolean;
  sslValid: boolean;
  sslProblem: string | null;
  responseTime: number | null;
  lento: boolean;
  motivoFalha: string | null;
  finalUrl: string | null;
  categoria: CompanyCategory;
  motivos: string[];
  scoreDigital: number;
  scoreIcp: number;
  scoreObjetivo: number;
  scoreIa: number | null;
  scoreFinal: number;
  prioridade: LeadPriority;
  iaAplicada: boolean;
  iaMotivo: string | null;
  oportunidadeIa: string | null;
  justificativaIa: string | null;
  /** `ScoreBreakdown` serializado. */
  detalhamento: unknown;
  createdAt: string;
}

export interface CompanyRunEntry {
  isNew: boolean;
  nicho: string;
  run: {
    id: string;
    bairro: string;
    cidade: string;
    uf: string;
    status: MiningStatus;
    processados: number;
    total: number;
    nichosFalhos: string[];
    createdAt: string;
    createdBy: { name: string };
  };
}

export interface CompanyDetail {
  id: string;
  nome: string;
  nicho: string;
  endereco: string | null;
  bairro: string | null;
  cidade: string | null;
  uf: string | null;
  telefone: string | null;
  website: string | null;
  latitude: number | null;
  longitude: number | null;
  marcaRede: string | null;
  fonte: MiningSource;
  categoria: CompanyCategory | null;
  scoreFinal: number | null;
  prioridade: LeadPriority | null;
  hasSite: boolean | null;
  isHttps: boolean | null;
  lastAnalyzedAt: string | null;
  createdAt: string;
  updatedAt: string;
  assignedUser: UserRef | null;
  prospectLead: { id: string; status: LeadStatus; assignedTo: string | null; createdAt: string } | null;
  analyses: CompanyAnalysis[];
  runs: CompanyRunEntry[];
}

export type ExportRequest = { ids: string[] } | { filters: CompanyFilters };

export interface ExportResult {
  blob: Blob;
  filename: string;
  total: number;
  truncated: boolean;
}

export interface TriageResult {
  created: number;
  ignored: number;
}

export interface AssignResult {
  updated: number;
  assignee: UserRef;
}

export interface ClaimResult {
  assignee: UserRef;
}

export interface Assignee extends UserRef {
  title?: string | null;
}

// ---------------------------------------------------------------------------
// Utilitários de resposta
// ---------------------------------------------------------------------------

function pickUserRef(v: unknown): UserRef | null {
  if (v && typeof v === 'object') {
    const o = v as Record<string, unknown>;
    if (typeof o.id === 'string') return { id: o.id, name: typeof o.name === 'string' ? o.name : '' };
  }
  return null;
}

/** Responsável atual informado num 409 do "Assumir" (`assignee` ou `assignedTo`). */
export function conflictAssignee(e: LeadMinerApiError): UserRef | null {
  return pickUserRef(e.data.assignee) ?? pickUserRef(e.data.assignedTo);
}

/** `runId` informado num 409 de `POST /runs`. */
export function conflictRunId(e: LeadMinerApiError): string | null {
  return typeof e.data.runId === 'string' ? e.data.runId : null;
}

function filenameFrom(disposition: string | null): string {
  const m = disposition?.match(/filename\*?=(?:UTF-8'')?"?([^";]+)"?/i);
  if (m) {
    try {
      return decodeURIComponent(m[1]);
    } catch {
      return m[1];
    }
  }
  return 'leads.csv';
}

// ---------------------------------------------------------------------------
// Chamadas
// ---------------------------------------------------------------------------

export const leadMinerApi = {
  getConfig: (opts?: RequestOptions) => getJson<LeadMinerConfig>('/config', opts),

  createRun: (input: CreateRunInput, opts?: RequestOptions) => postJson<RunProgress>('/runs', input, opts),

  listRuns: (params: RunsListParams = {}, opts?: RequestOptions) =>
    getJson<RunsListResponse>(`/runs${toQueryString(params)}`, opts),

  activeRuns: (opts?: RequestOptions) => getJson<{ runs: RunProgress[] }>('/runs/active', opts),

  lookupRun: (params: { bairro: string; cidade: string; uf: string }, opts?: RequestOptions) =>
    getJson<{ run: RunLookup | null }>(`/runs/lookup${toQueryString(params)}`, opts),

  getRun: (id: string, opts?: RequestOptions) => getJson<RunDetail>(`/runs/${enc(id)}`, opts),

  discover: (id: string, opts?: RequestOptions) => postJson<RunProgress>(`/runs/${enc(id)}/discover`, undefined, opts),

  batch: (id: string, opts?: RequestOptions) => postJson<RunProgress>(`/runs/${enc(id)}/batch`, undefined, opts),

  /** Aceita filtros tipados ou a query já montada (ex.: `buildRankingQuery(ui).query`). */
  listCompanies: (params: (CompanyFilters & { page?: number }) | URLSearchParams = {}, opts?: RequestOptions) =>
    getJson<CompaniesResponse>(`/companies${toQueryString(params)}`, opts),

  companiesMap: (params: CompanyFilters | URLSearchParams = {}, opts?: RequestOptions) =>
    getJson<MapResponse>(`/companies/map${toQueryString(params)}`, opts),

  getCompany: (id: string, opts?: RequestOptions) => getJson<CompanyDetail>(`/companies/${enc(id)}`, opts),

  exportCsv: async (req: ExportRequest, opts?: RequestOptions): Promise<ExportResult> => {
    const res = await send('/companies/export', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req),
      signal: opts?.signal,
    });
    const blob = await res.blob();
    const total = Number(res.headers.get('X-Export-Total'));
    return {
      blob,
      filename: filenameFrom(res.headers.get('Content-Disposition')),
      total: Number.isFinite(total) ? total : 0,
      truncated: res.headers.get('X-Export-Truncated') === 'true',
    };
  },

  triage: (ids: string[], opts?: RequestOptions) => postJson<TriageResult>('/companies/triage', { ids }, opts),

  /** Corpo `{ ids, assigneeId }`, como espera `POST /companies/assign`. */
  assign: async (ids: string[], assigneeId: string, opts?: RequestOptions): Promise<AssignResult> => {
    const data = await postJson<Record<string, unknown>>('/companies/assign', { ids, assigneeId }, opts);
    return {
      updated: typeof data.updated === 'number' ? data.updated : ids.length,
      assignee: pickUserRef(data.assignee) ?? pickUserRef(data.assignedTo) ?? { id: assigneeId, name: '' },
    };
  },

  /** 409 → `LeadMinerApiError` com o responsável atual em `conflictAssignee(e)`. */
  claim: async (companyId: string, opts?: RequestOptions): Promise<ClaimResult> => {
    const data = await postJson<Record<string, unknown>>(`/companies/${enc(companyId)}/claim`, undefined, opts);
    const assignee = pickUserRef(data.assignee) ?? pickUserRef(data.assignedTo);
    if (!assignee) throw new LeadMinerApiError(500, DEFAULT_MESSAGES[500], data);
    return { assignee };
  },

  /** Aceita a resposta como lista ou como `{ users }`. */
  assignees: async (opts?: RequestOptions): Promise<Assignee[]> => {
    const data = await getJson<unknown>('/assignees', opts);
    const list = Array.isArray(data)
      ? data
      : data && typeof data === 'object' && Array.isArray((data as { users?: unknown }).users)
        ? (data as { users: unknown[] }).users
        : [];
    return list.flatMap((u) => {
      const ref = pickUserRef(u);
      if (!ref) return [];
      const title = (u as { title?: unknown }).title;
      return [{ ...ref, title: typeof title === 'string' ? title : null }];
    });
  },
};

/** Dispara o download de um `ExportResult` no navegador. */
export function downloadExport(result: Pick<ExportResult, 'blob' | 'filename'>): void {
  const url = URL.createObjectURL(result.blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = result.filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

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
import type { ServicesStatus } from './services';
import type { NameOrigin } from './display';
import type { ApproachChannel, ApproachFallbackReason } from './approach';
import type {
  CnpjData,
  CnpjCandidate,
  CnpjOrigin,
  PageSpeedAbsence,
  PageSpeedResult,
  SinaisDigitais,
  SourceMode,
} from './types';

export type { IaDisabledReason, RunProgress, CompanyFilters, LeadStatus, RunsListQuery };
export type { CompanyCategory, LeadPriority, MiningSource, MiningStatus };
export type { ServicesStatus, NameOrigin, ApproachChannel, ApproachFallbackReason };

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

async function bodyJson<T>(method: 'POST' | 'PUT' | 'DELETE', path: string, body: unknown, opts: RequestOptions = {}): Promise<T> {
  const res = await send(path, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: opts.signal,
  });
  return (await res.json()) as T;
}

const postJson = <T>(path: string, body: unknown, opts: RequestOptions = {}): Promise<T> =>
  bodyJson<T>('POST', path, body, opts);

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
  /** Estado e uso do mês de Google Places, PageSpeed e Gemini (Req. 2.6). */
  services: ServicesStatus;
}

export interface CreateRunInput {
  bairro: string;
  cidade: string;
  uf: string;
  nichos?: string[];
  preset?: PresetId;
  excluirRedes: boolean;
  iaEnabled: boolean;
  /** Fonte de descoberta; padrão `MISTA` (Req. 4.3). */
  fonte?: SourceMode;
  /** Analisar desempenho com o PageSpeed; padrão `true` (Req. 10.1). */
  pagespeedEnabled?: boolean;
  /** Consultar CNPJ na BrasilAPI; padrão `true` (Req. 12.7). */
  cnpjEnabled?: boolean;
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
  /** Origem do Nome_Exibicao (para a Atribuicao_Google na UI, Req. 6.4). */
  nomeOrigem: NameOrigin;
  /** Campos exibidos que vêm do Conteudo_Google (Req. 6.4). */
  googleFields: GoogleField[];
  googlePlaceId: string | null;
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
  /** Snapshots da Etapa 3 (filtros e badges do ranking). */
  temInstagram: boolean | null;
  temWhatsapp: boolean | null;
  cnpjFormatado: string | null;
  situacaoCadastral: string | null;
  desempenhoRuim: boolean | null;
  assignedUser: UserRef | null;
  prospectLead: { id: string; status: LeadStatus } | null;
}

/** Campo de exibição que pode vir do Cache_Google (espelha `display.GoogleField`). */
export type GoogleField = 'nome' | 'endereco' | 'bairro' | 'cidade' | 'uf' | 'telefone' | 'website' | 'coords';

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
  /** Empresas filtradas sem coordenadas próprias, só com coordenadas no Cache_Google (Req. 6.5). */
  semCoordsProprias: number;
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
  /** 1 = análise anterior à Etapa 3 (regras da Etapa 1); 2 = Etapa 3 (Req. 13.1, 17.4). */
  versaoScore: 1 | 2;
  sinais: SinaisDigitais | null;
  pagespeed: PageSpeedResult | null;
  pagespeedMotivo: PageSpeedAbsence | null;
  tecnologias: string[];
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

/** Mensagem de abordagem gravada, como devolvida pelas rotas (Req. 15.8). */
export interface ApproachMessageDto {
  id: string;
  canal: ApproachChannel;
  origem: 'IA' | 'MODELO';
  assunto: string | null;
  texto: string;
  fallback: ApproachFallbackReason | null;
  analysisId: string | null;
  author: UserRef;
  createdAt: string;
  /** `https://wa.me/{num}?text=…` quando o canal é WHATSAPP e há número (Req. 15.7). */
  whatsappLink: string | null;
}

/** Candidato a CNPJ enriquecido com a forma mascarada e o possível conflito (Req. 17.3). */
export type CnpjCandidateDto = CnpjCandidate & {
  formatado: string;
  conflito: { id: string; nome: string } | null;
};

export interface CompanyDetail {
  id: string;
  nome: string;
  /** Nome_Exibicao e sua origem (Req. 6.3, 6.4). */
  nomeOrigem: NameOrigin;
  googleFields: GoogleField[];
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
  /** Conteudo_Google para a UI; nunca o objeto de cache cru (Req. 6.8–6.10). */
  google: {
    placeId: string;
    mapsLink: string;
    cacheStatus: 'VALIDO' | 'AUSENTE';
    aviso: 'INDISPONIVEL' | 'NAO_ENCONTRADO' | null;
  } | null;
  osmId: string | null;
  cnpj: { valor: string; formatado: string; origem: CnpjOrigin; dados: CnpjData | null; status: string | null } | null;
  cnpjCandidatos: CnpjCandidateDto[];
  temInstagram: boolean | null;
  temWhatsapp: boolean | null;
  situacaoCadastral: string | null;
  assignedUser: UserRef | null;
  prospectLead: { id: string; status: LeadStatus; assignedTo: string | null; createdAt: string } | null;
  analyses: CompanyAnalysis[];
  mensagens: ApproachMessageDto[];
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

/** Resposta de `POST /companies/[id]/reanalyze` (Req. 16.2). */
export interface ReanalyzeResult {
  analysisId: string;
  semWebsite: boolean;
  googleRefresh: string | null;
  company: CompanyDetail;
}

/** Resultado da consulta à BrasilAPI num `setCnpj` (Req. 12). */
export type CnpjLookupOutcome = 'OK' | 'NAO_ENCONTRADO' | 'INDISPONIVEL' | 'EM_CACHE';

/** Resposta de `PUT /companies/[id]/cnpj` (Req. 11.6). */
export interface SetCnpjResult {
  company: CompanyDetail;
  lookup: CnpjLookupOutcome;
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

/** `reason` (`RECENTE`/`EM_CURSO`) de um 409 de reanálise. */
export function reanalyzeConflictReason(e: LeadMinerApiError): 'RECENTE' | 'EM_CURSO' | null {
  return e.data.reason === 'RECENTE' || e.data.reason === 'EM_CURSO' ? e.data.reason : null;
}

/** Empresa em conflito (`{ id, nome }`) num 409 de `PUT /cnpj`. */
export function conflictCnpjCompany(e: LeadMinerApiError): { id: string; nome: string } | null {
  const c = e.data.conflito;
  if (c && typeof c === 'object') {
    const o = c as Record<string, unknown>;
    if (typeof o.id === 'string' && typeof o.nome === 'string') return { id: o.id, nome: o.nome };
  }
  return null;
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

  /** Reanalisa a Empresa sob demanda (Req. 16). 409 → `LeadMinerApiError` com `reason` em `e.data`. */
  reanalyze: (id: string, opts?: RequestOptions) =>
    postJson<ReanalyzeResult>(`/companies/${enc(id)}/reanalyze`, undefined, opts),

  /** Define/atualiza o CNPJ manual da Empresa (Req. 11.6, 11.7). 409 de conflito em `e.data.conflito`. */
  setCnpj: (id: string, cnpj: string, opts?: RequestOptions) =>
    bodyJson<SetCnpjResult>('PUT', `/companies/${enc(id)}/cnpj`, { cnpj }, opts),

  /** Remove o CNPJ da Empresa (Req. 11.10). */
  removeCnpj: (id: string, opts?: RequestOptions) =>
    bodyJson<{ company: CompanyDetail }>('DELETE', `/companies/${enc(id)}/cnpj`, undefined, opts),

  /** Gera e grava uma mensagem de abordagem (Req. 15). 409 sem Analise. */
  generateApproach: (id: string, canal: ApproachChannel, opts?: RequestOptions) =>
    postJson<{ message: ApproachMessageDto }>(`/companies/${enc(id)}/approach`, { canal }, opts),

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

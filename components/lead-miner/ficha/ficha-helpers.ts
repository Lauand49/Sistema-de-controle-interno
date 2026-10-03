/**
 * Lógica pura da Ficha_Empresa (Req. 14, 16.3, 16.4, 2.17).
 *
 * Isomórfico e sem React: formatação, leitura do detalhamento da pontuação e a máquina de
 * estados do botão "Assumir lead". Testado em `tests/lead-miner/ficha-helpers.test.ts`.
 */
import { AI_MAX, CATEGORY_LABEL, DIGITAL_MAX, ICP_MAX, NICHES, OBJECTIVE_MAX } from '@/lib/leads/config';
import type { NicheTier, PriorityCode, ScoreCriterion } from '@/lib/leads/types';
import { isLeadMinerApiError, conflictAssignee, type UserRef } from '@/lib/leads/client-api';
import type { CompanyAnalysis, LeadStatus } from '@/lib/leads/client-api';

// ---------------------------------------------------------------------------
// Textos fixos
// ---------------------------------------------------------------------------

export const NOT_INFORMED = 'não informado';
export const NOT_IN_TRIAGE = 'não enviada para triagem';
export const NO_SITE = 'sem site';
export const NOT_ANALYZED = 'empresa ainda não analisada';
export const AI_NOT_APPLIED = 'não aplicado';
export const COMPANY_NOT_FOUND = 'Empresa não encontrada';
export const CLAIM_SLOW_TEXT = 'A operação está demorando mais que o esperado…';
/** Tempo até exibir o aviso de demora do "Assumir lead" (Req. 14.12). */
export const CLAIM_SLOW_MS = 2_000;

export const LEAD_STATUS_LABEL: Record<LeadStatus, string> = {
  RAW: 'Aguardando triagem (bruto)',
  PENDING: 'Pendente de triagem',
  IN_PROGRESS: 'Em triagem',
  CONVERTED_TO_PIPE: 'Convertido em card no funil',
  DISCARDED: 'Descartado',
};

const FAILURE_LABEL: Record<string, string> = {
  TIMEOUT: 'tempo esgotado',
  DNS: 'domínio não encontrado (DNS)',
  CONEXAO_RECUSADA: 'conexão recusada',
  CONEXAO_ENCERRADA: 'conexão encerrada',
  URL_INVALIDA: 'URL inválida',
  DESTINO_BLOQUEADO: 'destino bloqueado',
  EXCESSO_REDIRECIONAMENTOS: 'excesso de redirecionamentos',
  HTTP_ERRO: 'erro HTTP',
  SSL: 'erro de certificado SSL',
};

const SSL_PROBLEM_LABEL: Record<string, string> = {
  NAO_CONFIAVEL: 'certificado não confiável',
  EXPIRADO: 'certificado expirado',
  DOMINIO_DIVERGENTE: 'certificado de outro domínio',
};

// ---------------------------------------------------------------------------
// Formatação
// ---------------------------------------------------------------------------

const TIME_ZONE = 'America/Sao_Paulo';
const dateTimeFormatter = new Intl.DateTimeFormat('pt-BR', {
  timeZone: TIME_ZONE,
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

/** "DD/MM/AAAA HH:mm" no fuso de São Paulo; `null` para data ausente ou inválida. */
export function formatDateTime(value: string | Date | null | undefined): string | null {
  if (value === null || value === undefined || value === '') return null;
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  const parts = dateTimeFormatter.formatToParts(d);
  const get = (t: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === t)?.value ?? '';
  return `${get('day')}/${get('month')}/${get('year')} ${get('hour')}:${get('minute')}`;
}

/** Texto do campo ou "não informado" quando vazio/só espaços (Req. 14.1). */
export function orNotInformed(value: string | null | undefined): string {
  const v = typeof value === 'string' ? value.trim() : '';
  return v === '' ? NOT_INFORMED : v;
}

const NICHE_BY_ID = new Map(NICHES.map((n) => [n.id, n]));

/** Rótulo e Tier do nicho; ids desconhecidos aparecem como vieram, sem Tier. */
export function nicheInfo(id: string): { label: string; tier: NicheTier | null } {
  const n = NICHE_BY_ID.get(id);
  return n ? { label: n.label, tier: n.tier } : { label: id || NOT_INFORMED, tier: null };
}

export function categoryLabel(c: string | null | undefined): string {
  if (!c) return NOT_INFORMED;
  return (CATEGORY_LABEL as Record<string, string>)[c] ?? c;
}

/** Status do Lead_de_Triagem vinculado ou "não enviada para triagem". */
export function leadStatusText(lead: { status: LeadStatus } | null | undefined): string {
  if (!lead) return NOT_IN_TRIAGE;
  return LEAD_STATUS_LABEL[lead.status] ?? lead.status;
}

/** Motivo da falha em português; detalhes livres (ex.: "HTTP 503") passam como vieram. */
export function failureLabel(motivo: string | null | undefined): string {
  if (!motivo) return 'motivo não registrado';
  return FAILURE_LABEL[motivo] ?? motivo;
}

export function sslProblemLabel(p: string | null | undefined): string | null {
  if (!p) return null;
  return SSL_PROBLEM_LABEL[p] ?? p;
}

/** Link para a Tela_Ranking filtrada pela mineração (Req. 14.6). */
export function rankingHrefForRun(runId: string): string {
  return `/tools/lead-miner/leads?runId=${encodeURIComponent(runId)}`;
}

/** Cópia ordenada da mais recente para a mais antiga (datas inválidas ao final). */
export function sortByDateDesc<T>(items: readonly T[], getDate: (t: T) => string): T[] {
  const time = (t: T) => {
    const n = new Date(getDate(t)).getTime();
    return Number.isNaN(n) ? -Infinity : n;
  };
  return [...items].sort((a, b) => time(b) - time(a));
}

// ---------------------------------------------------------------------------
// Detalhamento da pontuação (Req. 14.3)
// ---------------------------------------------------------------------------

export interface DisplayComponent {
  value: number;
  max: number;
  criteria: ScoreCriterion[];
}

export interface DisplayBreakdown {
  digital: DisplayComponent;
  icp: DisplayComponent;
  /** null = IA não aplicada. */
  ia: DisplayComponent | null;
  iaMotivo: string | null;
  objetivo: number;
  final: number;
  prioridade: PriorityCode;
  /** true quando o final foi reescalado: round(objetivo × 100 / 65). */
  rescaled: boolean;
  /** false quando o detalhamento salvo é ilegível e só os totais foram usados. */
  hasCriteria: boolean;
}

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

function readCriteria(v: unknown): ScoreCriterion[] | null {
  if (!Array.isArray(v)) return null;
  const out: ScoreCriterion[] = [];
  for (const c of v) {
    if (!isObj(c) || typeof c.label !== 'string' || !isNum(c.points)) return null;
    out.push({ id: typeof c.id === 'string' ? c.id : c.label, label: c.label, points: c.points });
  }
  return out;
}

function readComponent(v: unknown, max: number): DisplayComponent | null {
  if (!isObj(v) || !isNum(v.value)) return null;
  const criteria = readCriteria(v.criteria);
  if (!criteria) return null;
  return { value: v.value, max, criteria };
}

/**
 * Monta o detalhamento a exibir. Usa o `ScoreBreakdown` salvo em `detalhamento`; se ele estiver
 * ausente ou malformado, recorre às colunas da análise (sem critérios).
 * A IA é considerada aplicada somente se `iaAplicada` e houver `scoreIa`.
 */
export function toDisplayBreakdown(a: CompanyAnalysis): DisplayBreakdown {
  const iaApplied = a.iaAplicada && isNum(a.scoreIa);
  const d = isObj(a.detalhamento) ? a.detalhamento : null;
  const digital = d ? readComponent(d.digital, DIGITAL_MAX) : null;
  const icp = d ? readComponent(d.icp, ICP_MAX) : null;
  const iaSaved = d && iaApplied ? readComponent(d.ia, AI_MAX) : null;
  const hasCriteria = digital !== null && icp !== null && (!iaApplied || iaSaved !== null);

  return {
    digital: hasCriteria && digital ? digital : { value: a.scoreDigital, max: DIGITAL_MAX, criteria: [] },
    icp: hasCriteria && icp ? icp : { value: a.scoreIcp, max: ICP_MAX, criteria: [] },
    ia: iaApplied
      ? hasCriteria && iaSaved
        ? iaSaved
        : { value: a.scoreIa as number, max: AI_MAX, criteria: [] }
      : null,
    iaMotivo: iaApplied ? null : a.iaMotivo,
    objetivo: a.scoreObjetivo,
    final: a.scoreFinal,
    prioridade: a.prioridade,
    rescaled: !iaApplied,
    hasCriteria,
  };
}

/** "round(40 × 100 / 65) = 62" (Req. 14.3). */
export function rescaledFormulaText(objetivo: number, final: number): string {
  return `Score_Final = round(Score_Objetivo × 100 / ${OBJECTIVE_MAX}) = round(${objetivo} × 100 / ${OBJECTIVE_MAX}) = ${final}`;
}

// ---------------------------------------------------------------------------
// "Assumir lead" (Req. 14.9, 14.10, 14.12, 14.13, 16.3, 16.4)
// ---------------------------------------------------------------------------

export type ClaimState =
  | { phase: 'idle'; error: string | null }
  | { phase: 'pending'; slow: boolean };

export type ClaimAction =
  | { type: 'start' }
  | { type: 'slow' }
  | { type: 'success' }
  | { type: 'conflict' }
  | { type: 'fail'; message: string };

export const CLAIM_INITIAL: ClaimState = { phase: 'idle', error: null };

/**
 * `start` só vale em `idle` (evita duplo envio); `slow` só vale em `pending`.
 * Sucesso e conflito voltam a `idle` sem erro — o componente passa a exibir o Responsável e
 * oculta o botão. Falha volta a `idle` com a mensagem, reabilitando a ação.
 */
export function claimReducer(state: ClaimState, action: ClaimAction): ClaimState {
  switch (action.type) {
    case 'start':
      return state.phase === 'idle' ? { phase: 'pending', slow: false } : state;
    case 'slow':
      return state.phase === 'pending' ? { phase: 'pending', slow: true } : state;
    case 'success':
    case 'conflict':
      return CLAIM_INITIAL;
    case 'fail':
      return { phase: 'idle', error: action.message };
    default:
      return state;
  }
}

export type ClaimOutcome =
  | { kind: 'conflict'; assignee: UserRef | null; message: string }
  | { kind: 'error'; message: string };

/** Classifica o erro do claim: 409 → conflito com o Responsável atual; demais → falha. */
export function classifyClaimError(e: unknown): ClaimOutcome {
  if (isLeadMinerApiError(e) && e.status === 409) {
    const assignee = conflictAssignee(e);
    const who = assignee?.name?.trim();
    return {
      kind: 'conflict',
      assignee,
      message: who ? `Este lead já foi assumido por ${who}.` : 'Este lead já foi assumido por outra pessoa.',
    };
  }
  const detail = isLeadMinerApiError(e) ? e.message : null;
  return {
    kind: 'error',
    message: detail ? `O lead não foi assumido. ${detail}` : 'O lead não foi assumido. Tente novamente.',
  };
}

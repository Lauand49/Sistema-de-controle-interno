/**
 * Pontuador do Minerador de Leads (Req. 6).
 *
 * Módulo puro e isomórfico: sem I/O, sem relógio, sem aleatoriedade. A mesma entrada
 * produz sempre o mesmo detalhamento (Req. 6.10).
 *
 * Versao_Score 2 (Etapa 2, Req. 13.3, 13.6): entrada opcional `pagespeed` e critério
 * `desempenhoRuim` depois de `lento`. ICP, IA, fórmulas, reescala e prioridade não mudam;
 * sem Desempenho_Ruim o detalhamento é o da Etapa 1 acrescido de `versao: 2`.
 */

import {
  AI_MAX,
  DIGITAL_MAX,
  DIGITAL_POINTS_V2,
  HTTP_ERROR_MIN_STATUS,
  ICP_MAX,
  ICP_POINTS,
  OBJECTIVE_MAX,
  SLOW_THRESHOLD_MS,
} from './config';
import { desempenhoRuimLabel, isPoorPerformance } from './classifier';
import type {
  AiOutcome,
  NicheTier,
  PageSpeedResult,
  PriorityCode,
  ScoreBreakdown,
  ScoreComponent,
  ScoreCriterion,
  SiteAnalysis,
} from './types';

export interface ScoreInput {
  analysis: SiteAnalysis;
  tier: NicheTier;
  iaEnabled: boolean;
  /** null quando a IA não foi chamada. */
  ai: AiOutcome | null;
  /** Resultado_PageSpeed (Versao_Score 2); ausente/null = sem dados de desempenho. */
  pagespeed?: PageSpeedResult | null;
}

/** Versão da pontuação gravada no detalhamento. */
export const SCORE_VERSION = 2;

export { isPoorPerformance };

/** Arredonda para o inteiro mais próximo, com frações .5 para cima. */
export function roundHalfUp(x: number): number {
  return Math.floor(x + 0.5);
}

/** >= 70 ALTA, >= 40 MEDIA, senão BAIXA (Req. 6.8). */
export function priorityOf(final: number): PriorityCode {
  if (final >= 70) return 'ALTA';
  if (final >= 40) return 'MEDIA';
  return 'BAIXA';
}

const clamp = (x: number, min: number, max: number): number => Math.min(max, Math.max(min, x));

const sumPoints = (criteria: readonly ScoreCriterion[]): number =>
  criteria.reduce((acc, c) => acc + c.points, 0);

/** Componente de presença digital (Req. 6.1). Critérios em ordem fixa. */
function digitalComponent(a: SiteAnalysis, pagespeed: PageSpeedResult | null | undefined): ScoreComponent {
  const criteria: ScoreCriterion[] = [];

  if (!a.hasSite) {
    criteria.push({ id: 'semSite', label: 'Empresa não possui site', points: DIGITAL_POINTS_V2.semSite });
  } else {
    if (!a.online) {
      criteria.push({ id: 'offline', label: 'Site offline', points: DIGITAL_POINTS_V2.offline });
    }
    if (a.statusCode != null && a.statusCode >= HTTP_ERROR_MIN_STATUS) {
      criteria.push({ id: 'httpErro', label: `Site responde com erro HTTP ${a.statusCode}`, points: DIGITAL_POINTS_V2.httpErro });
    }
    if (!a.isHttps) {
      criteria.push({ id: 'semHttps', label: 'Site sem HTTPS', points: DIGITAL_POINTS_V2.semHttps });
    }
    if (!a.sslValid) {
      criteria.push({ id: 'sslInvalido', label: 'Certificado SSL inválido ou ausente', points: DIGITAL_POINTS_V2.sslInvalido });
    }
    if (a.responseTimeMs != null && a.responseTimeMs > SLOW_THRESHOLD_MS) {
      criteria.push({ id: 'lento', label: 'Site lento (acima de 2,5 s)', points: DIGITAL_POINTS_V2.lento });
    }
    if (isPoorPerformance(pagespeed)) {
      criteria.push({ id: 'desempenhoRuim', label: desempenhoRuimLabel(pagespeed), points: DIGITAL_POINTS_V2.desempenhoRuim });
    }
  }

  const raw = sumPoints(criteria);
  return { value: clamp(raw, 0, DIGITAL_MAX), max: DIGITAL_MAX, raw, criteria };
}

/** Componente ICP pelo Tier do nicho (Req. 6.2). */
function icpComponent(tier: NicheTier): ScoreComponent {
  const points = ICP_POINTS[tier];
  const criteria: ScoreCriterion[] = [{ id: `tier${tier}`, label: `Nicho Tier ${tier}`, points }];
  const raw = sumPoints(criteria);
  return { value: clamp(raw, 0, ICP_MAX), max: ICP_MAX, raw, criteria };
}

/** Score_IA utilizável: IA habilitada, resposta ok, número finito em [0, 35] (Req. 6.4). */
function usableAiScore(input: ScoreInput): number | null {
  const { iaEnabled, ai } = input;
  if (!iaEnabled || ai == null || !ai.ok) return null;
  const s = ai.result.score;
  if (typeof s !== 'number' || !Number.isFinite(s) || s < 0 || s > AI_MAX) return null;
  return s;
}

/** Motivo do descarte do Score_IA (Req. 6.6). "cota esgotada" é reportado como "sem resposta". */
function aiNotUsedReason(input: ScoreInput): NonNullable<ScoreBreakdown['iaNaoUsadaMotivo']> {
  const { iaEnabled, ai } = input;
  if (!iaEnabled) return 'IA desabilitada';
  if (ai == null) return 'sem resposta';
  if (ai.ok) return 'resposta inválida'; // score não numérico ou fora de 0–35
  switch (ai.reason) {
    case 'sem resposta':
    case 'cota esgotada':
      return 'sem resposta';
    case 'IA desabilitada':
      return 'IA desabilitada';
    default:
      return 'resposta inválida';
  }
}

/** Calcula componentes, Score_Final, Prioridade e detalhamento (Req. 6). */
export function score(input: ScoreInput): ScoreBreakdown {
  const digital = digitalComponent(input.analysis, input.pagespeed);
  const icp = icpComponent(input.tier);
  const objetivo = clamp(digital.value + icp.value, 0, OBJECTIVE_MAX);

  const aiScore = usableAiScore(input);

  if (aiScore != null) {
    const points = roundHalfUp(aiScore);
    const criteria: ScoreCriterion[] = [{ id: 'ia', label: 'Avaliação da IA', points }];
    const raw = sumPoints(criteria);
    const ia: ScoreComponent = { value: clamp(raw, 0, AI_MAX), max: AI_MAX, raw, criteria };
    const final = clamp(objetivo + ia.value, 0, 100);
    return {
      digital,
      icp,
      ia,
      iaNaoUsadaMotivo: null,
      objetivo,
      final,
      prioridade: priorityOf(final),
      formula: 'OBJETIVO_MAIS_IA',
      versao: SCORE_VERSION,
    };
  }

  const final = clamp(roundHalfUp((objetivo * 100) / OBJECTIVE_MAX), 0, 100);
  return {
    digital,
    icp,
    ia: null,
    iaNaoUsadaMotivo: aiNotUsedReason(input),
    objetivo,
    final,
    prioridade: priorityOf(final),
    formula: 'OBJETIVO_REESCALADO',
    versao: SCORE_VERSION,
  };
}

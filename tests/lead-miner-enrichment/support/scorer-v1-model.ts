/**
 * Modelo congelado da Versao_Score 1 (Etapa 1) — referência da Propriedade 36.
 *
 * Cópia literal de `lib/leads/classifier.ts` e `lib/leads/scorer.ts` no commit de
 * `etapa-2-paineis` (a3377cc), antes da extensão para a Versao_Score 2. NÃO editar: mudanças
 * futuras no código de produção não devem "mover" esta referência. Somente os imports foram
 * ajustados para o alias `@/lib/leads/...` e os dois módulos foram reunidos neste arquivo.
 */
// ===== lib/leads/classifier.ts (Etapa 1) =====
/**
 * Classificador do Minerador de Leads (Req. 5).
 *
 * Função pura: sem rede, banco, relógio ou estado global. A mesma `SiteAnalysis`
 * produz sempre a mesma categoria e os mesmos motivos, na mesma ordem (Req. 5.7).
 * Os limites de status HTTP e de latência vêm de `config.ts` (Req. 5.5).
 */

import type { ClassificationResult } from '@/lib/leads/types';

export const MOTIVO_SEM_SITE = 'Empresa não possui site';
export const MOTIVO_ANALISE_INCOMPLETA = 'Análise incompleta do site';
export const MOTIVO_BI = 'Site online, seguro e dentro do limite de latência';

export function classify(a: SiteAnalysis): ClassificationResult {
  // Regra 1 (Req. 5.1): sem site, independentemente de qualquer outro dado.
  if (!a.hasSite) {
    return { category: 'CRIAR_SITE', motivos: [MOTIVO_SEM_SITE] };
  }

  // Regra 2 (Req. 5.8): online, mas faltam status HTTP ou tempo de resposta.
  if (a.online && (a.statusCode == null || a.responseTimeMs == null)) {
    return { category: 'OTIMIZACAO_SEGURANCA', motivos: [MOTIVO_ANALISE_INCOMPLETA] };
  }

  // Regra 3 (Req. 5.2, 5.6): condições (a)–(e) em ordem fixa, um motivo por condição.
  const motivos: string[] = [];

  // (a) offline — inclui "destino bloqueado" da Guarda_SSRF.
  if (!a.online) {
    motivos.push(a.failureDetail ? `Site offline (${a.failureDetail})` : 'Site offline');
  }
  // (b) status HTTP >= limite.
  if (a.statusCode != null && a.statusCode >= HTTP_ERROR_MIN_STATUS) {
    motivos.push(`Site responde com erro HTTP ${a.statusCode}`);
  }
  // (c) URL final sem HTTPS (inclusive após fallback http://).
  if (!a.isHttps) {
    motivos.push('Site sem HTTPS');
  }
  // (d) certificado SSL inválido.
  if (!a.sslValid) {
    motivos.push('Certificado SSL inválido ou ausente');
  }
  // (e) latência estritamente maior que o limite.
  if (a.responseTimeMs != null && a.responseTimeMs > SLOW_THRESHOLD_MS) {
    motivos.push(`Site lento (${a.responseTimeMs} ms, limite ${SLOW_THRESHOLD_MS} ms)`);
  }

  if (motivos.length > 0) {
    return { category: 'OTIMIZACAO_SEGURANCA', motivos };
  }

  // Regra 4 (Req. 5.3): nenhuma condição verdadeira.
  return { category: 'ANALISE_DADOS_BI', motivos: [MOTIVO_BI] };
}

// ===== lib/leads/scorer.ts (Etapa 1) =====
/**
 * Pontuador do Minerador de Leads (Req. 6).
 *
 * Módulo puro e isomórfico: sem I/O, sem relógio, sem aleatoriedade. A mesma entrada
 * produz sempre o mesmo detalhamento (Req. 6.10).
 */

import {
  AI_MAX,
  DIGITAL_MAX,
  DIGITAL_POINTS,
  HTTP_ERROR_MIN_STATUS,
  ICP_MAX,
  ICP_POINTS,
  OBJECTIVE_MAX,
  SLOW_THRESHOLD_MS,
} from '@/lib/leads/config';
import type {
  AiOutcome,
  NicheTier,
  PriorityCode,
  ScoreBreakdown,
  ScoreComponent,
  ScoreCriterion,
  SiteAnalysis,
} from '@/lib/leads/types';

export interface ScoreInput {
  analysis: SiteAnalysis;
  tier: NicheTier;
  iaEnabled: boolean;
  /** null quando a IA não foi chamada. */
  ai: AiOutcome | null;
}

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
function digitalComponent(a: SiteAnalysis): ScoreComponent {
  const criteria: ScoreCriterion[] = [];

  if (!a.hasSite) {
    criteria.push({ id: 'semSite', label: 'Empresa não possui site', points: DIGITAL_POINTS.semSite });
  } else {
    if (!a.online) {
      criteria.push({ id: 'offline', label: 'Site offline', points: DIGITAL_POINTS.offline });
    }
    if (a.statusCode != null && a.statusCode >= HTTP_ERROR_MIN_STATUS) {
      criteria.push({ id: 'httpErro', label: `Site responde com erro HTTP ${a.statusCode}`, points: DIGITAL_POINTS.httpErro });
    }
    if (!a.isHttps) {
      criteria.push({ id: 'semHttps', label: 'Site sem HTTPS', points: DIGITAL_POINTS.semHttps });
    }
    if (!a.sslValid) {
      criteria.push({ id: 'sslInvalido', label: 'Certificado SSL inválido ou ausente', points: DIGITAL_POINTS.sslInvalido });
    }
    if (a.responseTimeMs != null && a.responseTimeMs > SLOW_THRESHOLD_MS) {
      criteria.push({ id: 'lento', label: 'Site lento (acima de 2,5 s)', points: DIGITAL_POINTS.lento });
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
  const digital = digitalComponent(input.analysis);
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
  };
}

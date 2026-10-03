/**
 * Classificador do Minerador de Leads (Req. 5).
 *
 * Função pura: sem rede, banco, relógio ou estado global. A mesma `SiteAnalysis`
 * produz sempre a mesma categoria e os mesmos motivos, na mesma ordem (Req. 5.7).
 * Os limites de status HTTP e de latência vêm de `config.ts` (Req. 5.5).
 *
 * Versao_Score 2 (Etapa 2, Req. 13.2): entrada opcional `pagespeed`; a condição (f)
 * Desempenho_Ruim vem depois de (a)–(e). Sem Resultado_PageSpeed (ou com nota >= limite)
 * o resultado é idêntico ao da Etapa 1.
 */

import { HTTP_ERROR_MIN_STATUS, PAGESPEED_POOR_THRESHOLD, SLOW_THRESHOLD_MS } from './config';
import type { ClassificationResult, PageSpeedResult, SiteAnalysis } from './types';

export const MOTIVO_SEM_SITE = 'Empresa não possui site';
export const MOTIVO_ANALISE_INCOMPLETA = 'Análise incompleta do site';
export const MOTIVO_BI = 'Site online, seguro e dentro do limite de latência';

/** Desempenho_Ruim: há Resultado_PageSpeed e a nota de desempenho é < PAGESPEED_POOR_THRESHOLD. */
export const isPoorPerformance = (p: PageSpeedResult | null | undefined): p is PageSpeedResult =>
  p != null && p.desempenho < PAGESPEED_POOR_THRESHOLD;

/** Rótulo do motivo/critério de Desempenho_Ruim (o mesmo no Classificador e no Pontuador). */
export const desempenhoRuimLabel = (p: PageSpeedResult): string =>
  `Desempenho ruim no PageSpeed (nota ${p.desempenho})`;

export function classify(
  a: SiteAnalysis,
  extra?: { pagespeed?: PageSpeedResult | null },
): ClassificationResult {
  // Regra 1 (Req. 5.1): sem site, independentemente de qualquer outro dado.
  if (!a.hasSite) {
    return { category: 'CRIAR_SITE', motivos: [MOTIVO_SEM_SITE] };
  }

  // Regra 2 (Req. 5.8): online, mas faltam status HTTP ou tempo de resposta.
  if (a.online && (a.statusCode == null || a.responseTimeMs == null)) {
    return { category: 'OTIMIZACAO_SEGURANCA', motivos: [MOTIVO_ANALISE_INCOMPLETA] };
  }

  // Regra 3 (Req. 5.2, 5.6; Etapa 2 Req. 13.2): condições (a)–(f) em ordem fixa, um motivo por condição.
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
  // (f) Desempenho_Ruim no PageSpeed (Versao_Score 2).
  const pagespeed = extra?.pagespeed;
  if (isPoorPerformance(pagespeed)) {
    motivos.push(desempenhoRuimLabel(pagespeed));
  }

  if (motivos.length > 0) {
    return { category: 'OTIMIZACAO_SEGURANCA', motivos };
  }

  // Regra 4 (Req. 5.3): nenhuma condição verdadeira.
  return { category: 'ANALISE_DADOS_BI', motivos: [MOTIVO_BI] };
}

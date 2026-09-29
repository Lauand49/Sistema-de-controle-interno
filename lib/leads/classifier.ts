/**
 * Classificador do Minerador de Leads (Req. 5).
 *
 * Função pura: sem rede, banco, relógio ou estado global. A mesma `SiteAnalysis`
 * produz sempre a mesma categoria e os mesmos motivos, na mesma ordem (Req. 5.7).
 * Os limites de status HTTP e de latência vêm de `config.ts` (Req. 5.5).
 */

import { HTTP_ERROR_MIN_STATUS, SLOW_THRESHOLD_MS } from './config';
import type { ClassificationResult, SiteAnalysis } from './types';

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

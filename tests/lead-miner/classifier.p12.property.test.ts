// Feature: lead-miner, Property 12: Classificação segue o modelo de referência
/**
 * **Validates: Requirements 5.1, 5.2, 5.3, 5.4, 5.6, 5.8**
 */
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  MOTIVO_ANALISE_INCOMPLETA,
  MOTIVO_BI,
  MOTIVO_SEM_SITE,
  classify,
} from '@/lib/leads/classifier';
import { CATEGORY_LABEL, HTTP_ERROR_MIN_STATUS, SLOW_THRESHOLD_MS } from '@/lib/leads/config';
import type { ClassificationResult, SiteAnalysis } from '@/lib/leads/types';
import { arbSiteAnalysis } from './support/arb-site';

/** Modelo de referência escrito diretamente a partir do Requisito 5. */
function referenceModel(a: SiteAnalysis): ClassificationResult {
  if (!a.hasSite) return { category: 'CRIAR_SITE', motivos: [MOTIVO_SEM_SITE] };
  if (a.online && (a.statusCode === null || a.responseTimeMs === null)) {
    return { category: 'OTIMIZACAO_SEGURANCA', motivos: [MOTIVO_ANALISE_INCOMPLETA] };
  }
  const conds: Array<[boolean, string]> = [
    [!a.online, a.failureDetail ? `Site offline (${a.failureDetail})` : 'Site offline'],
    [a.statusCode !== null && a.statusCode >= HTTP_ERROR_MIN_STATUS, `Site responde com erro HTTP ${a.statusCode}`],
    [!a.isHttps, 'Site sem HTTPS'],
    [!a.sslValid, 'Certificado SSL inválido ou ausente'],
    [
      a.responseTimeMs !== null && a.responseTimeMs > SLOW_THRESHOLD_MS,
      `Site lento (${a.responseTimeMs} ms, limite ${SLOW_THRESHOLD_MS} ms)`,
    ],
  ];
  const motivos = conds.filter(([c]) => c).map(([, m]) => m);
  if (motivos.length > 0) return { category: 'OTIMIZACAO_SEGURANCA', motivos };
  return { category: 'ANALISE_DADOS_BI', motivos: [MOTIVO_BI] };
}

describe('Property 12: Classificação segue o modelo de referência', () => {
  it('categoria única entre as três e 1–5 motivos iguais ao modelo', () => {
    fc.assert(
      fc.property(arbSiteAnalysis, (a) => {
        const r = classify(a);
        expect(Object.keys(CATEGORY_LABEL)).toContain(r.category);
        expect(r.motivos.length).toBeGreaterThanOrEqual(1);
        expect(r.motivos.length).toBeLessThanOrEqual(5);
        expect(r).toEqual(referenceModel(a));
      }),
      { numRuns: 100 },
    );
  });
});

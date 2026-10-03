/**
 * Exemplos do Classificador/Pontuador na Versao_Score 2 (Desempenho_Ruim do PageSpeed).
 * **Validates: Requirements 13.2, 13.3, 13.6, 21.6**
 */
import { describe, expect, it } from 'vitest';
import { classify, MOTIVO_BI } from '@/lib/leads/classifier';
import { score, SCORE_VERSION } from '@/lib/leads/scorer';
import { DIGITAL_MAX, DIGITAL_POINTS_V2 } from '@/lib/leads/config';
import type { PageSpeedResult, SiteAnalysis } from '@/lib/leads/types';

const ps = (desempenho: number): PageSpeedResult => ({
  desempenho,
  acessibilidade: 90,
  boasPraticas: 90,
  seo: 90,
  lcpMs: 1_500,
  cls: 0.01,
  tbtMs: 100,
  fcpMs: 900,
  urlAnalisada: 'https://exemplo.com.br/',
});

/** Site online, HTTPS válido, 200 e rápido: sem nenhuma condição (a)–(e). */
const healthy: SiteAnalysis = {
  hasSite: true,
  online: true,
  statusCode: 200,
  isHttps: true,
  sslValid: true,
  sslProblem: null,
  responseTimeMs: 800,
  slow: false,
  failure: null,
  failureDetail: null,
  finalUrl: 'https://exemplo.com.br/',
};

/** Site com todas as condições (a)–(e) verdadeiras. */
const broken: SiteAnalysis = {
  hasSite: true,
  online: false,
  statusCode: 503,
  isHttps: false,
  sslValid: false,
  sslProblem: null,
  responseTimeMs: 3_000,
  slow: true,
  failure: 'HTTP_ERRO',
  failureDetail: 'HTTP 503',
  finalUrl: 'http://exemplo.com.br/',
};

const base = { tier: 2 as const, iaEnabled: false, ai: null };

describe('Desempenho_Ruim: limite 49 vs 50', () => {
  it('nota 49 é Desempenho_Ruim; 50 não é', () => {
    const c49 = classify(healthy, { pagespeed: ps(49) });
    expect(c49.category).toBe('OTIMIZACAO_SEGURANCA');
    expect(c49.motivos).toEqual(['Desempenho ruim no PageSpeed (nota 49)']);

    const c50 = classify(healthy, { pagespeed: ps(50) });
    expect(c50).toEqual({ category: 'ANALISE_DADOS_BI', motivos: [MOTIVO_BI] });

    const s49 = score({ ...base, analysis: healthy, pagespeed: ps(49) });
    expect(s49.digital.criteria.map((c) => c.id)).toEqual(['desempenhoRuim']);
    expect(s49.digital.value).toBe(DIGITAL_POINTS_V2.desempenhoRuim);

    const s50 = score({ ...base, analysis: healthy, pagespeed: ps(50) });
    expect(s50.digital.criteria).toEqual([]);
    expect(s50.digital.value).toBe(0);
  });
});

describe('BI que vira Otimização / Segurança só por desempenho', () => {
  it('sem PageSpeed é BI; com nota baixa vira Otimização com um único motivo', () => {
    expect(classify(healthy).category).toBe('ANALISE_DADOS_BI');
    expect(classify(healthy, { pagespeed: null }).category).toBe('ANALISE_DADOS_BI');

    const c = classify(healthy, { pagespeed: ps(20) });
    expect(c.category).toBe('OTIMIZACAO_SEGURANCA');
    expect(c.motivos).toHaveLength(1);
    expect(c.motivos[0]).toBe('Desempenho ruim no PageSpeed (nota 20)');
  });
});

describe('Seis motivos e saturação do componente digital', () => {
  it('condições (a)–(f) geram 6 motivos em ordem fixa', () => {
    const c = classify(broken, { pagespeed: ps(10) });
    expect(c.category).toBe('OTIMIZACAO_SEGURANCA');
    expect(c.motivos).toHaveLength(6);
    expect(c.motivos[0]).toMatch(/^Site offline/);
    expect(c.motivos[1]).toBe('Site responde com erro HTTP 503');
    expect(c.motivos[2]).toBe('Site sem HTTPS');
    expect(c.motivos[3]).toBe('Certificado SSL inválido ou ausente');
    expect(c.motivos[4]).toMatch(/^Site lento/);
    expect(c.motivos[5]).toBe('Desempenho ruim no PageSpeed (nota 10)');
  });

  it('componente digital satura em 40 com raw acima do teto', () => {
    const s = score({ ...base, analysis: broken, pagespeed: ps(10) });
    expect(s.digital.criteria.map((c) => c.id)).toEqual([
      'offline',
      'httpErro',
      'semHttps',
      'sslInvalido',
      'lento',
      'desempenhoRuim',
    ]);
    expect(s.digital.raw).toBe(62);
    expect(s.digital.value).toBe(DIGITAL_MAX);
    expect(s.digital.value).toBe(40);
  });
});

describe('versao: 2', () => {
  it('detalhamento grava versao 2 com e sem PageSpeed, com e sem IA', () => {
    expect(SCORE_VERSION).toBe(2);
    expect(score({ ...base, analysis: healthy }).versao).toBe(2);
    expect(score({ ...base, analysis: healthy, pagespeed: ps(30) }).versao).toBe(2);
    const withAi = score({
      tier: 1,
      iaEnabled: true,
      ai: { ok: true, result: { score: 20 } } as never,
      analysis: broken,
      pagespeed: ps(30),
    });
    expect(withAi.formula).toBe('OBJETIVO_MAIS_IA');
    expect(withAi.versao).toBe(2);
  });
});

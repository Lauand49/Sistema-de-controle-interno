import { describe, expect, it } from 'vitest';
import {
  MOTIVO_ANALISE_INCOMPLETA,
  MOTIVO_BI,
  MOTIVO_SEM_SITE,
  classify,
} from '@/lib/leads/classifier';
import { goodSite, noSite } from './support/arb-site';

describe('classify', () => {
  it('sem site → Criar Site do Zero com um único motivo, ignorando os demais dados', () => {
    expect(classify(noSite())).toEqual({ category: 'CRIAR_SITE', motivos: [MOTIVO_SEM_SITE] });
    // Dados contraditórios não alteram a regra 1.
    expect(classify(goodSite({ hasSite: false, statusCode: 500, responseTimeMs: 9_000 }))).toEqual({
      category: 'CRIAR_SITE',
      motivos: [MOTIVO_SEM_SITE],
    });
  });

  it('site saudável → Análise de Dados / BI com um único motivo', () => {
    expect(classify(goodSite())).toEqual({ category: 'ANALISE_DADOS_BI', motivos: [MOTIVO_BI] });
  });

  it('(a) offline isolado', () => {
    const r = classify(goodSite({ online: false, statusCode: null, responseTimeMs: null }));
    expect(r).toEqual({ category: 'OTIMIZACAO_SEGURANCA', motivos: ['Site offline'] });
  });

  it('(a) offline por destino bloqueado inclui o detalhe', () => {
    const r = classify(
      goodSite({ online: false, statusCode: null, responseTimeMs: null, failure: 'DESTINO_BLOQUEADO', failureDetail: 'destino bloqueado' }),
    );
    expect(r).toEqual({ category: 'OTIMIZACAO_SEGURANCA', motivos: ['Site offline (destino bloqueado)'] });
  });

  it('(b) status HTTP 400 isolado', () => {
    const r = classify(goodSite({ statusCode: 400 }));
    expect(r).toEqual({ category: 'OTIMIZACAO_SEGURANCA', motivos: ['Site responde com erro HTTP 400'] });
  });

  it('(c) sem HTTPS isolado', () => {
    const r = classify(goodSite({ isHttps: false }));
    expect(r).toEqual({ category: 'OTIMIZACAO_SEGURANCA', motivos: ['Site sem HTTPS'] });
  });

  it('(d) SSL inválido isolado', () => {
    const r = classify(goodSite({ sslValid: false, sslProblem: 'EXPIRADO' }));
    expect(r).toEqual({ category: 'OTIMIZACAO_SEGURANCA', motivos: ['Certificado SSL inválido ou ausente'] });
  });

  it('(e) latência 2.501 ms isolada', () => {
    const r = classify(goodSite({ responseTimeMs: 2_501, slow: true }));
    expect(r.category).toBe('OTIMIZACAO_SEGURANCA');
    expect(r.motivos).toHaveLength(1);
    expect(r.motivos[0]).toMatch(/^Site lento/);
  });

  it('fronteiras: latência exatamente 2.500 ms e status 399 → Análise de Dados / BI', () => {
    expect(classify(goodSite({ responseTimeMs: 2_500 })).category).toBe('ANALISE_DADOS_BI');
    expect(classify(goodSite({ statusCode: 399 })).category).toBe('ANALISE_DADOS_BI');
    expect(classify(goodSite({ statusCode: 399, responseTimeMs: 2_500 }))).toEqual({
      category: 'ANALISE_DADOS_BI',
      motivos: [MOTIVO_BI],
    });
  });

  it('várias condições → um motivo por condição, na ordem (a)–(e)', () => {
    const r = classify(
      goodSite({ online: false, statusCode: 503, isHttps: false, sslValid: false, responseTimeMs: 3_000, failureDetail: 'HTTP 503' }),
    );
    expect(r.category).toBe('OTIMIZACAO_SEGURANCA');
    expect(r.motivos).toHaveLength(5);
    expect(r.motivos[0]).toBe('Site offline (HTTP 503)');
    expect(r.motivos[1]).toBe('Site responde com erro HTTP 503');
    expect(r.motivos[2]).toBe('Site sem HTTPS');
    expect(r.motivos[3]).toBe('Certificado SSL inválido ou ausente');
    expect(r.motivos[4]).toMatch(/^Site lento/);
  });

  it('análise incompleta: online sem status ou sem tempo de resposta', () => {
    const esperado = { category: 'OTIMIZACAO_SEGURANCA', motivos: [MOTIVO_ANALISE_INCOMPLETA] };
    expect(classify(goodSite({ statusCode: null }))).toEqual(esperado);
    expect(classify(goodSite({ responseTimeMs: null }))).toEqual(esperado);
    expect(classify(goodSite({ statusCode: null, responseTimeMs: null, isHttps: false }))).toEqual(esperado);
  });

  it('duas execuções com a mesma entrada produzem categoria e motivos iguais', () => {
    const entrada = goodSite({ isHttps: false, sslValid: false, responseTimeMs: 4_000 });
    const r1 = classify(entrada);
    const r2 = classify(structuredClone(entrada));
    expect(r2).toEqual(r1);
    expect(r2.motivos).toEqual(r1.motivos);
  });
});

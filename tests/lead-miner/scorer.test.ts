import { describe, expect, it } from 'vitest';
import { priorityOf, roundHalfUp, score, type ScoreInput } from '@/lib/leads/scorer';
import type { AiOutcome } from '@/lib/leads/types';
import { goodSite, noSite } from './support/arb-site';

const aiOk = (s: number): AiOutcome => ({ ok: true, result: { score: s, oportunidade: 'O', justificativa: 'J' } });

describe('roundHalfUp', () => {
  it('arredonda .5 para cima', () => {
    expect(roundHalfUp(17.5)).toBe(18);
    expect(roundHalfUp(17.49)).toBe(17);
    expect(roundHalfUp(0)).toBe(0);
  });
});

describe('priorityOf', () => {
  it('fronteiras 39, 40, 69, 70', () => {
    expect(priorityOf(39)).toBe('BAIXA');
    expect(priorityOf(40)).toBe('MEDIA');
    expect(priorityOf(69)).toBe('MEDIA');
    expect(priorityOf(70)).toBe('ALTA');
  });
});

describe('score', () => {
  it('com IA: final = objetivo + IA arredondada', () => {
    // Site saudável (digital 0) + Tier 1 (25) + IA 17,5 → 18.
    const r = score({ analysis: goodSite(), tier: 1, iaEnabled: true, ai: aiOk(17.5) });
    expect(r.digital.value).toBe(0);
    expect(r.icp.value).toBe(25);
    expect(r.objetivo).toBe(25);
    expect(r.ia).toEqual({ value: 18, max: 35, raw: 18, criteria: [{ id: 'ia', label: 'Avaliação da IA', points: 18 }] });
    expect(r.final).toBe(43);
    expect(r.formula).toBe('OBJETIVO_MAIS_IA');
    expect(r.iaNaoUsadaMotivo).toBeNull();
    expect(r.prioridade).toBe('MEDIA');
  });

  it('sem IA: final = round(objetivo × 100 / 65)', () => {
    const r = score({ analysis: goodSite(), tier: 1, iaEnabled: false, ai: null });
    expect(r.objetivo).toBe(25);
    expect(r.final).toBe(38); // 38,46…
    expect(r.ia).toBeNull();
    expect(r.iaNaoUsadaMotivo).toBe('IA desabilitada');
    expect(r.formula).toBe('OBJETIVO_REESCALADO');
    expect(r.prioridade).toBe('BAIXA');
  });

  it('motivos de descarte da IA', () => {
    const base = { analysis: goodSite(), tier: 2 as const, iaEnabled: true };
    expect(score({ ...base, ai: null }).iaNaoUsadaMotivo).toBe('sem resposta');
    expect(score({ ...base, ai: { ok: false, reason: 'cota esgotada' } }).iaNaoUsadaMotivo).toBe('sem resposta');
    expect(score({ ...base, ai: { ok: false, reason: 'resposta inválida' } }).iaNaoUsadaMotivo).toBe('resposta inválida');
    expect(score({ ...base, ai: aiOk(36) }).iaNaoUsadaMotivo).toBe('resposta inválida');
    expect(score({ ...base, ai: aiOk(Number.NaN) }).iaNaoUsadaMotivo).toBe('resposta inválida');
    expect(score({ ...base, ai: aiOk(-1) }).ia).toBeNull();
  });

  it('pontuação mínima: site saudável, Tier 3, sem IA e IA 0', () => {
    const semIa = score({ analysis: goodSite(), tier: 3, iaEnabled: false, ai: null });
    expect(semIa.digital.value).toBe(0);
    expect(semIa.digital.criteria).toEqual([]);
    expect(semIa.objetivo).toBe(8);
    expect(semIa.final).toBe(12); // round(800 / 65) = 12
    const comIa0 = score({ analysis: goodSite(), tier: 3, iaEnabled: true, ai: aiOk(0) });
    expect(comIa0.final).toBe(8);
    expect(comIa0.prioridade).toBe('BAIXA');
  });

  it('pontuação máxima: sem site, Tier 1 → 100 com ou sem IA', () => {
    const semIa = score({ analysis: noSite(), tier: 1, iaEnabled: false, ai: null });
    expect(semIa.digital.value).toBe(40);
    expect(semIa.objetivo).toBe(65);
    expect(semIa.final).toBe(100);
    expect(semIa.prioridade).toBe('ALTA');
    const comIa = score({ analysis: noSite(), tier: 1, iaEnabled: true, ai: aiOk(35) });
    expect(comIa.final).toBe(100);
  });

  it('digital limitado a 40 com raw acima do máximo', () => {
    // offline 20 + http 10 + sem https 10 + ssl 8 + lento 7 = 55 → 40.
    const r = score({
      analysis: goodSite({ online: false, statusCode: 500, isHttps: false, sslValid: false, responseTimeMs: 3_000 }),
      tier: 2,
      iaEnabled: false,
      ai: null,
    });
    expect(r.digital.raw).toBe(55);
    expect(r.digital.value).toBe(40);
    expect(r.digital.criteria.map((c) => c.id)).toEqual(['offline', 'httpErro', 'semHttps', 'sslInvalido', 'lento']);
  });

  it('Prioridade via score em 39, 40, 69, 70', () => {
    const saudavelT1 = (ia: number) => score({ analysis: goodSite(), tier: 1, iaEnabled: true, ai: aiOk(ia) });
    expect(saudavelT1(14)).toMatchObject({ final: 39, prioridade: 'BAIXA' });
    expect(saudavelT1(15)).toMatchObject({ final: 40, prioridade: 'MEDIA' });
    // Sem site + Tier 3 = 48.
    const semSiteT3 = (ia: number) => score({ analysis: noSite(), tier: 3, iaEnabled: true, ai: aiOk(ia) });
    expect(semSiteT3(21)).toMatchObject({ final: 69, prioridade: 'MEDIA' });
    expect(semSiteT3(22)).toMatchObject({ final: 70, prioridade: 'ALTA' });
  });

  it('duas execuções com a mesma entrada produzem o mesmo detalhamento', () => {
    const entrada: ScoreInput = { analysis: goodSite({ isHttps: false }), tier: 2, iaEnabled: true, ai: aiOk(20.5) };
    expect(score(structuredClone(entrada))).toEqual(score(entrada));
  });
});

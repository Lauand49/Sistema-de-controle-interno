import { describe, expect, it } from 'vitest';
import {
  AI_NOT_APPLIED,
  CLAIM_INITIAL,
  NOT_INFORMED,
  NOT_IN_TRIAGE,
  claimReducer,
  classifyClaimError,
  failureLabel,
  formatDateTime,
  leadStatusText,
  nicheInfo,
  orNotInformed,
  rankingHrefForRun,
  rescaledFormulaText,
  sortByDateDesc,
  toDisplayBreakdown,
} from '@/components/lead-miner/ficha/ficha-helpers';
import { LeadMinerApiError, type CompanyAnalysis } from '@/lib/leads/client-api';
import { score } from '@/lib/leads/scorer';
import type { SiteAnalysis } from '@/lib/leads/types';

const noSite: SiteAnalysis = {
  hasSite: false,
  online: false,
  statusCode: null,
  isHttps: false,
  sslValid: false,
  sslProblem: null,
  responseTimeMs: null,
  slow: false,
  failure: null,
  failureDetail: null,
  finalUrl: null,
};

function analysisFrom(b: ReturnType<typeof score>, over: Partial<CompanyAnalysis> = {}): CompanyAnalysis {
  return {
    id: 'a1',
    runId: 'r1',
    hasSite: false,
    online: false,
    statusCode: null,
    isHttps: false,
    sslValid: false,
    sslProblem: null,
    responseTime: null,
    lento: false,
    motivoFalha: null,
    finalUrl: null,
    categoria: 'CRIAR_SITE',
    motivos: ['Empresa sem site'],
    scoreDigital: b.digital.value,
    scoreIcp: b.icp.value,
    scoreObjetivo: b.objetivo,
    scoreIa: b.ia?.value ?? null,
    scoreFinal: b.final,
    prioridade: b.prioridade,
    iaAplicada: b.ia !== null,
    iaMotivo: b.iaNaoUsadaMotivo,
    oportunidadeIa: null,
    justificativaIa: null,
    detalhamento: JSON.parse(JSON.stringify(b)),
    createdAt: '2024-05-10T13:05:00.000Z',
    ...over,
  };
}

describe('formatação da Ficha', () => {
  it('formata DD/MM/AAAA HH:mm no fuso de São Paulo (Req. 14.5)', () => {
    expect(formatDateTime('2024-05-10T13:05:00.000Z')).toBe('10/05/2024 10:05');
    expect(formatDateTime('2024-01-01T02:30:00.000Z')).toBe('31/12/2023 23:30');
    expect(formatDateTime('invalida')).toBeNull();
    expect(formatDateTime(null)).toBeNull();
  });

  it('campos vazios viram "não informado" e sem lead vira "não enviada para triagem" (Req. 14.1)', () => {
    expect(orNotInformed(null)).toBe(NOT_INFORMED);
    expect(orNotInformed('   ')).toBe(NOT_INFORMED);
    expect(orNotInformed(' Centro ')).toBe('Centro');
    expect(leadStatusText(null)).toBe(NOT_IN_TRIAGE);
    expect(leadStatusText({ status: 'PENDING' })).toBe('Pendente de triagem');
  });

  it('nicho com rótulo e Tier; id desconhecido sem Tier', () => {
    expect(nicheInfo('advocacia')).toEqual({ label: 'Escritório de advocacia', tier: 1 });
    expect(nicheInfo('xyz')).toEqual({ label: 'xyz', tier: null });
  });

  it('motivo de falha em português, detalhe livre preservado', () => {
    expect(failureLabel('TIMEOUT')).toBe('tempo esgotado');
    expect(failureLabel('HTTP 503')).toBe('HTTP 503');
  });

  it('link do ranking filtrado pela mineração (Req. 14.6)', () => {
    expect(rankingHrefForRun('abc-1')).toBe('/tools/lead-miner/leads?runId=abc-1');
  });

  it('ordena da mais recente para a mais antiga sem mutar a entrada', () => {
    const items = [{ d: '2024-01-01T00:00:00Z' }, { d: '2024-03-01T00:00:00Z' }, { d: 'x' }, { d: '2024-02-01T00:00:00Z' }];
    const out = sortByDateDesc(items, (i) => i.d);
    expect(out.map((i) => i.d)).toEqual(['2024-03-01T00:00:00Z', '2024-02-01T00:00:00Z', '2024-01-01T00:00:00Z', 'x']);
    expect(items[0].d).toBe('2024-01-01T00:00:00Z');
  });
});

describe('detalhamento do score (Req. 14.3)', () => {
  it('sem IA: componente IA "não aplicado" e fórmula reescalada', () => {
    const b = score({ analysis: noSite, tier: 1, iaEnabled: false, ai: null });
    const d = toDisplayBreakdown(analysisFrom(b));
    expect(d.ia).toBeNull();
    expect(d.rescaled).toBe(true);
    expect(d.iaMotivo).toBe('IA desabilitada');
    expect(d.digital).toMatchObject({ value: 40, max: 40 });
    expect(d.icp).toMatchObject({ value: 25, max: 25 });
    expect(d.digital.criteria.map((c) => c.label)).toEqual(['Empresa não possui site']);
    expect(d.final).toBe(100);
    expect(rescaledFormulaText(d.objetivo, d.final)).toBe(
      'Score_Final = round(Score_Objetivo × 100 / 65) = round(65 × 100 / 65) = 100',
    );
    expect(AI_NOT_APPLIED).toBe('não aplicado');
  });

  it('com IA: três componentes com máximos 40/25/35', () => {
    const b = score({
      analysis: noSite,
      tier: 3,
      iaEnabled: true,
      ai: { ok: true, result: { score: 20, oportunidade: 'o', justificativa: 'j' } },
    });
    const d = toDisplayBreakdown(analysisFrom(b));
    expect(d.rescaled).toBe(false);
    expect(d.ia).toMatchObject({ value: 20, max: 35 });
    expect(d.final).toBe(40 + 8 + 20);
    expect(d.hasCriteria).toBe(true);
  });

  it('detalhamento ilegível: usa as colunas, sem critérios', () => {
    const b = score({ analysis: noSite, tier: 2, iaEnabled: false, ai: null });
    const d = toDisplayBreakdown(analysisFrom(b, { detalhamento: { lixo: true } }));
    expect(d.hasCriteria).toBe(false);
    expect(d.digital).toEqual({ value: 40, max: 40, criteria: [] });
    expect(d.icp).toEqual({ value: 15, max: 25, criteria: [] });
    expect(d.final).toBe(b.final);
  });
});

describe('Assumir lead (Req. 14.9, 14.10, 14.12, 14.13)', () => {
  it('pendente → aviso de demora → sucesso oculta o erro', () => {
    let s = claimReducer(CLAIM_INITIAL, { type: 'start' });
    expect(s).toEqual({ phase: 'pending', slow: false });
    expect(claimReducer(s, { type: 'start' })).toBe(s); // sem duplo envio
    s = claimReducer(s, { type: 'slow' });
    expect(s).toEqual({ phase: 'pending', slow: true });
    expect(claimReducer(s, { type: 'success' })).toEqual(CLAIM_INITIAL);
  });

  it('aviso de demora ignorado fora de pendente', () => {
    expect(claimReducer(CLAIM_INITIAL, { type: 'slow' })).toBe(CLAIM_INITIAL);
  });

  it('falha reabilita a ação com mensagem', () => {
    const s = claimReducer({ phase: 'pending', slow: true }, { type: 'fail', message: 'x' });
    expect(s).toEqual({ phase: 'idle', error: 'x' });
    expect(claimReducer(s, { type: 'start' })).toEqual({ phase: 'pending', slow: false });
  });

  it('409 informa o Responsável atual', () => {
    const e = new LeadMinerApiError(409, 'Este lead já foi assumido.', {
      error: 'Este lead já foi assumido.',
      assignedTo: { id: 'u2', name: 'Maria' },
    });
    expect(classifyClaimError(e)).toEqual({
      kind: 'conflict',
      assignee: { id: 'u2', name: 'Maria' },
      message: 'Este lead já foi assumido por Maria.',
    });
    const semNome = classifyClaimError(new LeadMinerApiError(409, 'x', { assignedTo: null }));
    expect(semNome).toMatchObject({ kind: 'conflict', assignee: null });
  });

  it('outros erros: "não foi assumido"', () => {
    expect(classifyClaimError(new LeadMinerApiError(500, 'Erro interno do servidor. Tente novamente.'))).toEqual({
      kind: 'error',
      message: 'O lead não foi assumido. Erro interno do servidor. Tente novamente.',
    });
    expect(classifyClaimError(new Error('boom'))).toEqual({
      kind: 'error',
      message: 'O lead não foi assumido. Tente novamente.',
    });
  });
});

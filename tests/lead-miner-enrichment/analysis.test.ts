/**
 * Exemplos da análise de uma Empresa (`analyzeCompany`): descoberta e enriquecimento de CNPJ,
 * PageSpeed condicionado ao site online e ausência do Corpo_HTML no resultado.
 * Toda I/O é falsa (resolver, transporte, PageSpeed, BrasilAPI); nada sai para a rede.
 *
 * Requisitos: 11.4, 11.5, 11.9, 12.3, 12.4, 12.5, 12.7, 10.7, 7.5, 21.4.
 */
import { describe, expect, it } from 'vitest';
import { analyzeCompany, type AnalysisDeps, type AnalyzeTarget } from '@/lib/leads/analysis';
import { CNPJ_STATUS, cnpjCheckDigits, formatCnpj } from '@/lib/leads/cnpj';
import { intervalLimiter } from '@/lib/leads/sources/rate-limit';
import type { SiteAnalyzerDeps } from '@/lib/leads/site-analyzer';
import { addr, fakeResolver } from '../lead-miner/support/fake-net';
import { brasilApiJson, fakeBrasilApi, type BrasilApiCall } from './support/fake-brasilapi';
import { fakePageSpeed, lighthouseJson, type PageSpeedCall } from './support/fake-pagespeed';
import { fakeBodyTransport, htmlAnswer, type BodyTransportAnswer } from './support/fake-transport-body';
import { memoryUsageGate } from './support/fake-usage';
import type { ScriptStep } from './support/scripted';

const SITE = 'https://clinica.example.com.br/';
const CNPJ_A = '11222333000181';
const CNPJ_B = `112223330002${cnpjCheckDigits('112223330002')}`;
const NOW = new Date('2025-06-01T12:00:00.000Z');
const NOW_MS = 1_000_000;
const DEADLINE = NOW_MS + 60_000;
/** Marcador presente só no HTML, para provar que o Corpo_HTML não vaza no resultado. */
const MARKER = 'MARCADOR_CORPO_HTML_9f3a';

const htmlWith = (...cnpjs: string[]) =>
  `<html><body><p>${MARKER}</p>${cnpjs.map((c) => `<footer>CNPJ ${formatCnpj(c)}</footer>`).join('')}</body></html>`;

function target(over: Partial<AnalyzeTarget> = {}): AnalyzeTarget {
  return {
    companyId: 'c1',
    nicho: 'clinica_odontologica',
    nome: 'Clínica Sorriso',
    bairro: 'Vila Mariana',
    cidade: 'São Paulo',
    uf: 'SP',
    website: SITE,
    instagramOsm: null,
    whatsappOsm: null,
    cnpj: null,
    cnpjOrigem: null,
    cnpjCandidatos: [],
    cnpjDadosCnpj: null,
    cnpjConsultadoEm: null,
    cnpjAi: null,
    ...over,
  };
}

interface Setup {
  site?: BodyTransportAnswer;
  brasil?: ReadonlyArray<ScriptStep<BrasilApiCall>>;
  pagespeed?: ReadonlyArray<ScriptStep<PageSpeedCall>>;
}

function setup(s: Setup = {}) {
  let t = NOW.getTime();
  const sleep = async (ms: number) => {
    t += ms;
  };
  const transport = fakeBodyTransport(s.site === undefined ? {} : { [SITE]: s.site });
  const resolver = fakeResolver({ 'clinica.example.com.br': [addr('93.184.216.34')] });
  const brasil = fakeBrasilApi(s.brasil ?? [], { sleep });
  const ps = fakePageSpeed(s.pagespeed ?? []);
  const deps: AnalysisDeps = {
    site: {
      resolver,
      transport: transport as unknown as SiteAnalyzerDeps['transport'],
      now: () => 0,
      setTimer: () => () => {},
    },
    pagespeed: { http: ps, usage: memoryUsageGate(), limit: 100, now: () => NOW, hasKey: false },
    cnpj: {
      http: brasil,
      limiter: intervalLimiter(1000, { now: () => t, sleep }),
      sleep,
      now: () => new Date(t),
    },
    ai: { client: null, usage: memoryUsageGate(), limit: 100, now: () => NOW },
    now: () => NOW_MS,
  };
  return { deps, brasil, ps, transport };
}

const opts = (over: Partial<{ iaEnabled: boolean; pagespeedEnabled: boolean; cnpjEnabled: boolean }> = {}) => ({
  iaEnabled: false,
  pagespeedEnabled: false,
  cnpjEnabled: true,
  deadline: DEADLINE,
  ...over,
});

describe('analyzeCompany — descoberta de CNPJ', () => {
  it('HTML sem CNPJ: nada aplicado, nenhum candidato, sem BrasilAPI', async () => {
    const { deps, brasil } = setup({ site: htmlAnswer(htmlWith()) });
    const out = await analyzeCompany(target(), opts(), deps);
    expect(out.site.online).toBe(true);
    expect(out.cnpj).toMatchObject({ apply: null, origem: null, data: null, candidates: [], status: null, encontrados: [] });
    expect(brasil.calls).toHaveLength(0);
  });

  it('um CNPJ (Req. 11.4): aplicado com origem SITE e Dados_CNPJ da BrasilAPI', async () => {
    const { deps, brasil } = setup({
      site: htmlAnswer(htmlWith(CNPJ_A)),
      brasil: [{ status: 200, json: brasilApiJson(CNPJ_A) }],
    });
    const out = await analyzeCompany(target(), opts(), deps);
    expect(brasil.calls.map((c) => c.cnpj)).toEqual([CNPJ_A]);
    expect(out.cnpj.apply).toBe(CNPJ_A);
    expect(out.cnpj.origem).toBe('SITE');
    expect(out.cnpj.data).toMatchObject({ cnpj: CNPJ_A, uf: 'SP', situacao: 'ATIVA' });
    expect(out.cnpj.candidates).toEqual([]);
    expect(out.cnpj.status).toBeNull();
  });

  it('vários CNPJs (Req. 11.5): todos candidatos MULTIPLOS, nenhum aplicado, sem BrasilAPI', async () => {
    const { deps, brasil } = setup({ site: htmlAnswer(htmlWith(CNPJ_A, CNPJ_B)) });
    const out = await analyzeCompany(target(), opts(), deps);
    expect(out.cnpj.apply).toBeNull();
    expect(out.cnpj.candidates).toEqual([
      { cnpj: CNPJ_A, motivo: 'MULTIPLOS' },
      { cnpj: CNPJ_B, motivo: 'MULTIPLOS' },
    ]);
    expect(brasil.calls).toHaveLength(0);
  });

  it('CNPJ de outra UF (Req. 12.4): desfeito, candidato UF_DIVERGENTE, sem dados', async () => {
    const { deps } = setup({
      site: htmlAnswer(htmlWith(CNPJ_A)),
      brasil: [{ status: 200, json: brasilApiJson(CNPJ_A, { uf: 'RJ' }) }],
    });
    const out = await analyzeCompany(target(), opts(), deps);
    expect(out.cnpj.apply).toBeNull();
    expect(out.cnpj.origem).toBeNull();
    expect(out.cnpj.data).toBeNull();
    expect(out.cnpj.candidates).toEqual([{ cnpj: CNPJ_A, motivo: 'UF_DIVERGENTE' }]);
    expect(out.cnpj.status).toBe(CNPJ_STATUS.UF_DIVERGENTE);
  });

  it('BrasilAPI 404 (Req. 12.3): desfeito, candidato NAO_ENCONTRADO, sem retentativa', async () => {
    const { deps, brasil } = setup({ site: htmlAnswer(htmlWith(CNPJ_A)), brasil: [{ status: 404 }] });
    const out = await analyzeCompany(target(), opts(), deps);
    expect(brasil.calls).toHaveLength(1);
    expect(out.cnpj.apply).toBeNull();
    expect(out.cnpj.candidates).toEqual([{ cnpj: CNPJ_A, motivo: 'NAO_ENCONTRADO' }]);
    expect(out.cnpj.status).toBe(CNPJ_STATUS.NAO_ENCONTRADO);
  });

  it('BrasilAPI indisponível (Req. 12.5): 1 retentativa; CNPJ mantido sem Dados_CNPJ', async () => {
    const { deps, brasil } = setup({
      site: htmlAnswer(htmlWith(CNPJ_A)),
      brasil: [{ status: 503 }, { error: 'timeout' }],
    });
    const out = await analyzeCompany(target(), opts(), deps);
    expect(brasil.calls).toHaveLength(2);
    expect(out.cnpj.apply).toBe(CNPJ_A);
    expect(out.cnpj.origem).toBe('SITE');
    expect(out.cnpj.data).toBeNull();
    expect(out.cnpj.candidates).toEqual([]);
    expect(out.cnpj.status).toBe(CNPJ_STATUS.INDISPONIVEL);
  });

  it('consulta desmarcada (Req. 12.7): candidato CONSULTA_DESABILITADA e nenhuma chamada à BrasilAPI', async () => {
    const { deps, brasil } = setup({ site: htmlAnswer(htmlWith(CNPJ_A)) });
    const out = await analyzeCompany(target(), opts({ cnpjEnabled: false }), deps);
    expect(brasil.calls).toHaveLength(0);
    expect(out.cnpj.apply).toBeNull();
    expect(out.cnpj.data).toBeNull();
    expect(out.cnpj.candidates).toEqual([{ cnpj: CNPJ_A, motivo: 'CONSULTA_DESABILITADA' }]);
    expect(out.cnpj.encontrados).toEqual([CNPJ_A]);
  });

  it('CNPJ MANUAL preservado (Req. 11.9): outro do site vira MANUAL_PRESERVADO, sem BrasilAPI', async () => {
    const { deps, brasil } = setup({ site: htmlAnswer(htmlWith(CNPJ_B)) });
    const t = target({
      cnpj: CNPJ_A,
      cnpjOrigem: 'MANUAL',
      cnpjDadosCnpj: CNPJ_A,
      cnpjConsultadoEm: new Date(NOW.getTime() - 86_400_000),
    });
    const out = await analyzeCompany(t, opts(), deps);
    expect(brasil.calls).toHaveLength(0);
    expect(out.cnpj.apply).toBeNull();
    expect(out.cnpj.origem).toBeNull();
    expect(out.cnpj.candidates).toEqual([{ cnpj: CNPJ_B, motivo: 'MANUAL_PRESERVADO' }]);
  });
});

describe('analyzeCompany — PageSpeed (Req. 10.7)', () => {
  it('site online e opção marcada: chama o PageSpeed com a URL final', async () => {
    const { deps, ps } = setup({
      site: htmlAnswer(htmlWith()),
      pagespeed: [{ status: 200, json: lighthouseJson({ performance: 0.42 }) }],
    });
    const out = await analyzeCompany(target(), opts({ pagespeedEnabled: true }), deps);
    expect(ps.calls).toHaveLength(1);
    expect(ps.calls[0].query.get('url')).toBe(SITE);
    expect(out.pagespeed).toMatchObject({ ok: true, result: { desempenho: 42 } });
  });

  it('site offline: SITE_OFFLINE sem chamada', async () => {
    const { deps, ps } = setup({ site: Object.assign(new Error('refused'), { code: 'ECONNREFUSED' }) });
    const out = await analyzeCompany(target(), opts({ pagespeedEnabled: true }), deps);
    expect(out.site.online).toBe(false);
    expect(out.pagespeed).toEqual({ ok: false, reason: 'SITE_OFFLINE' });
    expect(ps.calls).toHaveLength(0);
  });

  it('sem site: SEM_SITE sem chamada', async () => {
    const { deps, ps, transport } = setup();
    const out = await analyzeCompany(target({ website: null }), opts({ pagespeedEnabled: true }), deps);
    expect(out.pagespeed).toEqual({ ok: false, reason: 'SEM_SITE' });
    expect(ps.calls).toHaveLength(0);
    expect(transport.requests).toHaveLength(0);
  });

  it('opção desmarcada com site online: DESABILITADO_NA_MINERACAO sem chamada', async () => {
    const { deps, ps } = setup({ site: htmlAnswer(htmlWith()) });
    const out = await analyzeCompany(target(), opts({ pagespeedEnabled: false }), deps);
    expect(out.site.online).toBe(true);
    expect(out.pagespeed).toEqual({ ok: false, reason: 'DESABILITADO_NA_MINERACAO' });
    expect(ps.calls).toHaveLength(0);
  });
});

describe('analyzeCompany — Corpo_HTML (Req. 7.5)', () => {
  it('o HTML não aparece em nenhum campo do resultado', async () => {
    const { deps } = setup({
      site: htmlAnswer(htmlWith(CNPJ_A)),
      brasil: [{ status: 200, json: brasilApiJson(CNPJ_A) }],
    });
    const out = await analyzeCompany(target(), opts(), deps);
    expect(out.versaoScore).toBe(2);
    const text = JSON.stringify(out);
    expect(text).not.toContain(MARKER);
    expect(text).not.toContain('<html');
    expect(text).not.toContain('<footer');
  });
});

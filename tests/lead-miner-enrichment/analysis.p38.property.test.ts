/**
 * **Validates: Requirements 13.8**
 *
 * Para um roteiro fixo de site (status, latência, esquema), PageSpeed e IA, `analyzeCompany`
 * é executada duas vezes: uma sem Sinais_Digitais, sem CNPJ e sem Dados_CNPJ (linha de base) e
 * outra com Sinais_Digitais, CNPJs no HTML, CNPJ/Dados_CNPJ já gravados e respostas arbitrárias
 * da BrasilAPI. Categoria, motivos, Score_Final e Prioridade (e todo o ScoreBreakdown) são iguais.
 * Toda I/O é falsa; nada sai para a rede.
 */
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import type { CnpjAiFields } from '@/lib/leads/ai';
import { analyzeCompany, type AnalysisDeps, type AnalyzeTarget } from '@/lib/leads/analysis';
import { cnpjCheckDigits, formatCnpj } from '@/lib/leads/cnpj';
import { NICHES, SLOW_THRESHOLD_MS } from '@/lib/leads/config';
import { intervalLimiter } from '@/lib/leads/sources/rate-limit';
import type { SiteAnalyzerDeps } from '@/lib/leads/site-analyzer';
import type { CnpjCandidate, CnpjOrigin } from '@/lib/leads/types';
import { addr, fakeResolver } from '../lead-miner/support/fake-net';
import { brasilApiJson, fakeBrasilApi, type BrasilApiCall } from './support/fake-brasilapi';
import { fakeGemini, geminiJson, type GeminiStep } from './support/fake-gemini';
import { fakePageSpeed, lighthouseJson, type PageSpeedCall } from './support/fake-pagespeed';
import { fakeBodyTransport, type BodyTransportAnswer } from './support/fake-transport-body';
import { memoryUsageGate } from './support/fake-usage';
import type { ScriptStep } from './support/scripted';

// Feature: lead-miner-enrichment, Property 38: For any roteiro fixo de site, PageSpeed e IA e quaisquer Sinais_Digitais, CNPJs no HTML e Dados_CNPJ, analyzeCompany produz a mesma Categoria, motivos, Score_Final e Prioridade.

const RUNS = { numRuns: 100 };
const HOST = 'clinica.example.com.br';
const NOW = new Date('2025-06-01T12:00:00.000Z');
const NOW_MS = 1_000_000;
const DEADLINE = NOW_MS + 60_000;

// ---------------------------------------------------------------------------
// Roteiro fixo (site, PageSpeed, IA): compartilhado pelas duas execuções
// ---------------------------------------------------------------------------

type SiteScript =
  | { kind: 'none' }
  | { kind: 'error'; code: 'ECONNREFUSED' | 'ENOTFOUND' }
  | { kind: 'http'; status: number; headersAt: number; contentType: string | null };

interface FixedScript {
  nicho: string;
  scheme: 'https' | 'http';
  site: SiteScript;
  pagespeedEnabled: boolean;
  pagespeed: ScriptStep<PageSpeedCall>;
  iaEnabled: boolean;
  gemini: GeminiStep | null;
}

const siteScript: fc.Arbitrary<SiteScript> = fc.oneof(
  fc.constant<SiteScript>({ kind: 'none' }),
  fc.record({ kind: fc.constant('error' as const), code: fc.constantFrom('ECONNREFUSED' as const, 'ENOTFOUND' as const) }),
  fc.record({
    kind: fc.constant('http' as const),
    status: fc.constantFrom(200, 200, 204, 404, 500, 503),
    headersAt: fc.integer({ min: 0, max: SLOW_THRESHOLD_MS * 2 }),
    contentType: fc.constantFrom<string | null>('text/html; charset=utf-8', 'text/html', 'application/json', null),
  }),
);

const pagespeedStep: fc.Arbitrary<ScriptStep<PageSpeedCall>> = fc.oneof(
  fc.double({ min: 0, max: 1, noNaN: true }).map((p) => ({ status: 200, json: lighthouseJson({ performance: p }) })),
  fc.constant({ status: 500 }),
  fc.constant({ error: 'timeout' as const }),
);

const geminiStep: fc.Arbitrary<GeminiStep | null> = fc.oneof(
  fc.constant(null), // cliente ausente (sem chave)
  fc.integer({ min: -5, max: 40 }).map((s) =>
    geminiJson({ score: s, oportunidade: 'Criar site responsivo', justificativa: 'Sem presença digital própria.' }),
  ),
  fc.constant<GeminiStep>({ text: 'não é JSON' }),
  fc.constant<GeminiStep>({ error: 'falha' }),
);

const fixedScript: fc.Arbitrary<FixedScript> = fc.record({
  nicho: fc.constantFrom(...NICHES.map((n) => n.id)),
  scheme: fc.constantFrom('https' as const, 'http' as const),
  site: siteScript,
  pagespeedEnabled: fc.boolean(),
  pagespeed: pagespeedStep,
  iaEnabled: fc.boolean(),
  gemini: geminiStep,
});

// ---------------------------------------------------------------------------
// Variação: Sinais_Digitais, CNPJs no HTML, Dados_CNPJ e respostas da BrasilAPI
// ---------------------------------------------------------------------------

/** CNPJ válido (14 dígitos com verificadores corretos). */
const validCnpj = fc.stringMatching(/^[0-9]{12}$/).map((b) => `${b}${cnpjCheckDigits(b)}`);

const signalSnippet = fc.constantFrom(
  '<a href="https://www.instagram.com/clinica.sorriso">Instagram</a>',
  '<a href="https://instagram.com/Outra_Clinica?igsh=x">IG</a>',
  '<a href="https://wa.me/5511999998888">WhatsApp</a>',
  '<a href="https://api.whatsapp.com/send?phone=11988887777">Fale conosco</a>',
  '<meta name="generator" content="WordPress 6.4">',
  '<link rel="stylesheet" href="/wp-content/themes/x/style.css">',
  '<script src="https://static.wixstatic.com/a.js"></script>',
  '<script src="https://cdn.shopify.com/s/x.js"></script>',
  '<script async src="https://www.googletagmanager.com/gtag/js?id=G-1"></script>',
  '<script src="https://code.jquery.com/jquery.min.js"></script>',
  '<script id="__NEXT_DATA__" type="application/json">{}</script>',
  '<link href="/css/bootstrap.min.css" rel="stylesheet">',
  "<script>fbq('init', '123');</script>",
  '<p>Bem-vindo</p>',
);

interface Variation {
  snippets: string[];
  htmlCnpjs: string[];
  instagramOsm: string | null;
  whatsappOsm: string | null;
  cnpjEnabled: boolean;
  current: {
    cnpj: string;
    origem: CnpjOrigin | null;
    withData: boolean;
    consultadoHaDias: number;
    candidatos: CnpjCandidate[];
    ai: CnpjAiFields | null;
  } | null;
  brasil: 'OK_MESMA_UF' | 'OK_OUTRA_UF' | 'NAO_ENCONTRADO' | 'INDISPONIVEL' | 'TIMEOUT';
  useCurrentInHtml: boolean;
}

const cnpjAi: fc.Arbitrary<CnpjAiFields | null> = fc.option(
  fc.record({
    nomeFantasia: fc.option(fc.constantFrom('CLINICA SORRISO', 'SORRISO+'), { nil: null }),
    cnaeCodigo: fc.option(fc.constantFrom('8630504', '4711302'), { nil: null }),
    cnaeDescricao: fc.option(fc.constantFrom('Atividade odontológica', 'Comércio varejista'), { nil: null }),
    porte: fc.option(fc.constantFrom('MICRO EMPRESA', 'DEMAIS'), { nil: null }),
    situacao: fc.option(fc.constantFrom('ATIVA', 'BAIXADA', 'INAPTA'), { nil: null }),
    inicioAtividade: fc.option(fc.constantFrom('2015-03-10', '2023-01-02'), { nil: null }),
  }),
  { nil: null },
);

const variation: fc.Arbitrary<Variation> = fc.record({
  snippets: fc.array(signalSnippet, { maxLength: 6 }),
  htmlCnpjs: fc.array(validCnpj, { maxLength: 3 }),
  instagramOsm: fc.constantFrom<string | null>(null, '@clinica.osm', 'https://instagram.com/osm_perfil'),
  whatsappOsm: fc.constantFrom<string | null>(null, '+55 11 97777-6666', '11966665555'),
  cnpjEnabled: fc.boolean(),
  current: fc.option(
    fc.record({
      cnpj: validCnpj,
      origem: fc.constantFrom<CnpjOrigin | null>('SITE', 'MANUAL', null),
      withData: fc.boolean(),
      consultadoHaDias: fc.integer({ min: 0, max: 200 }),
      candidatos: fc.array(
        validCnpj.chain((c) =>
          fc.constantFrom<CnpjCandidate['motivo']>('MULTIPLOS', 'UF_DIVERGENTE', 'NAO_ENCONTRADO').map((motivo) => ({ cnpj: c, motivo })),
        ),
        { maxLength: 2 },
      ),
      ai: cnpjAi,
    }),
    { nil: null },
  ),
  brasil: fc.constantFrom('OK_MESMA_UF', 'OK_OUTRA_UF', 'NAO_ENCONTRADO', 'INDISPONIVEL', 'TIMEOUT'),
  useCurrentInHtml: fc.boolean(),
});

// ---------------------------------------------------------------------------
// Montagem de uma execução (fakes novos a cada chamada)
// ---------------------------------------------------------------------------

function brasilStep(kind: Variation['brasil']): ScriptStep<BrasilApiCall> {
  switch (kind) {
    case 'OK_MESMA_UF':
      return (req) => ({ status: 200, json: brasilApiJson(req.cnpj) });
    case 'OK_OUTRA_UF':
      return (req) => ({ status: 200, json: brasilApiJson(req.cnpj, { uf: 'RJ' }) });
    case 'NAO_ENCONTRADO':
      return { status: 404 };
    case 'INDISPONIVEL':
      return { status: 503 };
    case 'TIMEOUT':
      return { error: 'timeout' };
  }
}

function buildHtml(v: Variation | null): string {
  if (!v) return '<html><body><p>Bem-vindo</p></body></html>';
  const cnpjs = [...v.htmlCnpjs];
  if (v.useCurrentInHtml && v.current) cnpjs.push(v.current.cnpj);
  const parts = [...v.snippets, ...cnpjs.map((c) => `<footer>CNPJ ${formatCnpj(c)}</footer>`)];
  return `<html><body><p>Bem-vindo</p>${parts.join('')}</body></html>`;
}

async function run(s: FixedScript, v: Variation | null) {
  const siteUrl = `${s.scheme}://${HOST}/`;
  const html = buildHtml(v);

  let siteAnswer: BodyTransportAnswer | undefined;
  if (s.site.kind === 'error') siteAnswer = Object.assign(new Error('falha'), { code: s.site.code });
  else if (s.site.kind === 'http')
    siteAnswer = { status: s.site.status, headersAt: s.site.headersAt, contentType: s.site.contentType, body: html };

  let t = NOW.getTime();
  const sleep = async (ms: number) => {
    t += ms;
  };
  const transport = fakeBodyTransport(siteAnswer === undefined ? {} : { [siteUrl]: siteAnswer });
  const step = v ? brasilStep(v.brasil) : null;
  const brasil = fakeBrasilApi(step ? [step, step, step] : [], { sleep });
  const ps = fakePageSpeed([s.pagespeed, s.pagespeed, s.pagespeed]);
  const gemini = s.gemini ? fakeGemini([s.gemini]) : null;

  const deps: AnalysisDeps = {
    site: {
      resolver: fakeResolver({ [HOST]: [addr('93.184.216.34')] }),
      transport: transport as unknown as SiteAnalyzerDeps['transport'],
      now: () => 0,
      setTimer: () => () => { },
    },
    pagespeed: { http: ps, usage: memoryUsageGate(), limit: 100, now: () => NOW, hasKey: false },
    cnpj: {
      http: brasil,
      limiter: intervalLimiter(1000, { now: () => t, sleep }),
      sleep,
      now: () => new Date(t),
    },
    ai: { client: gemini, usage: memoryUsageGate(), limit: 100, now: () => NOW, setTimer: () => () => { } },
    now: () => NOW_MS,
  };

  const cur = v?.current ?? null;
  const target: AnalyzeTarget = {
    companyId: 'c1',
    nicho: s.nicho,
    nome: 'Clínica Sorriso',
    bairro: 'Vila Mariana',
    cidade: 'São Paulo',
    uf: 'SP',
    website: s.site.kind === 'none' ? null : siteUrl,
    instagramOsm: v?.instagramOsm ?? null,
    whatsappOsm: v?.whatsappOsm ?? null,
    cnpj: cur?.cnpj ?? null,
    cnpjOrigem: cur?.origem ?? null,
    cnpjCandidatos: cur?.candidatos ?? [],
    cnpjDadosCnpj: cur?.withData ? cur.cnpj : null,
    cnpjConsultadoEm: cur?.withData ? new Date(NOW.getTime() - cur.consultadoHaDias * 86_400_000) : null,
    cnpjAi: cur?.withData ? cur.ai : null,
  };

  return analyzeCompany(
    target,
    { iaEnabled: s.iaEnabled, pagespeedEnabled: s.pagespeedEnabled, cnpjEnabled: v?.cnpjEnabled ?? false, deadline: DEADLINE },
    deps,
  );
}

describe('Property 38: Sinais e CNPJ não alteram Categoria nem score', () => {
  it('mesma Categoria, motivos, Score_Final e Prioridade com e sem Sinais/CNPJ/Dados_CNPJ', async () => {
    let sinaisDiferentes = 0;
    let comDadosCnpj = 0;
    await fc.assert(
      fc.asyncProperty(fixedScript, variation, async (s, v) => {
        const base = await run(s, null);
        const varied = await run(s, v);
        if (JSON.stringify(varied.sinais) !== JSON.stringify(base.sinais)) sinaisDiferentes++;
        if (varied.cnpj.data || varied.cnpj.apply) comDadosCnpj++;

        expect(varied.classification.category).toBe(base.classification.category);
        expect(varied.classification.motivos).toEqual(base.classification.motivos);
        expect(varied.breakdown.final).toBe(base.breakdown.final);
        expect(varied.breakdown.prioridade).toBe(base.breakdown.prioridade);
        // Todo o detalhamento do score também é idêntico.
        expect(varied.breakdown).toEqual(base.breakdown);
        expect(varied.versaoScore).toBe(2);
      }),
      RUNS,
    );
    // A propriedade não é vacuosa: a variação de fato produziu Sinais e CNPJ diferentes.
    expect(sinaisDiferentes).toBeGreaterThan(0);
    expect(comDadosCnpj).toBeGreaterThan(0);
  });
});

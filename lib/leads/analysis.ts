/**
 * Análise de uma Empresa, compartilhada entre o Lote e a Reanalise (Req. 7–14, 16.2).
 *
 * Sequência: Analisador_de_Site (com Corpo_HTML) → Sinais_Digitais e CNPJs do HTML →
 * `planCnpj` → PageSpeed, BrasilAPI e IA em paralelo (cada um limitado pelo `deadline`) →
 * `resolveSiteCnpj` → `classify`/`score` da Versao_Score 2.
 *
 * O Corpo_HTML vive só dentro de `analyzeCompany` e nunca entra no resultado (Req. 7.5).
 * Toda I/O vem das dependências injetadas (as mesmas de `PipelineDeps`).
 *
 * `approachInputFrom` monta a entrada do Gerador_Abordagem a partir do banco; do usuário da
 * sessão lê só o primeiro nome (Req. 15.10).
 */
import { analyzeWithAi, cnpjAiFields, type AiInput } from './ai';
import type { ApproachChannel, ApproachInput } from './approach';
import { lookupCnpj, needsLookup, type CnpjLookupOutcome } from './brasilapi';
import { classify } from './classifier';
import { extractCnpjs, mergeCandidates, normalizeCnpj, planCnpj, resolveSiteCnpj, CNPJ_STATUS } from './cnpj';
import { GEMINI_TIMEOUT_MS, NICHES, PAGESPEED_TIMEOUT_MS, type Niche } from './config';
import { parsePageSpeedJson } from './display';
import { runPageSpeed } from './pagespeed';
import type { PipelineDeps } from './pipeline';
import type { AnalysisDataV2, ClaimedItemV2, CnpjAnalysisOutcome } from './repository';
import { score } from './scorer';
import { detectSignals, parseSinais } from './signals';
import { analyzeSiteWithBody } from './site-analyzer';
import type { AiOutcome, CategoryCode, CnpjCandidate, CnpjData, PageSpeedOutcome, SiteAnalysis } from './types';

/** Reserva para a gravação da análise, descontada do tempo restante até o `deadline`. */
export const ANALYSIS_WRITE_MARGIN_MS = 2_000;

/** Dependências usadas pela análise (subconjunto de `PipelineDeps`). */
export type AnalysisDeps = Pick<PipelineDeps, 'site' | 'pagespeed' | 'cnpj' | 'ai' | 'now'>;

/**
 * Empresa a analisar: o item reservado pelo Lote (`ClaimedItemV2`) ou o equivalente montado
 * pela Reanalise. `website` é o próprio; `cacheWebsite`/`cacheNome` vêm do Cache_Google válido.
 */
export type AnalyzeTarget = Pick<
  ClaimedItemV2,
  | 'companyId'
  | 'nicho'
  | 'nome'
  | 'bairro'
  | 'cidade'
  | 'uf'
  | 'website'
  | 'instagramOsm'
  | 'whatsappOsm'
  | 'cnpj'
  | 'cnpjOrigem'
  | 'cnpjCandidatos'
  | 'cnpjDadosCnpj'
  | 'cnpjConsultadoEm'
  | 'cnpjAi'
> &
  Partial<Pick<ClaimedItemV2, 'cacheNome' | 'cacheWebsite'>>;

export interface AnalyzeOptions {
  iaEnabled: boolean;
  pagespeedEnabled: boolean;
  cnpjEnabled: boolean;
  /** Instante limite (ms, mesma base de `deps.now()`). */
  deadline: number;
}

const NICHE_BY_ID = new Map<string, Niche>(NICHES.map((n) => [n.id, n]));

const nonEmpty = (v: string | null | undefined): string | null => {
  const t = (v ?? '').trim();
  return t ? t : null;
};

/** Website próprio; na falta, o do Cache_Google válido (Req. 5). */
export function targetWebsite(t: Pick<AnalyzeTarget, 'website' | 'cacheWebsite'>): string | null {
  return nonEmpty(t.website) ?? nonEmpty(t.cacheWebsite);
}

/** Tempo disponível para uma chamada externa: min(timeout próprio, restante − margem), ≥ 0. */
export function boundedTimeout(ownMs: number, deadline: number, nowMs: number): number {
  return Math.max(0, Math.min(ownMs, deadline - nowMs - ANALYSIS_WRITE_MARGIN_MS));
}

/** Motivo de ausência quando o PageSpeed não é chamado; null = deve ser chamado (Req. 10.2, 10.3, 10.7). */
export function pagespeedSkipReason(site: SiteAnalysis, enabled: boolean): PageSpeedOutcome | null {
  if (!enabled) return { ok: false, reason: 'DESABILITADO_NA_MINERACAO' };
  if (!site.hasSite) return { ok: false, reason: 'SEM_SITE' };
  if (!site.online || !site.finalUrl) return { ok: false, reason: 'SITE_OFFLINE' };
  return null;
}

/** CNPJ a consultar na BrasilAPI, ou null (Req. 12.1, 12.7). */
function lookupTarget(
  t: AnalyzeTarget,
  plan: ReturnType<typeof planCnpj>,
  cnpjEnabled: boolean,
  now: Date,
): { cnpj: string; kind: 'SITE_NEW' | 'CURRENT' } | null {
  if (!cnpjEnabled) return null;
  if (plan.kind === 'APPLY_SITE') return { cnpj: plan.cnpj, kind: 'SITE_NEW' };
  const current = t.cnpj ? normalizeCnpj(t.cnpj) : null;
  if (current && needsLookup(t, current, now)) return { cnpj: current, kind: 'CURRENT' };
  return null;
}

/** Desfecho do CNPJ da análise a partir do plano e da consulta (Req. 11.4, 11.5, 11.9, 12.3–12.5, 12.7). */
function cnpjOutcome(
  t: AnalyzeTarget,
  plan: ReturnType<typeof planCnpj>,
  found: string[],
  target: { cnpj: string; kind: 'SITE_NEW' | 'CURRENT' } | null,
  lookup: CnpjLookupOutcome | null,
): CnpjAnalysisOutcome {
  let apply: string | null = null;
  let data: CnpjData | null = null;
  let status: string | null = null;
  const fresh: CnpjCandidate[] = plan.kind === 'CANDIDATES' ? [...plan.candidates] : [];

  if (plan.kind === 'APPLY_SITE' && target?.kind === 'SITE_NEW' && lookup) {
    const r = resolveSiteCnpj(plan, t.uf, lookup);
    apply = r.apply ? normalizeCnpj(plan.cnpj) : null;
    data = r.data;
    status = r.status;
    if (r.candidate) fresh.push(r.candidate);
  } else if (target?.kind === 'CURRENT' && lookup) {
    // Renovação dos Dados_CNPJ do CNPJ atual (ex.: MANUAL há mais de 90 dias).
    if (lookup.ok) data = lookup.data;
    else status = CNPJ_STATUS[lookup.reason];
  }

  return {
    plan,
    apply,
    origem: apply ? 'SITE' : null,
    data,
    candidates: mergeCandidates(fresh, [], apply ?? t.cnpj),
    status,
    encontrados: found,
  };
}

const AI_NO_TIME: AiOutcome = { ok: false, reason: 'sem resposta' };

/**
 * Analisa uma Empresa (Lote e Reanalise). Nunca grava; o chamador persiste o resultado.
 * Lança apenas para Nicho desconhecido (tratado como falha da Empresa pelo Lote).
 */
export async function analyzeCompany(
  t: AnalyzeTarget,
  o: AnalyzeOptions,
  deps: AnalysisDeps,
): Promise<AnalysisDataV2> {
  const niche = NICHE_BY_ID.get(t.nicho);
  if (!niche) throw new Error(`Nicho desconhecido: ${t.nicho}`);

  // 1) Site + Corpo_HTML (≤ 10 s, Guarda_SSRF).
  const fetched = await analyzeSiteWithBody(targetWebsite(t), deps.site);
  const site = fetched.analysis;
  let html: string | null = fetched.html;

  // 2) Sinais_Digitais e CNPJs do HTML (Req. 8, 9, 11.3).
  const sinais = detectSignals(html, { instagram: t.instagramOsm, whatsapp: t.whatsappOsm });
  const found = html ? extractCnpjs(html) : [];
  html = null; // Req. 7.5: o Corpo_HTML não sai daqui.

  // 3) Plano do CNPJ (Req. 11.4, 11.5, 11.9, 12.7).
  const plan = planCnpj(t, found, { enrich: o.cnpjEnabled });
  const target = lookupTarget(t, plan, o.cnpjEnabled, deps.cnpj.now());

  // 4) PageSpeed, BrasilAPI e IA em paralelo, limitados pelo deadline (Req. 10.8).
  const skip = pagespeedSkipReason(site, o.pagespeedEnabled);
  const pagespeedTask: Promise<PageSpeedOutcome> = skip
    ? Promise.resolve(skip)
    : runPageSpeed(site.finalUrl as string, deps.pagespeed, {
        timeoutMs: boundedTimeout(PAGESPEED_TIMEOUT_MS, o.deadline, deps.now()),
      });

  const lookupTask: Promise<CnpjLookupOutcome | null> = target
    ? lookupCnpj(target.cnpj, deps.cnpj, {
        deadline: deps.cnpj.now().getTime() + Math.max(0, o.deadline - deps.now() - ANALYSIS_WRITE_MARGIN_MS),
      })
    : Promise.resolve(null);

  const aiTask: Promise<AiOutcome | null> = (() => {
    if (!o.iaEnabled) return Promise.resolve(null);
    const timeoutMs = boundedTimeout(deps.ai.timeoutMs ?? GEMINI_TIMEOUT_MS, o.deadline, deps.now());
    if (timeoutMs <= 0) return Promise.resolve(AI_NO_TIME);
    const input: AiInput = {
      nome: nonEmpty(t.cacheNome) ?? t.nome,
      nicho: niche.label,
      bairro: t.bairro,
      cidade: t.cidade,
      site,
      sinais,
      // Somente Dados_CNPJ já gravados e sem razão social (Req. 12.8, 14.1).
      cnpj: cnpjAiFields(t.cnpjAi),
    };
    return analyzeWithAi(input, { ...deps.ai, timeoutMs });
  })();

  const [pagespeed, lookup, ai] = await Promise.all([pagespeedTask, lookupTask, aiTask]);

  // 5) CNPJ: resolução após a BrasilAPI (Req. 12.3, 12.4, 12.5).
  const cnpj = cnpjOutcome(t, plan, found, target, lookup);

  // 6) Classificação e pontuação v2: Sinais/Dados_CNPJ não entram (Req. 13.8).
  const ps = pagespeed.ok ? pagespeed.result : null;
  const classification = classify(site, { pagespeed: ps });
  const breakdown = score({ analysis: site, tier: niche.tier, iaEnabled: o.iaEnabled, ai, pagespeed: ps });

  return { versaoScore: 2, site, classification, breakdown, ai, sinais, pagespeed, cnpj };
}

// ---------------------------------------------------------------------------
// Entrada do Gerador_Abordagem (Req. 15.10)
// ---------------------------------------------------------------------------

export interface ApproachCompanySource {
  nome: string;
  nomeExibicao: string | null;
  nicho: string;
  bairro: string | null;
  cidade: string | null;
  cnpj: string | null;
  cnpjDadosCnpj: string | null;
  cnpjNomeFantasia: string | null;
  cnpjCnaeCodigo: string | null;
  cnpjCnaeDescricao: string | null;
  cnpjPorte: string | null;
  situacaoCadastral: string | null;
  cnpjInicioAtividade: string | null;
}

export interface ApproachAnalysisSource {
  categoria: CategoryCode;
  motivos: unknown;
  pagespeed: unknown;
  sinais: unknown;
  oportunidadeIa: string | null;
}

/** Primeiro nome (até o 1º espaço) do usuário da sessão. */
export function firstName(name: string | null | undefined): string {
  return (name ?? '').trim().split(/\s+/)[0] || 'Equipe SciTec jr.';
}

function stringList(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
}

/** Monta o `ApproachInput` do banco; do usuário lê só `name` (Req. 15.10). Nunca inclui a razão social. */
export function approachInputFrom(
  company: ApproachCompanySource,
  latestAnalysis: ApproachAnalysisSource,
  sessionUser: { name: string | null | undefined },
  canal: ApproachChannel,
): ApproachInput {
  const hasData = company.cnpj !== null && company.cnpjDadosCnpj === company.cnpj;
  return {
    nomeExibicao: nonEmpty(company.nomeExibicao) ?? nonEmpty(company.nome) ?? 'Empresa',
    nicho: NICHE_BY_ID.get(company.nicho)?.label ?? company.nicho,
    bairro: company.bairro,
    cidade: company.cidade,
    categoria: latestAnalysis.categoria,
    motivos: stringList(latestAnalysis.motivos),
    pagespeed: parsePageSpeedJson(latestAnalysis.pagespeed),
    sinais: parseSinais(latestAnalysis.sinais),
    cnpj: hasData
      ? cnpjAiFields({
          nomeFantasia: company.cnpjNomeFantasia,
          cnaeCodigo: company.cnpjCnaeCodigo,
          cnaeDescricao: company.cnpjCnaeDescricao,
          porte: company.cnpjPorte,
          situacao: company.situacaoCadastral,
          inicioAtividade: company.cnpjInicioAtividade,
        })
      : null,
    oportunidadeIa: latestAnalysis.oportunidadeIa,
    canal,
    remetente: firstName(sessionUser.name),
  };
}

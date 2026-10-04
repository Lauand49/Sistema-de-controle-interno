/**
 * Reanálise de uma Empresa sob demanda (Req. 16).
 *
 * Fluxo:
 * 1. Lease atômico num único `UPDATE … RETURNING`: barra execuções simultâneas e recusa se a
 *    Analise mais recente foi criada há menos de 10 minutos (Req. 16.4, 16.5). 0 linhas → consulta
 *    para distinguir `RECENTE` de `EM_CURSO`. Empresa inexistente → 404 antes do lease.
 * 2. Atualiza o Cache_Google se há Place_ID e o cache está ausente/expirado; sem cache e sem
 *    website próprio, analisa como "sem website informado" e devolve `semWebsite` (Req. 16.3).
 * 3. `analyzeCompany` até o `deadline` da rota (Req. 16.2).
 * 4. `persistReanalysis` grava a nova Analise (`runId = null`) e o snapshot numa transação única;
 *    em qualquer exceção nada é gravado e o lease é liberado no `finally` (Req. 16.6).
 *
 * Toda I/O externa vem de `PipelineDeps` (injeção), o que permite testar sem rede.
 */
import { notFound } from '@/lib/api-error';
import { cnpjAiFields } from './ai';
import { analyzeCompany, type AnalysisDeps, type AnalyzeOptions, type AnalyzeTarget } from './analysis';
import { parseCandidates } from './cnpj';
import { refreshGoogleCache, type RefreshOutcome } from './google-cache';
import type { PipelineDeps } from './pipeline';
import { persistReanalysis } from './repository';
import { serviceState } from './services';
import { monthKey } from './usage';

export type ReanalysisResult =
  | { ok: true; analysisId: string; semWebsite: boolean; googleRefresh: RefreshOutcome | null }
  | { ok: false; status: 409; reason: 'RECENTE' | 'EM_CURSO' };

export const MSG_REANALYSIS = {
  recente: 'Empresa analisada há menos de 10 minutos',
  emCurso: 'Reanálise já em andamento para esta empresa',
  naoEncontrada: 'Empresa não encontrada.',
} as const;

/** Duração do lease da Reanalise, em segundos (Req. 16.5). */
const LEASE_SECONDS = 90;

/** `true` quando o site próprio está vazio. */
const emptyOwnSite = (website: string | null): boolean => (website ?? '').trim() === '';

/**
 * Disponibilidade do PageSpeed no momento (mesmo critério de `pagespeedAvailability` do pipeline):
 * sem chave obrigatória; uso do mês < limite. Falha na leitura conta como "disponível".
 */
async function pagespeedEnabled(deps: PipelineDeps['pagespeed']): Promise<boolean> {
  try {
    const count = await deps.usage.count('pagespeed', monthKey(deps.now()));
    const safe = Number.isFinite(count) ? count : 0;
    const s = serviceState({ requiresKey: false, hasKey: deps.hasKey, count: safe, limit: deps.limit });
    return s.available;
  } catch {
    return true;
  }
}

/**
 * Reavalia uma Empresa sob demanda (Req. 16).
 *
 * @param companyId Empresa a reanalisar.
 * @param deps      Dependências do pipeline (banco e serviços externos).
 * @param deadline  Instante limite em ms (mesma base de `deps.now()`), tipicamente ~55 s.
 */
export async function reanalyzeCompany(
  companyId: string,
  deps: PipelineDeps,
  deadline: number,
): Promise<ReanalysisResult> {
  const { db } = deps;

  // 1) Lease atômico (Req. 16.4, 16.5). Único UPDATE … RETURNING: grava o lease só se não há
  //    outro em curso e nenhuma Analise nos últimos 10 minutos.
  const leased = await db.$queryRaw<Array<{ id: string }>>`
    UPDATE "Company" SET "reanaliseAte" = now() + (${LEASE_SECONDS}::int * interval '1 second')
    WHERE id = ${companyId} AND ("reanaliseAte" IS NULL OR "reanaliseAte" < now())
      AND NOT EXISTS (
        SELECT 1 FROM "CompanyAnalysis" a
        WHERE a."companyId" = ${companyId} AND a."createdAt" > now() - interval '10 minutes'
      )
    RETURNING id`;

  if (leased.length === 0) {
    // Distingue 404 / RECENTE / EM_CURSO. A comparação dos 10 minutos usa o relógio do banco
    // (mesma base do lease), não o relógio do processo.
    const existing = await db.company.findUnique({ where: { id: companyId }, select: { id: true } });
    if (!existing) throw notFound(MSG_REANALYSIS.naoEncontrada);

    const recente = await db.$queryRaw<Array<{ id: string }>>`
      SELECT id FROM "CompanyAnalysis"
      WHERE "companyId" = ${companyId} AND "createdAt" > now() - interval '10 minutes'
      LIMIT 1`;
    return { ok: false, status: 409, reason: recente.length > 0 ? 'RECENTE' : 'EM_CURSO' };
  }

  try {
    // 2) Cache_Google: atualiza se há Place_ID e cache ausente/expirado (Req. 16.3).
    let company = await db.company.findUnique({ where: { id: companyId }, include: { googleCache: true } });
    if (!company) throw notFound(MSG_REANALYSIS.naoEncontrada);

    let googleRefresh: RefreshOutcome | null = null;
    if (company.googlePlaceId) {
      googleRefresh = await refreshGoogleCache(db, companyId, deps.google);
      // O refresh pode ter gravado/apagado o cache: relê a Empresa para montar o alvo.
      const reloaded = await db.company.findUnique({ where: { id: companyId }, include: { googleCache: true } });
      if (reloaded) company = reloaded;
    }

    const now = deps.google.now();
    const cacheValido = company.googleCache != null && company.googleCache.expiraEm > now;
    const cacheWebsite = cacheValido ? company.googleCache?.website ?? null : null;
    const cacheNome = cacheValido ? company.googleCache?.nome ?? null : null;
    // Sem website próprio e sem cache válido com website → analisa como "sem website informado".
    const semWebsite = emptyOwnSite(company.website) && (cacheWebsite ?? '').trim() === '';

    const hasCnpjData = company.cnpj !== null && company.cnpjDadosCnpj === company.cnpj;
    const target: AnalyzeTarget = {
      companyId: company.id,
      nicho: company.nicho,
      nome: company.nome,
      bairro: company.bairro,
      cidade: company.cidade,
      uf: company.uf,
      website: company.website,
      instagramOsm: company.instagramOsm,
      whatsappOsm: company.whatsappOsm,
      cnpj: company.cnpj,
      cnpjOrigem:
        company.cnpjOrigem === 'SITE' || company.cnpjOrigem === 'MANUAL' ? company.cnpjOrigem : null,
      cnpjCandidatos: parseCandidates(company.cnpjCandidatos),
      cnpjDadosCnpj: company.cnpjDadosCnpj,
      cnpjConsultadoEm: company.cnpjConsultadoEm,
      cnpjAi: hasCnpjData
        ? cnpjAiFields({
          nomeFantasia: company.cnpjNomeFantasia,
          cnaeCodigo: company.cnpjCnaeCodigo,
          cnaeDescricao: company.cnpjCnaeDescricao,
          porte: company.cnpjPorte,
          situacao: company.situacaoCadastral,
          inicioAtividade: company.cnpjInicioAtividade,
        })
        : null,
      cacheNome,
      cacheWebsite,
    };

    // 3) Análise (Req. 16.2). `AnalysisDeps` é um subconjunto de `PipelineDeps`.
    const options: AnalyzeOptions = {
      iaEnabled: deps.ai.client != null,
      pagespeedEnabled: await pagespeedEnabled(deps.pagespeed),
      cnpjEnabled: true,
      deadline,
    };
    const analysisDeps: AnalysisDeps = {
      site: deps.site,
      pagespeed: deps.pagespeed,
      cnpj: deps.cnpj,
      ai: deps.ai,
      now: deps.now,
    };
    const data = await analyzeCompany(target, options, analysisDeps);

    // 4) Gravação atômica da nova Analise + snapshot (Req. 16.2, 16.6).
    const { analysisId } = await persistReanalysis(db, companyId, data, new Date(deps.now()));
    return { ok: true, analysisId, semWebsite, googleRefresh };
  } finally {
    // Libera o lease mesmo em falha (Req. 16.6).
    await db.$executeRaw`UPDATE "Company" SET "reanaliseAte" = NULL WHERE id = ${companyId}`;
  }
}

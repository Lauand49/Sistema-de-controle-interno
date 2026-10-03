import type { PrismaClient } from "@prisma/client";
import {
  analyzeCompany,
  type AnalysisDeps,
  type AnalyzeOptions,
  type AnalyzeTarget,
} from "./analysis";
import { refreshGoogleCache } from "./google-cache";
import type { GooglePlacesDeps } from "./sources/google-places";
import { persistReanalysis } from "./repository";
import { parseCandidates } from "./cnpj";
import { cnpjAiFields } from "./ai";

export interface ReanalysisDeps {
  db: PrismaClient;
  now: () => Date;
  google: GooglePlacesDeps;
  analysis: AnalysisDeps;
}

export type ReanalysisStatus = "OK" | "NOT_FOUND" | "RECENTE" | "EM_CURSO";

/**
 * Reavalia uma Empresa sob demanda (Req. 16).
 *
 * 1. Obtém lease atômico impedindo execuções simultâneas e barrando se a última
 *    análise foi há menos de 10 minutos (Req. 16.4, 16.5).
 * 2. Atualiza o Cache_Google se ausente/expirado (Req. 16.3).
 * 3. Analisa a Empresa até o deadline da rota (Req. 16.2).
 * 4. Grava uma Analise avulsa (sem Mineracao) preservando o histórico (Req. 16.6).
 */
export async function reanalyzeCompany(
  companyId: string,
  options: AnalyzeOptions,
  deps: ReanalysisDeps,
): Promise<{ status: ReanalysisStatus; analysisId?: string }> {
  const now = deps.now();
  const cutoff = new Date(now.getTime() - 10 * 60_000);

  // Req. 16.4 / 16.5: Lease atômico
  const result = await deps.db.company.updateMany({
    where: {
      id: companyId,
      OR: [
        { lastAnalyzedAt: null },
        { lastAnalyzedAt: { lte: cutoff } }
      ],
      AND: [
        {
          OR: [
            { reanaliseAte: null },
            { reanaliseAte: { lte: now } }
          ]
        }
      ]
    },
    data: {
      reanaliseAte: new Date(now.getTime() + 60_000)
    }
  });
  const lease = result.count;

  if (lease === 0) {
    const c = await deps.db.company.findUnique({
      where: { id: companyId },
      select: { lastAnalyzedAt: true, reanaliseAte: true },
    });
    if (!c) return { status: "NOT_FOUND" };
    if (c.reanaliseAte && c.reanaliseAte > now) return { status: "EM_CURSO" };
    if (c.lastAnalyzedAt && c.lastAnalyzedAt > cutoff)
      return { status: "RECENTE" };
    return { status: "EM_CURSO" }; // Corrida
  }

  try {
    let company = await deps.db.company.findUnique({
      where: { id: companyId },
      include: { googleCache: true },
    });
    if (!company) return { status: "NOT_FOUND" };

    // Req. 16.3: Atualiza cache se necessário
    if (company.googlePlaceId) {
      const outcome = await refreshGoogleCache(deps.db, companyId, deps.google);
      if (outcome === "UPDATED" || outcome === "NOT_FOUND") {
        const updated = await deps.db.company.findUnique({
          where: { id: companyId },
          include: { googleCache: true },
        });
        if (updated) company = updated;
      }
    }

    const hasData =
      company.cnpj !== null && company.cnpjDadosCnpj === company.cnpj;
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
        company.cnpjOrigem === "SITE" || company.cnpjOrigem === "MANUAL"
          ? company.cnpjOrigem
          : null,
      cnpjCandidatos: parseCandidates(company.cnpjCandidatos),
      cnpjDadosCnpj: company.cnpjDadosCnpj,
      cnpjConsultadoEm: company.cnpjConsultadoEm,
      cnpjAi: hasData
        ? cnpjAiFields({
            nomeFantasia: company.cnpjNomeFantasia,
            cnaeCodigo: company.cnpjCnaeCodigo,
            cnaeDescricao: company.cnpjCnaeDescricao,
            porte: company.cnpjPorte,
            situacao: company.situacaoCadastral,
            inicioAtividade: company.cnpjInicioAtividade,
          })
        : null,
      cacheNome: company.googleCache?.nome,
      cacheWebsite: company.googleCache?.website,
    };

    const result = await analyzeCompany(target, options, deps.analysis);
    const { analysisId } = await persistReanalysis(
      deps.db,
      companyId,
      result,
      deps.now(),
    );

    // Atualiza o lastAnalyzedAt após o sucesso
    await deps.db.$executeRaw`
      UPDATE "Company"
      SET "lastAnalyzedAt" = ${deps.now()}
      WHERE "id" = ${companyId}
    `;

    return { status: "OK", analysisId };
  } finally {
    // Libera o lease (mesmo em falha, Req. 16.6)
    await deps.db.$executeRaw`
      UPDATE "Company"
      SET "reanaliseAte" = NULL
      WHERE "id" = ${companyId}
    `;
  }
}

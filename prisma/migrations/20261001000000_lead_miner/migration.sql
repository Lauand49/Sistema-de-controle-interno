-- Etapa 1 — Minerador de Leads (OSM).
-- Gerada com `prisma migrate diff --from-migrations prisma/migrations --to-schema-datamodel prisma/schema.prisma --script`
-- e revisada: só adiciona tipos/tabelas/colunas/índices. Os índices parciais e CHECKs da migração
-- inicial ("User_one_manager_per_department", "SectorMember_one_manager_per_sector",
-- "User_global_without_department", "User_department_role_requires_department") são preservados.
-- ProspectLead.companyId é nullable: leads existentes ficam com NULL (Req. 9.11, 9.13).

-- CreateEnum
CREATE TYPE "MiningSource" AS ENUM ('OSM', 'GOOGLE', 'MISTA');

-- CreateEnum
CREATE TYPE "MiningStatus" AS ENUM ('PENDENTE', 'EM_ANDAMENTO', 'CONCLUIDA', 'ERRO');

-- CreateEnum
CREATE TYPE "CompanyCategory" AS ENUM ('CRIAR_SITE', 'OTIMIZACAO_SEGURANCA', 'ANALISE_DADOS_BI');

-- CreateEnum
CREATE TYPE "LeadPriority" AS ENUM ('ALTA', 'MEDIA', 'BAIXA');

-- AlterTable
ALTER TABLE "ProspectLead" ADD COLUMN     "companyId" TEXT;

-- CreateTable
CREATE TABLE "Company" (
    "id" TEXT NOT NULL,
    "googlePlaceId" TEXT,
    "osmId" TEXT,
    "cnpj" TEXT,
    "nome" TEXT NOT NULL,
    "nomeNormalizado" TEXT NOT NULL,
    "nicho" TEXT NOT NULL,
    "endereco" TEXT,
    "bairro" TEXT,
    "cidade" TEXT,
    "uf" TEXT,
    "telefone" TEXT,
    "website" TEXT,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "marcaRede" TEXT,
    "fonte" "MiningSource" NOT NULL DEFAULT 'OSM',
    "categoria" "CompanyCategory",
    "scoreFinal" INTEGER,
    "prioridade" "LeadPriority",
    "hasSite" BOOLEAN,
    "isHttps" BOOLEAN,
    "lastAnalyzedAt" TIMESTAMP(3),
    "assignedTo" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Company_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CompanyAlias" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "source" "MiningSource" NOT NULL,
    "externalId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CompanyAlias_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CompanyAnalysis" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "runId" TEXT,
    "hasSite" BOOLEAN NOT NULL,
    "online" BOOLEAN NOT NULL,
    "statusCode" INTEGER,
    "isHttps" BOOLEAN NOT NULL,
    "sslValid" BOOLEAN NOT NULL,
    "sslProblem" TEXT,
    "responseTime" INTEGER,
    "lento" BOOLEAN NOT NULL DEFAULT false,
    "motivoFalha" TEXT,
    "finalUrl" TEXT,
    "categoria" "CompanyCategory" NOT NULL,
    "motivos" JSONB NOT NULL,
    "scoreDigital" INTEGER NOT NULL,
    "scoreIcp" INTEGER NOT NULL,
    "scoreObjetivo" INTEGER NOT NULL,
    "scoreIa" INTEGER,
    "scoreFinal" INTEGER NOT NULL,
    "prioridade" "LeadPriority" NOT NULL,
    "iaAplicada" BOOLEAN NOT NULL DEFAULT false,
    "iaMotivo" TEXT,
    "oportunidadeIa" TEXT,
    "justificativaIa" TEXT,
    "detalhamento" JSONB NOT NULL,
    "pagespeed" JSONB,
    "tecnologias" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CompanyAnalysis_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MiningRun" (
    "id" TEXT NOT NULL,
    "bairro" TEXT NOT NULL,
    "cidade" TEXT NOT NULL,
    "uf" TEXT NOT NULL,
    "bairroNorm" TEXT NOT NULL,
    "cidadeNorm" TEXT NOT NULL,
    "nichos" JSONB NOT NULL,
    "excluirRedes" BOOLEAN NOT NULL DEFAULT false,
    "iaEnabled" BOOLEAN NOT NULL DEFAULT false,
    "iaDisabledReason" TEXT,
    "paramsKey" TEXT NOT NULL,
    "fonte" "MiningSource" NOT NULL DEFAULT 'OSM',
    "status" "MiningStatus" NOT NULL DEFAULT 'PENDENTE',
    "total" INTEGER NOT NULL DEFAULT 0,
    "processados" INTEGER NOT NULL DEFAULT 0,
    "area" JSONB,
    "nichosProcessados" JSONB NOT NULL DEFAULT '[]',
    "nichosFalhos" JSONB NOT NULL DEFAULT '[]',
    "errorMessage" TEXT,
    "lockedUntil" TIMESTAMP(3),
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "MiningRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MiningRunCompany" (
    "id" TEXT NOT NULL,
    "runId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "isNew" BOOLEAN NOT NULL,
    "nicho" TEXT NOT NULL,
    "claimToken" TEXT,
    "claimedAt" TIMESTAMP(3),
    "processedAt" TIMESTAMP(3),
    "failed" BOOLEAN NOT NULL DEFAULT false,
    "errorMessage" TEXT,
    "analysisId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MiningRunCompany_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ApiUsage" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "month" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ApiUsage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Company_googlePlaceId_key" ON "Company"("googlePlaceId");

-- CreateIndex
CREATE UNIQUE INDEX "Company_osmId_key" ON "Company"("osmId");

-- CreateIndex
CREATE UNIQUE INDEX "Company_cnpj_key" ON "Company"("cnpj");

-- CreateIndex
CREATE INDEX "Company_scoreFinal_nome_idx" ON "Company"("scoreFinal" DESC, "nome");

-- CreateIndex
CREATE INDEX "Company_nomeNormalizado_idx" ON "Company"("nomeNormalizado");

-- CreateIndex
CREATE INDEX "Company_uf_cidade_bairro_idx" ON "Company"("uf", "cidade", "bairro");

-- CreateIndex
CREATE INDEX "Company_nicho_idx" ON "Company"("nicho");

-- CreateIndex
CREATE INDEX "Company_assignedTo_idx" ON "Company"("assignedTo");

-- CreateIndex
CREATE INDEX "Company_lastAnalyzedAt_idx" ON "Company"("lastAnalyzedAt");

-- CreateIndex
CREATE INDEX "CompanyAlias_companyId_idx" ON "CompanyAlias"("companyId");

-- CreateIndex
CREATE UNIQUE INDEX "CompanyAlias_source_externalId_key" ON "CompanyAlias"("source", "externalId");

-- CreateIndex
CREATE INDEX "CompanyAnalysis_companyId_createdAt_idx" ON "CompanyAnalysis"("companyId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "MiningRun_createdAt_idx" ON "MiningRun"("createdAt" DESC);

-- CreateIndex
CREATE INDEX "MiningRun_bairroNorm_cidadeNorm_uf_status_idx" ON "MiningRun"("bairroNorm", "cidadeNorm", "uf", "status");

-- CreateIndex
CREATE INDEX "MiningRun_createdById_status_idx" ON "MiningRun"("createdById", "status");

-- CreateIndex
CREATE INDEX "MiningRun_createdById_paramsKey_idx" ON "MiningRun"("createdById", "paramsKey");

-- CreateIndex
CREATE UNIQUE INDEX "MiningRunCompany_analysisId_key" ON "MiningRunCompany"("analysisId");

-- CreateIndex
CREATE INDEX "MiningRunCompany_runId_processedAt_idx" ON "MiningRunCompany"("runId", "processedAt");

-- CreateIndex
CREATE UNIQUE INDEX "MiningRunCompany_runId_companyId_key" ON "MiningRunCompany"("runId", "companyId");

-- CreateIndex
CREATE UNIQUE INDEX "ApiUsage_provider_month_key" ON "ApiUsage"("provider", "month");

-- CreateIndex
CREATE UNIQUE INDEX "ProspectLead_companyId_key" ON "ProspectLead"("companyId");

-- AddForeignKey
ALTER TABLE "ProspectLead" ADD CONSTRAINT "ProspectLead_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Company" ADD CONSTRAINT "Company_assignedTo_fkey" FOREIGN KEY ("assignedTo") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompanyAlias" ADD CONSTRAINT "CompanyAlias_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompanyAnalysis" ADD CONSTRAINT "CompanyAnalysis_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompanyAnalysis" ADD CONSTRAINT "CompanyAnalysis_runId_fkey" FOREIGN KEY ("runId") REFERENCES "MiningRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MiningRun" ADD CONSTRAINT "MiningRun_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MiningRunCompany" ADD CONSTRAINT "MiningRunCompany_runId_fkey" FOREIGN KEY ("runId") REFERENCES "MiningRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MiningRunCompany" ADD CONSTRAINT "MiningRunCompany_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MiningRunCompany" ADD CONSTRAINT "MiningRunCompany_analysisId_fkey" FOREIGN KEY ("analysisId") REFERENCES "CompanyAnalysis"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Uma mineração ativa por autor E por conjunto de parâmetros (Req. 18.7, 18.12):
-- corrida entre dois POST /runs idênticos vira P2002 → 409; parâmetros distintos coexistem.
CREATE UNIQUE INDEX "MiningRun_one_active_per_author_params"
  ON "MiningRun" ("createdById", "paramsKey") WHERE status IN ('PENDENTE', 'EM_ANDAMENTO');

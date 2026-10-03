-- Etapa 3 (lead-miner-enrichment). Gerada com `prisma migrate diff --from-migrations prisma/migrations
-- --to-schema-datamodel prisma/schema.prisma --script` e revisada: só adiciona tipos/tabelas/colunas/índices
-- (nenhuma coluna removida). Os índices parciais e CHECKs criados por SQL nas migrações anteriores
-- ("User_one_manager_per_department", "SectorMember_one_manager_per_sector",
-- "MiningRun_one_active_per_author_params") são preservados (Req. 19.2).

-- CreateEnum
CREATE TYPE "CnpjOrigin" AS ENUM ('SITE', 'MANUAL');

-- CreateEnum
CREATE TYPE "ApproachChannel" AS ENUM ('WHATSAPP', 'EMAIL');

-- CreateEnum
CREATE TYPE "ApproachOrigin" AS ENUM ('IA', 'MODELO');

-- AlterTable
ALTER TABLE "Company" ADD COLUMN     "cnpjCandidatos" JSONB NOT NULL DEFAULT '[]',
ADD COLUMN     "cnpjCnaeCodigo" TEXT,
ADD COLUMN     "cnpjCnaeDescricao" TEXT,
ADD COLUMN     "cnpjConsultadoEm" TIMESTAMP(3),
ADD COLUMN     "cnpjDadosCnpj" TEXT,
ADD COLUMN     "cnpjInicioAtividade" TEXT,
ADD COLUMN     "cnpjMei" BOOLEAN,
ADD COLUMN     "cnpjMunicipio" TEXT,
ADD COLUMN     "cnpjNatureza" TEXT,
ADD COLUMN     "cnpjNomeFantasia" TEXT,
ADD COLUMN     "cnpjOrigem" "CnpjOrigin",
ADD COLUMN     "cnpjPorte" TEXT,
ADD COLUMN     "cnpjRazaoSocial" TEXT,
ADD COLUMN     "cnpjSituacaoData" TEXT,
ADD COLUMN     "cnpjStatus" TEXT,
ADD COLUMN     "cnpjUf" TEXT,
ADD COLUMN     "desempenhoRuim" BOOLEAN,
ADD COLUMN     "instagramOsm" TEXT,
ADD COLUMN     "nomeExibicao" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "reanaliseAte" TIMESTAMP(3),
ADD COLUMN     "situacaoCadastral" TEXT,
ADD COLUMN     "temInstagram" BOOLEAN,
ADD COLUMN     "temWhatsapp" BOOLEAN,
ADD COLUMN     "whatsappOsm" TEXT;

-- Backfill: nenhuma Empresa antiga tem Cache_Google nem Dados_CNPJ → Nome_Exibicao = nome próprio
UPDATE "Company" SET "nomeExibicao" = nome;


-- AlterTable
ALTER TABLE "CompanyAnalysis" ADD COLUMN     "cnpjEncontrados" JSONB,
ADD COLUMN     "pagespeedMotivo" TEXT,
ADD COLUMN     "sinais" JSONB,
ADD COLUMN     "versaoScore" INTEGER NOT NULL DEFAULT 2;

-- Backfill: análises existentes são da Etapa 1/2 (regras antigas); o default 2 vale para as novas (Req. 13.1)
UPDATE "CompanyAnalysis" SET "versaoScore" = 1;


-- AlterTable
ALTER TABLE "MiningRun" ADD COLUMN     "cnpjEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "fonteSolicitada" "MiningSource" NOT NULL DEFAULT 'OSM',
ADD COLUMN     "googleCursor" JSONB,
ADD COLUMN     "googleMotivo" TEXT,
ADD COLUMN     "googleNichosAfetados" JSONB NOT NULL DEFAULT '[]',
ADD COLUMN     "nichosGoogleFalhos" JSONB NOT NULL DEFAULT '[]',
ADD COLUMN     "nichosGoogleProcessados" JSONB NOT NULL DEFAULT '[]',
ADD COLUMN     "pagespeedEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "pagespeedMotivo" TEXT;

-- AlterTable
ALTER TABLE "MiningRunCompany" ADD COLUMN     "origem" "MiningSource" NOT NULL DEFAULT 'OSM';

-- CreateTable
CREATE TABLE "GooglePlaceCache" (
    "companyId" TEXT NOT NULL,
    "placeId" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "endereco" TEXT,
    "bairro" TEXT,
    "cidade" TEXT,
    "uf" TEXT,
    "telefone" TEXT,
    "website" TEXT,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "mapsUri" TEXT,
    "businessStatus" TEXT,
    "tipos" JSONB NOT NULL DEFAULT '[]',
    "obtidoEm" TIMESTAMP(3) NOT NULL,
    "expiraEm" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "GooglePlaceCache_pkey" PRIMARY KEY ("companyId")
);

-- CreateTable
CREATE TABLE "ApproachMessage" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "analysisId" TEXT,
    "canal" "ApproachChannel" NOT NULL,
    "origem" "ApproachOrigin" NOT NULL,
    "fallback" TEXT,
    "assunto" TEXT,
    "texto" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ApproachMessage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "GooglePlaceCache_expiraEm_idx" ON "GooglePlaceCache"("expiraEm");

-- CreateIndex
CREATE INDEX "ApproachMessage_companyId_createdAt_idx" ON "ApproachMessage"("companyId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "Company_scoreFinal_nomeExibicao_idx" ON "Company"("scoreFinal" DESC, "nomeExibicao");

-- CreateIndex
CREATE INDEX "Company_situacaoCadastral_idx" ON "Company"("situacaoCadastral");

-- AddForeignKey
ALTER TABLE "GooglePlaceCache" ADD CONSTRAINT "GooglePlaceCache_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApproachMessage" ADD CONSTRAINT "ApproachMessage_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApproachMessage" ADD CONSTRAINT "ApproachMessage_analysisId_fkey" FOREIGN KEY ("analysisId") REFERENCES "CompanyAnalysis"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ApproachMessage" ADD CONSTRAINT "ApproachMessage_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


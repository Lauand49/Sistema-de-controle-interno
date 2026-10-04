-- T5 (ajustes pós-etapa 3): avaliação básica dos leads sem contato (IA em lote ou regras).
CREATE TYPE "EvaluationSource" AS ENUM ('IA', 'REGRA');

ALTER TABLE "Company" ADD COLUMN "avaliacaoResumo" TEXT;
ALTER TABLE "Company" ADD COLUMN "sugestaoAcao" TEXT;
ALTER TABLE "Company" ADD COLUMN "avaliadoEm" TIMESTAMP(3);
ALTER TABLE "Company" ADD COLUMN "fonteAvaliacao" "EvaluationSource";

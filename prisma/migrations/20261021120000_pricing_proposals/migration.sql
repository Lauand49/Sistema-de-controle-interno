-- A tabela Product foi removida do banco manualmente, mas a migration anterior
-- permanece no histórico. IF EXISTS permite reconciliar ambos os estados.
DROP TABLE IF EXISTS "Product";

CREATE TABLE "PricingProposal" (
    "id" TEXT NOT NULL,
    "clientName" TEXT NOT NULL,
    "projectName" TEXT NOT NULL,
    "input" JSONB NOT NULL,
    "result" JSONB NOT NULL,
    "finalPrice" DECIMAL(12,2) NOT NULL,
    "createdById" TEXT NOT NULL,
    "cardId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PricingProposal_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PricingProposal_cardId_key" ON "PricingProposal"("cardId");
CREATE INDEX "PricingProposal_createdById_createdAt_idx" ON "PricingProposal"("createdById", "createdAt" DESC);

ALTER TABLE "PricingProposal"
    ADD CONSTRAINT "PricingProposal_createdById_fkey"
    FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "PricingProposal"
    ADD CONSTRAINT "PricingProposal_cardId_fkey"
    FOREIGN KEY ("cardId") REFERENCES "Card"("id") ON DELETE SET NULL ON UPDATE CASCADE;

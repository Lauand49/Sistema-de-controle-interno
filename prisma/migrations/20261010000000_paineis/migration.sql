-- AlterTable
ALTER TABLE "Task" ADD COLUMN     "completedAt" TIMESTAMP(3);

-- Backfill: tarefas já concluídas recebem updatedAt como Data_Conclusao (Req. 3.10)
UPDATE "Task" SET "completedAt" = "updatedAt" WHERE "status" = 'DONE' AND "completedAt" IS NULL;

-- CreateIndex
CREATE INDEX "ProspectLead_createdAt_idx" ON "ProspectLead"("createdAt");

-- CreateIndex
CREATE INDEX "Task_unitId_status_idx" ON "Task"("unitId", "status");

-- CreateIndex
CREATE INDEX "Task_completedAt_idx" ON "Task"("completedAt");

-- CreateIndex
CREATE INDEX "CrossDeptRequest_handlerId_idx" ON "CrossDeptRequest"("handlerId");

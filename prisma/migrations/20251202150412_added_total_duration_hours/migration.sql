-- AlterTable
ALTER TABLE "AtsStageMetric" ADD COLUMN     "totalDurationHours" DOUBLE PRECISION NOT NULL DEFAULT 0;

-- CreateIndex
CREATE INDEX "AtsStageMetric_connectorId_jobId_stageName_idx" ON "AtsStageMetric"("connectorId", "jobId", "stageName");

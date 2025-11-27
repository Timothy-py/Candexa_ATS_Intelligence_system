/*
  Warnings:

  - The `status` column on the `AtsJob` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - The `status` column on the `AtsTask` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - Changed the type of `provider` on the `AtsConnector` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.
  - Changed the type of `issueType` on the `AtsIssue` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.
  - Changed the type of `severity` on the `AtsIssue` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.

*/
-- CreateEnum
CREATE TYPE "AtsProvider" AS ENUM ('bamboohr', 'greenhouse', 'workable');

-- CreateEnum
CREATE TYPE "JobStatus" AS ENUM ('open', 'closed', 'archived');

-- CreateEnum
CREATE TYPE "IssueSeverity" AS ENUM ('low', 'medium', 'high');

-- CreateEnum
CREATE TYPE "IssueType" AS ENUM ('idle', 'missing_feedback', 'delay', 'anomaly');

-- CreateEnum
CREATE TYPE "TaskStatus" AS ENUM ('open', 'completed');

-- AlterTable
ALTER TABLE "AtsConnector" DROP COLUMN "provider",
ADD COLUMN     "provider" "AtsProvider" NOT NULL;

-- AlterTable
ALTER TABLE "AtsIssue" DROP COLUMN "issueType",
ADD COLUMN     "issueType" "IssueType" NOT NULL,
DROP COLUMN "severity",
ADD COLUMN     "severity" "IssueSeverity" NOT NULL;

-- AlterTable
ALTER TABLE "AtsJob" DROP COLUMN "status",
ADD COLUMN     "status" "JobStatus";

-- AlterTable
ALTER TABLE "AtsTask" DROP COLUMN "status",
ADD COLUMN     "status" "TaskStatus" NOT NULL DEFAULT 'open';

-- CreateIndex
CREATE INDEX "AtsCandidate_connectorId_idx" ON "AtsCandidate"("connectorId");

-- CreateIndex
CREATE INDEX "AtsCandidate_jobId_idx" ON "AtsCandidate"("jobId");

-- CreateIndex
CREATE INDEX "AtsCandidateEvent_candidateId_timestamp_idx" ON "AtsCandidateEvent"("candidateId", "timestamp");

-- CreateIndex
CREATE INDEX "AtsIssue_connectorId_resolved_idx" ON "AtsIssue"("connectorId", "resolved");

-- CreateIndex
CREATE INDEX "AtsJob_connectorId_idx" ON "AtsJob"("connectorId");

-- CreateIndex
CREATE INDEX "AtsTask_issueId_status_idx" ON "AtsTask"("issueId", "status");

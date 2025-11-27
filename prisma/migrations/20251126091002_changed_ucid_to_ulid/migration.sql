/*
  Warnings:

  - A unique constraint covering the columns `[externalCandidateId,connectorId]` on the table `AtsCandidate` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[providerEventId,connectorId]` on the table `AtsCandidateEvent` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[externalJobId,connectorId]` on the table `AtsJob` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateIndex
CREATE UNIQUE INDEX "AtsCandidate_externalCandidateId_connectorId_key" ON "AtsCandidate"("externalCandidateId", "connectorId");

-- CreateIndex
CREATE UNIQUE INDEX "AtsCandidateEvent_providerEventId_connectorId_key" ON "AtsCandidateEvent"("providerEventId", "connectorId");

-- CreateIndex
CREATE UNIQUE INDEX "AtsJob_externalJobId_connectorId_key" ON "AtsJob"("externalJobId", "connectorId");

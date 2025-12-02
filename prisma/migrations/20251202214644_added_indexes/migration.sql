-- CreateIndex
CREATE INDEX "AtsCandidate_jobId_connectorId_currentStage_idx" ON "AtsCandidate"("jobId", "connectorId", "currentStage");

-- CreateIndex
CREATE INDEX "AtsCandidate_jobId_connectorId_lastEventAt_idx" ON "AtsCandidate"("jobId", "connectorId", "lastEventAt");

-- CreateIndex
CREATE INDEX "AtsCandidateEvent_jobId_candidateId_timestamp_idx" ON "AtsCandidateEvent"("jobId", "candidateId", "timestamp");

-- CreateIndex
CREATE INDEX "AtsIssue_connectorId_jobId_severity_resolved_idx" ON "AtsIssue"("connectorId", "jobId", "severity", "resolved");

-- CreateTable
CREATE TABLE "AtsConnector" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "baseUrl" TEXT,
    "apiKey" TEXT,
    "authMeta" JSONB,
    "lastFullSyncAt" TIMESTAMP(3),
    "lastDeltaSyncAt" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'connected',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AtsConnector_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AtsJob" (
    "id" TEXT NOT NULL,
    "connectorId" TEXT NOT NULL,
    "externalJobId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "department" TEXT,
    "location" TEXT,
    "employmentType" TEXT,
    "status" TEXT,
    "hiringTeam" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AtsJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AtsCandidate" (
    "id" TEXT NOT NULL,
    "connectorId" TEXT NOT NULL,
    "externalCandidateId" TEXT NOT NULL,
    "jobId" TEXT,
    "fullName" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "source" TEXT,
    "resumeUrl" TEXT,
    "tags" TEXT[],
    "currentStage" TEXT,
    "lastEventAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AtsCandidate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AtsCandidateEvent" (
    "id" TEXT NOT NULL,
    "connectorId" TEXT NOT NULL,
    "candidateId" TEXT NOT NULL,
    "jobId" TEXT,
    "providerEventId" TEXT,
    "provider" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "stageFrom" TEXT,
    "stageTo" TEXT,
    "actor" TEXT,
    "timestamp" TIMESTAMP(3) NOT NULL,
    "rawPayload" JSONB,
    "normalized" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AtsCandidateEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AtsStageMetric" (
    "id" TEXT NOT NULL,
    "connectorId" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "stageName" TEXT NOT NULL,
    "candidateCount" INTEGER NOT NULL DEFAULT 0,
    "avgDurationHours" DOUBLE PRECISION,
    "delaySeverity" TEXT,
    "computedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AtsStageMetric_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AtsIssue" (
    "id" TEXT NOT NULL,
    "connectorId" TEXT NOT NULL,
    "candidateId" TEXT NOT NULL,
    "jobId" TEXT,
    "issueType" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "description" TEXT,
    "detectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolved" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "AtsIssue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AtsTask" (
    "id" TEXT NOT NULL,
    "issueId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'open',
    "taskType" TEXT NOT NULL,
    "assignee" TEXT,
    "dueAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AtsTask_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "AtsJob" ADD CONSTRAINT "AtsJob_connectorId_fkey" FOREIGN KEY ("connectorId") REFERENCES "AtsConnector"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AtsCandidate" ADD CONSTRAINT "AtsCandidate_connectorId_fkey" FOREIGN KEY ("connectorId") REFERENCES "AtsConnector"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AtsCandidate" ADD CONSTRAINT "AtsCandidate_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "AtsJob"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AtsCandidateEvent" ADD CONSTRAINT "AtsCandidateEvent_connectorId_fkey" FOREIGN KEY ("connectorId") REFERENCES "AtsConnector"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AtsCandidateEvent" ADD CONSTRAINT "AtsCandidateEvent_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "AtsCandidate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AtsCandidateEvent" ADD CONSTRAINT "AtsCandidateEvent_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "AtsJob"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AtsStageMetric" ADD CONSTRAINT "AtsStageMetric_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "AtsJob"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AtsStageMetric" ADD CONSTRAINT "AtsStageMetric_connectorId_fkey" FOREIGN KEY ("connectorId") REFERENCES "AtsConnector"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AtsIssue" ADD CONSTRAINT "AtsIssue_connectorId_fkey" FOREIGN KEY ("connectorId") REFERENCES "AtsConnector"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AtsIssue" ADD CONSTRAINT "AtsIssue_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "AtsCandidate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AtsIssue" ADD CONSTRAINT "AtsIssue_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "AtsJob"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AtsTask" ADD CONSTRAINT "AtsTask_issueId_fkey" FOREIGN KEY ("issueId") REFERENCES "AtsIssue"("id") ON DELETE CASCADE ON UPDATE CASCADE;

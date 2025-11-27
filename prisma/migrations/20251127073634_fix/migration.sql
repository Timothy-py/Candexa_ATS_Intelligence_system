-- AlterTable
ALTER TABLE "AtsCandidate" ADD COLUMN     "raw" JSONB;

-- AlterTable
ALTER TABLE "AtsConnector" ADD COLUMN     "openApiKey" TEXT,
ADD COLUMN     "subdomain" TEXT;

-- AlterTable
ALTER TABLE "AtsJob" ADD COLUMN     "raw" JSONB;

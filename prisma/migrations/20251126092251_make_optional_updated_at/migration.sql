-- AlterTable
ALTER TABLE "AtsCandidate" ALTER COLUMN "updatedAt" DROP NOT NULL;

-- AlterTable
ALTER TABLE "AtsConnector" ALTER COLUMN "updatedAt" DROP NOT NULL;

-- AlterTable
ALTER TABLE "AtsJob" ALTER COLUMN "updatedAt" DROP NOT NULL;

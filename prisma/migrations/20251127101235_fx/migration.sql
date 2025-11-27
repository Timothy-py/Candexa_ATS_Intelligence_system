/*
  Warnings:

  - The `status` column on the `AtsJob` table would be dropped and recreated. This will lead to data loss if there is data in the column.

*/
-- AlterTable
ALTER TABLE "AtsJob" DROP COLUMN "status",
ADD COLUMN     "status" TEXT;

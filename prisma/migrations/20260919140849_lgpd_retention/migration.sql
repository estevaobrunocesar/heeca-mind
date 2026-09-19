-- AlterTable
ALTER TABLE "organizations" ADD COLUMN     "retentionYears" INTEGER NOT NULL DEFAULT 5;

-- AlterTable
ALTER TABLE "patients" ADD COLUMN     "anonymizedAt" TIMESTAMP(3);

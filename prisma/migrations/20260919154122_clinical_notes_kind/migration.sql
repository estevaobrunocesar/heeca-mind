-- CreateEnum
CREATE TYPE "ClinicalNoteKind" AS ENUM ('EVOLUTION', 'NOTE', 'ASSESSMENT');

-- AlterTable
ALTER TABLE "clinical_notes" ADD COLUMN     "deletedReason" TEXT,
ADD COLUMN     "kind" "ClinicalNoteKind" NOT NULL DEFAULT 'NOTE';


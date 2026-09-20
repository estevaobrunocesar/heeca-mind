-- Heeca Mind, etapa 0: segmento do tenant e registro profissional genérico.

-- CreateEnum
CREATE TYPE "Segment" AS ENUM ('PSYCHOLOGY', 'THERAPY');

-- AlterTable
ALTER TABLE "organizations" ADD COLUMN "segment" "Segment" NOT NULL DEFAULT 'PSYCHOLOGY';

-- Professional.crp -> registrationKind/registrationNumber (dados preservados), showCrp -> showRegistration
ALTER TABLE "professionals" ADD COLUMN "registrationKind" TEXT NOT NULL DEFAULT 'CRP';
ALTER TABLE "professionals" ADD COLUMN "registrationNumber" TEXT;
UPDATE "professionals" SET "registrationNumber" = "crp";
ALTER TABLE "professionals" DROP COLUMN "crp";
ALTER TABLE "professionals" RENAME COLUMN "showCrp" TO "showRegistration";

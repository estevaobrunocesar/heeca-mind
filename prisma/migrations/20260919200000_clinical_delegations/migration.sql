-- CreateEnum
CREATE TYPE "ClinicalDelegationKind" AS ENUM ('SUPERVISION', 'SUBSTITUTION');

-- AlterTable
ALTER TABLE "clinical_access_logs" ADD COLUMN     "delegationId" TEXT;

-- AlterTable
ALTER TABLE "clinical_documents" ADD COLUMN     "delegationId" TEXT;

-- AlterTable
ALTER TABLE "clinical_notes" ADD COLUMN     "delegationId" TEXT;

-- CreateTable
CREATE TABLE "clinical_delegations" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "patientId" TEXT,
    "grantorProfessionalId" TEXT NOT NULL,
    "delegateProfessionalId" TEXT NOT NULL,
    "createdByUserId" TEXT NOT NULL,
    "kind" "ClinicalDelegationKind" NOT NULL,
    "canWrite" BOOLEAN NOT NULL,
    "reason" TEXT NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "revokedReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "clinical_delegations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "clinical_delegations_delegateProfessionalId_expiresAt_idx" ON "clinical_delegations"("delegateProfessionalId", "expiresAt");

-- CreateIndex
CREATE INDEX "clinical_delegations_grantorProfessionalId_expiresAt_idx" ON "clinical_delegations"("grantorProfessionalId", "expiresAt");

-- AddForeignKey
ALTER TABLE "clinical_notes" ADD CONSTRAINT "clinical_notes_delegationId_fkey" FOREIGN KEY ("delegationId") REFERENCES "clinical_delegations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clinical_access_logs" ADD CONSTRAINT "clinical_access_logs_delegationId_fkey" FOREIGN KEY ("delegationId") REFERENCES "clinical_delegations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clinical_delegations" ADD CONSTRAINT "clinical_delegations_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clinical_delegations" ADD CONSTRAINT "clinical_delegations_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "patients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clinical_delegations" ADD CONSTRAINT "clinical_delegations_grantorProfessionalId_fkey" FOREIGN KEY ("grantorProfessionalId") REFERENCES "professionals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clinical_delegations" ADD CONSTRAINT "clinical_delegations_delegateProfessionalId_fkey" FOREIGN KEY ("delegateProfessionalId") REFERENCES "professionals"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clinical_delegations" ADD CONSTRAINT "clinical_delegations_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clinical_documents" ADD CONSTRAINT "clinical_documents_delegationId_fkey" FOREIGN KEY ("delegationId") REFERENCES "clinical_delegations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

